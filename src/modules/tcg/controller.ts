// ---------------------------------------------------------------------------
// Fantasy TCG economy — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import type { CardPull } from '../../config/drizzle/schema.js';
import { UnauthorizedError } from '../../shared/errors/AppError.js';
import * as service from './service.js';
import { PACK_COST } from './service.js';
import type { OpenPackInput } from './schemas.js';
import type { CollectionCard } from './types.js';

/** The Auth0 subject of the caller, or a 401 if the token carried none. */
function requireSub(req: Request): string {
  const sub = (req.auth?.payload as { sub?: string } | undefined)?.sub;
  if (!sub) throw new UnauthorizedError('Not signed in');
  return sub;
}

function toCollectionCard(row: CardPull): CollectionCard {
  return {
    id: row.id,
    cardId: row.cardId,
    sport: row.sport,
    playerId: row.playerId,
    playerName: row.playerName,
    points: row.points,
    rarity: row.rarity,
    periodId: row.periodId,
    title: row.title,
    subtitle: row.subtitle,
    imageUrl: row.imageUrl,
    opponent: row.opponent,
    home: row.home,
    pulledAt: row.pulledAt.toISOString(),
  };
}

export class TcgController {
  /** GET /api/tcg/wallet — the caller's coin balance. */
  async wallet(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await service.getWallet(requireSub(req)));
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/tcg/wallet/claim — grant the daily coins (idempotent per day). */
  async claim(req: Request, res: Response, next: NextFunction) {
    try {
      res.json(await service.claimDaily(requireSub(req)));
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/tcg/packs/open — spend coins to open the drawn pack. */
  async open(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = requireSub(req);
      const { cards } = req.body as OpenPackInput;
      const result = await service.openPack(sub, cards);
      if (!result.ok) {
        res.status(402).json({ error: 'Insufficient balance', balance: result.balance, cost: PACK_COST });
        return;
      }
      res.json({ balance: result.balance, added: result.added, cost: PACK_COST });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/tcg/collection — the caller's pulled cards, newest first. */
  async collection(req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await service.getCollection(requireSub(req));
      res.json({ cards: rows.map(toCollectionCard) });
    } catch (err) {
      next(err);
    }
  }
}
