import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { join } from 'path';
import { PrismaModule } from '../prisma/prisma.module';
import { MessengerController } from './messenger.controller';
import { UploadController } from './upload.controller';
import { MessengerService } from './messenger.service';
import { PermissionService } from './permission.service';
import { MessengerGateway } from './messenger.gateway';

@Module({
  imports: [
    PrismaModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET'),
      }),
    }),
    MulterModule.register({
      dest: join(process.cwd(), '..', 'uploads'),
    }),
  ],
  controllers: [MessengerController, UploadController],
  providers: [MessengerService, PermissionService, MessengerGateway],
  exports: [MessengerGateway],
})
export class MessengerModule {}
