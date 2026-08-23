// ---------------------------------------------------------------------------
// Fantasy TCG economy — DTOs
// ---------------------------------------------------------------------------

export interface WalletDto {
  balance: number;
  /** UTC date of the last daily claim, or null if never claimed. */
  lastClaimDate: string | null;
}

export interface ClaimResult {
  balance: number;
  /** False when the daily grant was already claimed today. */
  claimed: boolean;
}

export interface OpenPackResult {
  balance: number;
  /** How many cards were added to the collection. */
  added: number;
  /** What the pack cost. */
  cost: number;
}

export interface CollectionCard {
  id: string;
  cardId: string;
  sport: string;
  playerId: number;
  playerName: string;
  points: number;
  rarity: string;
  periodId: string;
  title: string;
  subtitle: string;
  imageUrl: string;
  opponent: string | null;
  home: boolean | null;
  pulledAt: string;
}
