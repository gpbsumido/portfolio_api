import { query } from '../../config/database.js';
import type {
  NbaTeam,
  NbaPlayer,
  PlayerStats,
  ShotChartData,
  PaginatedResponse,
  PlayoffBracket,
} from './types.js';

const NBA_BASE_URL = 'https://stats.nba.com/stats';

const NBA_HEADERS: Record<string, string> = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  Origin: 'https://www.nba.com',
  Referer: 'https://www.nba.com/',
  'x-nba-stats-origin': 'stats',
  'x-nba-stats-token': 'true',
};

// Throttled fetch for NBA API (1 req/sec)
let lastFetchTime = 0;
async function throttledFetch(
  url: string,
  options: RequestInit,
): Promise<Response> {
  const now = Date.now();
  const wait = Math.max(0, 1000 - (now - lastFetchTime));
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastFetchTime = Date.now();
  return fetch(url, options);
}

function getCurrentSeason(): string {
  const now = new Date();
  const year = now.getFullYear();
  const seasonStartYear = now.getMonth() >= 9 ? year : year - 1;
  const seasonEndYear = seasonStartYear + 1;
  return `${seasonStartYear}-${seasonEndYear.toString().slice(-2)}`;
}

function getCurrentSeasonYear(): number {
  const now = new Date();
  const year = now.getFullYear();
  return now.getMonth() >= 9 ? year : year - 1;
}

export class NbaRepository {
  async fetchTeams(): Promise<PaginatedResponse<NbaTeam[]>> {
    const season = getCurrentSeason();
    const url = `https://stats.nba.com/stats/leaguestandingsv3?LeagueID=00&Season=${season}&SeasonType=Regular+Season`;
    const response = await throttledFetch(url, { headers: NBA_HEADERS });
    const data = await response.json();

    if (!data.resultSets?.[0]?.rowSet) {
      throw new Error('Invalid response format from NBA API [Teams]');
    }

    const teams: NbaTeam[] = data.resultSets[0].rowSet.map(
      (row: unknown[]) => ({
        id: parseInt(row[2] as string),
        name: row[4] as string,
        full_name: `${row[3]} ${row[4]}`,
        abbreviation: row[5] as string,
        city: row[3] as string,
        conference: row[6] as string,
        division: row[10] as string,
      }),
    );

    return {
      data: teams,
      meta: {
        total_pages: 1,
        current_page: 1,
        next_page: null,
        per_page: teams.length,
        total_count: teams.length,
      },
    };
  }

  async fetchPlayersByTeam(
    teamId: number,
  ): Promise<PaginatedResponse<NbaPlayer[]>> {
    const url = new URL(`${NBA_BASE_URL}/commonteamroster`);
    url.searchParams.append('LeagueID', '00');
    url.searchParams.append('Season', getCurrentSeason());
    url.searchParams.append('TeamID', teamId.toString());

    const response = await throttledFetch(url.toString(), {
      headers: NBA_HEADERS,
    });
    if (!response.ok) {
      throw new Error(
        `Failed to fetch team players: ${response.status} ${response.statusText}`,
      );
    }

    const data = await response.json();
    if (!data.resultSets?.[0]?.rowSet || !data.resultSets[0].headers) {
      throw new Error('Invalid response format from NBA API [Players]');
    }

    const headers: string[] = data.resultSets[0].headers;
    const getIdx = (name: string): number => {
      const idx = headers.indexOf(name);
      if (idx === -1) throw new Error(`Column '${name}' not found`);
      return idx;
    };

    const players: NbaPlayer[] = data.resultSets[0].rowSet
      .map((row: unknown[]) => {
        try {
          const playerName = row[getIdx('PLAYER')] as string;
          if (!playerName) return null;
          const height = row[getIdx('HEIGHT')] as string;

          return {
            id: row[getIdx('PLAYER_ID')] as number,
            first_name: playerName.split(' ')[0],
            last_name: playerName.split(' ').slice(1).join(' '),
            position: (row[getIdx('POSITION')] as string) || 'N/A',
            height_feet: height ? parseInt(height.split('-')[0]) : null,
            height_inches: height ? parseInt(height.split('-')[1]) : null,
            team: {
              id: row[getIdx('TeamID')] as number,
              name: 'Unknown',
              full_name: 'Unknown',
              abbreviation: 'Unknown',
              city: 'Unknown',
              conference: 'Unknown',
              division: 'Unknown',
            },
          };
        } catch {
          return null;
        }
      })
      .filter((p: NbaPlayer | null): p is NbaPlayer => p !== null);

    return {
      data: players,
      meta: {
        total_pages: 1,
        current_page: 1,
        next_page: null,
        per_page: players.length,
        total_count: players.length,
      },
    };
  }

