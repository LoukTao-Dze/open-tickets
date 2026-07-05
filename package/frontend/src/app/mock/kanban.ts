import { KanbanColumn, KanbanProject } from '../interface/kanban.interface';

const PROJECT_PLATFORM_CORE: KanbanProject = {
  id: crypto.randomUUID(),
  project_name: 'Platform Core',
};

const PROJECT_WEB_FRONTEND: KanbanProject = {
  id: crypto.randomUUID(),
  project_name: 'Web Frontend',
};

const PROJECT_DOCUMENTATION_PORTAL: KanbanProject = {
  id: crypto.randomUUID(),
  project_name: 'Documentation Portal',
};

export const MOCK_KAN_BAN: KanbanColumn[] = [
  {
    id: 'todo',
    name: 'To Do',
    count: 4,
    tickets: [
      {
        id: 'DS-1024',
        title: 'Implement OAuth2 middleware for API gateway',
        priority: 'Low',
        project: PROJECT_PLATFORM_CORE,
        meta: [
          { icon: 'chat_bubble', label: '3' },
          { icon: 'attach_file', label: '1' },
        ],
        assigneeAvatarUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuDgRxqwsRHSxQveTP1EjxLEapNgi9M0qpYn_IbPKxR0HpO818sJqExFXKbKusB58qLO1hv5-di4uHCejiTJkUnLYTcmNfIYJW1IPqosIi84B891XVJyh6qejPPdD9DX8RpUNBjTodDSYBZFHhcvwKlpLUREwuXCQiyyPyYhhp1XNs6-juUwt5Vlk94KtbAqyVrZG2FpJ0AJZp68pceQfJkpNklRcHvEnKrFF37fBOdY_iCZp-k5xIu-Y3TuMGomhmQ1FOGC5dZgwoR5',
        assigneeAlt: 'Assignee',
      },
    ],
  },
  {
    id: 'in-progress',
    name: 'In Progress',
    count: 2,
    tickets: [
      {
        id: 'DS-988',
        title: 'Database migration for multi-tenant shard support',
        priority: 'High',
        project: PROJECT_PLATFORM_CORE,
        meta: [{ icon: 'history', label: '2d ago' }],
        assigneeAvatarUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuCSw17eCwdZitofOGA6BI2Mvyly1DTbckEp1Tgj0LMruxZ1u3I47Jr4ZoNk8FLxy_J58BZSv7SeZdZH2bcRMI26pkaXfSo5h9uEA-P-Hz_sMG97d5o41rU8qNHQmlqOkpOi8dYiJzKMKq4YvKFWak0dxpgS4-0TpBFiVhGLpAo41TAbutka4pDcgpLT64W96UbxWL6VRUasWKvtnYZGfSBnX2m-0mkw_X0XxwF1pXG7fnJe9O07h6_yIgzJvhke8w4GEDftfkmfm6RI',
        assigneeAlt: 'Assignee',
      },
    ],
  },
  {
    id: 'ready-to-test',
    name: 'Ready to Test',
    count: 1,
    tickets: [
      {
        id: 'DS-1045',
        title: 'Refactor frontend component library to Tailwind v4',
        priority: 'Medium',
        project: PROJECT_WEB_FRONTEND,
        meta: [{ icon: 'bolt', label: 'Ready' }],
        assigneeAvatarUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuA1yX4u3_o06-JQcxG6ZUyTCaTsyVJfcnq2WaxlVZr9b-iHJtbXh8Skdv6Qi1h-gmRHKsbTIGaaKgqC5U7PmjUQTa-k-MbAZw2G321JSGsyjRNlyNh334hIR1XMF1yqK9jrUi4zX9BPv5NDM8c9RtBeAxd5XrrKLRTi3FkKZ3VXDmIQmytigY5AAlJv14EmniirvKJ3N-5ADxvmOlhbfhEiM4Z0ej54hMI3vxGABxmSy5kmkA0YBkIwZo7n3nFtYfFJx0foUpB4m2cF',
        assigneeAlt: 'Assignee',
      },
    ],
  },
  {
    id: 'test-in-progress',
    name: 'Test In Progress',
    count: 3,
    tickets: [
      {
        id: 'DS-882',
        title: 'Performance audit on Kubernetes ingress controller',
        priority: 'High',
        project: PROJECT_PLATFORM_CORE,
        meta: [{ icon: 'sync', label: 'In Review' }],
        assigneeAvatarUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuBoAnYB-I2tS5oWI7cXPS54GADsBprL2IUKdvqQdGMAk4RLp_6K8uDtiqMYGCA6FSbYk__QGfipLuLaSNx2ee_QtPhUwDX0V1o7bseHerdIvcyjPoFxtRedUB_7708pd-UTKj45oxHvMNDlZSQ0uRycKryzDhE3e7Zb8TPiwxDaLDuMpn0pNk7MhPPonmMsV-cIBHQ9b13EJ5wMTC66tOnLjIrSQWlaPNV_Lh0ugVD99bCYzR1Lwu6JTlO0qhQ8NVP3TVFBbnFkbanB',
        assigneeAlt: 'Assignee',
      },
    ],
  },
  {
    id: 'test-fail',
    name: 'Test Fail',
    count: 1,
    tickets: [
      {
        id: 'DS-1102',
        title: 'Memory leak in logging microservice under load',
        priority: 'Urgent',
        project: PROJECT_WEB_FRONTEND,
        alert: 'Pipeline #142 failed',
        meta: [{ icon: 'priority_high', label: '4h left' }],
        assigneeAvatarUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuCv5gSszYH73jvwDfhCF5dCSlPQVez_V2Te2Zur8YcferRB34mGWB8oAifLS9D1U8qXkQzF9oeJG7QgPxMY4NsodWJcSKYEo2H1LVfvvX8hH3zwRNXWRrggVYU9JzYJCdYolYkem8V1YuDq0em-ZyYBE3WkpM1kMjdQPUvEkgdJ5InpYMp1yeIS5a-cntx1Rura75nrcNN54usxR4Um9SKwmO3NivUgTXMNKRw6RTbVn25Q0IEy8VC5DuPHLiAWRzOOsLipt50XyUx8',
        assigneeAlt: 'Assignee',
      },
    ],
  },
  {
    id: 'done',
    name: 'Done',
    count: 142,
    tickets: [
      {
        id: 'DS-761',
        title: 'Update documentation for v2.4 Release',
        priority: 'Medium',
        project: PROJECT_DOCUMENTATION_PORTAL,
        meta: [{ icon: 'check_circle', label: '2 days ago' }],
        assigneeAvatarUrl:
          'https://lh3.googleusercontent.com/aida-public/AB6AXuD_vYUfknMeGFSOHgnhgnggBElJrZviScpw3tLSXxM2xPAmr8IfCZGwQjVRjmAxY2n1OVLvPmfi3pqxr_2Z8vK3OUS1cPkeoGXKR7hgkHKLhuQ1V3iR7Y7rdrKKrKXiWAEHEzW6i5BIf4hTJcKSAvOp6XbuQAY3dg9mWjnoqcvDU4UC7C5OFTU42nIKq1VYjkC_KUAHpDdjRC9Yt0_cDSEdRliQ_xY32nmXn1HAMzmiIYcN2OE_rFTuyNxpIWzKbChq6QOQiVPNrzrK',
        assigneeAlt: 'Assignee',
      },
    ],
  },
];
