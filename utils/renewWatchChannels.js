require("dotenv").config();

const { pool } = require("../config/database");
const { registerWatch, stopWatchByCalId } = require("./googleCalendar");

/**
 * Finds all two_way calendars whose watch channel expires within the next 24 hours
 * and renews them. Runs as a Railway cron job daily at 6am UTC so channels never
 * lapse -- Google stops sending webhooks as soon as a channel expires.
 *
 * Each calendar is renewed independently so one failure doesn't block the rest.
 */
async function renewExpiringChannels() {
  console.log("[renewWatchChannels] starting");
  const { rows } = await pool.query({ text: `
    SELECT c.id, c.google_cal_id, c.user_sub
    FROM   calendars c
    WHERE  c.sync_mode = 'two_way'
      AND  c.google_cal_id IS NOT NULL
      AND  c.channel_expiry < NOW() + INTERVAL '24 hours'
  `, query_timeout: 10_000 });

  if (rows.length === 0) {
    console.log("[renewWatchChannels] nothing to renew");
    return;
  }

  console.log(`[renewWatchChannels] renewing ${rows.length} channel(s)`);

  for (const calendar of rows) {
    try {
      // stop first so Google doesn't end up with two active channels for the same calendar
      await stopWatchByCalId(calendar.user_sub, calendar.google_cal_id);
      await registerWatch(calendar.user_sub, calendar.google_cal_id);
      console.log(`[renewWatchChannels] renewed channel for ${calendar.user_sub} calId=${calendar.google_cal_id}`);
    } catch (err) {
      // log and keep going, one bad calendar shouldn't block the rest
      console.error(`[renewWatchChannels] failed for ${calendar.user_sub} calId=${calendar.google_cal_id}:`, err.message);
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
