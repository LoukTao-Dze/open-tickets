// Shared between the local/Docker entrypoint (main.ts) and the Vercel serverless entrypoint (api/index.ts).
export function getCorsOrigins(): string[] {
  const configured = process.env.CORS_ORIGINS?.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (configured?.length) {
    return configured;
  }

  return [`http://localhost:${process.env.FRONT_END_PORT ?? 4200}`];
}
