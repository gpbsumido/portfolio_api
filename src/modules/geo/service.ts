import type { GeoLocation, IpApiResponse } from './types.js';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { getCachedData, CACHE_TTL } = require('../../../utils/cache') as {
  getCachedData: <T>(key: string, fetchFn: () => Promise<T>, ttl?: number) => Promise<T>;
  CACHE_TTL: { SHORT: number; MEDIUM: number; LONG: number };
};

export class GeoService {
  async lookup(ip: string): Promise<GeoLocation> {
    return getCachedData<GeoLocation>(
      `geo:${ip}`,
      async () => {
        const target =
          ip === 'unknown' || ip === '::1' || ip === '127.0.0.1'
            ? 'http://ip-api.com/json/?fields=status,message,lat,lon,city,country,regionName'
            : `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,lat,lon,city,country,regionName`;

        const upstream = await fetch(target, {
          signal: AbortSignal.timeout(6_000),
          headers: { Accept: 'application/json' },
        });

        if (!upstream.ok) {
          throw Object.assign(
            new Error(`ip-api.com responded with ${upstream.status}`),
            { status: 502 },
          );
        }

        const raw: IpApiResponse = await upstream.json();

        if (raw.status !== 'success') {
          throw Object.assign(
            new Error(`ip-api.com lookup failed: ${raw.message ?? 'unknown'}`),
            { status: 502 },
          );
        }

        return {
          latitude: raw.lat,
          longitude: raw.lon,
          city: raw.city,
          country: raw.country,
          regionName: raw.regionName,
        };
      },
      CACHE_TTL.SHORT,
    );
  }
}
