import * as sharpImport from 'sharp';
import { createWriteStream, createReadStream } from 'fs';
import { Logger } from '@nestjs/common';
import axios from 'axios';
import * as FormData from 'form-data';

export interface EnhanceOutput {
  width: number;
  height: number;
}

export interface EnhanceJobResult {
  jobId: string;
}

export interface EnhanceContext {
  /** Target pixel dimensions for print at 300 DPI. Undefined = use default ×2. */
  targetW?: number;
  targetH?: number;
}

export interface ImageEnhanceClient {
  /** Start enhancement: returns jobId. Poll getJobStatus() until done. */
  startEnhance(
    originalPath: string,
    enhancedPath: string,
    enhancedThumbPath: string,
    ctx?: EnhanceContext,
  ): Promise<EnhanceJobResult>;

  /** Poll job status. Returns status + optional dimensions when done. */
  getJobStatus(jobId: string): Promise<{
    status: 'pending' | 'processing' | 'done' | 'error';
    progress: number;
    message: string;
    width?: number;
    height?: number;
  }>;

  /** Download result and write to enhancedPath when done. */
  downloadResult(jobId: string, enhancedPath: string, enhancedThumbPath: string): Promise<EnhanceOutput>;
}

// ──────────────────────────────────────────────────────────────────────────────
//  AI Enhance Client (calls Python FastAPI enhance-service on port 8001)
// ──────────────────────────────────────────────────────────────────────────────

export class AiEnhanceClient implements ImageEnhanceClient {
  private readonly log = new Logger('AiEnhanceClient');
  private readonly baseUrl: string;

  constructor(baseUrl = 'http://127.0.0.1:8001') {
    this.baseUrl = baseUrl;
  }

  async startEnhance(
    originalPath: string,
    _enhancedPath: string,
    _enhancedThumbPath: string,
    ctx?: EnhanceContext,
  ): Promise<EnhanceJobResult> {
    const form = new FormData();
    form.append('file', createReadStream(originalPath));
    if (ctx?.targetW) form.append('target_w', String(ctx.targetW));
    if (ctx?.targetH) form.append('target_h', String(ctx.targetH));

    const { data } = await axios.post(
      `${this.baseUrl}/enhance/start`,
      form,
      { headers: form.getHeaders(), timeout: 10_000 },
    );
    if (!data.job_id) throw new Error('enhance-service did not return job_id');
    this.log.log(`AI enhance job started: ${data.job_id}`);
    return { jobId: data.job_id };
  }

  async getJobStatus(jobId: string) {
    const { data } = await axios.get(`${this.baseUrl}/enhance/status/${jobId}`, { timeout: 5_000 });
    return {
      status: data.status as 'pending' | 'processing' | 'done' | 'error',
      progress: data.progress ?? 0,
      message: data.message ?? '',
      width: data.width,
      height: data.height,
    };
  }

  async downloadResult(jobId: string, enhancedPath: string, enhancedThumbPath: string): Promise<EnhanceOutput> {
    const sharp = (sharpImport as any).default ?? sharpImport;

    // Stream download to file
    const response = await axios.get(`${this.baseUrl}/enhance/result/${jobId}`, {
      responseType: 'stream',
      timeout: 30_000,
    });
    await new Promise<void>((resolve, reject) => {
      const writer = createWriteStream(enhancedPath);
      response.data.pipe(writer);
      writer.on('finish', resolve);
      writer.on('error', reject);
    });

    const meta = await sharp(enhancedPath).metadata();
    const width: number = meta.width ?? 0;
    const height: number = meta.height ?? 0;

    await sharp(enhancedPath)
      .resize({ width: 600, withoutEnlargement: true })
      .jpeg({ quality: 82 })
      .toFile(enhancedThumbPath);

    return { width, height };
  }
}

// ──────────────────────────────────────────────────────────────────────────────
//  Fallback: sharp-based (brightness/contrast/sharpen only)
// ──────────────────────────────────────────────────────────────────────────────

export class SharpEnhanceClient implements ImageEnhanceClient {
  private readonly log = new Logger('SharpEnhanceClient');
  // Sharp processes synchronously — wrap in a synthetic single job.
  private readonly jobs = new Map<string, {
    status: 'pending' | 'processing' | 'done' | 'error';
    progress: number;
    message: string;
    width?: number;
    height?: number;
    enhancedPath?: string;
    enhancedThumbPath?: string;
  }>();

  async startEnhance(
    originalPath: string,
    enhancedPath: string,
    enhancedThumbPath: string,
    _ctx?: EnhanceContext,
  ): Promise<EnhanceJobResult> {
    const jobId = `sharp_${Date.now()}`;
    this.jobs.set(jobId, { status: 'processing', progress: 10, message: 'Улучшение...' });

    // Run synchronously but set done right away (sharp is fast)
    setImmediate(async () => {
      const j = this.jobs.get(jobId)!;
      try {
        const sharp = (sharpImport as any).default ?? sharpImport;
        const meta = await sharp(originalPath).metadata();
        const width: number = meta.width ?? 0;
        const height: number = meta.height ?? 0;

        await sharp(originalPath)
          .sharpen({ sigma: 1.1, m1: 0.5, m2: 0.5 })
          .normalise()
          .modulate({ brightness: 1.03, saturation: 1.1 })
          .jpeg({ quality: 92 })
          .toFile(enhancedPath);

        await sharp(enhancedPath)
          .resize({ width: 600, withoutEnlargement: true })
          .jpeg({ quality: 82 })
          .toFile(enhancedThumbPath);

        j.status = 'done';
        j.progress = 100;
        j.message = 'Готово (sharp fallback)';
        j.width = width;
        j.height = height;
        j.enhancedPath = enhancedPath;
        j.enhancedThumbPath = enhancedThumbPath;
        this.log.warn('AI enhance-service unavailable — used sharp fallback');
      } catch (err) {
        j.status = 'error';
        j.message = String(err);
        this.log.error('Sharp enhance error', err);
      }
    });

    return { jobId };
  }

  async getJobStatus(jobId: string) {
    const j = this.jobs.get(jobId);
    if (!j) return { status: 'error' as const, progress: 0, message: 'Unknown job' };
    return { status: j.status, progress: j.progress, message: j.message, width: j.width, height: j.height };
  }

  async downloadResult(_jobId: string, _enhancedPath: string, _enhancedThumbPath: string): Promise<EnhanceOutput> {
    const j = this.jobs.get(_jobId);
    if (!j || j.status !== 'done') throw new Error('Job not done');
    return { width: j.width ?? 0, height: j.height ?? 0 };
  }
}


// ──────────────────────────────────────────────────────────────────────────────
//  Factory
// ──────────────────────────────────────────────────────────────────────────────

export async function createEnhanceClient(): Promise<ImageEnhanceClient> {
  const log = new Logger('EnhanceFactory');
  const aiUrl = process.env.ENHANCE_SERVICE_URL ?? 'http://127.0.0.1:8001';

  try {
    const { data } = await axios.get(`${aiUrl}/health`, { timeout: 2000 });
    if (data?.status === 'ok') {
      log.log('AI enhance-service reachable — using AiEnhanceClient');
      return new AiEnhanceClient(aiUrl);
    }
  } catch {
    log.warn('AI enhance-service not reachable — falling back to SharpEnhanceClient');
  }

  return new SharpEnhanceClient();
}
