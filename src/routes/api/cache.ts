/**
 * @file Cache policy shared by every API route.
 *
 * A reader-specific answer must never be held anywhere but that reader's own
 * browser, so it carries neither `public` nor `s-maxage`. Routes whose answer
 * is the same for everyone pick a shared policy from their own folder.
 */

/** Anything that answers differently per reader, or that only its owner may read. */
export const PRIVATE_NO_STORE = 'private, no-store';
