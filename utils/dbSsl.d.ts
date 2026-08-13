import type { ConnectionOptions } from 'node:tls';

/**
 * Types for the shared database TLS helper. CommonJS because both the TS
 * config and the older config/database.js build a pool, and they must agree
 * about whether the server certificate gets verified.
 */
export type DbSslConfig = false | ConnectionOptions;

export declare function dbSslConfig(opts: {
  nodeEnv: string | undefined;
  caCert: string | undefined;
  rejectUnauthorized?: string | undefined;
}): DbSslConfig;

export declare function verifiesServer(config: DbSslConfig): boolean;

/**
 * True when the connection string points inside a private network, where
 * certificate verification is beside the point rather than unavailable.
 */
export declare function isPrivateConnection(connectionString: string | undefined): boolean;
