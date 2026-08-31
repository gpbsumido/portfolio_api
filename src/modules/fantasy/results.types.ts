// Draft Lab finished-draft records — row + wire shapes.

export type PickSource = 'user' | 'sim' | 'keeper' | 'espn';

export interface ResultPick {
  overall: number;
  teamIdx: number;
  playerId: string;
  name: string;
  pos: string;
  source: PickSource;
  keeper: boolean;
}

export interface ResultStandings {
  rows: { teamIdx: number; starterPts: number }[];
  myRank: number | null;
}

export interface ProjAdjustment {
  playerId: string;
  name: string;
  pos: string;
  delta: number;
}

/** One finished draft, as the extension posts it. */
export interface ResultInput {
  clientDraftId: string;
  sport: string;
  numTeams: number;
  rounds: number;
  mySlot: number;
  mode: string; // practice | companion
  fullySim: boolean;
  humanPickCount: number;
  teamNames: string; // pipe-joined
  picks: ResultPick[];
  standings: ResultStandings;
  projAdjustments: ProjAdjustment[];
}

export interface ResultRow {
  id: string;
  client_key: string;
  client_draft_id: string;
  sport: string;
  num_teams: number;
  rounds: number;
  my_slot: number;
  mode: string;
  fully_sim: boolean;
  human_pick_count: number;
  team_names: string;
  picks: ResultPick[];
  standings: ResultStandings;
  proj_adjustments: ProjAdjustment[];
  created_at: Date;
}

/** GET summary row — deliberately omits the picks/standings blobs. */
export interface ResultSummaryDto {
  id: string;
  sport: string;
  numTeams: number;
  mySlot: number;
  mode: string;
  fullySim: boolean;
  humanPickCount: number;
  createdAt: string;
}
