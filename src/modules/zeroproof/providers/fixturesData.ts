// ---------------------------------------------------------------------------
// A captured slate the fixtures provider replays — MLB, EPL, NFL.
// ---------------------------------------------------------------------------
//
// Hand-kept sample lines so dev/test/seed render a real-looking lobby and settle
// a full slate without spending a single vendor credit. Times are far enough
// out that they read as "upcoming" for a while; refresh as needed.

import type { NormalizedEvent } from './types.js';

export const FIXTURE_SLATE: NormalizedEvent[] = [
  {
    providerKey: 'fx-mlb-nyy-bos',
    sport: 'baseball_mlb',
    home: 'Boston Red Sox',
    away: 'New York Yankees',
    commenceTime: new Date('2026-09-03T23:05:00Z'),
    markets: [
      { market: 'h2h', outcomes: [{ name: 'New York Yankees', priceAmerican: -145 }, { name: 'Boston Red Sox', priceAmerican: 122 }] },
      { market: 'spread', outcomes: [{ name: 'New York Yankees', priceAmerican: -110, point: -1.5 }, { name: 'Boston Red Sox', priceAmerican: -110, point: 1.5 }] },
      { market: 'total', outcomes: [{ name: 'Over', priceAmerican: -105, point: 8.5 }, { name: 'Under', priceAmerican: -115, point: 8.5 }] },
    ],
  },
  {
    providerKey: 'fx-mlb-lad-sd',
    sport: 'baseball_mlb',
    home: 'San Diego Padres',
    away: 'Los Angeles Dodgers',
    commenceTime: new Date('2026-09-04T01:40:00Z'),
    markets: [
      { market: 'h2h', outcomes: [{ name: 'Los Angeles Dodgers', priceAmerican: -160 }, { name: 'San Diego Padres', priceAmerican: 135 }] },
      { market: 'total', outcomes: [{ name: 'Over', priceAmerican: -110, point: 7.5 }, { name: 'Under', priceAmerican: -110, point: 7.5 }] },
    ],
  },
  {
    providerKey: 'fx-epl-ars-che',
    sport: 'soccer_epl',
    home: 'Arsenal',
    away: 'Chelsea',
    commenceTime: new Date('2026-09-05T14:00:00Z'),
    markets: [
      { market: 'h2h', outcomes: [{ name: 'Arsenal', priceAmerican: 125 }, { name: 'Chelsea', priceAmerican: 240 }, { name: 'Draw', priceAmerican: 230 }] },
      { market: 'total', outcomes: [{ name: 'Over', priceAmerican: -120, point: 2.5 }, { name: 'Under', priceAmerican: 100, point: 2.5 }] },
    ],
  },
  {
    providerKey: 'fx-nfl-kc-buf',
    sport: 'americanfootball_nfl',
    home: 'Buffalo Bills',
    away: 'Kansas City Chiefs',
    commenceTime: new Date('2026-09-06T20:25:00Z'),
    markets: [
      { market: 'h2h', outcomes: [{ name: 'Kansas City Chiefs', priceAmerican: 105 }, { name: 'Buffalo Bills', priceAmerican: -125 }] },
      { market: 'spread', outcomes: [{ name: 'Kansas City Chiefs', priceAmerican: -110, point: 2.5 }, { name: 'Buffalo Bills', priceAmerican: -110, point: -2.5 }] },
      { market: 'total', outcomes: [{ name: 'Over', priceAmerican: -110, point: 48.5 }, { name: 'Under', priceAmerican: -110, point: 48.5 }] },
    ],
  },
];
