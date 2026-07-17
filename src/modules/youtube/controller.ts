import type { Request, Response, NextFunction } from 'express';
import { YouTubeService } from './service.js';

const service = new YouTubeService();

export class YouTubeController {
  async getRecent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const channelId = req.query.channel_id as string | undefined;
      if (!channelId) {
        res.status(400).json({ error: 'channel_id query parameter is required' });
        return;
      }

      const videos = await service.getRecentVideos(channelId);
      res.status(200).send(videos);
    } catch (error) {
      console.error('YouTube API Error:', error);
      next(error);
    }
  }
}
