/**
 * TLS settings for the Postgres connection.
 *
 * `rejectUnauthorized: false` negotiates TLS and then never checks who it is
 * talking to, which stops a passive eavesdropper and does nothing at all
 * against an active one. That matters here because DATABASE_URL points at a
 * publicly reachable proxy host rather than a private network, so the path is
 * the open internet.
 *
 * The blocker on fixing it properly is that verification needs the provider's
 * root certificate, which isn't in the repo. So: verify whenever a CA is
 * configured, and keep the previous behaviour when it isn't, with a warning in
 * production so an unverified connection is visible rather than assumed.
 *
 * Set DB_CA_CERT to the PEM contents (Railway and friends give you the file;
 * paste it in as a single value with real newlines or \n escapes).
 */
function dbSslConfig(opts) {
  const ca = opts.caCert?.trim();

  if (ca) {
    return {
      // \n escapes survive most secret stores better than literal newlines.
      ca: ca.replace(/\\n/g, '\n'),
      rejectUnauthorized: true,
    };
  }

  // An explicit opt-in for a provider whose chain is already in the system
  // trust store, where no CA needs supplying.
  if (opts.rejectUnauthorized === 'true') {
    return { rejectUnauthorized: true };
  }

  if (opts.nodeEnv === 'production') {
    return { rejectUnauthorized: false };
  }

  return false;
}

/** Whether the resulting config actually verifies the server. */
function verifiesServer(config) {
  return config !== false && config.rejectUnauthorized === true;
}

module.exports = { dbSslConfig, verifiesServer };
