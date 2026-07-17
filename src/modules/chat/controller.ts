import type { Request, Response, NextFunction } from 'express';
import { ChatService } from './service.js';

const service = new ChatService();

export class ChatController {
  async chat(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { prompt } = req.body;

    if (!prompt) {
      res.status(400).json({ error: 'Prompt is required' });
      return;
    }

    if (prompt.length > 4000) {
      res.status(400).json({ error: 'Prompt too long' });
      return;
    }

    try {
      const reply = await service.chat(prompt);
      res.json({ reply });
    } catch (error) {
      console.error('ChatGPT error:', error);
      res.status(500).json({ error: 'ChatGPT request failed' });
    }
  }

  async summarize(req: Request, res: Response, _next: NextFunction): Promise<void> {
    const { text } = req.body;

    if (text.length > 4000) {
      res.status(400).json({ error: 'Text too long' });
      return;
    }

    if (!text) {
      res.status(400).json({ error: 'Text for summarization is required' });
      return;
    }

    try {
      const reply = await service.summarize(text);
      res.json({ reply });
    } catch (error) {
      console.error('ChatGPT error:', error);
      res.status(500).json({ error: 'ChatGPT request failed' });
    }
  }
}
