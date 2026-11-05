import type { Request } from 'express';
import { SESSION_COOKIE } from './auth.constants';

export function extractSessionId(request: Request): string | undefined {
  const cookie = request.headers.cookie
    ?.split(';')
    .map((part: string) => part.trim())
    .find((part: string) => part.startsWith(`${SESSION_COOKIE}=`));
  return cookie?.slice(SESSION_COOKIE.length + 1);
}
