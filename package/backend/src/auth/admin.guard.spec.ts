import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { AuthService } from './auth.service';

const contextFor = (cookie?: string) =>
  ({
    switchToHttp: () => ({ getRequest: () => ({ headers: { cookie } }) }),
  }) as unknown as ExecutionContext;

describe('AdminGuard', () => {
  const sessionId = 'a'.repeat(64);

  const guardFor = (role: string) => {
    const getSession = jest.fn().mockResolvedValue({ user: { role } });
    return {
      guard: new AdminGuard({ getSession } as unknown as AuthService),
      getSession,
    };
  };

  it('allows admins', async () => {
    const { guard, getSession } = guardFor('admin');
    await expect(
      guard.canActivate(contextFor(`open_ticket_session=${sessionId}`)),
    ).resolves.toBe(true);
    expect(getSession).toHaveBeenCalledWith(sessionId);
  });

  it('forbids non-admin roles', async () => {
    const { guard } = guardFor('user');
    await expect(
      guard.canActivate(contextFor(`open_ticket_session=${sessionId}`)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});
