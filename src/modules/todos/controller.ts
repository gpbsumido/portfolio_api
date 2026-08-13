import type { Request, Response, NextFunction } from 'express';
import * as repo from './repository.js';
import * as history from './history.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import { actorEmail } from '../../shared/auth/adminEmail.js';
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
      const todo = await repo.setDone(id, done, actorEmail(req));
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
      const { title, project, phase, detail, reason } = req.body as CreateTodoInput;
      const todo = await repo.createTodo(
        { title, project, phase, detail: detail ?? null, reason: reason ?? null },
        actorEmail(req),
      );
      res.status(201).json({ todo });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/todos/:id */
  async remove(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const todo = await repo.softDeleteTodo(id, actorEmail(req));
      if (!todo) {
        throw new NotFoundError('Todo not found');
      }
      res.json({ todo });
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/todos/:id/revisions */
  async revisions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      res.json({ revisions: await history.listRevisions(id) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/todos/:id/revert */
  async revert(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const { revision } = req.body as { revision: number };
      const result = await history.revertTo(id, revision, actorEmail(req));
      if (!result) {
        // Distinguishable from a silent no-op on purpose: asking for a revision
        // that never existed is a mistake worth hearing about.
        throw new NotFoundError('Revision not found');
      }
      res.json(result);
    } catch (err) {
      next(err);
    }
  }

  /** GET /api/todos/:id/comments */
  async comments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      res.json({ comments: await history.listComments(id) });
    } catch (err) {
      next(err);
    }
  }

  /** POST /api/todos/:id/comments */
  async addComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params as { id: string };
      const { body } = req.body as { body: string };
      const comment = await history.addComment(id, body, actorEmail(req));
      if (!comment) {
        throw new NotFoundError('Todo not found');
      }
      res.status(201).json({ comment });
    } catch (err) {
      next(err);
    }
  }

  /** PATCH /api/todos/comments/:commentId */
  async editComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { commentId } = req.params as { commentId: string };
      const { body } = req.body as { body: string };
      const comment = await history.editComment(commentId, body);
      if (!comment) {
        throw new NotFoundError('Comment not found');
      }
      res.json({ comment });
    } catch (err) {
      next(err);
    }
  }

  /** DELETE /api/todos/comments/:commentId */
  async removeComment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { commentId } = req.params as { commentId: string };
      const comment = await history.removeComment(commentId);
      if (!comment) {
        throw new NotFoundError('Comment not found');
      }
      res.json({ comment });
    } catch (err) {
      next(err);
    }
  }
}
