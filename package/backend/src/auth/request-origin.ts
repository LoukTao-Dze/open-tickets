import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { getCorsOrigins } from '../cors-origins';

// Reject cross-origin cookie mutations, including deployments with SameSite=None.
export function validateRequestOrigin(request: Request): void {
  const origin = request.get('origin');
  if (origin && !getCorsOrigins().includes(origin)) {
    throw new ForbiddenException();
  }
}
