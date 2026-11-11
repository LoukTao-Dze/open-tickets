import { KanbanColumn, KanbanColumnId, KanbanProject } from '../../interface/kanban.interface';
import type { ProjectProgressLog } from '../../services/project.service';

export interface ProjectProgress {
  project: KanbanProject;
  completedTasks: number;
  totalTasks: number;
  percent: number;
  counts: Record<KanbanColumnId, number>;
}

export interface ProjectProgressLogGroup {
  date: string;
  logs: ProjectProgressLog[];
}

export function groupProgressLogsByDate(
  logs: readonly ProjectProgressLog[],
): ProjectProgressLogGroup[] {
  return logs.reduce<ProjectProgressLogGroup[]>((groups, log) => {
    let group = groups[groups.length - 1];
    if (!group || group.date !== log.date) {
      group = { date: log.date, logs: [] };
      groups.push(group);
    }
    group.logs.push(log);
    return groups;
  }, []);
}

export function calculateProjectProgress(
  projects: readonly KanbanProject[],
  columns: readonly KanbanColumn[],
): ProjectProgress[] {
  const taskCounts = new Map<
    string,
    { completed: number; total: number; counts: Record<KanbanColumnId, number> }
  >();

  for (const project of projects) {
    taskCounts.set(project.id, {
      completed: 0,
      total: 0,
      counts: {
        todo: 0,
        'in-progress': 0,
        'ready-to-test': 0,
        'test-in-progress': 0,
        'test-fail': 0,
        done: 0,
      },
    });
  }

  for (const column of columns) {
    for (const ticket of column.tickets) {
      const counts = taskCounts.get(ticket.project?.id ?? '');
      if (!counts) {
        continue;
      }

      counts.total += 1;
      counts.counts[column.id] += 1;
      if (column.id === 'done') {
        counts.completed += 1;
      }
    }
  }

  return projects.map((project) => {
    const counts = taskCounts.get(project.id)!;
    return {
      project,
      completedTasks: counts.completed,
      totalTasks: counts.total,
      percent: counts.total ? Math.round((counts.completed / counts.total) * 100) : 0,
      counts: counts.counts,
    };
  });
}
