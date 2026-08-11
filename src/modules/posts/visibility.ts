import * as repo from './repository.js';

/**
 * Whether `viewerSub` may see content authored by `authorSub`.
 *
 * Public profiles are visible to anyone; a private one only to its owner and
 * accepted followers. This lives on its own because more than one module needs
 * it -- a reply thread is exactly as private as the post it hangs off, and a
 * second copy of the rule is a second place for it to drift.
 */
export async function canViewAuthor(
  authorSub: string,
  viewerSub: string | null,
): Promise<boolean> {
  if (viewerSub === authorSub) return true;

  const profile = await repo.getProfileVisibilityBySub(authorSub);
  if (!profile) return false;
  if (profile.is_public) return true;
  if (!viewerSub) return false;

  return repo.isAcceptedFollower(viewerSub, authorSub);
}

/**
 * Whether `viewerSub` may see a given post, resolved from the post id.
 *
 * Returns false for a post that doesn't exist, so callers can answer 404
 * without a second lookup and without distinguishing "private" from "gone".
 */
export async function canViewPost(
  postId: string,
  viewerSub: string | null,
): Promise<boolean> {
  const post = await repo.getPostById(postId);
  if (!post) return false;
  return canViewAuthor(post.sub, viewerSub);
}
