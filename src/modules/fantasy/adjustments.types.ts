// Draft Lab valuation adjustments — row + wire shapes.

export type AdjustmentCategory = 'injury' | 'ripple' | 'camp' | 'context';
export type AdjustmentConfidence = 'high' | 'med' | 'low';
export type AdjustmentStatus = 'pending' | 'approved' | 'rejected';

export interface AdjustmentRow {
  id: string;
  player_name: string;
  team: string | null;
  position: string | null;
  category: AdjustmentCategory;
  note: string;
  source_url: string | null;
  delta_pct: string; // pg NUMERIC comes back as string
  beneficiary_of: string | null;
  confidence: AdjustmentConfidence;
  status: AdjustmentStatus;
  batch_date: string; // ISO date
  created_at: Date;
  updated_at: Date;
}

export interface AdjustmentDto {
  id: string;
  player: string;
  team: string | null;
  position: string | null;
  category: AdjustmentCategory;
  note: string;
  sourceUrl: string | null;
  deltaPct: number;
  beneficiaryOf: string | null;
  confidence: AdjustmentConfidence;
  status: AdjustmentStatus;
  batchDate: string;
}

/** One item in a daily research push. */
export interface AdjustmentInput {
  player: string;
  team?: string | null;
  position?: string | null;
  category: AdjustmentCategory;
  note: string;
  sourceUrl?: string | null;
  deltaPct: number;
  beneficiaryOf?: string | null;
  confidence: AdjustmentConfidence;
}
