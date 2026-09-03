// ---------------------------------------------------------------------------
// ZeroProof wallets — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import { UnauthorizedError } from '../../shared/errors/index.js';
import type { OpenWalletInput } from './schemas.js';
import * as service from './service.js';
import type { EventDto, EventWithLines, WalletDto, WalletWithBalance } from './types.js';

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
}
