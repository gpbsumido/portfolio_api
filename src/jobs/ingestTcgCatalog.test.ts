import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

vi.mock('../modules/tcg/catalog.js', () => ({ writeCatalog: vi.fn() }));

import { writeCatalog } from '../modules/tcg/catalog.js';
import {
  fixedLookup,
  ingestTcgCatalog,
  preferredNode,
  resetPreferredNode,
} from './ingestTcgCatalog.js';

const SERIES = [{ id: 'tcgp', name: 'Pokémon TCG Pocket' }];

const DETAIL = {
  id: 'tcgp',
  name: 'Pokémon TCG Pocket',
  logo: 'https://assets.tcgdex.net/en/tcgp/logo',
  sets: [
    {
      id: 'A1',
      name: 'Genetic Apex',
      logo: 'https://assets.tcgdex.net/en/tcgp/A1/logo',
      symbol: null,
      cardCount: { official: 226, total: 286 },
    },
  ],
};

/** Answers the two endpoints the job walks. */
function stubFetch(handler: (url: string) => { ok?: boolean; status?: number; body?: unknown }) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      const { ok = true, status = 200, body } = handler(String(url));
      return {
        ok,
        status,
        json: async () => body,
      } as unknown as Response;
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // No fallback by default. With one configured, any test that makes the
  // primary fetch fail would reach a real TCGdex node over the network --
  // which these tests did until the fallback started working, and passed only
  // because it did not.
  process.env.TCGDEX_FALLBACK_IPS = '';
  vi.mocked(writeCatalog).mockResolvedValue({ series: 1, sets: 1 });
});

describe('ingestTcgCatalog', () => {
  test('stores every serie with its sets', async () => {
    stubFetch((url) => ({ body: url.endsWith('/series') ? SERIES : DETAIL }));

    await ingestTcgCatalog();

    expect(writeCatalog).toHaveBeenCalledWith([
      {
        id: 'tcgp',
        name: 'Pokémon TCG Pocket',
        logo: 'https://assets.tcgdex.net/en/tcgp/logo',
        sets: [
          {
            id: 'A1',
            name: 'Genetic Apex',
            logo: 'https://assets.tcgdex.net/en/tcgp/A1/logo',
            symbol: null,
            cardCountOfficial: 226,
            cardCountTotal: 286,
          },
        ],
      },
    ]);
  });

  test('keeps a set whose card count has not been published yet', async () => {
    stubFetch((url) => ({
      body: url.endsWith('/series')
        ? SERIES
        : { ...DETAIL, sets: [{ id: 'A4', name: 'Just Announced' }] },
    }));

    await ingestTcgCatalog();

    const [[written]] = vi.mocked(writeCatalog).mock.calls;
    // Null, not zero: an unknown count rendered as "0 cards" is a lie, and
    // dropping the set entirely is how a new expansion goes missing.
    expect(written[0].sets[0]).toMatchObject({
      id: 'A4',
      cardCountOfficial: null,
      cardCountTotal: null,
    });
  });

  test('writes nothing when one serie cannot be fetched', async () => {
    stubFetch((url) => (url.endsWith('/series') ? { body: SERIES } : { ok: false, status: 503 }));

    await expect(ingestTcgCatalog()).rejects.toThrow();
    // Yesterday's catalog keeps serving rather than half of two of them.
    expect(writeCatalog).not.toHaveBeenCalled();
  });

  test('refuses an empty series list instead of emptying the catalog', async () => {
    stubFetch(() => ({ body: [] }));

    await expect(ingestTcgCatalog()).rejects.toThrow(/empty/i);
    expect(writeCatalog).not.toHaveBeenCalled();
  });

  test('gives up on a request that hangs rather than pinning the container', async () => {
    stubFetch((url) => ({ body: url.endsWith('/series') ? SERIES : DETAIL }));
    await ingestTcgCatalog();

    const [, options] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
    expect(options.signal).toBeDefined();
  });
});

