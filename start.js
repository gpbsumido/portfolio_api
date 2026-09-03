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
    // Mirror the TCGdex series/sets catalog so the lists stop rendering from a
    // slow third party (daily, 0 5 * * *).
    "ingest-tcg-catalog": () =>
      require("./dist/jobs/ingestTcgCatalog").ingestTcgCatalog(),
    // Pull ZeroProof odds and snapshot them so the events feed serves from the
    // DB (default provider is fixtures — zero credits — until a key is set).
    "zeroproof-odds-sync": () =>
      require("./dist/jobs/zeroproofOddsSync").zeroproofOddsSync(),
    // Settle finished ZeroProof events: grade open bets, stamp CLV, pay the
    // ledger. Idempotent, so a re-run is safe.
    "zeroproof-settle": () =>
      require("./dist/jobs/zeroproofSettle").zeroproofSettle(),
    // ZeroProof wallet maintenance: bust empty challenge wallets, refund the
    // principal of matured wallets. Both sweeps are idempotent.
    "zeroproof-unlock": () =>
      require("./dist/jobs/zeroproofUnlock").zeroproofUnlock(),
    // Accrue a day's simulated yield on the held ZeroProof float.
    "zeroproof-yield": () =>
      require("./dist/jobs/zeroproofYield").zeroproofYield(),
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
