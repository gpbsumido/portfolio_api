export interface TodoRow {
  id: string;
  project: string;
  phase: number;
  position: number;
  title: string;
  detail: string | null;
  /** Why the item exists, as opposed to `detail`, which is what to do about it. */
  reason: string | null;
  blocking: boolean;
  command: string | null;
  pr_repo: string | null;
  pr_number: number | null;
  done: boolean;
  done_at: Date | null;
  deleted_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

/** What a caller may supply when adding an item. position is never theirs. */
export interface NewTodo {
  project: string;
  phase: number;
  title: string;
  detail: string | null;
  reason: string | null;
}

/**
 * Enough to render a readable timeline without diffing every adjacent pair.
 * `reverted` is distinct from `updated` so a restore reads as one.
 */
export type ChangeKind = 'created' | 'updated' | 'ticked' | 'unticked' | 'removed' | 'reverted';

export interface TodoRevisionRow {
  id: string;
  todo_id: string;
  revision: number;
  change_kind: ChangeKind;
  snapshot: TodoRow;
  reverted_from: string | null;
  actor: string | null;
  created_at: Date;
}

export interface TodoCommentRow {
  id: string;
  todo_id: string;
  body: string;
  actor: string | null;
  created_at: Date;
  updated_at: Date;
  deleted_at: Date | null;
}
