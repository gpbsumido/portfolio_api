export interface QualifyingResult {
  driver: string;
  position: number;
  Q2?: string;
  Q3?: string;
}

export interface RaceResult {
  driver: string;
  position: number;
  fastestLap?: boolean;
  driverOfTheDay?: boolean;
  status?: string;
  dnf?: boolean;
  overtakes?: number;
}

export interface PointsBreakdown {
  points: number;
  breakdown: Record<string, number>;
}

export interface FantasyPointsEntry {
  total: number;
  qualifying: PointsBreakdown;
  race: PointsBreakdown;
}

export interface FantasyDataResult {
  error?: string;
  qualifying: QualifyingResult[];
  race: RaceResult[];
  event_info: unknown;
}

export interface FantasyResponse {
  event: unknown;
  points: Record<string, FantasyPointsEntry>;
  unprocessed: FantasyDataResult;
}
