if (process.env.RUN_CRON === "true") {
  const { renewExpiringChannels } = require("./utils/renewWatchChannels");
  renewExpiringChannels()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("renewal job failed:", err.message);
      process.exit(1);
    });
} else {
  require("./server");
}
