import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const config = app.get(ConfigService);
  const webOrigin = config.get<string>('WEB_ORIGIN') ?? 'http://localhost:5300';
  const adminOrigin = config.get<string>('ADMIN_ORIGIN') ?? 'http://localhost:5301';
  const authorOrigin = config.get<string>('AUTHOR_ORIGIN') ?? 'http://localhost:5302';
  const port = Number(config.get<string>('PORT') ?? 3000);
  const host = config.get<string>('HOST') ?? '0.0.0.0';

  app.setGlobalPrefix('api');
  app.use(json({ limit: '3mb' }));
  app.use(urlencoded({ extended: true, limit: '3mb' }));
  app.enableCors({
    origin: [webOrigin, authorOrigin, adminOrigin],
    credentials: true,
    // 允许浏览器把用户自带的 AI 凭据放在请求头里传给后端（BYOK）。
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-AI-Api-Key',
      'X-AI-Base-Url',
      'X-AI-Model',
    ],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
    }),
  );

  await app.listen(port, host);
  console.log(`Novel API is running on http://${host}:${port}/api`);
}

void bootstrap();
