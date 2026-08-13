/**
 * TLS settings for the Postgres connection.
 *
 * `rejectUnauthorized: false` negotiates TLS and then never checks who it is
 * talking to, which stops a passive eavesdropper and does nothing at all
 * against an active one.
 *
 * That used to matter a great deal, because DATABASE_URL pointed at a publicly
 * reachable proxy and the path was the open internet. It now points inside
 * Railway's private network, which is a WireGuard tunnel between services in
 * one project, so there is no public path to sit on. Verification there is not
 * unavailable, it is beside the point — see isPrivateConnection below, which is
 * what stops the warning firing about a risk that no longer exists.
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

/**
 * Is this connection string pointing inside the private network?
 *
 * Railway's private network is a WireGuard tunnel between services in the same
 * project, so traffic on it is already encrypted and there is no public path to
 * eavesdrop on. Certificate verification is not "unavailable" there, it is
 * beside the point — which matters because the warning below was written when
 * DATABASE_URL pointed at a public proxy, and its premise stopped being true
 * the moment that changed.
 *
 * Localhost counts for the same reason: a compose database on the same machine
 * has no network to intercept.
 */
function isPrivateConnection(connectionString) {
  if (!connectionString) return false;
  return /@([^/:]*\.railway\.internal|localhost|127\.0\.0\.1|\[::1\]|db)(:|\/|$)/.test(
    connectionString,
  );
}

module.exports.isPrivateConnection = isPrivateConnection;