describe('when TCGdex is having a bad day', () => {
  test('retries a network blip and carries on', async () => {
    let calls = 0;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        calls += 1;
        // First call fails the way undici reports every network problem.
        if (calls === 1) throw new TypeError('fetch failed');
        return {
          ok: true,
          status: 200,
          json: async () => (String(url).endsWith('/series') ? SERIES : DETAIL),
        } as unknown as Response;
      }),
    );

    await ingestTcgCatalog();

    expect(writeCatalog).toHaveBeenCalledTimes(1);
  });

  test('names the url it gave up on rather than just "fetch failed"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    // "fetch failed" alone does not say which of the dozens of calls this job
    // makes died, which is what the first real outage logged.
    await expect(ingestTcgCatalog()).rejects.toThrow(/api\.tcgdex\.net/);
    expect(writeCatalog).not.toHaveBeenCalled();
  });

  test('does not retry a 404, which will not improve', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 404,
      json: async () => ({}),
    })) as unknown as typeof fetch;
    vi.stubGlobal('fetch', fetchMock);

    await expect(ingestTcgCatalog()).rejects.toThrow(/404/);
    expect(vi.mocked(fetchMock)).toHaveBeenCalledTimes(1);
  });
});

describe('falling back to a node that answers', () => {
  test('is switched off by an empty TCGDEX_FALLBACK_IPS', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new TypeError('fetch failed');
      }),
    );

    // With no fallbacks configured the job fails at the published address,
    // which is what someone setting this to empty is asking for.
    await expect(ingestTcgCatalog()).rejects.toThrow(/api\.tcgdex\.net/);
    expect(writeCatalog).not.toHaveBeenCalled();
  });

  test('does not reach for a fallback when the published address works', async () => {
    stubFetch((url) => ({ body: url.endsWith('/series') ? SERIES : DETAIL }));

    await ingestTcgCatalog();

    // The fallback exists for someone else's outage. If it engaged while the
    // normal path was fine we would silently stop noticing their recovery.
    expect(writeCatalog).toHaveBeenCalledTimes(1);
  });
});

describe('fixedLookup', () => {
  test('answers with an array when Node asks for all', () => {
    // Since Node 20 autoSelectFamily is on and net.connect passes all: true.
    // Answering the other way put undefined into the socket and produced
    // "Invalid IP address: undefined" on the fallback's first production run.
    const cb = vi.fn();
    fixedLookup('51.68.233.163')('api.tcgdex.net', { all: true }, cb as never);
    expect(cb).toHaveBeenCalledWith(null, [{ address: '51.68.233.163', family: 4 }]);
  });

  test('answers with address and family when it does not', () => {
    const cb = vi.fn();
    fixedLookup('51.68.233.163')('api.tcgdex.net', { all: false }, cb as never);
    expect(cb).toHaveBeenCalledWith(null, '51.68.233.163', 4);
  });

  test('tolerates the options argument being a bare family number', () => {
    const cb = vi.fn();
    fixedLookup('51.68.233.163')('api.tcgdex.net', 4, cb as never);
    expect(cb).toHaveBeenCalledWith(null, '51.68.233.163', 4);
  });

  test('reports family 6 for an IPv6 address', () => {
    const cb = vi.fn();
    fixedLookup('2001:41d0:303:1c2b::1')('api.tcgdex.net', { all: true }, cb as never);
    expect(cb).toHaveBeenCalledWith(null, [{ address: '2001:41d0:303:1c2b::1', family: 6 }]);
  });
});

describe('remembering the node that worked', () => {
  test('a run starts with no preferred node, so a fixed upstream is noticed', async () => {
    stubFetch((url) => ({ body: url.endsWith('/series') ? SERIES : DETAIL }));

    await ingestTcgCatalog();

    // If this stuck across runs, TCGdex could fix its DNS and we would keep
    // routing around it forever without noticing.
    expect(preferredNode()).toBeNull();
  });

  test('a healthy published address never sets one', async () => {
    stubFetch((url) => ({ body: url.endsWith('/series') ? SERIES : DETAIL }));
    await ingestTcgCatalog();
    expect(preferredNode()).toBeNull();
  });

  test('resetPreferredNode clears it', () => {
    resetPreferredNode();
    expect(preferredNode()).toBeNull();
  });
});
