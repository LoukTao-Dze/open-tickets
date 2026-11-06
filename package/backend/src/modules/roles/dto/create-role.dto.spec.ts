import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { CreateRoleDto } from './create-role.dto';

const validate = (name: unknown) =>
  validateSync(
    plainToInstance(CreateRoleDto, {
      name,
      canEdit: true,
      defaultAccess: 'view',
    }),
  );

describe('CreateRoleDto', () => {
  it.each(['QA reviewer', 'ทีมตรวจสอบ', '  Ops  '])('accepts %j', (name) => {
    expect(validate(name)).toHaveLength(0);
  });

  it.each(['', ' ', 'a', 'x'.repeat(33), 'bad\nname', 42, null])(
    'rejects %j',
    (name) => {
      expect(validate(name).length).toBeGreaterThan(0);
    },
  );
});
