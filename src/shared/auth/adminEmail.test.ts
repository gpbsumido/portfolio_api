import { describe, test, expect, afterEach } from 'vitest';
import { isAdminRequest, EMAIL_CLAIM_NS } from './adminEmail.js';

const original = process.env.ADMIN_ALLOWED_EMAILS;

afterEach(() => {
  if (original === undefined) delete process.env.ADMIN_ALLOWED_EMAILS;
  else process.env.ADMIN_ALLOWED_EMAILS = original;
});

const req = (payload: Record<string, unknown>) => ({ auth: { payload } }) as never;

const admin = {
  sub: 'auth0|owner',
  [`${EMAIL_CLAIM_NS}email`]: 'owner@example.com',
  [`${EMAIL_CLAIM_NS}email_verified`]: true,
};

describe('isAdminRequest', () => {
  test('admits a verified address on the list', () => {
    process.env.ADMIN_ALLOWED_EMAILS = 'owner@example.com';

    expect(isAdminRequest(req(admin))).toBe(true);
  });

  test('refuses an address that is not on the list', () => {
    process.env.ADMIN_ALLOWED_EMAILS = 'someone-else@example.com';

    expect(isAdminRequest(req(admin))).toBe(false);
  });

  test('refuses an allowlisted address that the provider has not verified', () => {
    // An unverified address can be typed in by anyone at signup, so trusting it
    // would make the allowlist decorative.
    process.env.ADMIN_ALLOWED_EMAILS = 'owner@example.com';

    expect(
      isAdminRequest(req({ ...admin, [`${EMAIL_CLAIM_NS}email_verified`]: false })),
    ).toBe(false);
  });

  test('an unset allowlist admits nobody, rather than everybody', () => {
    delete process.env.ADMIN_ALLOWED_EMAILS;

    expect(isAdminRequest(req(admin))).toBe(false);
  });

  test('an empty allowlist admits nobody', () => {
    process.env.ADMIN_ALLOWED_EMAILS = '   ';

    expect(isAdminRequest(req(admin))).toBe(false);
  });

  test('normalises case and padding on both sides', () => {
    process.env.ADMIN_ALLOWED_EMAILS = ' Owner@Example.COM , other@example.com ';

    expect(
      isAdminRequest(req({ ...admin, [`${EMAIL_CLAIM_NS}email`]: '  OWNER@example.com ' })),
    ).toBe(true);
  });

  test('refuses a request with no auth payload at all', () => {
    process.env.ADMIN_ALLOWED_EMAILS = 'owner@example.com';

    expect(isAdminRequest({} as never)).toBe(false);
  });

  test('ignores a bare email claim, which Auth0 does not guarantee', () => {
    process.env.ADMIN_ALLOWED_EMAILS = 'owner@example.com';

    expect(
      isAdminRequest(req({ sub: 'auth0|x', email: 'owner@example.com', email_verified: true })),
    ).toBe(false);
  });
});
