import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { v4 as uuid } from 'uuid';
import { existsSync, createReadStream } from 'fs';
import { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UploadResultDto } from './dto/message.dto';
import { AttachmentKind } from '@prisma/client';

const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 МБ

function kindFromMime(mime: string): AttachmentKind {
  if (mime.startsWith('image/')) return AttachmentKind.IMAGE;
  if (mime.startsWith('video/')) return AttachmentKind.VIDEO;
  if (
    mime === 'application/pdf' ||
    mime.includes('word') ||
    mime.includes('excel') ||
    mime.includes('spreadsheet') ||
    mime.includes('presentation')
  )
    return AttachmentKind.DOC;
  return AttachmentKind.FILE;
}

// __dirname at runtime: .../backend/dist/src/messenger → go up 4 levels to project root, then uploads/
const UPLOADS_DIR = join(__dirname, '..', '..', '..', '..', 'uploads');

const storage = diskStorage({
  destination: UPLOADS_DIR,
  filename: (_req, file, cb) => {
    const ext = extname(file.originalname) || '';
    cb(null, `${uuid()}${ext}`);
  },
});

@ApiTags('messenger')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('messenger')
export class UploadController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Загрузить файл/фото/видео (≤ 20 МБ)' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @ApiResponse({ status: 201, type: UploadResultDto })
  @UseInterceptors(
    FileInterceptor('file', {
      storage,
      limits: { fileSize: MAX_SIZE_BYTES },
      fileFilter: (_req, file, cb) => {
        // Запрещаем исполняемые файлы
        const blocked = ['.exe', '.bat', '.cmd', '.sh', '.ps1', '.msi'];
        if (blocked.includes(extname(file.originalname).toLowerCase()))
          return cb(new BadRequestException('Тип файла запрещён'), false);
        cb(null, true);
      },
    }),
  )
  async uploadFile(
    @CurrentUser() u: any,
    @UploadedFile() file: Express.Multer.File,
  ): Promise<UploadResultDto> {
    if (!file) throw new BadRequestException('Файл не получен');
    if (file.size > MAX_SIZE_BYTES)
      throw new BadRequestException(`Файл слишком большой (макс. 20 МБ)`);

    const kind = kindFromMime(file.mimetype);
    const storageKey = file.filename;

    // Сохраняем pending-вложение (messageId = '' — будет заполнен при отправке сообщения)
    await this.prisma.attachment.create({
      data: {
        messageId: '',
        kind,
        storageKey,
        fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
        mime: file.mimetype,
        sizeBytes: file.size,
      },
    });

    return {
      storageKey,
      fileName: Buffer.from(file.originalname, 'latin1').toString('utf8'),
      mime: file.mimetype,
      sizeBytes: file.size,
      kind,
      url: `/api/messenger/files/${storageKey}`,
    };
  }

  @Get('files/:key')
  @ApiOperation({ summary: 'Скачать/отобразить файл по ключу (публичный)' })
  serveFile(@Param('key') key: string, @Res() res: Response) {
    // Защита от path traversal
    if (key.includes('..') || key.includes('/')) throw new BadRequestException('Недопустимый ключ');
    const filePath = join(UPLOADS_DIR, key);
    if (!existsSync(filePath)) {
      res.status(404).send('Not found');
      return;
    }
    const attachment = this.prisma.attachment.findFirst({ where: { storageKey: key } });
    // Отдаём файл — mime определяется по расширению браузером
    res.sendFile(filePath);
  }
}
