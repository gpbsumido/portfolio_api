// The initial research batch (Aug 2026 training-camp/preseason). Every item is
// pending until approved in the extension. Sources are the trackers cited when
// this list was compiled; deltaPct is (percent change to the player's points),
// so -90 ≈ undraftable, +15 ≈ a meaningful bump. Ripple rows carry
// beneficiaryOf = the injured player whose vacated share they absorb.
import type { AdjustmentInput } from '../../src/modules/fantasy/adjustments.types.js';

const YAHOO = 'https://sports.yahoo.com/fantasy/article/nfl-training-camp-injury-report-tracking-the-latest-news-updates-for-2026-fantasy-football-163938278.html';
const SI_COACH = 'https://www.si.com/fantasy/implications-nfl-coaching-changes-2026';

export const SEED_ITEMS: AdjustmentInput[] = [
  // A. Season-ending + ripple beneficiaries
  { player: 'Ricky Pearsall', team: 'SF', position: 'WR', category: 'injury', note: 'PCL surgery — out for season', deltaPct: -90, confidence: 'high', sourceUrl: YAHOO },
  { player: 'Mike Evans', team: 'SF', position: 'WR', category: 'ripple', note: 'Absorbs vacated SF targets (Pearsall out)', deltaPct: 8, confidence: 'med', beneficiaryOf: 'Ricky Pearsall', sourceUrl: YAHOO },
  { player: 'Deebo Samuel', team: 'SF', position: 'WR', category: 'ripple', note: 'Signed into the vacated SF role', deltaPct: 10, confidence: 'med', beneficiaryOf: 'Ricky Pearsall', sourceUrl: YAHOO },
  { player: 'Jayden Higgins', team: 'HOU', position: 'WR', category: 'injury', note: 'Torn ACL — out for season', deltaPct: -90, confidence: 'high', sourceUrl: YAHOO },
  { player: 'Tank Dell', team: 'HOU', position: 'WR', category: 'ripple', note: 'Target share opens (Higgins out)', deltaPct: 12, confidence: 'med', beneficiaryOf: 'Jayden Higgins', sourceUrl: YAHOO },
  { player: 'Jaylin Noel', team: 'HOU', position: 'WR', category: 'ripple', note: 'Steps up in 3-WR sets (Higgins out)', deltaPct: 15, confidence: 'med', beneficiaryOf: 'Jayden Higgins', sourceUrl: YAHOO },

  // B. Camp injuries with Week-1 risk + handcuffs
  { player: 'Breece Hall', team: 'NYJ', position: 'RB', category: 'camp', note: 'Groin — 2-3 weeks', deltaPct: -15, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Braelon Allen', team: 'NYJ', position: 'RB', category: 'ripple', note: 'Early-season lead back (Hall out)', deltaPct: 20, confidence: 'med', beneficiaryOf: 'Breece Hall', sourceUrl: YAHOO },
  { player: 'Kyle Monangai', team: 'CHI', position: 'RB', category: 'camp', note: 'Hyperextended knee — doubtful, multiple weeks', deltaPct: -25, confidence: 'med', sourceUrl: YAHOO },
  { player: "D'Andre Swift", team: 'CHI', position: 'RB', category: 'ripple', note: 'Reclaims workload (Monangai out)', deltaPct: 10, confidence: 'med', beneficiaryOf: 'Kyle Monangai', sourceUrl: YAHOO },
  { player: 'Zach Charbonnet', team: 'SEA', position: 'RB', category: 'camp', note: 'Knee — on PUP', deltaPct: -20, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Jordyn Tyson', team: 'NO', position: 'WR', category: 'camp', note: 'Hamstring — may open on IR', deltaPct: -40, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Emeka Egbuka', team: 'TB', position: 'WR', category: 'camp', note: 'Toe — Week 1 uncertain', deltaPct: -12, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Luther Burden III', team: 'CHI', position: 'WR', category: 'camp', note: 'Groin — misses preseason', deltaPct: -8, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Tucker Kraft', team: 'GB', position: 'TE', category: 'camp', note: 'ACL recovery — snaps may be capped', deltaPct: -8, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Patrick Mahomes', team: 'KC', position: 'QB', category: 'camp', note: 'Knee — conflicting reports, verify; practicing', deltaPct: -6, confidence: 'low', sourceUrl: YAHOO },

  // C. Minor — expected ready
  { player: 'Tyler Warren', team: 'IND', position: 'TE', category: 'camp', note: 'Groin — expected ready', deltaPct: -3, confidence: 'med', sourceUrl: YAHOO },
  { player: "Ja'Marr Chase", team: 'CIN', position: 'WR', category: 'camp', note: 'Knee — day-to-day, minor', deltaPct: -2, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Puka Nacua', team: 'LAR', position: 'WR', category: 'camp', note: 'Groin — expected ready', deltaPct: -4, confidence: 'med', sourceUrl: YAHOO },
  { player: 'Malik Nabers', team: 'NYG', position: 'WR', category: 'camp', note: 'Knee — expected ready Week 1', deltaPct: -3, confidence: 'med', sourceUrl: YAHOO },
  { player: 'TreVeyon Henderson', team: 'NE', position: 'RB', category: 'camp', note: 'Ankle — likely ready', deltaPct: -5, confidence: 'med', sourceUrl: YAHOO },

  // D. Coaching / QB context (analytical — low confidence)
  { player: 'Bijan Robinson', team: 'ATL', position: 'RB', category: 'context', note: 'Stefanski OC — scheme historically lifts RB', deltaPct: 8, confidence: 'low', sourceUrl: SI_COACH },
  { player: 'Kyle Pitts', team: 'ATL', position: 'TE', category: 'context', note: 'Stefanski OC — TE flourish', deltaPct: 10, confidence: 'low', sourceUrl: SI_COACH },
  { player: 'Ashton Jeanty', team: 'LV', position: 'RB', category: 'context', note: 'Kubiak heavy personnel favors the back (offsets ankle)', deltaPct: 10, confidence: 'low', sourceUrl: SI_COACH },
  { player: 'Ashton Jeanty', team: 'LV', position: 'RB', category: 'camp', note: 'Ankle sprain — questionable', deltaPct: -12, confidence: 'med', sourceUrl: YAHOO },
];
