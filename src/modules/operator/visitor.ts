// ---------------------------------------------------------------------------
// Operator module — who is asking
//
// Three layers answer three different questions, and it helps to keep them
// apart rather than think of them as "more auth":
//
//   the service token    can this caller write at all?      security boundary
//   the visitor id       which visitor is this?             fairness, not security
//   optionalCheckJwt     who is this, really?               identity, when offered
//
// The visitor id is minted by paul-explore's BFF as a cookie and forwarded
// here. It is self-asserted: someone could clear the cookie and come back as a
// stranger. That sounds fatal until you notice the service token already
// decides who can reach these endpoints at all, so this does not need to resist
// an attacker. It needs to tell honest visitors apart, which is exactly what a
// fairness limit requires and precisely what the old IP-keyed limiter could not
// do, because every request arrives from the same handful of BFF egress IPs.
//
// What it cannot do is attribute an action to a person. Two restocks sharing a
// visitor id came from the same browser; nothing here knows who was holding the
// phone. You cannot have both "no login" and trustworthy attribution for the
// same action -- that is definitional, not a gap to engineer around. So a
// signed-in caller wins when there is one, and everyone else is labelled
// honestly as an anonymous session rather than dressed up as a named operator.
// ---------------------------------------------------------------------------

import { ipKeyGenerator } from 'express-rate-limit';
import type { Request } from 'express';

export const VISITOR_HEADER = 'x-operator-visitor';

/** Actor recorded when we have nothing better: no token, no cookie. */
export const UNKNOWN_ACTOR = 'unidentified caller';

type MaybeAuthed = Request & {
  auth?: { payload?: { sub?: string } };
};

/** The forwarded visitor id, if the BFF sent one that looks like one. */
export function visitorIdOf(req: Request): string | null {
  const raw = req.get(VISITOR_HEADER);
  if (!raw) return null;

  // Opaque to us, but bounded so a caller cannot stuff the audit trail or the
  // limiter's key space with something enormous.
  const trimmed = raw.trim();
  if (trimmed.length === 0 || trimmed.length > 64) return null;
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) return null;
  return trimmed;
}

/**
 * The key a fairness limit should count against.
 *
 * Visitor first, then a signed-in subject, then the IP. The IP is last because
 * it is the least useful here: it is the BFF's, not the visitor's.
 */
export function rateLimitKeyOf(req: Request): string {
  const sub = (req as MaybeAuthed).auth?.payload?.sub;
  const identified = visitorIdOf(req) ?? sub;
  if (identified) return identified;

  // Last resort, and the only branch where the key is an address. It goes
  // through ipKeyGenerator because an IPv6 user is typically handed a whole /64
  // -- keying on the full address would let one person mint effectively
  // unlimited buckets just by varying the low bits, which is the bypass this
  // limiter exists to prevent. v4 addresses pass through unchanged.
  return req.ip ? ipKeyGenerator(req.ip) : 'unknown';
}

/**
 * Who to record as having done something.
 *
 * A real identity beats a pseudonymous one, and both beat a constant. The
 * anonymous form is deliberately prefixed so nobody reads it as a username.
 */
export function actorOf(req: Request): string {
  const sub = (req as MaybeAuthed).auth?.payload?.sub;
  if (sub) return sub;

  const visitor = visitorIdOf(req);
  if (visitor) return `anonymous:${visitor}`;

  return UNKNOWN_ACTOR;
}
