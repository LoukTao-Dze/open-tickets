import { Component, EventEmitter, HostListener, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { EnumWorkspaceItemType } from '../../../enum/workspace.enum';
import {
  STICKY_NOTE_COLOR_OPTIONS,
  StickyNoteColorOption,
} from '../../../shared/sticky-note-colors';

export interface ToolHubsButton {
  id: EnumWorkspaceItemType;
  icon: string;
  iconClass?: string;
  isActive?: boolean;
}

export type InsertableWorkspaceItemType =
  | EnumWorkspaceItemType.STICKY_NOTE
  | EnumWorkspaceItemType.TEXT
  | EnumWorkspaceItemType.LINK
  | EnumWorkspaceItemType.CODE_SNIPPET
  | EnumWorkspaceItemType.IMAGE;

export interface InsertToolEvent {
  type: InsertableWorkspaceItemType;
  color?: StickyNoteColorOption;
}

const INSERTABLE_TOOL_TYPES: ReadonlySet<EnumWorkspaceItemType> = new Set([
  EnumWorkspaceItemType.TEXT,
  EnumWorkspaceItemType.LINK,
  EnumWorkspaceItemType.CODE_SNIPPET,
  EnumWorkspaceItemType.IMAGE,
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
