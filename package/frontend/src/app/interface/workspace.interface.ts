import { EnumWorkspaceItemType } from '../enum/workspace.enum';

export type CanvasItemType = EnumWorkspaceItemType;

export interface CanvasItemBase {
  id: string;
  type: CanvasItemType;
  x: number;
  y: number;
  zIndex: number;
}

export interface StickyNoteItem extends CanvasItemBase {
  type: EnumWorkspaceItemType.STICKY_NOTE;
  label: string;
  content: string;
  bgColor: string;
  textColor: string;
  rotation: number;
  icon: string;
}

export interface UploadedImageItem extends CanvasItemBase {
  type: EnumWorkspaceItemType.IMAGE;
  fileName: string;
  imageUrl: string;
  imageAlt: string;
  width: number;
  height: number;
  statusIcon: string;
  statusIconClass: string;
  grayscaleHover: boolean;
}

export interface CodeSnippetItem extends CanvasItemBase {
  type: EnumWorkspaceItemType.CODE_SNIPPET;
  fileName: string;
  code: string;
}

export interface TextItem extends CanvasItemBase {
  type: EnumWorkspaceItemType.TEXT;
  content: string;
  fontSize: number;
  color: string;
  width: number;
  height: number;
}

export interface LinkItem extends CanvasItemBase {
  type: EnumWorkspaceItemType.LINK;
  url: string;
  title: string;
}

export type WorkspaceCanvasItem =
  | StickyNoteItem
  | UploadedImageItem
  | CodeSnippetItem
  | TextItem
  | LinkItem;

export interface Whiteboard {
  id: string;
  name: string;
  items: WorkspaceCanvasItem[];
}
