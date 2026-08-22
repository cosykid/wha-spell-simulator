/**
 * @file `LOOKS` and the one rule for reading it: sigil row, else element row,
 * else inert.
 *
 * Keying on **sigil id** rather than element is what makes crystal and aeroform
 * representable: they are earth and wind behaviorally, and a row of their own is
 * the only place that difference is allowed to live. This phase ships the five
 * element rows plus the inert fallback, so every sigil currently resolves
 * through the element tier; phase 4 adds sigil rows above it and nothing else
 * changes.
 *
 * Resolution never returns undefined, which is why no caller may branch on
 * element. If a look is missing, that is a missing table row, not a code path.
 *
 * @example
 * const look = lookRow({ sigil: 'crystal', element: 'earth' }).body;
 */

import { EARTH_LOOKS } from './earth.js';
import { FIRE_LOOKS } from './fire.js';
import { INERT_LOOKS } from './inert.js';
import { LIGHT_LOOKS } from './light.js';
import { WATER_LOOKS } from './water.js';
import { WIND_LOOKS } from './wind.js';
import type { Look, LookRow, LookTable } from './look.js';
import type { ElementId, LookRole } from '../../types.js';

/**
 * Rows keyed on sigil id. The five element ids are rows too, and they are the
 * fallback tier every sigil without a row of its own lands on.
 */
export const LOOKS: LookTable = {
	fire: FIRE_LOOKS,
	water: WATER_LOOKS,
	wind: WIND_LOOKS,
	earth: EARTH_LOOKS,
	light: LIGHT_LOOKS
};

/** What a cast paints from: the sigil that was drawn, and the element behind it. */
export interface LookKey {
	sigil: string | null;
	element: ElementId | null;
}

/**
 * The row a cast paints from. The `table` parameter is the seam the precedence
 * tests drive; callers pass the real one by omitting it.
 */
export function lookRow(key: LookKey, table: LookTable = LOOKS): LookRow {
	const bySigil = key.sigil ? table[key.sigil] : undefined;
	const byElement = key.element ? table[key.element] : undefined;
	return bySigil ?? byElement ?? INERT_LOOKS;
}

/** One role off that row. */
export function lookFor(key: LookKey, role: LookRole, table: LookTable = LOOKS): Look {
	return lookRow(key, table)[role];
}
