import type { Request, Response, NextFunction } from 'express';
import { GeoService } from './service.js';

const service = new GeoService();

function clientIp(req: Request): string {
  return (
    ((req.headers['x-forwarded-for'] as string) ?? '').split(',')[0].trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket?.remoteAddress ||
    'unknown'
  );
}

export class GeoController {
  async lookup(req: Request, res: Response, next: NextFunction): Promise<void> {
    const ip = clientIp(req);
    try {
      const data = await service.lookup(ip);
      res.json(data);
    } catch (err) {
      next(err);
    }
  }
}
