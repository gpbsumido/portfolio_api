/**
 * Points awarded for a correct series winner, by round.
 * Round is derived from the matchup ID string.
 */
const ROUND_POINTS = {
  r1: 1,
  r2: 2,
  cf: 4,
  finals: 8,
};

const MAX_POSSIBLE = 52;

/**
 * Derive the round key from a matchup ID.
 * Patterns: E_R1_M1..4, W_R1_M1..4 → r1
 *           E_R2_M1/2, W_R2_M1/2   → r2
 *           E_CF, W_CF              → cf
 *           NBA_FINALS              → finals
 *
 * @param {string} matchupId
 * @returns {'r1' | 'r2' | 'cf' | 'finals' | null}
 */
function getRound(matchupId) {
  if (matchupId === 'NBA_FINALS') return 'finals';
  if (matchupId.endsWith('_CF')) return 'cf';
  if (matchupId.includes('_R2_')) return 'r2';
  if (matchupId.includes('_R1_')) return 'r1';
  return null;
}

/**
 * Score a user's bracket picks against the official results.
 *
 * @param {Record<string, { winner: string; seriesScore: string; mvp?: string; lastGameCombinedScore?: number | null }>} picks
 * @param {Record<string, { winner: string; seriesScore: string; mvp?: string; lastGameCombinedScore?: number | null }>} official
 * @returns {{ total: number, breakdown: { r1: number, r2: number, cf: number, finals: number, bonuses: number, mvp: number, combinedScoreDiff: number | null } }}
 */
function scoreBracket(picks, official) {
  const breakdown = { r1: 0, r2: 0, cf: 0, finals: 0, bonuses: 0, mvp: 0, combinedScoreDiff: null };

  for (const matchupId of Object.keys(official)) {
    const officialPick = official[matchupId];
    const userPick = picks[matchupId];

    if (!officialPick?.winner || !userPick?.winner) continue;

    const round = getRound(matchupId);
    if (!round) continue;

    const winnerCorrect = userPick.winner === officialPick.winner;

    if (winnerCorrect) {
      breakdown[round] += ROUND_POINTS[round];
    }

    if (officialPick.seriesScore && userPick.seriesScore === officialPick.seriesScore) {
      breakdown.bonuses += 1;
    }

    if (round === 'finals') {
      if (officialPick.mvp && userPick.mvp && userPick.mvp.trim().toLowerCase() === officialPick.mvp.trim().toLowerCase()) {
        breakdown.mvp += 5;
      }

      if (officialPick.lastGameCombinedScore != null && userPick.lastGameCombinedScore != null) {
        breakdown.combinedScoreDiff = Math.abs(userPick.lastGameCombinedScore - officialPick.lastGameCombinedScore);
      }
    }
  }

  const total = breakdown.r1 + breakdown.r2 + breakdown.cf + breakdown.finals + breakdown.bonuses + breakdown.mvp;

  return { total, breakdown };
}

module.exports = { scoreBracket, getRound, ROUND_POINTS, MAX_POSSIBLE };
