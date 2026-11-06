// Custom roles are read-only on the work pages until the server reports their edit permission.
const EDITOR_ROLES: readonly string[] = ['admin', 'user'];

export const isReadOnlyRole = (role: string): boolean => !EDITOR_ROLES.includes(role);
