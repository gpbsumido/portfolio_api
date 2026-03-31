const express = require("express");
const { getCachedData, CACHE_TTL } = require("../utils/cache");

const router = express.Router();

/**
 * Returns the real client IP from common proxy headers, falling back to
 * the socket remote address. Railway and most cloud providers set
 * x-forwarded-for.
 *
 * @param {import("express").Request} req
 * @returns {string}
 */
function clientIp(req) {
  return (
    (req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() ||
    req.headers["x-real-ip"] ||
    req.socket?.remoteAddress ||
    "unknown"
  );
}

/**
 * GET /api/geo
 *
 * Looks up approximate lat/lon/city for the requesting IP via ip-api.com
 * (free tier, HTTP, no key required — does not block server IPs).
 * Results are cached per IP for 5 minutes.
 *
 * Response shape (normalised to match the frontend's expectations):
 *   { latitude, longitude, city, country }
 */
router.get("/", async (req, res, next) => {
  const ip = clientIp(req);

  try {
    const data = await getCachedData(
      `geo:${ip}`,
      async () => {
        // ip-api.com free tier is HTTP-only — fine for server-to-server.
        const target =
          ip === "unknown" || ip === "::1" || ip === "127.0.0.1"
            ? "http://ip-api.com/json/?fields=status,message,lat,lon,city,country,regionName"
            : `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,message,lat,lon,city,country,regionName`;

        const upstream = await fetch(target, {
          signal: AbortSignal.timeout(6_000),
          headers: { Accept: "application/json" },
        });

        if (!upstream.ok) {
          throw Object.assign(
            new Error(`ip-api.com responded with ${upstream.status}`),
            { status: 502 },
          );
        }

        const raw = await upstream.json();

        if (raw.status !== "success") {
          throw Object.assign(
            new Error(`ip-api.com lookup failed: ${raw.message ?? "unknown"}`),
            { status: 502 },
          );
        }

        // Normalise field names to match frontend expectations (latitude/longitude).
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

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
