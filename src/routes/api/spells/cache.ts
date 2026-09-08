/**
 * @file How long the CDN may hold each spell read.
 *
 * Only the responses that are the same for every reader are cacheable, so
 * `s-maxage` here is also the promise that a response carries nothing about who
 * asked for it. `max-age=0` keeps the browser revalidating while the edge
 * answers; `stale-while-revalidate` means the wait for a fresh page falls on
 * the edge and never on a reader.
 */

/** A published page. A spell published now shows up within the minute. */
export const LIBRARY_FEED_CACHE = 'public, max-age=0, s-maxage=60, stale-while-revalidate=600';

/**
 * One published spell's drawing. Held longer than the feed: a drawing only
 * changes when its owner saves over it, and a plate that is a few minutes stale
 * still casts.
 */
export const SPELL_DETAIL_CACHE = 'public, max-age=0, s-maxage=300, stale-while-revalidate=3600';
