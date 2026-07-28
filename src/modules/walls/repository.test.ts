import { describe, test, expect, vi } from 'vitest';
import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { WallsRepository } from './repository.js';
import type { WallManifest } from './types.js';

const SUB = 'auth0|u1';

const manifest = (id: string, name: string): WallManifest => ({
  id,
  name,
  state: { images: [], wall: { width: 96, height: 60 }, gap: 3, layout: 'rows' },
  createdAt: '2026-07-28T00:00:00.000Z',
  updatedAt: '2026-07-28T00:00:00.000Z',
});

/** A fake S3 client that records commands and replays canned responses. */
function fakeClient(responder: (cmd: unknown) => unknown = () => ({})) {
  const sent: unknown[] = [];
  const send = vi.fn(async (cmd: unknown) => {
    sent.push(cmd);
    return responder(cmd);
  });
  return { client: { send } as never, send, sent };
}

const bodyOf = (json: unknown) => ({
  Body: { transformToString: async () => JSON.stringify(json) },
});

describe('WallsRepository', () => {
  test('putManifest writes JSON to the manifest key', async () => {
    const { client, sent } = fakeClient();
    const repo = new WallsRepository({ client, bucket: 'b', cdnBase: 'https://cdn' });
    await repo.putManifest(SUB, manifest('w1', 'Hallway'));

    const put = sent.find((c) => c instanceof PutObjectCommand) as PutObjectCommand;
    expect(put.input.Key).toBe('gallery-walls/auth0_u1/w1/manifest.json');
    expect(put.input.Bucket).toBe('b');
    expect(put.input.ContentType).toBe('application/json');
    expect(JSON.parse(put.input.Body as string).name).toBe('Hallway');
  });

  test('getManifest reads and parses the manifest, null when missing', async () => {
    const found = fakeClient((c) =>
      c instanceof GetObjectCommand ? bodyOf(manifest('w1', 'Den')) : {},
    );
    const repo = new WallsRepository({ client: found.client, bucket: 'b', cdnBase: 'https://cdn' });
    expect((await repo.getManifest(SUB, 'w1'))?.name).toBe('Den');

    const missing = fakeClient(() => {
      const err = new Error('missing');
      err.name = 'NoSuchKey';
      throw err;
    });
    const repo2 = new WallsRepository({ client: missing.client, bucket: 'b', cdnBase: 'https://cdn' });
    expect(await repo2.getManifest(SUB, 'nope')).toBeNull();
  });

  test('listSummaries lists wall folders and returns a summary per manifest', async () => {
    const { client } = fakeClient((c) => {
      if (c instanceof ListObjectsV2Command) {
        return {
          CommonPrefixes: [
            { Prefix: 'gallery-walls/auth0_u1/w1/' },
            { Prefix: 'gallery-walls/auth0_u1/w2/' },
          ],
        };
      }
      if (c instanceof GetObjectCommand) {
        const id = (c.input.Key as string).includes('/w1/') ? 'w1' : 'w2';
        return bodyOf(manifest(id, id === 'w1' ? 'Hall' : 'Den'));
      }
      return {};
    });
    const repo = new WallsRepository({ client, bucket: 'b', cdnBase: 'https://cdn' });
    const summaries = await repo.listSummaries(SUB);
    expect(summaries).toEqual([
      { id: 'w1', name: 'Hall', updatedAt: '2026-07-28T00:00:00.000Z' },
      { id: 'w2', name: 'Den', updatedAt: '2026-07-28T00:00:00.000Z' },
    ]);
  });

  test('putImage uploads under the wall images folder and returns a CDN url', async () => {
    const { client, sent } = fakeClient();
    const repo = new WallsRepository({ client, bucket: 'b', cdnBase: 'https://cdn' });
    const url = await repo.putImage(SUB, 'w1', 'img3', 'jpg', Buffer.from('x'), 'image/jpeg');

    const put = sent.find((c) => c instanceof PutObjectCommand) as PutObjectCommand;
    expect(put.input.Key).toBe('gallery-walls/auth0_u1/w1/images/img3.jpg');
    expect(put.input.ContentType).toBe('image/jpeg');
    expect(url).toBe('https://cdn/gallery-walls/auth0_u1/w1/images/img3.jpg');
  });

  test('deleteWall lists the wall prefix and deletes every object', async () => {
    const { client, sent } = fakeClient((c) =>
      c instanceof ListObjectsV2Command
        ? {
            Contents: [
              { Key: 'gallery-walls/auth0_u1/w1/manifest.json' },
              { Key: 'gallery-walls/auth0_u1/w1/images/a.jpg' },
            ],
          }
        : {},
    );
    const repo = new WallsRepository({ client, bucket: 'b', cdnBase: 'https://cdn' });
    await repo.deleteWall(SUB, 'w1');

    const del = sent.find((c) => c instanceof DeleteObjectsCommand) as DeleteObjectsCommand;
    expect(del.input.Delete?.Objects).toEqual([
      { Key: 'gallery-walls/auth0_u1/w1/manifest.json' },
      { Key: 'gallery-walls/auth0_u1/w1/images/a.jpg' },
    ]);
  });

  test('deleteImage removes a single wall image by its key', async () => {
    const { client, sent } = fakeClient();
    const repo = new WallsRepository({ client, bucket: 'b', cdnBase: 'https://cdn' });
    await repo.deleteImage(SUB, 'w1', 'img7', 'webp');

    const del = sent.find((c) => c instanceof DeleteObjectCommand) as DeleteObjectCommand;
    expect(del.input.Key).toBe('gallery-walls/auth0_u1/w1/images/img7.webp');
    expect(del.input.Bucket).toBe('b');
  });

  test('deleteWall with an empty prefix sends no delete', async () => {
    const { client, sent } = fakeClient((c) =>
      c instanceof ListObjectsV2Command ? { Contents: [] } : {},
    );
    const repo = new WallsRepository({ client, bucket: 'b', cdnBase: 'https://cdn' });
    await repo.deleteWall(SUB, 'gone');
    expect(sent.some((c) => c instanceof DeleteObjectsCommand)).toBe(false);
  });
});
