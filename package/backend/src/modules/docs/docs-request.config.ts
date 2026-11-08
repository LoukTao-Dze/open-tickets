import { INestApplication } from '@nestjs/common';
import { json } from 'express';
import type { RequestHandler } from 'express';

const DOCS_BODY_LIMIT = '1mb';

export function configureDocsBodyParser(app: INestApplication): void {
  const docsJsonParser = json({ limit: DOCS_BODY_LIMIT });
  // Wrap the scoped parser so Nest still installs its bounded global JSON parser.
  const parseDocsBody: RequestHandler = (request, response, next) =>
    docsJsonParser(request, response, next);
  app.use('/api/docs', parseDocsBody);
}
