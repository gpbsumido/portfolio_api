import { describe, test, expect, vi, beforeEach } from 'vitest';
import { WallsService } from './service.js';
import { NotFoundError } from '../../shared/errors/AppError.js';
import type { WallManifest, WallState } from './types.js';

const SUB = 'auth0|u1';
const T0 = '2026-07-28T00:00:00.000Z';

const state = (ids: { id: string; src: string }[]): WallState => ({
  images: ids.map((i) => ({ id: i.id, src: i.src, frame: { sizeId: '8x10' } })),
  wall: { width: 96, height: 60 },
  gap: 3,
  layout: 'rows',
});

function fakeRepo() {
  const manifests = new Map<string, WallManifest>();
  return {
    manifests,
    putManifest: vi.fn(async (sub: string, m: WallManifest) => {
      manifests.set(`${sub}|${m.id}`, m);
    }),
    getManifest: vi.fn(async (sub: string, id: string) => manifests.get(`${sub}|${id}`) ?? null),
    listSummaries: vi.fn(async (sub: string) =>
      [...manifests.values()]
        .filter((_, i) => i >= 0)
        .map((m) => ({ id: m.id, name: m.name, updatedAt: m.updatedAt })),
    ),
    putImage: vi.fn(
      async (sub: string, wallId: string, imageId: string, ext: string) =>
        `https://cdn/gallery-walls/${sub}/${wallId}/images/${imageId}.${ext}`,
    ),
    deleteImage: vi.fn(async () => {}),
    deleteWall: vi.fn(async () => {}),
  };
}

const processImage = vi.fn(async (buffer: Buffer) => ({
  fullBuffer: Buffer.from(`opt:${buffer.toString()}`),
}));

let clock = T0;
const makeService = (repo: ReturnType<typeof fakeRepo>) =>
  new WallsService({
    repo: repo as never,
    processImage: processImage as never,
    now: () => clock,
    idGen: () => 'wall-1',
  });

beforeEach(() => {
  clock = T0;
  processImage.mockClear();
});

describe('WallsService.createWall', () => {
  test('uploads local files, rewrites their srcs to CDN urls, and keeps external srcs', async () => {
    const repo = fakeRepo();
    const service = makeService(repo);

    const summary = await service.createWall(SUB, {
      name: 'Hallway',
      state: state([
        { id: 'a', src: 'blob:a' },
        { id: 'b', src: 'https://cdn/gallery-walls/auth0|u1/old/images/b.webp' },
      ]),
      files: [{ imageId: 'a', buffer: Buffer.from('AAA'), mimetype: 'image/png' }],
    });

    expect(summary).toEqual({ id: 'wall-1', name: 'Hallway', updatedAt: T0 });
    expect(processImage).toHaveBeenCalledWith(Buffer.from('AAA'));
    expect(repo.putImage).toHaveBeenCalledWith(
      SUB,
      'wall-1',
      'a',
      'webp',
      Buffer.from('opt:AAA'),
      'image/webp',
    );

    const stored = repo.manifests.get(`${SUB}|wall-1`)!;
    expect(stored.state.images[0].src).toBe(
      'https://cdn/gallery-walls/auth0|u1/wall-1/images/a.webp',
    );
    expect(stored.state.images[1].src).toBe(
      'https://cdn/gallery-walls/auth0|u1/old/images/b.webp',
    );
    expect(stored.createdAt).toBe(T0);
    expect(stored.updatedAt).toBe(T0);
  });
});

describe('WallsService.listWalls / getWall', () => {
  test('lists a users saved walls', async () => {
    const repo = fakeRepo();
    const service = makeService(repo);
    await service.createWall(SUB, { name: 'Den', state: state([]), files: [] });
    expect(await service.listWalls(SUB)).toEqual([
      { id: 'wall-1', name: 'Den', updatedAt: T0 },
    ]);
  });

  test('getWall returns the manifest, and throws NotFound when it is missing', async () => {
    const repo = fakeRepo();
    const service = makeService(repo);
    await service.createWall(SUB, { name: 'Den', state: state([]), files: [] });
    expect((await service.getWall(SUB, 'wall-1')).name).toBe('Den');
    await expect(service.getWall(SUB, 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('WallsService.updateWall', () => {
  test('renames, preserves createdAt, bumps updatedAt, and deletes removed images', async () => {
    const repo = fakeRepo();
    const service = makeService(repo);
    await service.createWall(SUB, {
      name: 'Old',
      state: state([
        { id: 'a', src: 'blob:a' },
        { id: 'b', src: 'blob:b' },
      ]),
      files: [
        { imageId: 'a', buffer: Buffer.from('AAA'), mimetype: 'image/png' },
        { imageId: 'b', buffer: Buffer.from('BBB'), mimetype: 'image/png' },
      ],
    });

    clock = '2026-07-28T09:00:00.000Z';
    const summary = await service.updateWall(SUB, 'wall-1', {
      name: 'New',
      state: state([
        { id: 'b', src: 'https://cdn/gallery-walls/auth0|u1/wall-1/images/b.webp' },
        { id: 'c', src: 'blob:c' },
      ]),
      files: [{ imageId: 'c', buffer: Buffer.from('CCC'), mimetype: 'image/png' }],
    });

    expect(summary).toEqual({ id: 'wall-1', name: 'New', updatedAt: '2026-07-28T09:00:00.000Z' });
    expect(repo.deleteImage).toHaveBeenCalledWith(SUB, 'wall-1', 'a', 'webp');
    expect(repo.deleteImage).not.toHaveBeenCalledWith(SUB, 'wall-1', 'b', 'webp');

    const stored = repo.manifests.get(`${SUB}|wall-1`)!;
    expect(stored.createdAt).toBe(T0);
    expect(stored.updatedAt).toBe('2026-07-28T09:00:00.000Z');
    expect(stored.state.images.map((i) => i.id)).toEqual(['b', 'c']);
  });

  test('throws NotFound when updating a wall that does not exist', async () => {
    const repo = fakeRepo();
    const service = makeService(repo);
    await expect(
      service.updateWall(SUB, 'ghost', { name: 'x', state: state([]), files: [] }),
    ).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('WallsService.removeWall', () => {
  test('deletes the wall, and throws NotFound when it is missing', async () => {
    const repo = fakeRepo();
    const service = makeService(repo);
    await service.createWall(SUB, { name: 'Den', state: state([]), files: [] });

    await service.removeWall(SUB, 'wall-1');
    expect(repo.deleteWall).toHaveBeenCalledWith(SUB, 'wall-1');

    await expect(service.removeWall(SUB, 'ghost')).rejects.toBeInstanceOf(NotFoundError);
  });
});
