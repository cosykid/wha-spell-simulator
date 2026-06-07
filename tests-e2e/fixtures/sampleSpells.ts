/** @file Define sample spells that can be used in E2E tests */

import { NormStroke } from '../helpers/types';
import fireShoot from './spells/fire-shoot.json' with { type: 'json' };

/** A castable spell: the symbol strokes drawn inside the ring. */
export interface CastableSpell {
	id: string;
	element: string;
	manifestations: string[];
	/** Symbol strokes (sigil + signs), in normalized canvas space. */
	symbols: NormStroke[];
}

/** "Fire Shoot" — the fire sigil ringed with four column signs. */
export const FIRE_SHOOT: CastableSpell = fireShoot as CastableSpell;