  async fetchPlayerStats(
    playerId: number,
  ): Promise<PaginatedResponse<PlayerStats[]>> {
    const url = new URL(`${NBA_BASE_URL}/playerdashboardbygeneralsplits`);
    const params: Record<string, string> = {
      DateFrom: '',
      DateTo: '',
      GameSegment: '',
      LastNGames: '0',
      LeagueID: '00',
      Location: '',
      MeasureType: 'Base',
      Month: '0',
      OpponentTeamID: '0',
      Outcome: '',
      PORound: '0',
      PaceAdjust: 'N',
      PerMode: 'PerGame',
      Period: '0',
      PlayerID: playerId.toString(),
      PlusMinus: 'N',
      Rank: 'N',
      Season: getCurrentSeason(),
      SeasonSegment: '',
      SeasonType: 'Regular Season',
      ShotClockRange: '',
      Split: 'general',
      VsConference: '',
      VsDivision: '',
    };
    Object.entries(params).forEach(([k, v]) => url.searchParams.append(k, v));

    const response = await throttledFetch(url.toString(), {
      headers: NBA_HEADERS,
    });
    if (!response.ok) {
      throw new Error(`Failed to fetch player stats: ${response.status}`);
    }

    const data = await response.json();
    if (!data.resultSets?.[0]?.rowSet?.[0] || !data.resultSets[0].headers) {
      throw new Error('Invalid response format from NBA API [Stats]');
    }

    const headers: string[] = data.resultSets[0].headers;
    const getIdx = (name: string): number => {
      const idx = headers.indexOf(name);
      if (idx === -1) throw new Error(`Column '${name}' not found`);
      return idx;
    };
    const row = data.resultSets[0].rowSet[0];
    const get = (name: string) => row[getIdx(name)];

    const pts = parseFloat(get('PTS')) || 0;
    const reb = parseFloat(get('REB')) || 0;
    const ast = parseFloat(get('AST')) || 0;
    const stl = parseFloat(get('STL')) || 0;
    const blk = parseFloat(get('BLK')) || 0;

    const stats: PlayerStats = {
      games_played: parseInt(get('GP')) || 0,
      player_id: playerId,
      season: getCurrentSeasonYear(),
      min: get('MIN') || '0:00',
      fgm: parseFloat(get('FGM')) || 0,
      fga: parseFloat(get('FGA')) || 0,
      fg_pct: parseFloat(get('FG_PCT')) || 0,
      fg3m: parseFloat(get('FG3M')) || 0,
      fg3a: parseFloat(get('FG3A')) || 0,
      fg3_pct: parseFloat(get('FG3_PCT')) || 0,
      ftm: parseFloat(get('FTM')) || 0,
      fta: parseFloat(get('FTA')) || 0,
      ft_pct: parseFloat(get('FT_PCT')) || 0,
      oreb: parseFloat(get('OREB')) || 0,
      dreb: parseFloat(get('DREB')) || 0,
      reb,
      ast,
      turnover: parseFloat(get('TOV')) || 0,
      stl,
      blk,
      pf: parseFloat(get('PF')) || 0,
      pts,
      fantasy_points: pts * 1 + reb * 1.2 + ast * 1.5 + stl * 3 + blk * 3,
    };

    return {
      data: [stats],
      meta: {
        total_pages: 1,
        current_page: 1,
        next_page: null,
        per_page: 1,
        total_count: 1,
      },
    };
  }

