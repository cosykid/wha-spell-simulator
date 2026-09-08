/**
 * @file `VOICES` and the one rule for reading it: sigil row, else element row,
 * else inert. The same resolution as `looks/table.ts`, for the same reason:
 * crystal is not earth and aeroform is not wind, and a row of their own is the
 * only place that difference is allowed to live.
 *
 * The rows themselves are in [`voices/`](voices/), one substance per file, the
 * way the look table keeps its own.
 *
 * Resolution never returns undefined, so nothing in the sound layer branches on
 * element. A silent element is a missing table row, not a code path.
 *
 * @example
 * const voice = voiceRow({ sigil: 'crystal', element: 'earth' });
 */

import { AEROFORM_VOICE } from './voices/aeroform.js';
import { CRYSTAL_VOICE } from './voices/crystal.js';
import { EARTH_VOICE } from './voices/earth.js';
import { FIRE_VOICE } from './voices/fire.js';
import { INERT_VOICE } from './voices/inert.js';
import { LIGHT_VOICE } from './voices/light.js';
import { WATER_VOICE } from './voices/water.js';
import { WIND_VOICE } from './voices/wind.js';
import type { ElementId } from '../../types.js';
import type { VoiceRow, VoiceTable } from './voice.js';

export {
	AEROFORM_VOICE,
	CRYSTAL_VOICE,
	EARTH_VOICE,
	FIRE_VOICE,
	INERT_VOICE,
	LIGHT_VOICE,
	WATER_VOICE,
	WIND_VOICE
};

/**
 * Rows keyed on sigil id. The five element ids are rows too, and they are the
 * fallback tier every sigil without a row of its own lands on.
 */
export const VOICES: VoiceTable = {
	fire: FIRE_VOICE,
	water: WATER_VOICE,
	wind: WIND_VOICE,
	earth: EARTH_VOICE,
	light: LIGHT_VOICE,
	crystal: CRYSTAL_VOICE,
	aeroform: AEROFORM_VOICE
};

/** What a cast sounds from: the sigil that was drawn, and the element behind it. */
export interface VoiceKey {
	sigil: string | null;
	element: ElementId | null;
}

/**
 * The row a cast sounds from. The `table` parameter is the seam the precedence
 * tests drive; callers pass the real one by omitting it.
 */
export function voiceRow(key: VoiceKey, table: VoiceTable = VOICES): VoiceRow {
	const bySigil = key.sigil ? table[key.sigil] : undefined;
	const byElement = key.element ? table[key.element] : undefined;
	return bySigil ?? byElement ?? INERT_VOICE;
}
