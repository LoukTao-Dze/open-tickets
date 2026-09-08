import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

export async function createApp() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');

  const frontendUrl = process.env.FRONTEND_URL;
  const localFrontendUrl = `http://localhost:${process.env.FRONT_END_PORT}`;
  const allowedOrigins = [frontendUrl, localFrontendUrl].filter(
    (origin): origin is string => Boolean(origin),
  );

  app.enableCors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : true,
    credentials: true,
  });

  return app;
}
