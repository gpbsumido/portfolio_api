import { OpenAI } from 'openai';
import { env } from '../../config/env.js';

const openai = new OpenAI({
  apiKey: env.OPENAI_API_KEY,
});

export class ChatService {
  async chat(prompt: string): Promise<string> {
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });
    return chatResponse.choices[0].message.content ?? '';
  }

  async summarize(text: string): Promise<string> {
    const prompt = `Reword this for a personal reflection in a medical journal so it's clear:\n\n${text}`;
    const chatResponse = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: prompt }],
    });
    return chatResponse.choices[0].message.content ?? '';
  }
}
