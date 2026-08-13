export interface TodoRow {
  id: string;
  project: string;
  phase: number;
  position: number;
  title: string;
  detail: string | null;
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
}
