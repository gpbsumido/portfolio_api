export interface NbaTeam {
  id: number;
  name: string;
  full_name: string;
  abbreviation: string;
  city: string;
  conference: string;
  division: string;
}

export interface NbaPlayer {
  id: number;
  first_name: string;
  last_name: string;
  position: string;
  height_feet: number | null;
  height_inches: number | null;
  team: NbaTeam;
}

export interface PlayerStats {
  games_played: number;
  player_id: number;
  season: number;
  min: string;
  fgm: number;
  fga: number;
  fg_pct: number;
  fg3m: number;
  fg3a: number;
  fg3_pct: number;
  ftm: number;
  fta: number;
  ft_pct: number;
  oreb: number;
  dreb: number;
  reb: number;
  ast: number;
  turnover: number;
  stl: number;
  blk: number;
  pf: number;
  pts: number;
  fantasy_points: number;
}

export interface ShotZone {
  zone: string;
  fgPct: number;
  fgm: number;
  fga: number;
  attPerGame: number;
  makesPerGame: number;
}

export interface ShotChartData {
  playerId: number;
  season: string;
  zones: ShotZone[];
}

export interface PaginationMeta {
  total_pages: number;
  current_page: number;
  next_page: number | null;
  per_page: number;
  total_count: number;
}

export interface PaginatedResponse<T> {
  data: T;
  meta: PaginationMeta;
}

// Playoffs types

export interface PlayoffBracket {
  id: string;
  user_sub: string;
  season: number;
  picks: Record<string, unknown>;
  display_name: string | null;
  updated_at: Date;
}

export interface LeaderboardEntry {
  rank: number;
  userSub: string;
  bracketId: string;
  username: string | null;
  displayName: string;
  score: number;
  maxPossible: number;
  breakdown: ScoreBreakdown;
  updatedAt: Date;
}

export interface ScoreBreakdown {
  r1: number;
  r2: number;
  cf: number;
  finals: number;
  bonuses: number;
  mvp: number;
  combinedScoreDiff: number | null;
}
