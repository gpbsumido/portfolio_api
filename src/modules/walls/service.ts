/**
 * The gallery-walls domain logic, kept free of Express so it can be unit tested.
 * It orchestrates the S3 repository and the shared image processor: on save it
 * optimizes each freshly uploaded photo, uploads it under the wall's folder, and
 * rewrites that image's src in the wall state to its CDN URL. Images that already
 * carry a remote src (a prior save) are left alone.
 *
 * Dependencies (repo, image processor, clock, id generator) are injected so the
 * behaviour is deterministic in tests.
 */

import { NotFoundError } from '../../shared/errors/AppError.js';
import type { WallsRepository } from './repository.js';
import type { WallManifest, WallState, WallSummary } from './types.js';

/** One uploaded photo, keyed by the state image id it belongs to. */
export interface WallUpload {
  imageId: string;
  buffer: Buffer;
  mimetype: string;
}

interface SaveInput {
  name: string;
  state: WallState;
  files: WallUpload[];
}

interface UpdateInput {
  name?: string;
  state?: WallState;
  files: WallUpload[];
}

interface WallsServiceDeps {
  repo: WallsRepository;
  processImage: (buffer: Buffer) => Promise<{ fullBuffer: Buffer }>;
  now: () => string;
  idGen: () => string;
}

const IMAGE_EXT = 'webp';
const IMAGE_CONTENT_TYPE = 'image/webp';

const toSummary = (m: WallManifest): WallSummary => ({
  id: m.id,
  name: m.name,
  updatedAt: m.updatedAt,
});

export class WallsService {
  private readonly repo: WallsRepository;
  private readonly processImage: WallsServiceDeps['processImage'];
  private readonly now: () => string;
  private readonly idGen: () => string;

  constructor(deps: WallsServiceDeps) {
    this.repo = deps.repo;
    this.processImage = deps.processImage;
    this.now = deps.now;
    this.idGen = deps.idGen;
  }

  /** Upload each file and return a map of image id to its new CDN url. */
  private async uploadFiles(
    sub: string,
    wallId: string,
    files: WallUpload[],
  ): Promise<Map<string, string>> {
    const uploaded = new Map<string, string>();
    for (const file of files) {
      const { fullBuffer } = await this.processImage(file.buffer);
      const url = await this.repo.putImage(
        sub,
        wallId,
        file.imageId,
        IMAGE_EXT,
        fullBuffer,
        IMAGE_CONTENT_TYPE,
      );
      uploaded.set(file.imageId, url);
    }
    return uploaded;
  }

  /** Swap the src of any image that was just uploaded for its CDN url. */
  private rewriteState(state: WallState, uploaded: Map<string, string>): WallState {
    return {
      ...state,
      images: state.images.map((image) => {
        const url = uploaded.get(image.id);
        return url ? { ...image, src: url } : image;
      }),
    };
  }

  async createWall(sub: string, input: SaveInput): Promise<WallSummary> {
    const wallId = this.idGen();
    const uploaded = await this.uploadFiles(sub, wallId, input.files);
    const timestamp = this.now();
    const manifest: WallManifest = {
      id: wallId,
      name: input.name,
      state: this.rewriteState(input.state, uploaded),
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    await this.repo.putManifest(sub, manifest);
    return toSummary(manifest);
  }

  async listWalls(sub: string): Promise<WallSummary[]> {
    return this.repo.listSummaries(sub);
  }

  async getWall(sub: string, wallId: string): Promise<WallManifest> {
    const manifest = await this.repo.getManifest(sub, wallId);
    if (!manifest) throw new NotFoundError('Wall not found.');
    return manifest;
  }

  async updateWall(sub: string, wallId: string, input: UpdateInput): Promise<WallSummary> {
    const existing = await this.getWall(sub, wallId);

    const nextStateInput = input.state ?? existing.state;
    const uploaded = await this.uploadFiles(sub, wallId, input.files);
    const nextState = this.rewriteState(nextStateInput, uploaded);

    if (input.state) {
      const keptIds = new Set(nextState.images.map((i) => i.id));
      const removed = existing.state.images.filter((i) => !keptIds.has(i.id));
      for (const image of removed) {
        await this.repo.deleteImage(sub, wallId, image.id, IMAGE_EXT);
      }
    }

    const manifest: WallManifest = {
      id: wallId,
      name: input.name ?? existing.name,
      state: nextState,
      createdAt: existing.createdAt,
      updatedAt: this.now(),
    };
    await this.repo.putManifest(sub, manifest);
    return toSummary(manifest);
  }

  async removeWall(sub: string, wallId: string): Promise<void> {
    await this.getWall(sub, wallId);
    await this.repo.deleteWall(sub, wallId);
  }
}
