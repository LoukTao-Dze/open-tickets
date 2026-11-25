export const MAIN_MENUS = [
  { key: 'kanban', label: 'Kanban', icon: 'view_kanban' },
  { key: 'workspace', label: 'Workspace', icon: 'account_tree' },
  { key: 'projects', label: 'Projects', icon: 'folder_open' },
  { key: 'progress', label: 'Progress', icon: 'monitoring' },
  { key: 'scenes', label: 'Test scenes', icon: 'fact_check' },
  { key: 'roles', label: 'Roles', icon: 'badge' },
] as const;

export type MenuKey = (typeof MAIN_MENUS)[number]['key'];
