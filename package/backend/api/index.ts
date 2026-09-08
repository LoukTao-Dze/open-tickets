import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import type { Request, Response } from 'express';
import express from 'express';
import { AppModule } from '../src/app.module';
import { getCorsOrigins } from '../src/cors-origins';

// Cached across warm Vercel invocations so we don't re-bootstrap Nest on every request.
let cachedApp: express.Express | undefined;

async function bootstrap(): Promise<express.Express> {
  const expressInstance = express();
  const app = await NestFactory.create(
    AppModule,
    new ExpressAdapter(expressInstance),
  );
  app.setGlobalPrefix('api');
  app.enableCors({
    origin: getCorsOrigins(),
    credentials: true,
  });
  await app.init();
  return expressInstance;
}

export default async function handler(req: Request, res: Response) {
  if (!cachedApp) {
    cachedApp = await bootstrap();
  }
  cachedApp(req, res);
}
