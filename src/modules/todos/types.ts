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
  created_at: Date;
  updated_at: Date;
}
