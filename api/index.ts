import { createApp } from "../package/backend/src/bootstrap";

type HttpHandler = (request: unknown, response: unknown) => void;

let appPromise: Promise<HttpHandler> | undefined;

async function getApp(): Promise<HttpHandler> {
  appPromise ??= createApp().then(async (nestApp) => {
    await nestApp.init();
    return nestApp.getHttpAdapter().getInstance() as HttpHandler;
  });

  return appPromise;
}

export default async function handler(
  request: unknown,
  response: unknown,
): Promise<void> {
  const app = await getApp();
  app(request, response);
}
