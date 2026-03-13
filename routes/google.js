const crypto = require("crypto");
const express = require("express");
const db = require("../utils/db");
const { checkJwt } = require("../middleware/auth");
const { registerWatch, stopWatch } = require("../utils/googleCalendar");

const router = express.Router();

// origins that are allowed to initiate Google OAuth. the callback will redirect
// back to whichever origin started the flow, so prod, develop, and local dev
// all work from the same single API deployment.
const ALLOWED_ORIGINS = new Set([
  "https://paulsumido.com",
  "https://develop.paulsumido.com",
  "http://localhost:3000",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Signs a payload string with HMAC-SHA256 using GOOGLE_STATE_SECRET.
 * We use this to generate and verify the OAuth state param so we can trust
 * which user the callback belongs to without storing anything server-side.
 *
 * @param {string} payload
 * @returns {string} hex digest
 */
function signState(payload) {
  return crypto
    .createHmac("sha256", process.env.GOOGLE_STATE_SECRET)
    .update(payload)
    .digest("hex");
}

/**
 * Builds the state query param from a { userId, origin } pair.
 * Payload is base64url-encoded JSON so it survives URL round-trips cleanly.
 * Format: "<base64url(json)>.<hmac>"
 *
 * @param {string} userId
 * @param {string} origin  - one of ALLOWED_ORIGINS
 * @returns {string}
 */
function buildState(userId, origin) {
  const payload = Buffer.from(JSON.stringify({ userId, origin })).toString("base64url");
  const sig = signState(payload);
  return `${payload}.${sig}`;
}

/**
 * Verifies the state param from the callback. Returns { userId, origin } if
 * valid, null if tampered or malformed.
 *
 * @param {string} state
 * @returns {{ userId: string, origin: string }|null}
 */
function verifyState(state) {
  if (!state || !state.includes(".")) return null;
  const dotIdx = state.lastIndexOf(".");
  const payload = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  const expected = signState(payload);
  // constant-time compare to avoid timing attacks
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig, "hex"), Buffer.from(expected, "hex"))) {
      return null;
    }
  } catch {
    // buffers were different lengths, definitely invalid
    return null;
  }
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString());
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

/**
 * GET /api/google/auth/status
 *
 * Tells the frontend whether this user has connected their Google Calendar.
 * Quick check -- just a single row lookup, no Google API call.
 */
router.get("/auth/status", checkJwt, async (req, res) => {
  const userId = req.auth.payload.sub;
  try {
    const auth = await db.getGoogleAuth(userId);
    if (auth) {
      res.json({ connected: true, googleCalId: auth.google_cal_id });
    } else {
      res.json({ connected: false });
    }
  } catch (err) {
    console.error("[google] GET /auth/status failed:", err.message);
    res.status(500).json({ error: "Failed to check connection status" });
  }
});

/**
 * GET /api/google/auth/url
 *
 * Generates the Google OAuth authorization URL for this user. The frontend
 * redirects the user to this URL to kick off the connect flow.
 *
 * We sign the state param with an HMAC so the callback can verify it wasn't
 * tampered with. prompt=consent is required to always get a refresh_token back,
 * even if the user has connected before.
 */
router.get("/auth/url", checkJwt, async (req, res) => {
  const userId = req.auth.payload.sub;
  const origin = req.query.origin;

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    return res.status(400).json({ error: "Missing or invalid origin" });
  }

  try {
    const state = buildState(userId, origin);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params}` });
  } catch (err) {
    console.error("[google] GET /auth/url failed:", err.message);
    res.status(500).json({ error: "Failed to generate authorization URL" });
  }
});

/**
 * GET /api/google/auth/callback
 *
 * Google redirects here after the user approves (or denies) the OAuth prompt.
 * This route is not protected by checkJwt -- the browser arrives here without
 * our token. We use the signed state param to figure out which user this is for.
 *
 * On success we save the tokens and register a watch channel, then bounce the
 * browser back to the settings page with a ?gcal=connected flag so the UI can
 * show a success message.
 */
router.get("/auth/callback", async (req, res) => {
  const { code, state, error } = req.query;

  const parsed = verifyState(state);
  // fall back to FRONTEND_URL if state is missing/invalid (e.g. very old flows)
  const origin = parsed?.origin ?? process.env.FRONTEND_URL;

  // user clicked "deny" on the Google consent screen
  if (error) {
    console.warn("[google] OAuth denied by user:", error);
    return res.redirect(`${origin}/protected/settings?gcal=denied`);
  }

  if (!parsed) {
    console.warn("[google] Invalid state param in callback");
    return res.status(400).json({ error: "Invalid state parameter" });
  }

  const { userId } = parsed;

  try {
    // exchange the authorization code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID,
        client_secret: process.env.GOOGLE_CLIENT_SECRET,
        redirect_uri: process.env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
      }).toString(),
    });

    if (!tokenRes.ok) {
      const body = await tokenRes.text();
      console.error("[google] Token exchange failed:", body);
      return res.redirect(`${origin}/protected/settings?gcal=error`);
    }

    const { access_token, refresh_token, expires_in } = await tokenRes.json();
    const tokenExpiry = new Date(Date.now() + expires_in * 1000);

    await db.upsertGoogleAuth(userId, {
      accessToken: access_token,
      refreshToken: refresh_token,
      tokenExpiry,
    });

    // register the watch channel so Google can ping us when events change.
    // non-fatal if it fails here -- user is still connected, they just won't
    // get inbound sync until the next renewal cycle picks them up.
    try {
      await registerWatch(userId);
    } catch (watchErr) {
      console.error("[google] registerWatch failed after connect:", watchErr.message);
    }

    res.redirect(`${origin}/protected/settings?gcal=connected`);
  } catch (err) {
    console.error("[google] Callback error:", err.message);
    res.redirect(`${origin}/protected/settings?gcal=error`);
  }
});

/**
 * DELETE /api/google/auth/disconnect
 *
 * Stops the watch channel and removes the user's tokens. After this their
 * events will no longer sync with Google Calendar.
 */
router.delete("/auth/disconnect", checkJwt, async (req, res) => {
  const userId = req.auth.payload.sub;
  try {
    // stop the watch channel first so Google stops pinging us.
    // non-fatal if it fails (channel may have already expired).
    try {
      await stopWatch(userId);
    } catch (watchErr) {
      console.warn("[google] stopWatch failed on disconnect:", watchErr.message);
    }

    await db.deleteGoogleAuth(userId);
    res.sendStatus(204);
  } catch (err) {
    console.error("[google] DELETE /auth/disconnect failed:", err.message);
    res.status(500).json({ error: "Failed to disconnect Google Calendar" });
  }
});

module.exports = router;
