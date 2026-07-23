// ---------------------------------------------------------------------------
// Search module — Express router
// ---------------------------------------------------------------------------

import { Router } from 'express';
import { SearchController } from './controller.js';
import { optionalCheckJwt } from '../../config/auth.js';

const router = Router();
const ctrl = new SearchController();

// GET /api/search?q=... — public search (works for guests)
router.get('/', optionalCheckJwt, (req, res, next) => ctrl.search(req, res, next));

export default router;
