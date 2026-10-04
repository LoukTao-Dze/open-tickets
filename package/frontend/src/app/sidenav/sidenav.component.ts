import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { ProjectApiService } from '../services/project.service';
import { KanbanProject } from '../interface/kanban.interface';

export interface SidenavLink {
  icon: string;
  label: string;
  route: string;
  isActive: boolean;
}

@Component({
  selector: 'app-sidenav',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, RouterLinkActive],
  templateUrl: './sidenav.component.html',
  styleUrls: ['./sidenav.component.scss'],
})
export class SidenavComponent implements OnInit {
  projects: KanbanProject[] = [];
  selectedProjectId = '';

  constructor(private readonly projectApi: ProjectApiService) {}

  ngOnInit(): void {
    this.projectApi.getProjects().subscribe({
      next: (projects) => {
        this.projects = projects;
        this.selectedProjectId = projects[0]?.id ?? '';
      },
      error: (error) => console.error('Failed to load projects', error),
    });
  }

  get selectedProject(): KanbanProject | undefined {
    return this.projects.find((project) => project.id === this.selectedProjectId);
  }

  navLinks: SidenavLink[] = [
    { icon: 'view_kanban', label: 'Kanban', route: '/kanban', isActive: true },
    { icon: 'account_tree', label: 'Workspace', route: '/workspace', isActive: true },
    { icon: 'insert_drive_file', label: 'Files', route: '/files', isActive: true },
    { icon: 'folder_open', label: 'Projects', route: '/projects', isActive: true },
    { icon: 'archive', label: 'Files Storage', route: '/files', isActive: false },
    { icon: 'badge', label: 'Roles', route: '/roles', isActive: false },
    { icon: 'dashboard', label: 'Dashboard', route: '/overview', isActive: false },
    { icon: 'settings', label: 'Settings', route: '/settings', isActive: false },
  ];

  bottomNavLinks: SidenavLink[] = [
    { icon: 'help', label: 'Support', route: '/support', isActive: true },
    { icon: 'description', label: 'Docs', route: '/docs', isActive: true },
  ];
}
