export interface StickyNoteColorOption {
  id: string;
  label: string;
  bgColor: string;
  textColor: string;
}

export const STICKY_NOTE_COLOR_OPTIONS: StickyNoteColorOption[] = [
  { id: 'amber', label: 'Amber', bgColor: '#fde68a', textColor: '#451a03' },
  { id: 'green', label: 'Green', bgColor: '#bbf7d0', textColor: '#064e3b' },
  { id: 'orange', label: 'Orange', bgColor: '#fed7aa', textColor: '#7c2d12' },
  { id: 'blue', label: 'Blue', bgColor: '#bfdbfe', textColor: '#1e3a8a' },
  { id: 'pink', label: 'Pink', bgColor: '#fbcfe8', textColor: '#831843' },
  { id: 'violet', label: 'Violet', bgColor: '#ddd6fe', textColor: '#4c1d95' },
];
