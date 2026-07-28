/**
 * Pure helpers for the S3 key layout that backs saved gallery walls. Everything
 * a user saves lives under one per-user prefix, one folder per wall:
 *
 *   gallery-walls/{userSegment}/{wallId}/manifest.json
 *   gallery-walls/{userSegment}/{wallId}/images/{imageId}.{ext}
 *
 * The Auth0 `sub` (e.g. "auth0|abc123") is squashed to a URL-safe segment so the
 * CDN URLs we hand back never need percent-encoding.
 */

/** Root prefix for every wall in the bucket. */
export const WALLS_ROOT = 'gallery-walls';

/** Squash an Auth0 sub into a URL- and key-safe path segment. */
export function userSegment(sub: string): string {
  return sub.replace(/[^a-zA-Z0-9-_]/g, '_');
}

/** The prefix holding all of one user's walls (trailing slash included). */
export function userPrefix(sub: string): string {
  return `${WALLS_ROOT}/${userSegment(sub)}/`;
}

/** The folder holding a single wall (trailing slash included). */
export function wallPrefix(sub: string, wallId: string): string {
  return `${userPrefix(sub)}${wallId}/`;
}

/** Key of a wall's manifest.json. */
export function manifestKey(sub: string, wallId: string): string {
  return `${wallPrefix(sub, wallId)}manifest.json`;
}

/**
 * Squash an image id into a key- and URL-safe filename. Image ids come from the
 * browser and are built from filenames, so they can hold spaces and non-ASCII
 * (a screenshot named "Shot 2025-11-18 at 10.40 AM.png" carries a narrow
 * no-break space). Left raw those land in the key and the CDN URL needs
 * escaping to be fetchable, so they are flattened here. Deterministic, so the
 * delete path rebuilds the same key.
 */
export function imageSegment(imageId: string): string {
  return imageId.replace(/[^a-zA-Z0-9.\-_]/g, '_');
}

/** Key of one image inside a wall. */
export function imageKey(sub: string, wallId: string, imageId: string, ext: string): string {
  return `${wallPrefix(sub, wallId)}images/${imageSegment(imageId)}.${ext}`;
}

/**
 * Pull the wallId out of a ListObjectsV2 CommonPrefix like
 * "gallery-walls/{seg}/{wallId}/". Returns null if the prefix doesn't sit
 * directly under the user prefix.
 */
export function wallIdFromPrefix(commonPrefix: string, sub: string): string | null {
  const base = userPrefix(sub);
  if (!commonPrefix.startsWith(base)) return null;
  const rest = commonPrefix.slice(base.length).replace(/\/$/, '');
  return rest.length > 0 && !rest.includes('/') ? rest : null;
}
