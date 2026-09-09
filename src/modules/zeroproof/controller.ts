// ---------------------------------------------------------------------------
// ZeroProof wallets — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/index.js';
import type {
  ZeroproofBet,
  ZeroproofLeagueEspnLeague,
} from '../../config/drizzle/schema.js';
import type {
  AddEspnLeagueInput,
  AddLeagueEspnLeagueInput,
  CreateLeagueInput,
  JoinLeagueInput,
  OpenWalletInput,
  PlaceBetInput,
} from './schemas.js';
import * as service from './service.js';
import type {
  BetDto,
  EventDto,
  EventWithLines,
  LeagueDto,
  LeagueEspnLeagueDto,
  LeagueEspnLeagueRow,
  LeagueListItem,
  LeagueStanding,
  LeagueStandingDto,
  WalletDto,
  WalletWithBalance,
} from './types.js';

/** Postgres decimals come back as strings; parse to number (or keep null). */
function toNumber(value: string | null): number | null {
  return value != null ? Number(value) : null;
}

function toBetDto(bet: ZeroproofBet): BetDto {
  return {
    id: bet.id,
    walletId: bet.walletId,
    eventId: bet.eventId,
    market: bet.market,
    selection: bet.selection,
    oddsAmerican: bet.oddsAmerican,
    lineValue: toNumber(bet.lineValue),
    closingOddsAmerican: bet.closingOddsAmerican,
    clv: toNumber(bet.clv),
    stakeCents: bet.stakeCents,
    status: bet.status,
    placedAt: bet.placedAt.toISOString(),
    settledAt: bet.settledAt ? bet.settledAt.toISOString() : null,
  };
}

/** The Auth0 subject of the caller, or a 401 if the token carried none. */
function requireSub(req: Request): string {
  const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub;
  if (!sub) throw new UnauthorizedError('Not signed in');
  return sub;
}

/** The caller's subject if the (optional) token carried one, else null. */
function optionalSub(req: Request): string | null {
  return (req.auth?.payload as { sub?: string } | undefined)?.sub ?? null;
}

/** A route param, narrowed to the single value Express may hand back as an array. */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

/** The join code is shared only with people already inside the league. */
function toLeagueDto(item: LeagueListItem, includeCode: boolean): LeagueDto {
  const l = item.league;
  return {
    id: l.id,
    commissionerSub: l.commissionerSub,
    name: l.name,
    joinCode: includeCode ? l.joinCode : null,
    visibility: l.visibility,
    startingBankrollCents: l.startingBankrollCents,
    maxMembers: l.maxMembers,
    winCondition: l.winCondition,
    thresholdCents: l.thresholdCents,
    endsAt: l.endsAt ? l.endsAt.toISOString() : null,
    status: l.status,
    winnerSub: l.winnerSub,
    espnGame: l.espnGame,
    espnLeagueId: l.espnLeagueId,
    espnSeason: l.espnSeason,
    createdAt: l.createdAt.toISOString(),
    settledAt: l.settledAt ? l.settledAt.toISOString() : null,
    memberCount: item.memberCount,
  };
}

function toStandingDto(s: LeagueStanding): LeagueStandingDto {
  return {
    userSub: s.userSub,
    balanceCents: s.balanceCents,
    wins: s.wins,
    losses: s.losses,
    pushes: s.pushes,
    betCount: s.betCount,
    roiPct: s.roiPct,
    rank: s.rank,
  };
}

// Accepts a plain row (freshly added — no health yet) or one enriched with
// health from the detail query; a row with no health reads as "not checked yet".
function toLeagueEspnLeagueDto(
  row: ZeroproofLeagueEspnLeague &
    Partial<Pick<LeagueEspnLeagueRow, 'lastCheckedAt' | 'lastOkAt' | 'lastError'>>,
): LeagueEspnLeagueDto {
  return {
    id: row.id,
    game: row.game,
    leagueId: row.espnLeagueId,
    season: row.season,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt ? row.lastCheckedAt.toISOString() : null,
    lastOkAt: row.lastOkAt ? row.lastOkAt.toISOString() : null,
    lastError: row.lastError ?? null,
  };
}

function toWalletDto(w: WalletWithBalance): WalletDto {
  return {
    id: w.id,
    mode: w.mode,
    principalCents: w.principalCents,
    balanceCents: w.balanceCents,
    lockStart: w.lockStart.toISOString(),
    lockEnd: w.lockEnd.toISOString(),
    status: w.status,
    createdAt: w.createdAt.toISOString(),
  };
}

function toEventDto(e: EventWithLines): EventDto {
  return {
    id: e.id,
    sport: e.sport,
    home: e.home,
    away: e.away,
    commenceTime: e.commenceTime.toISOString(),
    status: e.status,
    markets: e.markets.map((m) => ({
      market: m.market,
      fetchedAt: m.fetchedAt.toISOString(),
      outcomes: m.outcomes,
    })),
  };
}

