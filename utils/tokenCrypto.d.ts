/**
 * Types for the shared token-encryption helper.
 *
 * The implementation is CommonJS because both the TypeScript modules and the
 * older utils/*.js layer handle these tokens, and a crypto routine is the last
 * thing worth having two copies of.
 */
export declare class MissingEncryptionKeyError extends Error {}

export declare function isEncrypted(value: string | null | undefined): boolean;
export declare function encryptionConfigured(): boolean;
export declare function encryptToken(plaintext: string): string;
export declare function decryptToken(stored: string): string;
export declare function encryptIfConfigured(plaintext: string): string;
