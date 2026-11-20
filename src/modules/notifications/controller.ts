// ---------------------------------------------------------------------------
// Notifications module — Express controller
// ---------------------------------------------------------------------------

import { requireUserSub } from '../../shared/auth/requestUser.js';
import type { Request, Response, NextFunction } from 'express';
import * as service from './service.js';

export class NotificationsController {
  /** GET /api/notifications — the recipient's activity feed + unread count */
  async list(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = requireUserSub(req);
      const result = await service.list(sub);
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** PUT /api/notifications/seen — mark all notifications as read */
  async markSeen(req: Request, res: Response, next: NextFunction) {
    try {
      const sub = requireUserSub(req);
      await service.markSeen(sub);
      res.status(204).end();
    } catch (err) {
      next(err);
    }
  }
}
