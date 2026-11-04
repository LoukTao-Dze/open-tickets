import { EnumAuthProvider } from './auth.dto';

export interface SessionMetadata {
  authProvider: EnumAuthProvider;
  expiresAt: string;
}

export abstract class SessionStore {
  abstract setSession(
    key: string,
    value: string,
    ttl: number,
    metadata: SessionMetadata,
  ): Promise<unknown>;
  abstract getSession(key: string): Promise<string | null>;
  abstract deleteSession(key: string): Promise<unknown>;
  abstract recordAttempt(key: string): Promise<number>;
}
