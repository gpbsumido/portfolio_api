import { describe, test, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { app } from '../../app.js';

// Authenticated as a fixed user.
vi.mock('../../config/auth.js', () => {
  const authAs = (req: any, _res: any, next: any) => {
    req.auth = { payload: { sub: 'auth0|test' } };
    next();
  };
  return { checkJwt: authAs, optionalCheckJwt: authAs, checkPermissions: () => authAs };
});

// Skip the real sharp/ffmpeg pipeline.
vi.mock('../../shared/utils/mediaProcessor.js', () => ({
  processImage: vi.fn(async () => ({ fullBuffer: Buffer.from('optimized') })),
}));

// A tiny in-memory S3 keyed by object key, driven off command class names.
const s3mock = vi.hoisted(() => {
  const store = new Map<string, string>();
  const send = async (cmd: any) => {
    const name = cmd.constructor.name;
    const input = cmd.input;
    if (name === 'PutObjectCommand') {
      store.set(input.Key, String(input.Body));
      return {};
    }
    if (name === 'GetObjectCommand') {
      if (!store.has(input.Key)) {
        const err: any = new Error('missing');
        err.name = 'NoSuchKey';
        throw err;
      }
      return { Body: { transformToString: async () => store.get(input.Key) } };
    }
    if (name === 'ListObjectsV2Command') {
      const prefix: string = input.Prefix;
      const keys = [...store.keys()].filter((k) => k.startsWith(prefix));
      if (input.Delimiter === '/') {
        const set = new Set(
          keys.map((k) => prefix + k.slice(prefix.length).split('/')[0] + '/'),
        );
        return { CommonPrefixes: [...set].map((Prefix) => ({ Prefix })) };
      }
      return { Contents: keys.map((Key) => ({ Key })) };
    }
    if (name === 'DeleteObjectsCommand') {
      for (const o of input.Delete.Objects) store.delete(o.Key);
      return {};
    }
    if (name === 'DeleteObjectCommand') {
      store.delete(input.Key);
      return {};
    }
    return {};
  };
  return { store, send };
});

vi.mock('../../config/s3.js', () => ({
  s3: { send: s3mock.send },
  S3_BUCKET: 'test-bucket',
  CDN_BASE: 'https://cdn.example',
}));

const wallState = () => ({
  images: [
    { id: 'a', src: 'blob:a', frame: { sizeId: '8x10' } },
    { id: 'b', src: 'https://cdn.example/gallery-walls/auth0_test/other/images/b.webp' },
  ],
  wall: { width: 96, height: 60 },
  gap: 3,
  layout: 'rows',
});

beforeEach(() => s3mock.store.clear());

describe('walls API', () => {
  test('creates a wall, uploading local photos to its S3 folder', async () => {
    const res = await request(app)
      .post('/api/walls')
      .field('name', 'Hallway')
      .field('state', JSON.stringify(wallState()))
      .field('imageIds', JSON.stringify(['a']))
      .attach('photos', Buffer.from('AAA'), { filename: 'a.png', contentType: 'image/png' });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('Hallway');
    expect(typeof res.body.id).toBe('string');

    // The optimized image landed under the wall's images/ folder.
    const imageKey = [...s3mock.store.keys()].find((k) => k.includes('/images/a.webp'));
    expect(imageKey).toMatch(/^gallery-walls\/auth0_test\/.+\/images\/a\.webp$/);
  });

  test('lists, reads, and deletes a saved wall', async () => {
    const create = await request(app)
      .post('/api/walls')
      .field('name', 'Den')
      .field('state', JSON.stringify(wallState()))
      .field('imageIds', JSON.stringify(['a']))
      .attach('photos', Buffer.from('AAA'), { filename: 'a.png', contentType: 'image/png' });
    const id = create.body.id;

    const list = await request(app).get('/api/walls');
    expect(list.status).toBe(200);
    expect(list.body).toEqual([{ id, name: 'Den', updatedAt: expect.any(String) }]);

    const read = await request(app).get(`/api/walls/${id}`);
    expect(read.status).toBe(200);
    // Local photo rewritten to a CDN url; the already-remote one is untouched.
    expect(read.body.state.images[0].src).toBe(
      `https://cdn.example/gallery-walls/auth0_test/${id}/images/a.webp`,
    );
    expect(read.body.state.images[1].src).toContain('/other/images/b.webp');

    const del = await request(app).delete(`/api/walls/${id}`);
    expect(del.status).toBe(200);
    expect((await request(app).get('/api/walls')).body).toEqual([]);
  });

  test('rewrites the src of a photo whose id holds spaces and non-ASCII', async () => {
    // A real screenshot filename: spaces plus a narrow no-break space (U+202F).
    const id = 'Screenshot 2025-11-18 at 10.40.57 AM.png-852056-1763487663415';
    const state = {
      images: [{ id, src: 'blob:http://localhost:3000/dead-handle' }],
      wall: { width: 96, height: 60 },
      gap: 3,
      layout: 'rows',
    };

    const create = await request(app)
      .post('/api/walls')
      .field('name', 'Screenshots')
      .field('state', JSON.stringify(state))
      .field('imageIds', JSON.stringify([id]))
      .attach('photos', Buffer.from('AAA'), { filename: 'a.png', contentType: 'image/png' });
    expect(create.status).toBe(201);

    const read = await request(app).get(`/api/walls/${create.body.id}`);
    const src = read.body.state.images[0].src;
    // The dead blob url must be gone, and the CDN url must be safe to fetch.
    expect(src).not.toMatch(/^blob:/);
    expect(src).toContain('/images/');
    expect(src).toBe(encodeURI(src));
    expect(src).not.toMatch(/[  ]/);
  });

  test('rejects a create with no name', async () => {
    const res = await request(app)
      .post('/api/walls')
      .field('state', JSON.stringify(wallState()));
    expect(res.status).toBe(400);
  });

  test('404s reading a wall that does not exist', async () => {
    const res = await request(app).get('/api/walls/nope');
    expect(res.status).toBe(404);
  });
});
