// Pure logic of the fast review of the received-document queue: which documents wait, where "next"/"previous" lead and what a key press means.
export const WAITING_STATUSES = ['NEW', 'EXTRACTED', 'FAILED'];

// Ids of the documents that still need a person, oldest first.
export function waitingIds(rows: { id: number; status: string }[]): number[] {
  return rows.filter(r => WAITING_STATUSES.includes(r.status)).map(r => r.id).sort((a, b) => a - b);
}

// The waiting document after (direction 1) or before (-1) `currentId`, wrapping around; never the current one. null = nothing else waits.
export function neighbourId(ids: number[], currentId: number, direction: 1 | -1): number | null {
  const others = ids.filter(id => id !== currentId);
  if (!others.length) return null;
  if (direction === 1) return others.find(id => id > currentId) ?? others[0];
  return [...others].reverse().find(id => id < currentId) ?? others[others.length - 1];
}

export type ReviewShortcut = 'confirm' | 'next' | 'previous' | 'back' | 'rotate' | 'zoomIn' | 'zoomOut';
export interface KeyInfo { key: string; ctrlKey?: boolean; metaKey?: boolean; altKey?: boolean; shiftKey?: boolean; targetTag?: string; editable?: boolean }

// Elements where plain keys are typing (or operate the control itself, like a select): shortcuts without a modifier stay out of them.
const TYPING_TAGS = ['INPUT', 'TEXTAREA', 'SELECT'];
export const isTypingTarget = (info: Pick<KeyInfo, 'targetTag' | 'editable'>) => Boolean(info.editable) || TYPING_TAGS.includes((info.targetTag || '').toUpperCase());

// Key press -> action. Modifier combinations (Ctrl+Enter, Alt+arrows) work everywhere; single keys (Esc, R, +, -) only when focus is not in a field.
export function reviewShortcut(e: KeyInfo): ReviewShortcut | null {
  const key = e.key;
  if (e.altKey && !e.ctrlKey && !e.metaKey) {
    if (key === 'ArrowRight') return 'next';
    if (key === 'ArrowLeft') return 'previous';
    return null;
  }
  if ((e.ctrlKey || e.metaKey) && !e.altKey) return key === 'Enter' ? 'confirm' : null;
  if (e.shiftKey && key !== '+') return null;
  if (isTypingTarget(e)) return null;
  if (key === 'Escape') return 'back';
  if (key === 'r' || key === 'R') return 'rotate';
  if (key === '+' || key === '=') return 'zoomIn';
  if (key === '-') return 'zoomOut';
  return null;
}
