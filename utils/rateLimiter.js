const rateLimit = require("express-rate-limit");
const pThrottle = require("p-throttle");

// IP-based limiter for inbound requests to our NBA proxy routes
const nbaIpLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
});

// Throttle outbound calls to the NBA Stats API — max 1 request per second
const throttle = pThrottle({ limit: 1, interval: 1000 });
const throttledFetch = throttle((url, options) => fetch(url, options));

module.exports = { nbaIpLimiter, throttledFetch };
