import { NbaRepository } from './repository.js';
import type {
  NbaTeam,
  NbaPlayer,
  PlayerStats,
  ShotChartData,
  PaginatedResponse,
  LeaderboardEntry,
  ScoreBreakdown,
} from './types.js';
import { getCachedData } from '../../shared/utils/cache.js';
import { NotFoundError, ValidationError } from '../../shared/errors/index.js';

// Playoff scoring constants
const ROUND_POINTS: Record<string, number> = {
  r1: 1,
  r2: 2,
  cf: 4,
  finals: 8,
};
const MAX_POSSIBLE = 52;

function getRound(
  matchupId: string,
): 'r1' | 'r2' | 'cf' | 'finals' | null {
  if (matchupId === 'NBA_FINALS') return 'finals';
  if (matchupId.endsWith('_CF')) return 'cf';
  if (matchupId.includes('_R2_')) return 'r2';
  if (matchupId.includes('_R1_')) return 'r1';
  return null;
}

interface PickEntry {
  winner?: string;
  seriesScore?: string;
  mvp?: string;
  lastGameCombinedScore?: number | null;
}

function scoreBracket(
  picks: Record<string, PickEntry>,
  official: Record<string, PickEntry>,
): { total: number; breakdown: ScoreBreakdown } {
  const breakdown: ScoreBreakdown = {
    r1: 0,
    r2: 0,
    cf: 0,
    finals: 0,
    bonuses: 0,
    mvp: 0,
    combinedScoreDiff: null,
  };

  for (const matchupId of Object.keys(official)) {
    const officialPick = official[matchupId];
    const userPick = picks[matchupId];
    if (!officialPick?.winner || !userPick?.winner) continue;

    const round = getRound(matchupId);
    if (!round) continue;

    if (userPick.winner === officialPick.winner) {
      breakdown[round] += ROUND_POINTS[round];
    }

    if (
      officialPick.seriesScore &&
      userPick.seriesScore === officialPick.seriesScore
    ) {
      breakdown.bonuses += 1;
    }

    if (round === 'finals') {
      if (
        officialPick.mvp &&
        userPick.mvp &&
        userPick.mvp.trim().toLowerCase() ===
          officialPick.mvp.trim().toLowerCase()
      ) {
        breakdown.mvp += 5;
      }
      if (
        officialPick.lastGameCombinedScore != null &&
        userPick.lastGameCombinedScore != null
      ) {
        breakdown.combinedScoreDiff = Math.abs(
          userPick.lastGameCombinedScore - officialPick.lastGameCombinedScore,
        );
      }
    }
  }

  const total =
    breakdown.r1 +
    breakdown.r2 +
    breakdown.cf +
    breakdown.finals +
    breakdown.bonuses +
    breakdown.mvp;

  return { total, breakdown };
}

export class NbaService {
  constructor(private repo = new NbaRepository()) {}

  async getTeams(): Promise<PaginatedResponse<NbaTeam[]>> {
    return getCachedData('teams', () => this.repo.fetchTeams());
  }

  async getPlayersByTeam(
    teamId: number,
  ): Promise<PaginatedResponse<NbaPlayer[]>> {
    if (isNaN(teamId)) throw new ValidationError('Invalid team ID');
    return getCachedData(`team-players-${teamId}`, () =>
      this.repo.fetchPlayersByTeam(teamId),
    );
  }

  async getPlayerStats(
    playerId: number,
  ): Promise<PaginatedResponse<PlayerStats[]>> {
    if (isNaN(playerId)) throw new ValidationError('Invalid player ID');
    return getCachedData(`player-stats-${playerId}`, () =>
      this.repo.fetchPlayerStats(playerId),
    );
  }

  async getShotChart(playerId: number): Promise<{ data: ShotChartData }> {
    if (isNaN(playerId)) throw new ValidationError('Invalid player ID');
    return getCachedData(
      `shots-${playerId}`,
      () => this.repo.fetchShotChart(playerId),
      86400,
    );
  }

  // Playoffs

  async getPicks(
    userSub: string,
    season: number,
  ): Promise<Record<string, unknown>> {
    return this.repo.getPicksBySub(userSub, season);
  }

  async getPublicPicks(
    season: number,
    username?: string,
    bracketId?: string,
  ): Promise<Record<string, unknown>> {
    const UUID_RE =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (bracketId && UUID_RE.test(bracketId)) {
      const picks = await this.repo.getPicksByBracketId(bracketId, season);
      if (!picks) throw new NotFoundError('No picks found');
      return picks;
    }

    if (username) {
      const picks = await this.repo.getPicksByUsername(username, season);
      if (picks === null) throw new NotFoundError('User not found');
      return picks;
    }

    throw new ValidationError('username or bracketId is required');
  }

  async savePicks(
    userSub: string,
    season: number,
    picks: Record<string, unknown>,
    displayName?: string,
  ): Promise<void> {
    const storedName =
      typeof displayName === 'string' && displayName.trim()
        ? displayName.trim().slice(0, 100)
        : null;
    await this.repo.upsertPicks(userSub, season, picks, storedName);
  }

  async getLeaderboard(season: number): Promise<LeaderboardEntry[]> {
    const officialPicks = await this.repo.getOfficialPicks(season);
    const brackets = await this.repo.getUserBrackets(season);

    const entries = await Promise.all(
      brackets.map(async (b) => {
        const profile = await this.repo.getProfileBySub(b.user_sub);
        const displayName =
          profile?.display_name ??
          profile?.username ??
          b.display_name ??
          'Anonymous';
        const username = profile?.username ?? null;

        if (!officialPicks) {
          return {
            rank: 0,
            userSub: b.user_sub,
            bracketId: b.id,
            username,
            displayName,
            score: 0,
            maxPossible: MAX_POSSIBLE,
            breakdown: {
              r1: 0,
              r2: 0,
              cf: 0,
              finals: 0,
              bonuses: 0,
              mvp: 0,
              combinedScoreDiff: null,
            },
            updatedAt: b.updated_at,
          };
        }

        const { total, breakdown } = scoreBracket(
          b.picks as Record<string, PickEntry>,
          officialPicks as Record<string, PickEntry>,
        );
        return {
          rank: 0,
          userSub: b.user_sub,
          bracketId: b.id,
          username,
          displayName,
          score: total,
          maxPossible: MAX_POSSIBLE,
          breakdown,
          updatedAt: b.updated_at,
        };
      }),
    );

    entries.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aDiff = a.breakdown.combinedScoreDiff ?? Infinity;
      const bDiff = b.breakdown.combinedScoreDiff ?? Infinity;
      if (aDiff !== bDiff) return aDiff - bDiff;
      return (
        new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime()
      );
    });

    return entries.map((e, i) => ({ ...e, rank: i + 1 }));
  }

  async saveOfficialResults(
    season: number,
    picks: Record<string, unknown>,
  ): Promise<void> {
    await this.repo.upsertOfficialResults(season, picks);
  }
}
