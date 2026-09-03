// ---------------------------------------------------------------------------
// ZeroProof wallets — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/index.js';
import type { ZeroproofBet } from '../../config/drizzle/schema.js';
import type { OpenWalletInput, PlaceBetInput } from './schemas.js';
import * as service from './service.js';
import type { BetDto, EventDto, EventWithLines, WalletDto, WalletWithBalance } from './types.js';

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
}
