const db = require("./db");

/**
 * Returns a valid access token and the user-level Google Calendar ID stored in
 * google_auth. Refreshes the token if it expires within the next 5 minutes.
 * Throws if the user hasn't connected their Google Calendar or if the refresh
 * request fails.
 *
 * The returned calId is the legacy user-level calendar (google_auth.google_cal_id,
 * defaults to "primary"). Per-calendar calIds for two_way calendars come from the
 * calendars table -- callers that have those IDs should pass them in directly and
 * only use this function for the token.
 *
 * @param {string} userId - Auth0 sub
 * @returns {Promise<{ token: string, calId: string }>}
 */
async function getTokenAndCalId(userId) {
  const auth = await db.getGoogleAuth(userId);
  if (!auth) throw new Error("Google Calendar not connected");

  const expiresAt = new Date(auth.token_expiry);
  const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

  // still good for at least 5 minutes, use it as-is
  if (expiresAt > fiveMinFromNow) {
    return { token: auth.access_token, calId: auth.google_cal_id };
  }

  // access token is stale, use the refresh token to get a new one
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID,
    client_secret: process.env.GOOGLE_CLIENT_SECRET,
    refresh_token: auth.refresh_token,
    grant_type: "refresh_token",
  });

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Token refresh failed: ${body}`);
  }

  const { access_token, expires_in } = await res.json();
  const newExpiry = new Date(Date.now() + expires_in * 1000);

  await db.upsertGoogleAuth(userId, {
    accessToken: access_token,
    refreshToken: auth.refresh_token,
    tokenExpiry: newExpiry,
  });

  return { token: access_token, calId: auth.google_cal_id };
}

/**
 * Convenience wrapper for callers that only need the token and not the calId.
 *
 * @param {string} userId - Auth0 sub
 * @returns {Promise<string>} a non-expired access token
 */
async function getValidAccessToken(userId) {
  const { token } = await getTokenAndCalId(userId);
  return token;
}

module.exports = { getTokenAndCalId, getValidAccessToken };
