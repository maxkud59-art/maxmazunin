import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Res,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import { existsSync } from 'fs';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { BookLayoutService } from './book-layout.service';
import { LAYOUT_TEMPLATES } from './layout-templates';
import { BookSize } from '@prisma/client';

const UPLOADS_DIR = join(__dirname, '..', '..', '..', '..', 'uploads');
const BOOKS_DIR = join(UPLOADS_DIR, 'books');

const imageStorage = diskStorage({
  destination: BOOKS_DIR,
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname).toLowerCase() || '.jpg';
    cb(null, `${uuid()}${ext}`);
  },
});

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp', '.heic', '.heif', '.avif', '.tiff'];

@ApiTags('book-layout')
@Controller('book-layout')
export class BookLayoutController {
  constructor(private readonly svc: BookLayoutService) {}

  // ─── Templates (public static) ──────────────────────────────────────────

  @Get('templates')
  @ApiOperation({ summary: 'Список шаблонов компоновки' })
  getTemplates() {
    return LAYOUT_TEMPLATES;
  }

  // ─── Projects ────────────────────────────────────────────────────────────

  @Get('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Список проектов пользователя' })
  listProjects(@CurrentUser() u: any) {
    return this.svc.listProjects(u.id);
  }

  @Post('projects')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Создать проект' })
  createProject(@CurrentUser() u: any, @Body() body: { title: string; size: BookSize }) {
    if (!body.title?.trim()) throw new BadRequestException('Название обязательно');
    if (!Object.values(BookSize).includes(body.size)) throw new BadRequestException('Неверный размер');
    return this.svc.createProject(u.id, body.title.trim(), body.size);
  }

  @Get('projects/share/:token')
  @ApiOperation({ summary: 'Открыть проект по shareToken (без авторизации)' })
  getByToken(@Param('token') token: string) {
    return this.svc.getProjectByToken(token);
  }

  @Get('projects/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить проект с разворотами и фото' })
  getProject(@Param('id') id: string, @CurrentUser() u: any) {
    return this.svc.getProject(id, u.id);
  }

  @Patch('projects/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Обновить заголовок / номер заказа' })
  updateProject(
    @Param('id') id: string,
    @CurrentUser() u: any,
    @Body() body: { title?: string; orderNumber?: string | null },
  ) {
    return this.svc.updateProject(id, u.id, body);
  }

  @Delete('projects/:id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить проект' })
  async deleteProject(@Param('id') id: string, @CurrentUser() u: any) {
    await this.svc.deleteProject(id, u.id);
    return { ok: true };
  }

  // ─── Photos ──────────────────────────────────────────────────────────────

  @Post('projects/:id/photos')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Загрузить фотографии (несколько файлов)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { files: { type: 'array', items: { type: 'string', format: 'binary' } } },
    },
  })
  @UseInterceptors(
    FilesInterceptor('files', 50, {
      storage: imageStorage,
      limits: { fileSize: 30 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname).toLowerCase();
        if (!IMAGE_EXTENSIONS.includes(ext))
          return cb(new BadRequestException(`Неподдерживаемый формат: ${ext}`), false);
        cb(null, true);
      },
    }),
  )
  async uploadPhotos(
    @Param('id') projectId: string,
    @CurrentUser() u: any,
    @UploadedFiles() files: Express.Multer.File[],
  ) {
    if (!files?.length) throw new BadRequestException('Файлы не получены');
    const results = await Promise.all(
      files.map((f) => this.svc.uploadPhoto(projectId, u.id, f)),
    );
    return results;
  }

  @Delete('photos/:photoId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить фотографию' })
  async deletePhoto(@Param('photoId') photoId: string, @CurrentUser() u: any) {
    await this.svc.deletePhoto(photoId, u.id);
    return { ok: true };
  }

  @Get('photos/:photoId/quality')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Получить оценку качества печати фото' })
  getPhotoQuality(
    @Param('photoId') photoId: string,
    @CurrentUser() u: any,
    @Query('bookSize') bookSize = 'S20x20',
    @Query('templateId') templateId = '1',
    @Query('cellIndex') cellIndex = '0',
  ) {
    return this.svc.getPhotoQuality(photoId, u.id, bookSize, templateId, Number(cellIndex));
  }

  @Post('photos/:photoId/enhance/start')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Запустить AI-улучшение фото (async). Возвращает jobId для поллинга.' })
  enhancePhotoStart(
    @Param('photoId') photoId: string,
    @CurrentUser() u: any,
    @Body() body?: { bookSize?: string; templateId?: string; cellIndex?: number },
  ) {
    return this.svc.enhancePhotoStart(photoId, u.id, body ?? {});
  }

  @Get('photos/:photoId/enhance/job/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Статус задачи улучшения фото' })
  getEnhanceJobStatus(
    @Param('photoId') _photoId: string,
    @Param('jobId') jobId: string,
    @CurrentUser() u: any,
  ) {
    return this.svc.getEnhanceJobStatus(jobId, u.id);
  }

  @Post('photos/:photoId/enhance')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Улучшить фото (sync, fallback). Используй /enhance/start для async.' })
  enhancePhoto(@Param('photoId') photoId: string, @CurrentUser() u: any) {
    return this.svc.enhancePhoto(photoId, u.id);
  }

  @Post('photos/:photoId/enhance/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Применить/откатить улучшение фото' })
  applyEnhancement(
    @Param('photoId') photoId: string,
    @CurrentUser() u: any,
    @Body() body: { apply: boolean },
  ) {
    return this.svc.applyEnhancement(photoId, u.id, body.apply ?? true);
  }

  // ─── Travelbook cover generation ─────────────────────────────────────────

  @Post('projects/:id/cover/generate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Запустить генерацию обложки (тревелбук)' })
  startCoverGeneration(
    @Param('id') projectId: string,
    @CurrentUser() u: any,
    @Body() body: { location: string; style: string; bookSize: string; seed?: number },
  ) {
    return this.svc.startCoverGeneration(projectId, u.id, body);
  }

  @Get('cover/generate/status/:jobId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Статус задачи генерации обложки' })
  getCoverStatus(@Param('jobId') jobId: string, @CurrentUser() u: any) {
    return this.svc.getCoverStatus(jobId, u.id);
  }

  @Post('projects/:id/cover/apply')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Применить сгенерированную обложку к проекту' })
  applyCoverResult(
    @Param('id') projectId: string,
    @CurrentUser() u: any,
    @Body() body: { jobId: string; title?: string; subtitle?: string; style?: string },
  ) {
    return this.svc.applyCoverResult(
      projectId, u.id, body.jobId, body.title ?? '', body.subtitle ?? '', body.style ?? 'минимал',
    );
  }

  // ─── Spreads ──────────────────────────────────────────────────────────────

  @Post('projects/:id/spreads')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Добавить разворот' })
  addSpread(@Param('id') projectId: string, @CurrentUser() u: any) {
    return this.svc.addSpread(projectId, u.id);
  }

  @Delete('spreads/:spreadId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Удалить разворот' })
  async deleteSpread(@Param('spreadId') spreadId: string, @CurrentUser() u: any) {
    await this.svc.deleteSpread(spreadId, u.id);
    return { ok: true };
  }

  @Patch('spreads/:spreadId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Сохранить компоновку разворота (шаблон, расстановка, текст)' })
  saveSpread(
    @Param('spreadId') spreadId: string,
    @CurrentUser() u: any,
    @Body()
    body: {
      templateId?: string;
      placements?: { photoId: string; cellIndex: number; rotation?: number; scale?: number; panX?: number; panY?: number }[];
      textElements?: {
        text: string;
        fontFamily: string;
        fontSize: number;
        color: string;
        x: number;
        y: number;
        w: number;
        h: number;
      }[];
    },
  ) {
    return this.svc.saveSpread(spreadId, u.id, body);
  }

  // ─── Auto-layout ─────────────────────────────────────────────────────────

  @Post('projects/:id/auto-layout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Авто-расстановка фото по хронологии (≤8 на разворот)' })
  autoLayout(@Param('id') projectId: string, @CurrentUser() u: any) {
    return this.svc.autoLayout(projectId, u.id);
  }

  // ─── File serving ─────────────────────────────────────────────────────────

  @Get('files/originals/:key')
  @ApiOperation({ summary: 'Отдать оригинал фото' })
  serveOriginal(@Param('key') key: string, @Res() res: Response) {
    const path = this.svc.filePath(key, false);
    if (!existsSync(path)) return res.status(404).send('Not found');
    res.sendFile(path);
  }

  @Get('files/thumbs/:key')
  @ApiOperation({ summary: 'Отдать превью фото' })
  serveThumb(@Param('key') key: string, @Res() res: Response) {
    const path = this.svc.filePath(key, true);
    if (!existsSync(path)) return res.status(404).send('Not found');
    res.sendFile(path);
  }
}
