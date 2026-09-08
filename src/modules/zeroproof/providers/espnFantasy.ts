// ---------------------------------------------------------------------------
// ESPN fantasy matchups — an odds provider for weekly head-to-head betting
// ---------------------------------------------------------------------------
//
// A fantasy matchup (team A vs team B in a given week) becomes a bettable event
// with a single h2h market. ESPN publishes no betting line — only projected and
// actual scores — so v1 prices every matchup as a pick'em (both sides -110); a
// projected-score moneyline is a later refinement. ESPN also gives no kickoff
// timestamp, so the commence time is synthesised from the sync moment (see
// `normalizeMatchups`) — betting stays open until the matchup settles, which is
// the v1 tradeoff for not knowing the real lock time.
//
// Private leagues (like most personal leagues) need SWID + espn_s2 cookies;
// public ones need none. Both are handled by the same client.

import type {
  NormalizedEvent,
  NormalizedOutcome,
  NormalizedResult,
  OddsProvider,
} from './types.js';

const HOST = 'https://lm-api-reads.fantasy.espn.com';

/** ESPN publishes no line, so a matchup ships as a pick'em: both sides -110. */
export const PICK_EM_PRICE_AMERICAN = -110;

/** How far ahead the synthetic commence time sits, so the current week reads as upcoming. */
export const MATCHUP_LOCK_LEAD_MS = 48 * 60 * 60 * 1000;

export interface LeagueSpec {
  /** ESPN game code: 'ffl' (football), 'fba' (basketball), etc. */
  game: string;
  leagueId: string;
  season: string;
}

/** Parse a sport key like "ffl:1241838:2022" into a league spec. */
export function parseLeagueSpec(sportKey: string): LeagueSpec {
  const [game, leagueId, season] = sportKey.split(':');
  if (!game || !leagueId || !season) {
    throw new Error(`Malformed ESPN league key "${sportKey}" (expected game:leagueId:season)`);
  }
  return { game, leagueId, season };
}

// --- ESPN response shapes (only the fields we read) -------------------------

export interface EspnTeam {
  id: number;
  name?: string;
  abbrev?: string;
  location?: string;
  nickname?: string;
}
export interface EspnSide {
  teamId: number;
  totalPoints: number;
}
export interface EspnMatchup {
  id: number;
  matchupPeriodId: number;
  winner: string; // 'HOME' | 'AWAY' | 'UNDECIDED' | 'TIE'
  home?: EspnSide;
  away?: EspnSide;
}
export interface EspnLeague {
  scoringPeriodId: number;
  seasonId: number;
  teams: EspnTeam[];
  schedule: EspnMatchup[];
}

/** A team's display name, resolved from the teams array, with graceful fallbacks. */
export function teamName(teams: EspnTeam[], teamId: number): string {
  const team = teams.find((t) => t.id === teamId);
  if (!team) return `Team ${teamId}`;
  if (team.name && team.name.trim()) return team.name.trim();
  const composed = [team.location, team.nickname].filter(Boolean).join(' ').trim();
  if (composed) return composed;
  return team.abbrev?.trim() || `Team ${teamId}`;
}

/**
 * A stable id for a matchup, identical across the odds and results feeds so
 * settlement matches by provider_key. Team ids (not names) keep it stable even
 * if a team is renamed mid-season.
 */
export function matchupProviderKey(spec: LeagueSpec, m: EspnMatchup): string {
  return `espn:${spec.game}:${spec.season}:${spec.leagueId}:${m.matchupPeriodId}:${m.home?.teamId}-${m.away?.teamId}`;
}

/** The earliest week that still has an undecided matchup — the one worth betting. */
export function currentBettableWeek(league: EspnLeague): number | null {
  const open = league.schedule
    .filter((m) => m.home && m.away && m.winner === 'UNDECIDED')
    .map((m) => m.matchupPeriodId);
  if (open.length === 0) return null;
  return Math.min(...open);
}

/**
 * The current week's matchups as bettable pick'em events. `now` drives the
 * synthetic commence time (there is no real one from ESPN), so the events read
 * as upcoming and stay bettable until they settle.
 */
