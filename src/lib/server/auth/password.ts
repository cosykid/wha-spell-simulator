/**
 * @file Password hashing with Node's built-in scrypt, so no native dependency is
 * needed on the serverless runtime. Stored hashes are self-describing
 * (`scrypt$N$r$p$salt$hash` with base64url parts) so cost parameters can change
 * later without invalidating existing accounts.
 */
import {
	randomBytes,
	scrypt as scryptCallback,
	timingSafeEqual,
	type BinaryLike,
	type ScryptOptions
} from 'node:crypto';
import { promisify } from 'node:util';

// promisify collapses the overloads to the option-less form, so retype it.
const scrypt = promisify(scryptCallback) as (
	password: BinaryLike,
	salt: BinaryLike,
	keylen: number,
	options: ScryptOptions
) => Promise<Buffer>;

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function deriveKey(
	password: string,
	salt: Buffer,
	n: number,
	r: number,
	p: number
): Promise<Buffer> {
	// maxmem must cover 128 * N * r bytes, doubled for headroom.
	return scrypt(password, salt, KEY_LENGTH, { N: n, r, p, maxmem: 256 * n * r });
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(SALT_LENGTH);
	const key = await deriveKey(password, salt, SCRYPT_N, SCRYPT_R, SCRYPT_P);
	return [
		'scrypt',
		SCRYPT_N,
		SCRYPT_R,
		SCRYPT_P,
		salt.toString('base64url'),
		key.toString('base64url')
	].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const parts = stored.split('$');
	if (parts.length !== 6 || parts[0] !== 'scrypt') {
		return false;
	}
	const [, nRaw, rRaw, pRaw, saltRaw, keyRaw] = parts;
	const n = Number(nRaw);
	const r = Number(rRaw);
	const p = Number(pRaw);
	if (![n, r, p].every((value) => Number.isInteger(value) && value > 0)) {
		return false;
	}
	const salt = Buffer.from(saltRaw, 'base64url');
	const expected = Buffer.from(keyRaw, 'base64url');
	if (salt.length === 0 || expected.length !== KEY_LENGTH) {
		return false;
	}
	const actual = await deriveKey(password, salt, n, r, p);
	return timingSafeEqual(actual, expected);
}

let fallbackHash: Promise<string> | null = null;

/**
 * Hash of a throwaway random password, verified against when a login names an
 * unknown user. Doing the same scrypt work either way keeps response timing from
 * revealing whether a username exists.
 */
export function fallbackPasswordHash(): Promise<string> {
	fallbackHash ??= hashPassword(randomBytes(16).toString('base64url'));
	return fallbackHash;
}
