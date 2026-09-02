import { ComponentFixture, TestBed } from '@angular/core/testing';
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
      type: 'sticky-note',
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
      isBold: false,
      isUnderlined: false,
    } as any;
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

    expect(bubbled).toBeFalse();
  });
});