export class ZeroproofController {
  /** GET /api/zeroproof/events — upcoming events with latest lines (public). */
  async listEvents(_req: Request, res: Response, next: NextFunction) {
    try {
      const events = await service.listEvents();
      res.json({ events: events.map(toEventDto) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/me — the caller's profile stats, wallets and accolades. */
  async me(req: Request, res: Response, next: NextFunction) {
    try {
      const { wallets, stats, accolades } = await service.getProfile(requireSub(req));
      res.json({
        stats,
        wallets: wallets.map(toWalletDto),
        accolades: accolades.map((a) => ({ id: a.id, name: a.name, awardedAt: a.awardedAt.toISOString() })),
      });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/leaderboard — ranked profiles (public). */
  async leaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const board = req.query.board === 'roi' ? 'roi' : 'sharp';
      res.json({ board, entries: await service.leaderboard(board) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/refer — log an attributed click and 302 to the book. */
  async refer(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub ?? null;
      const partner = String(req.query.partner ?? '');
      const target = await service.recordReferralClick(sub, partner);
      res.redirect(302, target);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/house — company float, yield and referral clicks (admin). */
  async house(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await service.houseSummary());
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/zeroproof/bets — place a bet from one of the caller's wallets. */
  async placeBet(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = requireSub(req);
      const result = await service.placeBet(sub, req.body as PlaceBetInput);
      if (!result.ok) {
        res.status(402).json({ error: 'Insufficient balance', availableCents: result.availableCents });
        return;
      }
      res.status(201).json({ bet: toBetDto(result.bet) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/zeroproof/wallets — open a Season or Challenge wallet. */
  async openWallet(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = requireSub(req);
      const { mode, depositCents } = req.body as OpenWalletInput;
      const wallet = await service.openWallet(sub, mode, depositCents);
      res.status(201).json({ wallet: toWalletDto(wallet) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/wallets — the caller's wallets with derived balances. */
  async listWallets(req: Request, res: Response, next: NextFunction) {
    try {
      const wallets = await service.listWallets(requireSub(req));
      res.json({ wallets: wallets.map(toWalletDto) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/bets — the caller's bet history, newest first. */
  async myBets(req: Request, res: Response, next: NextFunction) {
    try {
      const bets = await service.getBets(requireSub(req));
      res.json({ bets: bets.map(toBetDto) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/zeroproof/leagues — create a league (commissioner). */
  async createLeague(req: Request, res: Response, next: NextFunction) {
    try {
      const item = await service.createLeague(requireSub(req), req.body as CreateLeagueInput);
      res.status(201).json({ league: toLeagueDto(item, true) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/leagues — discover public leagues (?q=) or resolve one (?code=). */
  async listLeagues(req: Request, res: Response, next: NextFunction) {
    try {
      const q = typeof req.query.q === 'string' ? req.query.q : undefined;
      const code = typeof req.query.code === 'string' ? req.query.code : undefined;
      const items = await service.listLeagues({ q, code });
      res.json({ leagues: items.map((i) => toLeagueDto(i, false)) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/leagues/mine — the caller's leagues. */
  async myLeagues(req: Request, res: Response, next: NextFunction) {
    try {
      const items = await service.getMyLeagues(requireSub(req));
      res.json({ leagues: items.map((i) => toLeagueDto(i, true)) });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/leagues/:id — a league's rules, board, and the caller's place. */
  async leagueDetail(req: Request, res: Response, next: NextFunction) {
    try {
      const detail = await service.getLeagueDetail(param(req.params.id), optionalSub(req));
      res.json({
        league: toLeagueDto(
          { league: detail.league, memberCount: detail.memberCount },
          detail.isMember || detail.isCommissioner,
        ),
        standings: detail.standings.map(toStandingDto),
        espnLeagues: detail.espnLeagues.map(toLeagueEspnLeagueDto),
        callerWalletId: detail.callerWalletId,
        isMember: detail.isMember,
        isCommissioner: detail.isCommissioner,
      });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/zeroproof/leagues/:id/espn-leagues — commissioner adds an ESPN league. */
  async addLeagueEspnLeague(req: Request, res: Response, next: NextFunction) {
    try {
      const body = req.body as AddLeagueEspnLeagueInput;
      const row = await service.addLeagueEspnLeague(requireSub(req), param(req.params.id), body);
      res.status(201).json({ espnLeague: toLeagueEspnLeagueDto(row) });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/zeroproof/leagues/:id/espn-leagues/:espnId — commissioner removes one. */
  async removeLeagueEspnLeague(req: Request, res: Response, next: NextFunction) {
    try {
      await service.removeLeagueEspnLeague(
        requireSub(req),
        param(req.params.id),
        param(req.params.espnId),
      );
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/zeroproof/leagues/:id/join — join a league. */
  async joinLeague(req: Request, res: Response, next: NextFunction) {
    try {
      const { joinCode } = req.body as JoinLeagueInput;
      const result = await service.joinLeague(requireSub(req), param(req.params.id), joinCode);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/zeroproof/espn-leagues — the registered ESPN leagues (admin). */
  async listEspnLeagues(_req: Request, res: Response, next: NextFunction) {
    try {
      res.json({ leagues: await service.listEspnLeagues() });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/zeroproof/espn-leagues — register a league for ingestion (admin). */
  async addEspnLeague(req: Request, res: Response, next: NextFunction) {
    try {
      const league = await service.addEspnLeague(req.body as AddEspnLeagueInput);
      res.status(201).json({ league });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/zeroproof/espn-leagues/:id — unregister a league (admin). */
  async removeEspnLeague(req: Request, res: Response, next: NextFunction) {
    try {
      await service.removeEspnLeague(param(req.params.id));
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
}
