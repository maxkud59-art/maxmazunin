import {
  Injectable,
  ForbiddenException,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { BookSize, SpreadKind } from '@prisma/client';
import { join } from 'path';
import { mkdirSync, existsSync, unlinkSync, writeFileSync } from 'fs';
import { v4 as uuid } from 'uuid';
import { createVisionClient } from './vision.adapter';
import { createEnhanceClient, ImageEnhanceClient, EnhanceContext, AiEnhanceClient } from './enhance.adapter';
import { calculatePrintQuality } from './quality.util';
import { templateForCount, LAYOUT_TEMPLATES } from './layout-templates';
import * as sharp from 'sharp';
// exifr uses default export; handled via dynamic import for ESM compat
import { ConfigService } from '@nestjs/config';

const UPLOADS_DIR = join(__dirname, '..', '..', '..', '..', 'uploads');
const BOOKS_DIR = join(UPLOADS_DIR, 'books');
const THUMBS_DIR = join(BOOKS_DIR, 'thumbs');

function ensureDirs() {
  [UPLOADS_DIR, BOOKS_DIR, THUMBS_DIR].forEach((d) => {
    if (!existsSync(d)) mkdirSync(d, { recursive: true });
  });
}

interface EnhanceJobEntry {
  status: 'pending' | 'processing' | 'done' | 'error';
  progress: number;
  message: string;
  photoId: string;
  enhKey: string;
  enhThumbKey: string;
  enhPath: string;
  enhThumbPath: string;
  originalPath: string;
  clientJobId?: string;
  width?: number;
  height?: number;
  error?: string;
}

@Injectable()
export class BookLayoutService {
  private readonly enhanceJobs = new Map<string, EnhanceJobEntry>();
  private enhanceClient: ImageEnhanceClient | null = null;
  private enhanceClientIsAI = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    ensureDirs();
    createEnhanceClient().then((c) => {
      this.enhanceClient = c;
      this.enhanceClientIsAI = c instanceof AiEnhanceClient;
    });
  }

  private async getEnhanceClient(): Promise<ImageEnhanceClient> {
    // If we have no client yet, or still using the Sharp fallback, try the AI client
    if (!this.enhanceClient || !this.enhanceClientIsAI) {
      const fresh = await createEnhanceClient();
      this.enhanceClient = fresh;
      this.enhanceClientIsAI = fresh instanceof AiEnhanceClient;
    }
    return this.enhanceClient;
  }

  // ──────────── Projects ────────────────────────────────────────────────────

  async listProjects(userId: string) {
    const projects = await this.prisma.bookProject.findMany({
      where: { createdById: userId },
      orderBy: { updatedAt: 'desc' },
      select: {
        id: true,
        title: true,
        size: true,
        orderNumber: true,
        shareToken: true,
        createdAt: true,
        updatedAt: true,
        _count: { select: { photos: true, spreads: true } },
        spreads: {
          where: { kind: SpreadKind.COVER },
          take: 1,
          select: {
            placements: {
              orderBy: { cellIndex: 'asc' },
              take: 1,
              select: {
                photo: {
                  select: { thumbKey: true, useEnhanced: true, enhancedThumbKey: true },
                },
              },
            },
          },
        },
      },
    });

    return projects.map(({ spreads, ...rest }) => {
      const photo = spreads?.[0]?.placements?.[0]?.photo;
      const effectiveThumb =
        photo?.useEnhanced && photo?.enhancedThumbKey
          ? photo.enhancedThumbKey
          : photo?.thumbKey;
      return {
        ...rest,
        coverThumbUrl: effectiveThumb
          ? `/api/book-layout/files/thumbs/${effectiveThumb}`
          : null,
      };
    });
  }

  async createProject(userId: string, title: string, size: BookSize) {
    const project = await this.prisma.bookProject.create({
      data: {
        title,
        size,
        createdById: userId,
        spreads: {
          create: [
            { index: 0, kind: SpreadKind.COVER },
            { index: 1, kind: SpreadKind.SPREAD, templateId: '2h' },
          ],
        },
      },
      include: {
        spreads: { orderBy: { index: 'asc' }, include: { placements: { include: { photo: true } }, textElements: true } },
        photos: { orderBy: { order: 'asc' } },
      },
    });
    return this.enrichProject(project);
  }

  async getProject(id: string, userId?: string) {
    const project = await this.prisma.bookProject.findUnique({
      where: { id },
      include: {
        spreads: {
          orderBy: { index: 'asc' },
          include: {
            placements: { include: { photo: true }, orderBy: { cellIndex: 'asc' } },
            textElements: true,
          },
        },
        photos: { orderBy: { order: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (userId && project.createdById !== userId) throw new ForbiddenException();
    return this.enrichProject(project);
  }

  async getProjectByToken(token: string) {
    const project = await this.prisma.bookProject.findUnique({
      where: { shareToken: token },
      include: {
        spreads: {
          orderBy: { index: 'asc' },
          include: {
            placements: { include: { photo: true }, orderBy: { cellIndex: 'asc' } },
            textElements: true,
          },
        },
        photos: { orderBy: { order: 'asc' } },
      },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    return this.enrichProject(project);
  }

  async updateProject(id: string, userId: string, data: { title?: string; orderNumber?: string | null }) {
    await this.assertOwner(id, userId);
    return this.prisma.bookProject.update({
      where: { id },
      data: { ...data, updatedAt: new Date() },
      select: { id: true, title: true, orderNumber: true, shareToken: true, updatedAt: true },
    });
  }

  async deleteProject(id: string, userId: string) {
    await this.assertOwner(id, userId);
    // Photos are cascade-deleted by Prisma; clean up disk files
    const photos = await this.prisma.bookPhoto.findMany({ where: { bookProjectId: id } });
    await this.prisma.bookProject.delete({ where: { id } });
    photos.forEach((p) => {
      this.safeUnlink(join(BOOKS_DIR, p.storageKey));
      this.safeUnlink(join(THUMBS_DIR, p.thumbKey));
    });
  }

  // ──────────── Photos ─────────────────────────────────────────────────────

  async uploadPhoto(
    projectId: string,
    userId: string,
    file: Express.Multer.File,
  ) {
    await this.assertOwner(projectId, userId);
    ensureDirs();

    // Generate thumbnail with sharp
    const sharpInstance = (sharp as any).default ?? sharp;
    const thumbFilename = `thumb_${file.filename}`;
    const thumbPath = join(THUMBS_DIR, thumbFilename);

    let width = 0;
    let height = 0;
    try {
      // Read original dimensions before creating thumbnail
      const meta = await sharpInstance(file.path).metadata();
      width = meta.width ?? 0;
      height = meta.height ?? 0;
      await sharpInstance(file.path)
        .resize({ width: 600, withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toFile(thumbPath);
    } catch {
      // If sharp fails, use the original as thumb
      try { require('fs').copyFileSync(file.path, thumbPath); } catch {}
    }

    // Read EXIF date
    let takenAt: Date | null = null;
    try {
      const exifr = await (Function('return import("exifr")')() as Promise<any>);
      const parsed = await (exifr.default ?? exifr).parse(file.path, {
        pick: ['DateTimeOriginal', 'CreateDate'],
      });
      const raw = parsed?.DateTimeOriginal ?? parsed?.CreateDate;
      if (raw instanceof Date) takenAt = raw;
    } catch {}

    // Count existing photos for order
    const count = await this.prisma.bookPhoto.count({ where: { bookProjectId: projectId } });

    const photo = await this.prisma.bookPhoto.create({
      data: {
        bookProjectId: projectId,
        storageKey: file.filename,
        thumbKey: thumbFilename,
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        width,
        height,
        takenAt,
        order: count,
      },
    });

    await this.prisma.bookProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });

    return this.enrichPhoto(photo);
  }

  async deletePhoto(photoId: string, userId: string) {
    const photo = await this.prisma.bookPhoto.findUnique({
      where: { id: photoId },
      include: { bookProject: true },
    });
    if (!photo) throw new NotFoundException();
    if (photo.bookProject.createdById !== userId) throw new ForbiddenException();

    await this.prisma.bookPhoto.delete({ where: { id: photoId } });
    this.safeUnlink(join(BOOKS_DIR, photo.storageKey));
    this.safeUnlink(join(THUMBS_DIR, photo.thumbKey));
    await this.prisma.bookProject.update({
      where: { id: photo.bookProjectId },
      data: { updatedAt: new Date() },
    });
  }

  // ──────────── Spreads ────────────────────────────────────────────────────

  async addSpread(projectId: string, userId: string) {
    await this.assertOwner(projectId, userId);
    const last = await this.prisma.bookSpread.findFirst({
      where: { bookProjectId: projectId },
      orderBy: { index: 'desc' },
    });
    const spread = await this.prisma.bookSpread.create({
      data: {
        bookProjectId: projectId,
        index: (last?.index ?? 0) + 1,
        kind: SpreadKind.SPREAD,
        templateId: '2h',
      },
      include: { placements: { include: { photo: true } }, textElements: true },
    });
    await this.prisma.bookProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return this.enrichSpread(spread);
  }

  async deleteSpread(spreadId: string, userId: string) {
    const spread = await this.prisma.bookSpread.findUnique({
      where: { id: spreadId },
      include: { bookProject: true },
    });
    if (!spread) throw new NotFoundException();
    if (spread.bookProject.createdById !== userId) throw new ForbiddenException();
    if (spread.kind === SpreadKind.COVER) throw new BadRequestException('Обложку нельзя удалить');
    await this.prisma.bookSpread.delete({ where: { id: spreadId } });
    await this.prisma.bookProject.update({
      where: { id: spread.bookProjectId },
      data: { updatedAt: new Date() },
    });
    // Re-index remaining spreads
    const remaining = await this.prisma.bookSpread.findMany({
      where: { bookProjectId: spread.bookProjectId },
      orderBy: { index: 'asc' },
    });
    await Promise.all(
      remaining.map((s, i) => this.prisma.bookSpread.update({ where: { id: s.id }, data: { index: i } })),
    );
  }

  async saveSpread(
    spreadId: string,
    userId: string,
    data: {
      templateId?: string;
      placements?: { photoId: string; cellIndex: number; rotation?: number; scale?: number; panX?: number; panY?: number }[];
      textElements?: { id?: string; text: string; fontFamily: string; fontSize: number; color: string; x: number; y: number; w: number; h: number }[];
    },
  ) {
    const spread = await this.prisma.bookSpread.findUnique({
      where: { id: spreadId },
      include: { bookProject: true },
    });
    if (!spread) throw new NotFoundException();
    if (spread.bookProject.createdById !== userId) throw new ForbiddenException();

    // Update template
    if (data.templateId !== undefined) {
      await this.prisma.bookSpread.update({ where: { id: spreadId }, data: { templateId: data.templateId } });
    }

    // Replace placements
    if (data.placements !== undefined) {
      await this.prisma.bookPlacement.deleteMany({ where: { spreadId } });
      if (data.placements.length > 0) {
        await this.prisma.bookPlacement.createMany({
          data: data.placements.map((p, z) => ({
            spreadId,
            photoId: p.photoId,
            cellIndex: p.cellIndex,
            rotation: p.rotation ?? 0,
            scale: p.scale ?? 1,
            panX: p.panX ?? 50,
            panY: p.panY ?? 50,
            z,
          })),
        });
      }
    }

    // Replace text elements
    if (data.textElements !== undefined) {
      await this.prisma.bookTextElement.deleteMany({ where: { spreadId } });
      if (data.textElements.length > 0) {
        await this.prisma.bookTextElement.createMany({
          data: data.textElements.map((t) => ({
            spreadId,
            text: t.text,
            fontFamily: t.fontFamily,
            fontSize: t.fontSize,
            color: t.color,
            x: t.x,
            y: t.y,
            w: t.w,
            h: t.h,
          })),
        });
      }
    }

    await this.prisma.bookProject.update({
      where: { id: spread.bookProjectId },
      data: { updatedAt: new Date() },
    });

    const updated = await this.prisma.bookSpread.findUnique({
      where: { id: spreadId },
      include: { placements: { include: { photo: true }, orderBy: { cellIndex: 'asc' } }, textElements: true },
    });
    return this.enrichSpread(updated!);
  }

  // ──────────── Auto-layout ────────────────────────────────────────────────

  async autoLayout(projectId: string, userId: string) {
    await this.assertOwner(projectId, userId);

    const photos = await this.prisma.bookPhoto.findMany({
      where: { bookProjectId: projectId },
      orderBy: [{ takenAt: { sort: 'asc', nulls: 'last' } }, { order: 'asc' }],
    });

    if (!photos.length) throw new BadRequestException('Загрузите фотографии перед авто-расстановкой');

    const visionClient = createVisionClient(this.config.get('VISION_API_KEY'));
    const metas = photos.map((p) => ({
      photoId: p.id,
      thumbPath: join(THUMBS_DIR, p.thumbKey),
      takenAt: p.takenAt ?? null,
      order: p.order,
    }));

    const { groups } = await visionClient.groupPhotos(metas);
    // Flatten all groups into ordered photo IDs
    const orderedIds = groups.flatMap((g) => g.photoIds);

    // Delete all SPREAD spreads (keep cover)
    await this.prisma.bookSpread.deleteMany({
      where: { bookProjectId: projectId, kind: SpreadKind.SPREAD },
    });

    // Create new spreads: chunk into max 8 per spread
    const chunks: string[][] = [];
    for (let i = 0; i < orderedIds.length; i += 8) {
      chunks.push(orderedIds.slice(i, i + 8));
    }

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const template = templateForCount(chunk.length);
      const spread = await this.prisma.bookSpread.create({
        data: {
          bookProjectId: projectId,
          index: i + 1,
          kind: SpreadKind.SPREAD,
          templateId: template.id,
        },
      });
      await this.prisma.bookPlacement.createMany({
        data: chunk.map((photoId, ci) => ({
          spreadId: spread.id,
          photoId,
          cellIndex: ci,
        })),
      });
    }

    await this.prisma.bookProject.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return this.getProject(projectId, userId);
  }

  // ──────────── Serve files ────────────────────────────────────────────────

  filePath(filename: string, thumb = false): string {
    const base = thumb ? THUMBS_DIR : BOOKS_DIR;
    const clean = filename.replace(/[^a-zA-Z0-9._-]/g, '');
    return join(base, clean);
  }

  // ──────────── Private helpers ────────────────────────────────────────────

  private async assertOwner(projectId: string, userId: string) {
    const project = await this.prisma.bookProject.findUnique({
      where: { id: projectId },
      select: { createdById: true },
    });
    if (!project) throw new NotFoundException('Проект не найден');
    if (project.createdById !== userId) throw new ForbiddenException();
  }

  private safeUnlink(path: string) {
    try { if (existsSync(path)) unlinkSync(path); } catch {}
  }

  private enrichPhoto(photo: any) {
    const effectiveThumbKey =
      photo.useEnhanced && photo.enhancedThumbKey ? photo.enhancedThumbKey : photo.thumbKey;
    const effectiveStorageKey =
      photo.useEnhanced && photo.enhancedKey ? photo.enhancedKey : photo.storageKey;
    return {
      ...photo,
      thumbUrl: `/api/book-layout/files/thumbs/${effectiveThumbKey}`,
      originalUrl: `/api/book-layout/files/originals/${effectiveStorageKey}`,
      originalThumbUrl: `/api/book-layout/files/thumbs/${photo.thumbKey}`,
      enhancedThumbUrl: photo.enhancedThumbKey
        ? `/api/book-layout/files/thumbs/${photo.enhancedThumbKey}`
        : null,
      enhancedOriginalUrl: photo.enhancedKey
        ? `/api/book-layout/files/originals/${photo.enhancedKey}`
        : null,
    };
  }

  // ──────────── Photo quality ──────────────────────────────────────────────

  async getPhotoQuality(
    photoId: string,
    userId: string,
    bookSize: string,
    templateId: string,
    cellIndex: number,
  ) {
    const photo = await this.prisma.bookPhoto.findUnique({
      where: { id: photoId },
      include: { bookProject: true },
    });
    if (!photo) throw new NotFoundException('Фото не найдено');
    if (photo.bookProject.createdById !== userId) throw new ForbiddenException();
    return calculatePrintQuality(photo.width, photo.height, bookSize, templateId, cellIndex);
  }

  // ──────────── Photo enhance (async job) ──────────────────────────────────

  async enhancePhotoStart(
    photoId: string,
    userId: string,
    context?: { bookSize?: string; templateId?: string; cellIndex?: number },
  ) {
    const photo = await this.prisma.bookPhoto.findUnique({
      where: { id: photoId },
      include: { bookProject: true },
    });
    if (!photo) throw new NotFoundException('Фото не найдено');
    if (photo.bookProject.createdById !== userId) throw new ForbiddenException();

    ensureDirs();
    const originalPath = join(BOOKS_DIR, photo.storageKey);
    if (!existsSync(originalPath)) throw new NotFoundException('Файл фото не найден');

    // Calculate target print dimensions (300 DPI for the specific cell)
    let enhanceCtx: EnhanceContext | undefined;
    if (context?.bookSize && context?.templateId && context?.cellIndex !== undefined) {
      const q = calculatePrintQuality(
        photo.width, photo.height,
        context.bookSize, context.templateId, context.cellIndex,
      );
      enhanceCtx = {
        targetW: q.requiredPixels.w,
        targetH: q.requiredPixels.h,
      };
    }

    const jobId = `ej_${uuid().replace(/-/g, '')}`;
    const enhKey = `enh_${uuid()}.jpg`;
    const enhThumbKey = `enh_thumb_${uuid()}.jpg`;
    const enhPath = join(BOOKS_DIR, enhKey);
    const enhThumbPath = join(THUMBS_DIR, enhThumbKey);

    const entry: EnhanceJobEntry = {
      status: 'pending',
      progress: 0,
      message: 'Запуск...',
      photoId,
      enhKey,
      enhThumbKey,
      enhPath,
      enhThumbPath,
      originalPath,
    };
    this.enhanceJobs.set(jobId, entry);

    // Start async — do not await
    this._runEnhanceJob(jobId, entry, photo, enhanceCtx).catch(() => {});

    return { jobId };
  }

  async getEnhanceJobStatus(jobId: string, userId: string) {
    const entry = this.enhanceJobs.get(jobId);
    if (!entry) throw new NotFoundException('Задача не найдена');

    // Auth check
    const photo = await this.prisma.bookPhoto.findUnique({
      where: { id: entry.photoId },
      include: { bookProject: true },
    });
    if (!photo || photo.bookProject.createdById !== userId) throw new ForbiddenException();

    const result: any = {
      jobId,
      status: entry.status,
      progress: entry.progress,
      message: entry.message,
    };

    if (entry.status === 'done') {
      const updated = await this.prisma.bookPhoto.findUnique({ where: { id: entry.photoId } });
      if (updated) result.photo = this.enrichPhoto(updated);
    }
    if (entry.error) result.error = entry.error;

    return result;
  }

  private async _runEnhanceJob(jobId: string, entry: EnhanceJobEntry, photo: any, ctx?: EnhanceContext) {
    try {
      entry.status = 'processing';
      entry.progress = 5;
      entry.message = 'Инициализация...';

      const client = await this.getEnhanceClient();

      entry.progress = 10;
      entry.message = 'Отправка в AI-сервис...';

      const { jobId: clientJobId } = await client.startEnhance(
        entry.originalPath,
        entry.enhPath,
        entry.enhThumbPath,
        ctx,
      );
      entry.clientJobId = clientJobId;

      // Poll until done (timeout 660s — GFPGAN 50s + 2 ESRGAN passes ~310s + margin)
      const timeout = Date.now() + 660_000;
      while (Date.now() < timeout) {
        await new Promise((r) => setTimeout(r, 2000));
        const status = await client.getJobStatus(clientJobId);
        // Map progress: AI 0-100 → our 10-90
        entry.progress = 10 + Math.round(status.progress * 0.8);
        entry.message = status.message;

        if (status.status === 'done') {
          entry.progress = 90;
          entry.message = 'Сохранение...';
          await client.downloadResult(clientJobId, entry.enhPath, entry.enhThumbPath);
          break;
        }
        if (status.status === 'error') {
          throw new Error(status.message || 'AI service error');
        }
      }

      // Check output was written
      if (!existsSync(entry.enhPath)) {
        throw new Error('Выходной файл не создан');
      }

      // Clean up old enhanced files
      if (photo.enhancedKey) this.safeUnlink(join(BOOKS_DIR, photo.enhancedKey));
      if (photo.enhancedThumbKey) this.safeUnlink(join(THUMBS_DIR, photo.enhancedThumbKey));

      await this.prisma.bookPhoto.update({
        where: { id: entry.photoId },
        data: { enhancedKey: entry.enhKey, enhancedThumbKey: entry.enhThumbKey },
      });

      entry.status = 'done';
      entry.progress = 100;
      entry.message = 'Готово';
    } catch (err: any) {
      entry.status = 'error';
      entry.progress = 0;
      entry.message = 'Ошибка улучшения';
      entry.error = String(err?.message ?? err);
      // Clean up partial files
      this.safeUnlink(entry.enhPath);
      this.safeUnlink(entry.enhThumbPath);
    }
  }

  // Keep old sync method as alias for backward compat (calls new async flow, waits)
  async enhancePhoto(photoId: string, userId: string) {
    const { jobId } = await this.enhancePhotoStart(photoId, userId);
    const timeout = Date.now() + 660_000;
    while (Date.now() < timeout) {
      await new Promise((r) => setTimeout(r, 1000));
      const entry = this.enhanceJobs.get(jobId);
      if (!entry) break;
      if (entry.status === 'done') {
        const updated = await this.prisma.bookPhoto.findUnique({ where: { id: photoId } });
        return updated ? this.enrichPhoto(updated) : null;
      }
      if (entry.status === 'error') throw new Error(entry.error ?? 'enhance failed');
    }
    throw new Error('Таймаут улучшения');
  }

  async applyEnhancement(photoId: string, userId: string, apply: boolean) {
    const photo = await this.prisma.bookPhoto.findUnique({
      where: { id: photoId },
      include: { bookProject: true },
    });
    if (!photo) throw new NotFoundException('Фото не найдено');
    if (photo.bookProject.createdById !== userId) throw new ForbiddenException();
    if (apply && !photo.enhancedKey) {
      throw new BadRequestException('Сначала улучшите фото');
    }

    const updated = await this.prisma.bookPhoto.update({
      where: { id: photoId },
      data: { useEnhanced: apply },
    });
    return this.enrichPhoto(updated);
  }

  // ──────────── Cover generation (Travelbook) ──────────────────────────────

  private readonly ENHANCE_SVC = process.env.ENHANCE_SERVICE_URL ?? 'http://localhost:8001';

  private readonly coverJobs = new Map<string, { projectId: string; userId: string }>();

  async startCoverGeneration(
    projectId: string,
    userId: string,
    params: { location: string; style: string; bookSize: string; seed?: number },
  ) {
    await this.assertOwner(projectId, userId);
    const res = await fetch(`${this.ENHANCE_SVC}/cover/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        location: params.location,
        style: params.style,
        book_size: params.bookSize,
        seed: params.seed,
      }),
    });
    if (!res.ok) throw new BadRequestException(`Cover service error: ${res.status}`);
    const data = await res.json() as { job_id: string };
    this.coverJobs.set(data.job_id, { projectId, userId });
    return { jobId: data.job_id };
  }

  async getCoverStatus(jobId: string, userId: string) {
    const entry = this.coverJobs.get(jobId);
    if (!entry || entry.userId !== userId) throw new NotFoundException('Job not found');
    const res = await fetch(`${this.ENHANCE_SVC}/cover/status/${jobId}`);
    if (!res.ok) throw new BadRequestException('Status fetch failed');
    return res.json();
  }

  async applyCoverResult(
    projectId: string,
    userId: string,
    jobId: string,
    title: string,
    subtitle: string,
    style: string,
  ) {
    await this.assertOwner(projectId, userId);
    const entry = this.coverJobs.get(jobId);
    if (!entry || entry.projectId !== projectId) throw new NotFoundException('Job not found');

    // Download image from Python service
    const imgRes = await fetch(`${this.ENHANCE_SVC}/cover/result/${jobId}`);
    if (!imgRes.ok) throw new BadRequestException('Image not ready');
    const imgBuf = Buffer.from(await imgRes.arrayBuffer());

    // Save original
    const storageKey = `covgen_${uuid()}.jpg`;
    const thumbKey = `covgenth_${uuid()}.jpg`;
    const origPath = join(BOOKS_DIR, storageKey);
    const thumbPath = join(THUMBS_DIR, thumbKey);

    writeFileSync(origPath, imgBuf);

    // Generate thumbnail
    const sharpFn = (sharp as any).default ?? sharp;
    const metadata = await sharpFn(imgBuf).metadata();
    await sharpFn(imgBuf)
      .resize({ width: 600, height: 600, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toFile(thumbPath);

    const width = metadata.width ?? 900;
    const height = metadata.height ?? 1350;

    // Create BookPhoto
    const photo = await this.prisma.bookPhoto.create({
      data: {
        bookProjectId: projectId,
        storageKey,
        thumbKey,
        fileName: `travelbook_${jobId.slice(0, 8)}.jpg`,
        width,
        height,
        order: 0,
        useEnhanced: false,
      },
    });

    // Find COVER spread
    const coverSpread = await this.prisma.bookSpread.findFirst({
      where: { bookProjectId: projectId, kind: 'COVER' },
      include: { placements: true, textElements: true },
    });
    if (!coverSpread) throw new NotFoundException('Cover spread not found');

    // Remove existing placement at cellIndex=0 (front cover)
    await this.prisma.bookPlacement.deleteMany({
      where: { spreadId: coverSpread.id, cellIndex: 0 },
    });

    // Place the generated photo at cellIndex=0 (front cover)
    await this.prisma.bookPlacement.create({
      data: {
        spreadId: coverSpread.id,
        photoId: photo.id,
        cellIndex: 0,
        rotation: 0,
        scale: 1,
        panX: 50,
        panY: 50,
        z: 0,
      },
    });

    // Compute text positions relative to cover canvas
    // For simplicity use fixed % values — user can adjust after
    const textColor = ['минимал', 'пастель'].includes(style) ? '#2c2416' : '#ffffff';
    const subColor  = ['минимал', 'пастель'].includes(style) ? '#6b5e4e' : '#d8d8d8';

    // Keep existing spine text; replace other text elements
    const spineText = coverSpread.textElements.find((t) => t.x < 0);
    await this.prisma.bookTextElement.deleteMany({
      where: {
        spreadId: coverSpread.id,
        ...(spineText ? { id: { not: spineText.id } } : {}),
      },
    });

    // We place text in the front zone: x starts at ~51.5%, width ~48.5%
    // Using fixed canvas % values that work for all book sizes
    const frontStart = 52;
    const frontW = 47;
    if (title) {
      await this.prisma.bookTextElement.create({
        data: {
          spreadId: coverSpread.id,
          text: title,
          fontFamily: 'Playfair Display',
          fontSize: 22,
          color: textColor,
          x: frontStart + 0.05 * frontW,
          y: 66,
          w: frontW * 0.90,
          h: 10,
        },
      });
    }
    if (subtitle) {
      await this.prisma.bookTextElement.create({
        data: {
          spreadId: coverSpread.id,
          text: subtitle,
          fontFamily: 'Montserrat',
          fontSize: 10,
          color: subColor,
          x: frontStart + 0.05 * frontW,
          y: 80,
          w: frontW * 0.70,
          h: 6,
        },
      });
    }

    // Set templateId to indicate photo-with-text style
    await this.prisma.bookSpread.update({
      where: { id: coverSpread.id },
      data: { templateId: 'ct-photo-dark-overlay' },
    });

    // Return full updated spread
    const updated = await this.prisma.bookSpread.findUnique({
      where: { id: coverSpread.id },
      include: {
        placements: { include: { photo: true } },
        textElements: true,
      },
    });
    return this.enrichSpread(updated);
  }

  private enrichSpread(spread: any) {
    return {
      ...spread,
      placements: (spread.placements ?? []).map((p: any) => ({
        ...p,
        photo: p.photo ? this.enrichPhoto(p.photo) : null,
      })),
    };
  }

  private enrichProject(project: any) {
    return {
      ...project,
      photos: (project.photos ?? []).map((p: any) => this.enrichPhoto(p)),
      spreads: (project.spreads ?? []).map((s: any) => this.enrichSpread(s)),
    };
  }
}
