import { ComponentFixture, TestBed } from '@angular/core/testing';
import { vi } from 'vitest';
import { EnumWorkspaceItemType } from '../../../enum/workspace.enum';
import { StickyNoteComponent } from './sticky-note.component';

describe('StickyNoteComponent', () => {
  let fixture: ComponentFixture<StickyNoteComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StickyNoteComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StickyNoteComponent);
    fixture.componentInstance.note = {
      id: 1,
      projectId: 'project-1',
      type: EnumWorkspaceItemType.STICKY_NOTE,
      x: 0,
      y: 0,
      width: 200,
      height: 200,
      zIndex: 1,
      label: 'Test',
      content: 'Hello',
      bgColor: '#fff',
      textColor: '#000',
      rotation: 0,
      icon: 'note',
      fontSize: 16,
    };
    fixture.componentInstance.isContentEditing = true;
    fixture.detectChanges();
  });

  it('should stop toolbar button mousedown from bubbling to the canvas drag handler', () => {
    let bubbled = false;
    fixture.nativeElement.addEventListener('mousedown', () => {
      bubbled = true;
    });

    const button = fixture.nativeElement.querySelector('.sticky-note-toolbar-button');
    expect(button).not.toBeNull();

    button.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));

    expect(bubbled).toBe(false);
  });

  it.each([1, 2])(
    'preserves the caret after Enter creates %i empty lines',
    async (emptyLineCount) => {
      const content: HTMLElement = fixture.nativeElement.querySelector('.sticky-note-content');
      for (let lineIndex = 0; lineIndex < emptyLineCount; lineIndex++) {
        const line = document.createElement('div');
        line.append(document.createElement('br'));
        content.append(line);
      }
      const range = document.createRange();
      range.setStart(content.lastChild!, 0);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
      vi.spyOn(fixture.componentInstance, 'updateActiveFormats').mockImplementation(() => {});

      content.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await new Promise<void>((resolve) => setTimeout(resolve));

      expect(selection.anchorNode).toBe(content.lastChild);
      expect(selection.anchorOffset).toBe(0);
      expect(selection.isCollapsed).toBe(true);
    },
  );

  it('preserves the caret after a Shift+Enter line break', async () => {
    const content: HTMLElement = fixture.nativeElement.querySelector('.sticky-note-content');
    content.append(document.createElement('br'), document.createElement('br'));
    const range = document.createRange();
    const caretOffset = 2;
    range.setStart(content, caretOffset);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    vi.spyOn(fixture.componentInstance, 'updateActiveFormats').mockImplementation(() => {});

    content.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await new Promise<void>((resolve) => setTimeout(resolve));

    expect(selection.anchorNode).toBe(content);
    expect(selection.anchorOffset).toBe(caretOffset);
  });
});
