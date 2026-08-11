// ---------------------------------------------------------------------------
// Feature-flags module — Express controller
// ---------------------------------------------------------------------------

import type { NextFunction, Request, Response } from 'express';
import type { FeatureFlag, FeatureFlagAudit } from '../../config/drizzle/schema.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import * as repo from './repository.js';
import type { UpdateFlagBody } from './schemas.js';
import type { AuditEntry, Environment, Flag } from './types.js';

const log = createModuleLogger('feature-flags');

/** The environments every flag is configured in, promoted left to right. */
const ENVIRONMENTS: Environment[] = ['development', 'staging', 'production'];

function toFlagDto(row: FeatureFlag): Flag {
  return {
    key: row.key,
    access: row.access,
    name: row.name,
    description: row.description,
    kind: row.kind,
    tags: row.tags,
    variations: row.variations,
    environments: row.environments,
    createdAt: row.createdAt.toISOString(),
  };
}

function toAuditDto(row: FeatureFlagAudit): AuditEntry {
  return {
    id: row.id,
    flagKey: row.flagKey,
    environment: row.environment as Environment,
    action: row.action,
    summary: row.summary,
    actor: row.actor,
    timestamp: row.createdAt.toISOString(),
  };
}

function param(val: string | string[]): string {
  return Array.isArray(val) ? val[0] : val;
}

/** The signed-in user's identity, preferring a readable email over the sub. */
function actorFrom(req: Request): string {
  const payload = (req as { auth?: { payload?: Record<string, unknown> } }).auth?.payload;
  const email = typeof payload?.email === 'string' ? payload.email : undefined;
  const sub = typeof payload?.sub === 'string' ? payload.sub : undefined;
  return email ?? sub ?? 'unknown';
}

export class FeatureFlagsController {
  /** GET /api/feature-flags — every flag plus the environment list. */
  async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await repo.listFlags();
      res.json({ flags: rows.map(toFlagDto), environments: ENVIRONMENTS });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/feature-flags/audit — the change log, newest first. */
  async audit(_req: Request, res: Response, next: NextFunction) {
    try {
      const rows = await repo.listAudit();
      res.json({ audit: rows.map(toAuditDto) });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/feature-flags/:flagKey — toggle the kill switch and/or rollout. */
  async patch(req: Request, res: Response, next: NextFunction) {
    try {
      const key = param(req.params.flagKey);
      const { environment, enabled, fallthrough } = req.body as UpdateFlagBody;
      const actor = actorFrom(req);

      let updated: FeatureFlag | null = null;

      if (enabled !== undefined) {
        updated = await repo.setEnabled(key, environment, enabled);
        if (!updated) throw new NotFoundError('flag not found');
        await repo.recordAudit({
          flagKey: key,
          environment,
          action: enabled ? 'enabled' : 'disabled',
          summary: `${enabled ? 'Enabled' : 'Disabled'} in ${environment}`,
          actor,
        });
      }

      if (fallthrough !== undefined) {
        updated = await repo.setFallthrough(key, environment, fallthrough);
        if (!updated) throw new NotFoundError('flag not found');
        const onSlice = fallthrough.find((w) => w.variation === 'on');
        const summary = onSlice
          ? `${environment} rollout set to ${onSlice.weight}% on`
          : `${environment} rollout weights updated`;
        await repo.recordAudit({
          flagKey: key,
          environment,
          action: 'rollout-changed',
          summary,
          actor,
        });
      }

      if (!updated) throw new NotFoundError('flag not found');

      log.info({ flagKey: key, environment, actor }, 'flag updated');
      res.json(toFlagDto(updated));
    } catch (err) {
      next(err);
    }
  }
}
