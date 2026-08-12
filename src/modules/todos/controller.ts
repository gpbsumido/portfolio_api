import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';
import { NotFoundError } from '../../shared/errors/AppError.js';

export class TodosController {
  /** GET /api/todos */
  async list(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      res.json({ todos: await repo.listTodos() });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/todos/:id */
  async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const { done } = req.body as { done: boolean };
      const todo = await repo.setDone(id, done);
      if (!todo) {
        throw new NotFoundError('Todo not found');
      }
      res.json({ todo });
    } catch (err) {
      next(err);
    }
  }
}
