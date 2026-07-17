import { parseStringPromise } from 'xml2js';
import type { YouTubeVideo } from './types.js';

export class YouTubeService {
  async getRecentVideos(channelId: string): Promise<YouTubeVideo[]> {
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?channel_id=${channelId}`,
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch data from YouTube: ${response.statusText}`);
    }

    const data = await response.text();
    const parsed = await parseStringPromise(data);

    const videos: YouTubeVideo[] = parsed.feed.entry
      ? parsed.feed.entry.map((entry: any) => ({
          id: entry['yt:videoId'][0],
          title: entry.title[0],
          published: entry.published[0],
          link: entry.link[0].$.href,
          thumbnail: entry['media:group'][0]['media:thumbnail'][0].$.url,
        }))
      : [];

    return videos;
  }
}
