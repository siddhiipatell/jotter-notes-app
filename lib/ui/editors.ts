/** Registry of mounted note editors, so other UI (properties, outline, rename, push) can reach them. */
export interface EditorHandle {
  path: string;
  /** write any pending edit to the vault now */
  flush(): Promise<void>;
  getDoc(): string;
  /** replace the document with new text via a transaction (keeps undo history) */
  applyContent(text: string): void;
  revealLine(line: number): void;
  focus(): void;
  /** true while an edit is waiting to be written */
  pending(): boolean;
}

const handles = new Map<string, EditorHandle>();

export function registerEditor(h: EditorHandle): () => void {
  handles.set(h.path, h);
  return () => { if (handles.get(h.path) === h) handles.delete(h.path); };
}
export const getEditor = (path: string) => handles.get(path);
export async function flushAll(): Promise<void> {
  await Promise.all([...handles.values()].map((h) => h.flush().catch(() => undefined)));
}
export const hasPendingEdits = () => [...handles.values()].some((h) => h.pending());
