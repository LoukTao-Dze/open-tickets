export type KanbanPriority = 'Low' | 'Medium' | 'High' | 'Urgent';

export type KanbanColumnId = string;

export interface KanbanMeta {
  icon: string;
  label: string;
}

export interface KanbanProject {
  id: string;
  project_name: string;
  description?: string | null;
  isDefault?: boolean;
  priority?: string;
  deadline?: string | null;
  status?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface KanbanTicket {
  id: string;
  columnId: KanbanColumnId;
  title: string;
  priority: KanbanPriority;
  project: KanbanProject;
  meta: KanbanMeta[];
  assigneeAvatarUrl: string;
  assigneeAlt: string;
  alert?: string;
  detail?: string;
  createDate?: string;
  updateDate?: string;
  taskType?: string;
  jobType?: string;
}

export interface KanbanColumn {
  id: KanbanColumnId;
  name: string;
  color: string;
  count: number;
  status: string;
  tickets: KanbanTicket[];
}
