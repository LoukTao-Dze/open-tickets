import { UnauthorizedException } from '@nestjs/common';
import { SESSION_COOKIE } from '../../auth/auth.constants';
import { MenuAccessController } from './menu-access.controller';

describe('MenuAccessController', () => {
  afterEach(() => jest.clearAllMocks());

  it('uses the role in the verified session, not a request parameter', async () => {
    const getMenuAccess = jest.fn().mockResolvedValue(['projects']);
    const getSession = jest.fn().mockResolvedValue({ user: { role: 'guest' } });
    const controller = new MenuAccessController(
      { getMenuAccess } as never,
      { getSession } as never,
    );
    const request = {
      headers: { cookie: `${SESSION_COOKIE}=session-id` },
      query: { role: 'admin' },
    };
    await expect(controller.getMenuAccess(request as never)).resolves.toEqual([
      'projects',
    ]);
    expect(getSession).toHaveBeenCalledWith('session-id');
    expect(getMenuAccess).toHaveBeenCalledWith('guest');
  });

  it('does not load menus without a valid session', async () => {
    const getMenuAccess = jest.fn();
    const getSession = jest.fn().mockRejectedValue(new UnauthorizedException());
    const controller = new MenuAccessController(
      { getMenuAccess } as never,
      { getSession } as never,
    );
    await expect(
      controller.getMenuAccess({ headers: {} } as never),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(getMenuAccess).not.toHaveBeenCalled();
  });
});
