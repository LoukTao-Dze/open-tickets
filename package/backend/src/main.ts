import * as dotenv from 'dotenv';
import { createApp } from './bootstrap';

dotenv.config();

async function bootstrap() {
  const app = await createApp();
  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
