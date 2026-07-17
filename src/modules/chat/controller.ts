import type { Request, Response, NextFunction } from 'express';
import { ChatService } from './service.js';
import { createModuleLogger } from '../../shared/utils/logger.js';
import { ValidationError } from '../../shared/errors/AppError.js';

const log = createModuleLogger('chat');

const service = new ChatService();

export class ChatController {
  async chat(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { prompt } = req.body;

      if (!prompt) {
        throw new ValidationError('Prompt is required');
      }

      if (prompt.length > 4000) {
        throw new ValidationError('Prompt too long');
      }

      const reply = await service.chat(prompt);
      res.json({ reply });
    } catch (error) {
      next(error);
    }
  }

  async summarize(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { text } = req.body;

      if (text.length > 4000) {
        throw new ValidationError('Text too long');
      }

      if (!text) {
        throw new ValidationError('Text for summarization is required');
      }

      const reply = await service.summarize(text);
      res.json({ reply });
    } catch (error) {
      next(error);
    }
  }
}
