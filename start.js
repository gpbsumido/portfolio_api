if (process.env.RUN_CRON === "true") {
  // Which cron job to run. Defaults to the calendar watch-channel renewal so
  // the existing Railway cron keeps working unchanged.
  const job = process.env.CRON_JOB || "renew-watch-channels";

  const jobs = {
    // Renew Google calendar watch channels before they expire (daily 6am UTC).
    "renew-watch-channels": () =>
      require("./utils/renewWatchChannels").renewExpiringChannels(),
    // Restore the feature-flags demo to its canonical seed (every 6h, 0 */6 * * *).
    "reset-feature-flags": () =>
      require("./dist/jobs/resetFeatureFlags").resetFeatureFlags(),
    // Re-seed the operator demo so its time-relative views stay fresh (daily, 0 4 * * *).
    "reseed-operator": () =>
      require("./dist/jobs/reseedOperator").reseedOperator(),
  };

  const run = jobs[job];
  if (!run) {
    console.error(`unknown CRON_JOB: ${job}`);
    process.exit(1);
  }

  run()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(`cron job "${job}" failed:`, err.message);
      process.exit(1);
    });
} else {
  require("./dist/index");
}
