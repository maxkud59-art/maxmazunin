import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { join } from 'path';
import { mkdirSync } from 'fs';

async function bootstrap() {
  // __dirname (compiled) = .../backend/dist/src → go up 3 to reach project root
  try { mkdirSync(join(__dirname, '..', '..', '..', 'uploads'), { recursive: true }); } catch {}

  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix('api');

  // CORS — разрешаем и HTTP и WebSocket
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }),
  );

  const swaggerConfig = new DocumentBuilder()
    .setTitle('maxmazunin.ru — Personal Cabinet API')
    .setDescription('Private web cabinet REST API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('api/docs', app, document, {
    jsonDocumentUrl: 'api/docs-json',
  });

  const port = process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Backend:    http://localhost:${port}`);
  console.log(`Swagger:    http://localhost:${port}/api/docs`);
  console.log(`OpenAPI JSON: http://localhost:${port}/api/docs-json`);
  console.log(`WS Messenger: ws://localhost:${port}/messenger`);
}

bootstrap();
