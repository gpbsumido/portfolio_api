// ---------------------------------------------------------------------------
// Referrals module — shared TypeScript types
// ---------------------------------------------------------------------------

/** A referral as returned to clients, with the resolved share URL and count. */
export interface ReferralDto {
  slug: string;
  targetPath: string;
  label: string | null;
  url: string;
  clicks: number;
  createdAt: string;
}

export interface ReferralStats {
  slug: string;
  targetPath: string;
  clicks: number;
  recent: { at: string }[];
}
