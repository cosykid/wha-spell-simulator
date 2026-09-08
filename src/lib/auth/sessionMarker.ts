/**
 * @file The cookie that lets a page see it has a session without seeing the
 * session itself.
 *
 * `wha_session` is httpOnly, so the prerendered shell cannot tell a guest from
 * a signed-in reader and has to ask `/api/me`. That question reaches a function
 * sitting beside the database in Sydney and answers a constant `{ user: null }`
 * for everyone who is not signed in. This marker is written, renewed and
 * cleared beside the real cookie, so a guest reads the same answer off their
 * own browser and never asks.
 *
 * It is a hint the client may act on, never an authority. It carries no
 * identity, no server code reads it, and the worst a stale one can do is spend
 * the round trip it was meant to save.
 */

/** Set beside `wha_session`, readable by scripts, with the same lifetime. */
export const SESSION_MARKER_COOKIE = 'wha_signed_in';

/**
 * Whether a cookie string carries the marker. Matches the whole name, so a
 * cookie merely ending in it (`other_wha_signed_in`) is not mistaken for one.
 *
 * @example
 * const signedIn = hasSessionMarker(document.cookie);
 */
export function hasSessionMarker(cookieHeader: string): boolean {
	return cookieHeader
		.split(';')
		.some((entry) => entry.trimStart().startsWith(`${SESSION_MARKER_COOKIE}=`));
}
