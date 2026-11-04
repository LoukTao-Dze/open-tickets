import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { LOGIN_WINDOW_SECONDS } from './auth.constants';
import { SessionMetadata, SessionStore } from './session-store';

const SESSIONS_TABLE = 'auth_sessions';
const RECORD_ATTEMPT_FUNCTION = 'record_login_attempt';

interface SessionRow {
  session: unknown;
  expires_at: string;
}

@Injectable()
export class DatabaseSessionService extends SessionStore {
  private readonly logger = new Logger(DatabaseSessionService.name);

  constructor(private readonly supabase: SupabaseService) {
    super();
  }

  private unavailable(
    operation: string,
    errorCode?: string,
  ): ServiceUnavailableException {
    // Database errors can include query details; log only the operation and error code.
    this.logger.error(
      `Session database ${operation} failed${errorCode ? ` (code ${errorCode})` : ''}`,
    );
    return new ServiceUnavailableException(
      'Authentication temporarily unavailable',
    );
  }

  async setSession(
    sessionId: string,
    value: string,
    ttl: number,
    metadata: SessionMetadata,
  ): Promise<void> {
    // create_date is omitted so an update keeps the original value.
    const { error } = await this.supabase
      .getClient()
      .from(SESSIONS_TABLE)
      .upsert(
        {
          session_id: sessionId,
          session: JSON.parse(value) as unknown,
          ttl,
          auth_provider: metadata.authProvider,
          expires_at: metadata.expiresAt,
          update_date: new Date().toISOString(),
        },
        { onConflict: 'session_id' },
      );
    if (error) throw this.unavailable('upsert', error.code);
    await this.deleteExpiredSessions();
  }

  async getSession(sessionId: string): Promise<string | null> {
    const { data, error } = await this.supabase
      .getClient()
      .from(SESSIONS_TABLE)
      .select('session, expires_at')
      .eq('session_id', sessionId)
      .maybeSingle<SessionRow>();
    if (error) throw this.unavailable('read', error.code);
    if (!data || Date.parse(data.expires_at) <= Date.now()) return null;
    return JSON.stringify(data.session);
  }

  async deleteSession(sessionId: string): Promise<number> {
    const { error, count } = await this.supabase
      .getClient()
      .from(SESSIONS_TABLE)
      .delete({ count: 'exact' })
      .eq('session_id', sessionId);
    if (error) throw this.unavailable('delete', error.code);
    return count ?? 0;
  }

  async recordAttempt(key: string): Promise<number> {
    const response = await this.supabase
      .getClient()
      .rpc(RECORD_ATTEMPT_FUNCTION, {
        p_key: key,
        p_window_seconds: LOGIN_WINDOW_SECONDS,
      });
    const attempts: unknown = response.data;
    if (response.error || typeof attempts !== 'number') {
      throw this.unavailable('rate limit', response.error?.code);
    }
    return attempts;
  }

  // Expired rows are already rejected on read; cleanup is best-effort housekeeping.
  private async deleteExpiredSessions(): Promise<void> {
    const { error } = await this.supabase
      .getClient()
      .from(SESSIONS_TABLE)
      .delete()
      .lte('expires_at', new Date().toISOString());
    if (error) this.logger.warn('Expired session cleanup failed');
  }
}
