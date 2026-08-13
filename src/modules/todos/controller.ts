import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import type { CreateTodoInput } from './schemas.js';

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

  /** POST /api/todos */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { title, project, phase, detail } = req.body as CreateTodoInput;
      const todo = await repo.createTodo({
        title,
        project,
        phase,
        detail: detail ?? null,
      });
      res.status(201).json({ todo });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/todos/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const todo = await repo.softDeleteTodo(id);
      if (!todo) {
        throw new NotFoundError('Todo not found');
      }
      res.json({ todo });
    } catch (err) {
      next(err);
    }
  }
}
