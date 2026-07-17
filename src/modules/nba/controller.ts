import type { Request, Response, NextFunction } from 'express';
import { NbaService } from './service.js';
import { ValidationError } from '../../shared/errors/index.js';
import { env } from '../../config/env.js';

const service = new NbaService();

const SEASON_RE = /^\d{4}$/;

/** Extract a single string param (Express 5 params can be string | string[]). */
function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

function parseSeason(raw: string | string[]): number {
  const s = param(raw);
  if (!SEASON_RE.test(s)) {
    throw new ValidationError('season must be a 4-digit year');
  }
  return Number(s);
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return val !== null && typeof val === 'object' && !Array.isArray(val);
}

export class NbaController {
  async getTeams(_req: Request, res: Response, next: NextFunction) {
    try {
      const data = await service.getTeams();
      res.status(200).json({ data });
    } catch (err) {
      next(err);
    }
  }

  async getPlayers(req: Request, res: Response, next: NextFunction) {
    try {
      const teamId = parseInt(param(req.params.teamId));
      const data = await service.getPlayersByTeam(teamId);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getStats(req: Request, res: Response, next: NextFunction) {
    try {
      const playerId = parseInt(param(req.params.playerId));
      const data = await service.getPlayerStats(playerId);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  async getShots(req: Request, res: Response, next: NextFunction) {
    try {
      const playerId = parseInt(param(req.params.playerId));
      const data = await service.getShotChart(playerId);
      res.status(200).json(data);
    } catch (err) {
      next(err);
    }
  }

  // Playoffs

  async getPicks(req: Request, res: Response, next: NextFunction) {
    try {
      const season = parseSeason(req.params.season);
      const userSub = (req as any).auth.payload.sub as string;
      const picks = await service.getPicks(userSub, season);
      res.json({ picks });
    } catch (err) {
      next(err);
    }
  }

  async getPublicPicks(req: Request, res: Response, next: NextFunction) {
    try {
      const season = parseSeason(req.params.season);
      const { username, bracketId } = req.query;
      const picks = await service.getPublicPicks(
        season,
        username as string | undefined,
        bracketId as string | undefined,
      );
      res.json({ picks });
    } catch (err) {
      next(err);
    }
  }

  async savePicks(req: Request, res: Response, next: NextFunction) {
    try {
      const season = parseSeason(req.params.season);
      const { picks, displayName } = req.body;
      if (!isPlainObject(picks)) {
        throw new ValidationError('picks must be a plain object');
      }
      const userSub = (req as any).auth.payload.sub as string;
      await service.savePicks(userSub, season, picks, displayName);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }

  async getLeaderboard(req: Request, res: Response, next: NextFunction) {
    try {
      const season = parseSeason(req.params.season);
      const entries = await service.getLeaderboard(season);
      res.json({ entries });
    } catch (err) {
      next(err);
    }
  }

  async saveResults(req: Request, res: Response, next: NextFunction) {
    try {
      const season = parseSeason(req.params.season);
      const secret = env.PLAYOFFS_ADMIN_SECRET;
      if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      const { picks } = req.body;
      if (!isPlainObject(picks)) {
        throw new ValidationError('picks must be a plain object');
      }
      await service.saveOfficialResults(season, picks);
      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  }
}
