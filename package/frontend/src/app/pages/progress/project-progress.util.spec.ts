import { KanbanColumn, KanbanProject, KanbanTicket } from '../../interface/kanban.interface';
import { ProjectProgressLog } from '../../services/project.service';
import { calculateProjectProgress, groupProgressLogsByDate } from './project-progress.util';

describe('groupProgressLogsByDate', () => {
  it('groups consecutive logs by date while preserving their order', () => {
    const logs = [
      createLog('log-1', '2026-11-10'),
      createLog('log-2', '2026-11-10'),
      createLog('log-3', '2026-11-09'),
    ];

    expect(groupProgressLogsByDate(logs)).toEqual([
      { date: '2026-11-10', logs: logs.slice(0, 2) },
      { date: '2026-11-09', logs: logs.slice(2) },
    ]);
  });

  it('returns no date groups when there are no logs', () => {
    expect(groupProgressLogsByDate([])).toEqual([]);
  });
});

describe('calculateProjectProgress', () => {
  it('calculates the completed share for each project and reports empty projects as zero', () => {
    const firstProject = createProject('first');
    const secondProject = createProject('second');
    const emptyProject = createProject('empty');
    const columns = [
      createColumn('todo', [createTicket('task-1', firstProject)]),
      createColumn('done', [
        createTicket('task-3', firstProject),
        createTicket('task-4', secondProject),
        createTicket('task-5', secondProject),
      ]),
    ];

    expect(calculateProjectProgress([firstProject, secondProject, emptyProject], columns)).toEqual([
      {
        project: firstProject,
        completedTasks: 1,
        totalTasks: 2,
        percent: 50,
        counts: {
          todo: 1,
          'in-progress': 0,
          'ready-to-test': 0,
          'test-in-progress': 0,
          'test-fail': 0,
          done: 1,
        },
      },
      {
        project: secondProject,
        completedTasks: 2,
        totalTasks: 2,
        percent: 100,
        counts: {
          todo: 0,
          'in-progress': 0,
          'ready-to-test': 0,
          'test-in-progress': 0,
          'test-fail': 0,
          done: 2,
        },
      },
      {
        project: emptyProject,
        completedTasks: 0,
        totalTasks: 0,
        percent: 0,
        counts: {
          todo: 0,
          'in-progress': 0,
          'ready-to-test': 0,
          'test-in-progress': 0,
          'test-fail': 0,
          done: 0,
        },
      },
    ]);
  });

  it('ignores tasks belonging to projects the caller did not provide', () => {
    const project = createProject('visible');
    const hiddenProject = createProject('hidden');

    expect(
      calculateProjectProgress(
        [project],
        [createColumn('todo', [createTicket('task-1', hiddenProject)])],
      ),
    ).toEqual([
      {
        project,
        completedTasks: 0,
        totalTasks: 0,
        percent: 0,
        counts: {
          todo: 0,
          'in-progress': 0,
          'ready-to-test': 0,
          'test-in-progress': 0,
          'test-fail': 0,
          done: 0,
        },
      },
    ]);
  });
});

function createProject(id: string): KanbanProject {
  return { id, project_name: id };
}

function createTicket(id: string, project: KanbanProject): KanbanTicket {
  return {
    id,
    columnId: 'todo',
    title: id,
    priority: 'Medium',
    project,
    meta: [],
    assigneeAvatarUrl: '',
    assigneeAlt: '',
  };
}

function createColumn(id: KanbanColumn['id'], tickets: KanbanTicket[]): KanbanColumn {
  return { id, name: id, count: tickets.length, status: id, tickets };
}

function createLog(id: string, date: string): ProjectProgressLog {
  return {
    id,
    projectId: 'project-1',
    date,
    details: `Details for ${id}`,
    createdBy: 'developer',
    createdAt: `${date}T09:00:00.000Z`,
  };
}
