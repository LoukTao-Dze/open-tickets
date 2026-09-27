import {
  AfterViewInit,
  Component,
  ElementRef,
  HostListener,
  Input,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { javascript } from '@codemirror/lang-javascript';
import { json } from '@codemirror/lang-json';
import { defaultHighlightStyle, indentOnInput, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState, Extension } from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import { CodeSnippetItem } from '../../../interface/workspace.interface';
import {
  computeResizedRect,
  ResizeCorner,
  ResizeStart,
  startResize,
} from '../shared/item-resize.util';

const MIN_WIDTH = 200;
const MIN_HEIGHT = 100;

const EDITOR_THEME = EditorView.theme(
  {
    '&': {
      backgroundColor: 'transparent',
      color: '#c9d1d9',
      height: '100%',
      fontSize: 'inherit',
    },
    '.cm-scroller': {
      fontFamily: 'inherit',
      overflow: 'auto',
      height: '100%',
      '&::-webkit-scrollbar': {
        width: '4px',
        height: '4px',
      },
      '&::-webkit-scrollbar-thumb': {
        background: '#30363d',
        borderRadius: '10px',
      },
    },
    '.cm-content': {
      padding: 0,
      caretColor: '#c9d1d9',
    },
    '.cm-gutters': {
      backgroundColor: 'transparent',
      color: 'rgba(192, 199, 212, 0.3)',
      border: 'none',
    },
    '.cm-activeLine': {
      backgroundColor: 'transparent',
    },
    '.cm-activeLineGutter': {
      backgroundColor: 'transparent',
    },
    '&.cm-focused': {
      outline: 'none',
    },
  },
  { dark: true },
);

@Component({
  selector: 'app-code-snippet',
  standalone: true,
  imports: [],
  templateUrl: './code-snippet.component.html',
  styleUrl: './code-snippet.component.scss',
})
export class CodeSnippetComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) item!: CodeSnippetItem;
  @Input() zoom = 1;
  @ViewChild('codeEditorHost', { static: true }) codeEditorHostRef!: ElementRef<HTMLDivElement>;

  isEditing = false;
  isFileNameEditing = false;
  listShotLanguages: Record<string, string> = {
    ['typescript']: 'ts',
    ['javascript']: 'js',
    ['json']: 'json',
  };

  private editorView?: EditorView;
  private readonly editableCompartment = new Compartment();

  private isResizing = false;
  private activeCorner: ResizeCorner | null = null;
  private resizeStart: ResizeStart = { x: 0, y: 0, width: 0, height: 0, itemX: 0, itemY: 0 };

  ngAfterViewInit() {
    this.editorView = new EditorView({
      state: this.createEditorState(this.item.code),
      parent: this.codeEditorHostRef.nativeElement,
    });
  }

  ngOnDestroy() {
    this.editorView?.destroy();
  }

  onFileNameInput(value: string) {
    this.item.fileName = value;
  }

  onFileNameMouseDown(event: PointerEvent) {
    if (this.isFileNameEditing) {
      event.stopPropagation();
    }
  }

  startEditingFileName(fileNameInput: HTMLInputElement) {
    this.isFileNameEditing = true;
    queueMicrotask(() => fileNameInput.focus());
  }

  stopEditingFileName() {
    this.isFileNameEditing = false;
  }

  onEditorMouseDown(event: PointerEvent) {
    if (this.isEditing) {
      event.stopPropagation();
    }
  }

  onResizeMouseDown(event: PointerEvent, corner: ResizeCorner) {
    event.stopPropagation();
    event.preventDefault();

    this.isResizing = true;
    this.activeCorner = corner;
    this.resizeStart = startResize(event, this.item);
  }

  @HostListener('document:pointermove', ['$event'])
  onDocumentMouseMove(event: PointerEvent) {
    if (!this.isResizing || !this.activeCorner) {
      return;
    }

    const rect = computeResizedRect(
      event,
      this.activeCorner,
      this.resizeStart,
      this.zoom,
      MIN_WIDTH,
      MIN_HEIGHT,
    );

    this.item.x = rect.x;
    this.item.y = rect.y;
    this.item.width = rect.width;
    this.item.height = rect.height;
  }

  @HostListener('document:pointerup')
  @HostListener('document:pointercancel')
  onDocumentMouseUp() {
    this.isResizing = false;
    this.activeCorner = null;
  }

  startEditing() {
    if (this.isEditing) {
      return;
    }

    this.isEditing = true;
    this.editorView?.dispatch({
      effects: this.editableCompartment.reconfigure(this.editableExtension(true)),
    });
    queueMicrotask(() => this.editorView?.focus());
  }

  stopEditing() {
    this.isEditing = false;
    this.editorView?.dispatch({
      effects: this.editableCompartment.reconfigure(this.editableExtension(false)),
    });
  }

  private editableExtension(editable: boolean) {
    return [EditorView.editable.of(editable), EditorState.readOnly.of(!editable)];
  }

  private getLanguageExtension(language: string): Extension {
    switch (language) {
      case 'typescript':
        return javascript({ typescript: true });
      case 'javascript':
        return javascript();
      case 'json':
        return json();
      default:
        return [];
    }
  }

  private createEditorState(code: string): EditorState {
    return EditorState.create({
      doc: code,
      extensions: [
        lineNumbers(),
        history(),
        indentOnInput(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
        this.getLanguageExtension(this.item.language),
        EDITOR_THEME,
        this.editableCompartment.of(this.editableExtension(false)),
        EditorView.domEventHandlers({
          blur: () => this.stopEditing(),
        }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            this.item.code = update.state.doc.toString();
          }
        }),
      ],
    });
  }
}
