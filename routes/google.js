const crypto = require("crypto");
const express = require("express");
const db = require("../utils/db");
const { checkJwt } = require("../middleware/auth");
const { registerWatch, stopWatch } = require("../utils/googleCalendar");

const router = express.Router();

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
 * Builds the state query param: "<userId>.<hmac>". The userId is the part
 * before the dot, the hmac is everything after. We verify by re-signing
 * the userId and comparing.
 *
 * @param {string} userId
 * @returns {string}
 */
function buildState(userId) {
  const sig = signState(userId);
  return `${userId}.${sig}`;
}

/**
 * Verifies the state param from the callback. Returns the userId if valid,
 * null if tampered or malformed.
 *
 * @param {string} state
 * @returns {string|null}
 */
function verifyState(state) {
  if (!state || !state.includes(".")) return null;
  const dotIdx = state.lastIndexOf(".");
  const userId = state.slice(0, dotIdx);
  const sig = state.slice(dotIdx + 1);
  const expected = signState(userId);
  // constant-time compare to avoid timing attacks
  try {
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
  } catch {
    // buffers were different lengths, definitely invalid
    return null;
  }
  return userId;
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
  try {
    const state = buildState(userId);
    const params = new URLSearchParams({
      client_id: process.env.GOOGLE_CLIENT_ID,
      redirect_uri: process.env.GOOGLE_REDIRECT_URI,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/calendar.events",
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

  // user clicked "deny" on the Google consent screen
  if (error) {
    console.warn("[google] OAuth denied by user:", error);
    return res.redirect(
      `${process.env.FRONTEND_URL}/protected/settings?gcal=denied`,
    );
  }

  const userId = verifyState(state);
  if (!userId) {
    console.warn("[google] Invalid state param in callback");
    return res.status(400).json({ error: "Invalid state parameter" });
  }

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
      return res.redirect(
        `${process.env.FRONTEND_URL}/protected/settings?gcal=error`,
      );
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

    res.redirect(`${process.env.FRONTEND_URL}/protected/settings?gcal=connected`);
  } catch (err) {
    console.error("[google] Callback error:", err.message);
    res.redirect(`${process.env.FRONTEND_URL}/protected/settings?gcal=error`);
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
