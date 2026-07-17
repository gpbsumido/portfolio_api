export interface FeedbackRow {
  id: string;
  text: string;
  rotation: string;
  journal_entry_id: string | null;
  user_sub: string;
}

export interface FeedbackWithJournal {
  id: string;
  text: string;
  rotation: string;
  journal_entry_id: string | null;
  journal: JournalSummary | null;
}

export interface JournalSummary {
  id: string;
  patientSetting: string;
  interaction: string;
  canmedsRoles: string[];
  learningObjectives: string[];
  rotation: string;
  date: string;
  location: string;
  hospital: string;
  doctor: string;
  whatIDidWell: string;
  whatICouldImprove: string;
}

export interface CreateFeedbackInput {
  text: string;
  rotation: string;
  journal_entry_id?: string;
  user_sub: string;
}

export interface UpdateFeedbackInput {
  text: string;
  rotation: string;
  journal_entry_id?: string;
  user_sub: string;
}
