/**
 * S3-backed persistence for saved gallery walls. There's no database: a user's
 * walls live entirely under their key prefix, one folder per wall, with a
 * manifest.json and an images/ folder. See {@link ./keys} for the layout.
 *
 * The S3 client, bucket, and CDN base are injected so the module is unit
 * testable with a fake client; they default to the shared singletons.
 */

import {
  PutObjectCommand,
  GetObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { s3, S3_BUCKET, CDN_BASE } from '../../config/s3.js';
import { manifestKey, imageKey, userPrefix, wallPrefix, wallIdFromPrefix } from './keys.js';
import type { WallManifest, WallSummary } from './types.js';

/** Minimal shape we need from an S3 client, so a fake can stand in. */
interface S3Like {
  send: S3Client['send'];
}

interface WallsRepositoryDeps {
  client?: S3Like;
  bucket?: string;
  cdnBase?: string;
}

/** True when an S3 GetObject failed purely because the key is absent. */
function isMissing(error: unknown): boolean {
  const name = (error as { name?: string })?.name;
  return name === 'NoSuchKey' || name === 'NotFound';
}

export class WallsRepository {
  private readonly client: S3Like;
  private readonly bucket: string;
  private readonly cdnBase: string;

  constructor(deps: WallsRepositoryDeps = {}) {
    this.client = deps.client ?? (s3 as unknown as S3Like);
    this.bucket = deps.bucket ?? S3_BUCKET!;
    this.cdnBase = deps.cdnBase ?? CDN_BASE!;
  }

  async putManifest(sub: string, manifest: WallManifest): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: manifestKey(sub, manifest.id),
        Body: JSON.stringify(manifest),
        ContentType: 'application/json',
      }) as never,
    );
  }

  async getManifest(sub: string, wallId: string): Promise<WallManifest | null> {
    try {
      const res = (await this.client.send(
        new GetObjectCommand({ Bucket: this.bucket, Key: manifestKey(sub, wallId) }) as never,
      )) as { Body?: { transformToString: () => Promise<string> } };
      const raw = (await res.Body?.transformToString()) ?? '';
      return JSON.parse(raw) as WallManifest;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }

  async listSummaries(sub: string): Promise<WallSummary[]> {
    const res = (await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: userPrefix(sub),
        Delimiter: '/',
      }) as never,
    )) as { CommonPrefixes?: { Prefix?: string }[] };

    const ids = (res.CommonPrefixes ?? [])
      .map((p) => (p.Prefix ? wallIdFromPrefix(p.Prefix, sub) : null))
      .filter((id): id is string => id !== null);

    const manifests = await Promise.all(ids.map((id) => this.getManifest(sub, id)));
    return manifests
      .filter((m): m is WallManifest => m !== null)
      .map((m) => ({ id: m.id, name: m.name, updatedAt: m.updatedAt }));
  }

  async putImage(
    sub: string,
    wallId: string,
    imageId: string,
    ext: string,
    body: Buffer,
    contentType: string,
  ): Promise<string> {
    const key = imageKey(sub, wallId, imageId, ext);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }) as never,
    );
    return `${this.cdnBase}/${key}`;
  }

  async deleteWall(sub: string, wallId: string): Promise<void> {
    const res = (await this.client.send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: wallPrefix(sub, wallId),
      }) as never,
    )) as { Contents?: { Key?: string }[] };

    const objects = (res.Contents ?? [])
      .map((o) => o.Key)
      .filter((k): k is string => Boolean(k))
      .map((Key) => ({ Key }));

    if (objects.length === 0) return;

    await this.client.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: objects },
      }) as never,
    );
  }
}
