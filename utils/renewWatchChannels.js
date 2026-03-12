require("dotenv").config();

const { pool } = require("../config/database");
const { registerWatch, stopWatch } = require("./googleCalendar");

/**
 * Finds all connected users whose watch channel expires within the next 24 hours
 * and renews them. Runs as a Railway cron job daily at 6am UTC so channels never
 * lapse -- Google stops sending webhooks as soon as a channel expires.
 *
 * Each user is renewed independently so one failure doesn't block the rest.
 */
async function renewExpiringChannels() {
  console.log("[renewWatchChannels] starting");
  const { rows } = await pool.query({ text: `
    SELECT user_id
    FROM google_auth
    WHERE channel_expiry < NOW() + INTERVAL '24 hours'
      AND channel_id IS NOT NULL
  `, query_timeout: 10_000 });

  if (rows.length === 0) {
    console.log("[renewWatchChannels] nothing to renew");
    return;
  }

  console.log(`[renewWatchChannels] renewing ${rows.length} channel(s)`);

  for (const { user_id } of rows) {
    try {
      // stop first so Google doesn't end up with two active channels for the same calendar
      await stopWatch(user_id);
      await registerWatch(user_id);
      console.log(`[renewWatchChannels] renewed channel for ${user_id}`);
    } catch (err) {
      // log and keep going, one bad token shouldn't block everyone else
      console.error(`[renewWatchChannels] failed for ${user_id}:`, err.message);
    }
  }

  console.log("[renewWatchChannels] done");
}

module.exports = { renewExpiringChannels };

// run directly: node utils/renewWatchChannels.js
// set up as a Railway cron job: command = node utils/renewWatchChannels.js, schedule = 0 6 * * *
if (require.main === module) {
  renewExpiringChannels()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("renewal job failed:", err.message);
      process.exit(1);
    });
}
