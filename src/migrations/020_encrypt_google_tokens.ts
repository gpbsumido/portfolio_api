import type { Knex } from 'knex';

// The crypto lives in utils so the CommonJS layer and the TS modules share one
// implementation; migrations reach it the same way.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { encryptToken, decryptToken, isEncrypted, encryptionConfigured } =
  require('../../utils/tokenCrypto') as {
    encryptToken: (v: string) => string;
    decryptToken: (v: string) => string;
    isEncrypted: (v: string | null | undefined) => boolean;
    encryptionConfigured: () => boolean;
  };

type Row = { user_id: string; access_token: string | null; refresh_token: string | null };

/**
 * Encrypts the stored Google OAuth tokens in place.
 *
 * Runs inside a transaction, so a failure part-way leaves every row as it was
 * rather than half the table encrypted with no way to tell which half. Rows
 * already in the envelope format are skipped, which makes the migration safe to
 * re-run and safe to interleave with a deploy that has already started writing
 * encrypted values.
 *
 * The application reads through decryptToken, which passes plaintext through
 * untouched, so this migration can run before or after the code deploys.
 */
export async function up(knex: Knex): Promise<void> {
  if (!encryptionConfigured()) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be set before running this migration. ' +
        'Generate one with: openssl rand -hex 32',
    );
  }

  await knex.transaction(async (trx) => {
    const rows = await trx<Row>('google_auth').select(
      'user_id',
      'access_token',
      'refresh_token',
    );

    for (const row of rows) {
      const update: Partial<Row> = {};
      if (row.access_token && !isEncrypted(row.access_token)) {
        update.access_token = encryptToken(row.access_token);
      }
      if (row.refresh_token && !isEncrypted(row.refresh_token)) {
        update.refresh_token = encryptToken(row.refresh_token);
      }
      if (Object.keys(update).length > 0) {
        await trx('google_auth').where({ user_id: row.user_id }).update(update);
      }
    }
  });
}

/**
 * Decrypts back to plaintext, so a rollback leaves a database the previous
 * release can read. Needs the same key the up used.
 */
export async function down(knex: Knex): Promise<void> {
  if (!encryptionConfigured()) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY must be set to roll this back; without it the ' +
        'stored tokens cannot be recovered.',
    );
  }

  await knex.transaction(async (trx) => {
    const rows = await trx<Row>('google_auth').select(
      'user_id',
      'access_token',
      'refresh_token',
    );

    for (const row of rows) {
      const update: Partial<Row> = {};
      if (isEncrypted(row.access_token)) {
        update.access_token = decryptToken(row.access_token as string);
      }
      if (isEncrypted(row.refresh_token)) {
        update.refresh_token = decryptToken(row.refresh_token as string);
      }
      if (Object.keys(update).length > 0) {
        await trx('google_auth').where({ user_id: row.user_id }).update(update);
      }
    }
  });
}
