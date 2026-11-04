import { Component, EventEmitter, HostListener, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnumWorkspaceItemType } from '../../../enum/workspace.enum';

export interface ToolHubsButton {
  id: EnumWorkspaceItemType;
  icon: string;
  iconClass?: string;
  isActive?: boolean;
}

export interface StickyNoteColorOption {
  id: string;
  label: string;
  bgColor: string;
  textColor: string;
}

export type InsertableWorkspaceItemType =
  | EnumWorkspaceItemType.STICKY_NOTE
  | EnumWorkspaceItemType.TEXT
  | EnumWorkspaceItemType.LINK
  | EnumWorkspaceItemType.CODE_SNIPPET
  | EnumWorkspaceItemType.IMAGE
  | EnumWorkspaceItemType.MARKDOWN;

export interface InsertToolEvent {
  type: InsertableWorkspaceItemType;
  color?: StickyNoteColorOption;
}

const STICKY_NOTE_COLOR_OPTIONS: StickyNoteColorOption[] = [
  { id: 'amber', label: 'Amber', bgColor: '#fde68a', textColor: '#451a03' },
  { id: 'green', label: 'Green', bgColor: '#bbf7d0', textColor: '#064e3b' },
  { id: 'orange', label: 'Orange', bgColor: '#fed7aa', textColor: '#7c2d12' },
  { id: 'blue', label: 'Blue', bgColor: '#bfdbfe', textColor: '#1e3a8a' },
  { id: 'pink', label: 'Pink', bgColor: '#fbcfe8', textColor: '#831843' },
  { id: 'violet', label: 'Violet', bgColor: '#ddd6fe', textColor: '#4c1d95' },
];

const INSERTABLE_TOOL_TYPES: ReadonlySet<EnumWorkspaceItemType> = new Set([
  EnumWorkspaceItemType.TEXT,
  EnumWorkspaceItemType.LINK,
  EnumWorkspaceItemType.CODE_SNIPPET,
  EnumWorkspaceItemType.IMAGE,
  EnumWorkspaceItemType.MARKDOWN,
  EnumWorkspaceItemType.STICKY_NOTE,
]);

@Component({
  selector: 'app-tool-hubs',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tool-hubs.component.html',
  styleUrl: './tool-hubs.component.scss',
})
export class ToolHubsComponent {
  @Output() insertItem = new EventEmitter<InsertToolEvent>();

  readonly EnumWorkspaceItemType = EnumWorkspaceItemType;
  readonly stickyNoteColorOptions = STICKY_NOTE_COLOR_OPTIONS;

  readonly primaryTools: ToolHubsButton[] = [
    { id: EnumWorkspaceItemType.SELECT, icon: 'near_me', isActive: true },
    { id: EnumWorkspaceItemType.PEN, icon: 'edit', isActive: false },
  ];

  readonly insertTools: ToolHubsButton[] = [
    {
      id: EnumWorkspaceItemType.STICKY_NOTE,
      icon: 'sticky_note_2',
      iconClass: 'text-[#fde68a]',
      isActive: true,
    },
    { id: EnumWorkspaceItemType.SHAPES, icon: 'category', isActive: false },
    { id: EnumWorkspaceItemType.TEXT, icon: 'text_fields', isActive: true },
    { id: EnumWorkspaceItemType.LINK, icon: 'link', isActive: true },
    { id: EnumWorkspaceItemType.IMAGE, icon: 'image', isActive: true },
    { id: EnumWorkspaceItemType.CODE_SNIPPET, icon: 'code', isActive: true },
    { id: EnumWorkspaceItemType.MARKDOWN, icon: 'markdown', isActive: true },
  ];

  readonly historyTools: ToolHubsButton[] = [
    { id: EnumWorkspaceItemType.UNDO, icon: 'undo', isActive: true },
    { id: EnumWorkspaceItemType.REDO, icon: 'redo', isActive: true },
  ];

  activeToolId = EnumWorkspaceItemType.SELECT;
  isStickyNoteColorPickerOpen = false;

  selectTool(id: EnumWorkspaceItemType) {
    this.activeToolId = id;
  }

  onInsertToolClick(tool: ToolHubsButton) {
    if (tool.id === EnumWorkspaceItemType.STICKY_NOTE) {
      this.activeToolId = tool.id;
      this.isStickyNoteColorPickerOpen = !this.isStickyNoteColorPickerOpen;
      return;
    }

    this.isStickyNoteColorPickerOpen = false;
    this.activeToolId = tool.id;

    if (INSERTABLE_TOOL_TYPES.has(tool.id as EnumWorkspaceItemType)) {
      this.insertItem.emit({ type: tool.id as InsertableWorkspaceItemType });
    }
  }

  chooseStickyNoteColor(color: StickyNoteColorOption) {
    this.isStickyNoteColorPickerOpen = false;
    this.activeToolId = EnumWorkspaceItemType.SELECT;
    this.insertItem.emit({ type: EnumWorkspaceItemType.STICKY_NOTE, color });
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: MouseEvent) {
    if (!this.isStickyNoteColorPickerOpen) {
      return;
    }

    const target = event.target as HTMLElement;
    if (!target.closest('.tool-hubs')) {
      this.isStickyNoteColorPickerOpen = false;
    }
  }
}