export function normalizeMatchups(
  league: EspnLeague,
  spec: LeagueSpec,
  now: Date,
): NormalizedEvent[] {
  const week = currentBettableWeek(league);
  if (week == null) return [];
  const commenceTime = new Date(now.getTime() + MATCHUP_LOCK_LEAD_MS);

  return league.schedule
    .filter((m) => m.matchupPeriodId === week && m.home && m.away)
    .map((m) => {
      const home = teamName(league.teams, (m.home as EspnSide).teamId);
      const away = teamName(league.teams, (m.away as EspnSide).teamId);
      const outcomes: NormalizedOutcome[] = [
        { name: home, priceAmerican: PICK_EM_PRICE_AMERICAN },
        { name: away, priceAmerican: PICK_EM_PRICE_AMERICAN },
      ];
      return {
        providerKey: matchupProviderKey(spec, m),
        sport: `fantasy_${spec.game}`,
        home,
        away,
        commenceTime,
        markets: [{ market: 'h2h', outcomes }],
      };
    });
}

/**
 * Completed matchups as results the settler can grade. A matchup counts as
 * completed once ESPN stamps a winner; the score comparison in `gradeBet` is the
 * source of truth, so a tie (equal points) settles as a push.
 */
export function normalizeResults(league: EspnLeague, spec: LeagueSpec): NormalizedResult[] {
  return league.schedule
    .filter((m) => m.home && m.away && (m.winner === 'HOME' || m.winner === 'AWAY' || m.winner === 'TIE'))
    .map((m) => {
      const homeSide = m.home as EspnSide;
      const awaySide = m.away as EspnSide;
      return {
        providerKey: matchupProviderKey(spec, m),
        completed: true,
        home: teamName(league.teams, homeSide.teamId),
        away: teamName(league.teams, awaySide.teamId),
        homeScore: homeSide.totalPoints,
        awayScore: awaySide.totalPoints,
      };
    });
}

/** The URL for a league's matchup + team data (public or private). */
export function leagueUrl(spec: LeagueSpec): string {
  return (
    `${HOST}/apis/v3/games/${spec.game}/seasons/${spec.season}` +
    `/segments/0/leagues/${spec.leagueId}?view=mMatchup&view=mTeam`
  );
}

export interface EspnCookies {
  swid?: string;
  espnS2?: string;
}

/** Cookie header for a private league, or undefined when public (no cookies). */
export function cookieHeader(cookies: EspnCookies): string | undefined {
  const parts: string[] = [];
  if (cookies.swid) parts.push(`SWID=${cookies.swid}`);
  if (cookies.espnS2) parts.push(`espn_s2=${cookies.espnS2}`);
  return parts.length > 0 ? parts.join('; ') : undefined;
}

/**
 * Fetch one league's matchup + team data. A private league without cookies is
 * 401 AUTH_LEAGUE_NOT_VISIBLE; a wrong game/season is 404. Either way the caller
 * must see the error, not a silently empty slate.
 */
export async function fetchEspnLeague(spec: LeagueSpec, cookies: EspnCookies): Promise<EspnLeague> {
  const cookie = cookieHeader(cookies);
  const res = await fetch(leagueUrl(spec), {
    headers: cookie ? { Cookie: cookie } : undefined,
  });
  if (!res.ok) {
    throw new Error(`ESPN fantasy returned ${res.status} for ${spec.game}:${spec.leagueId}:${spec.season}`);
  }
  return (await res.json()) as EspnLeague;
}

export class EspnFantasyProvider implements OddsProvider {
  readonly name = 'espn-fantasy';

  constructor(private readonly cookies: EspnCookies = {}) {}

  async getOdds(sportKeys: string[]): Promise<NormalizedEvent[]> {
    const now = new Date();
    const all: NormalizedEvent[] = [];
    for (const sportKey of sportKeys) {
      const spec = parseLeagueSpec(sportKey);
      const league = await fetchEspnLeague(spec, this.cookies);
      all.push(...normalizeMatchups(league, spec, now));
    }
    return all;
  }
}