  async fetchShotChart(playerId: number): Promise<{ data: ShotChartData }> {
    const season = getCurrentSeason();

    // Deterministic mock data per player (NBA blocks shotchartdetail from some envs)
    const seed = (n: number) => {
      const x = Math.sin(playerId * 1000 + n) * 10000;
      return x - Math.floor(x);
    };

    const gp = 60 + Math.floor(seed(0) * 22);
    const zones = [
      { zone: 'paint', base: 0.58, att: 6.2 },
      { zone: 'mid-left', base: 0.42, att: 2.8 },
      { zone: 'mid-right', base: 0.44, att: 2.6 },
      { zone: 'corner-3-left', base: 0.38, att: 1.8 },
      { zone: 'corner-3-right', base: 0.37, att: 1.9 },
      { zone: 'above-break-3', base: 0.36, att: 4.5 },
    ].map((z, i) => {
      const variance = (seed(i + 1) - 0.5) * 0.12;
      const fgPct = Math.max(0.2, Math.min(0.7, z.base + variance));
      const attVariance = (seed(i + 10) - 0.5) * 2;
      const attPerGame = Math.max(0.5, z.att + attVariance);
      const makesPerGame = attPerGame * fgPct;
      const fga = Math.round(attPerGame * gp);
      const fgm = Math.round(makesPerGame * gp);
      return {
        zone: z.zone,
        fgPct: parseFloat(fgPct.toFixed(3)),
        fgm,
        fga,
        attPerGame: parseFloat(attPerGame.toFixed(1)),
        makesPerGame: parseFloat(makesPerGame.toFixed(1)),
      };
    });

    return { data: { playerId, season, zones } };
  }

  // Playoffs — raw SQL

  async getPicksBySub(
    userSub: string,
    season: number,
  ): Promise<Record<string, unknown>> {
    const result = await query(
      'SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2',
      [userSub, season],
    );
    return (result.rows[0]?.picks as Record<string, unknown>) ?? {};
  }

  async getPicksByBracketId(
    bracketId: string,
    season: number,
  ): Promise<Record<string, unknown> | null> {
    const result = await query(
      'SELECT picks FROM nba_playoff_brackets WHERE id = $1 AND season = $2',
      [bracketId, season],
    );
    return (result.rows[0]?.picks as Record<string, unknown>) ?? null;
  }

  async getPicksByUsername(
    username: string,
    season: number,
  ): Promise<Record<string, unknown> | null> {
    const profileResult = await query(
      'SELECT user_sub FROM user_profiles WHERE username = $1',
      [username],
    );
    if (!profileResult.rows[0]) return null;

    const result = await query(
      'SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2',
      [profileResult.rows[0].user_sub, season],
    );
    return (result.rows[0]?.picks as Record<string, unknown>) ?? null;
  }

  async upsertPicks(
    userSub: string,
    season: number,
    picks: Record<string, unknown>,
    displayName: string | null,
  ): Promise<void> {
    await query(
      `INSERT INTO nba_playoff_brackets (id, user_sub, season, picks, display_name)
       VALUES (gen_random_uuid(), $1, $2, $3, $4)
       ON CONFLICT (user_sub, season)
       DO UPDATE SET picks = EXCLUDED.picks, display_name = COALESCE(EXCLUDED.display_name, nba_playoff_brackets.display_name), updated_at = now()`,
      [userSub, season, JSON.stringify(picks), displayName],
    );
  }

  async getOfficialPicks(
    season: number,
  ): Promise<Record<string, unknown> | null> {
    const result = await query(
      'SELECT picks FROM nba_playoff_brackets WHERE user_sub = $1 AND season = $2',
      ['OFFICIAL_RESULTS', season],
    );
    return (result.rows[0]?.picks as Record<string, unknown>) ?? null;
  }

  async getUserBrackets(season: number): Promise<PlayoffBracket[]> {
    const result = await query(
      'SELECT id, user_sub, picks, display_name, updated_at FROM nba_playoff_brackets WHERE user_sub != $1 AND season = $2',
      ['OFFICIAL_RESULTS', season],
    );
    return result.rows as PlayoffBracket[];
  }

  async getProfileBySub(
    userSub: string,
  ): Promise<{ display_name: string; username: string } | null> {
    const result = await query(
      'SELECT display_name, username FROM user_profiles WHERE user_sub = $1',
      [userSub],
    );
    return (result.rows[0] as { display_name: string; username: string }) ?? null;
  }

  async upsertOfficialResults(
    season: number,
    picks: Record<string, unknown>,
  ): Promise<void> {
    await query(
      `INSERT INTO nba_playoff_brackets (id, user_sub, season, picks)
       VALUES (gen_random_uuid(), $1, $2, $3)
       ON CONFLICT (user_sub, season)
       DO UPDATE SET picks = EXCLUDED.picks, updated_at = now()`,
      ['OFFICIAL_RESULTS', season, JSON.stringify(picks)],
    );
  }
}
