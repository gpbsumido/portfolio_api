export interface MedJournalEntry {
  id: string;
  patientSetting: string;
  interaction: string;
  canmedsRoles: string[];
  learningObjectives: string[];
  rotation: string;
  date: string;
  location?: string;
  hospital?: string;
  doctor?: string;
  whatIDidWell?: string;
  whatICouldImprove?: string;
  user_sub: string;
  feedback?: FeedbackItem[];
}

export interface FeedbackItem {
  text: string;
  rotation: string;
}

export interface SaveEntryInput {
  id?: string;
  patientSetting: string;
  interaction: string;
  canmedsRoles?: string[];
  learningObjectives?: string[];
  rotation: string;
  date: string;
  location?: string;
  hospital?: string;
  doctor?: string;
  whatIDidWell?: string;
  whatICouldImprove?: string;
  feedbackText?: string;
  feedback?: FeedbackItem[];
}
