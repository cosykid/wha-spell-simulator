/**
 * @file The one place a track's kind is switched on. Every other line of the sim
 * is kind-agnostic, so adding a phase 4 primitive is one row in each function
 * here and nothing else.
 *
 * These are functions rather than a lookup table because the params type follows
 * the kind: a `Track<'jet'>` may only be handed to the jet kernel, and the
 * switch is what proves it.
 */

import { BURST } from './burst.js';
import { FAN } from './fan.js';
import { JET } from './jet.js';
import type { Aperture, ScoreTrack, Vec3 } from '../../../types.js';
import type { Parcel, ParcelSeed } from '../parcel.js';
import type { Rng } from '../rng.js';

export function spawnFor(track: ScoreTrack, aperture: Aperture, rng: Rng): ParcelSeed {
	switch (track.kind) {
		case 'burst':
			return BURST.spawn(track.params, aperture, rng);
		case 'jet':
			return JET.spawn(track.params, aperture, rng);
		case 'fan':
			return FAN.spawn(track.params, aperture, rng);
	}
}

export function kernelFor(track: ScoreTrack, at: Vec3, ageS: number): Vec3 {
	switch (track.kind) {
		case 'burst':
			return BURST.velocity(track.params, at, ageS);
		case 'jet':
			return JET.velocity(track.params, at, ageS);
		case 'fan':
			return FAN.velocity(track.params, at, ageS);
	}
}

export function constrainFor(track: ScoreTrack, parcel: Parcel): void {
	switch (track.kind) {
		case 'burst':
			BURST.constrain?.(track.params, parcel);
			return;
		case 'jet':
			JET.constrain?.(track.params, parcel);
			return;
		case 'fan':
			FAN.constrain?.(track.params, parcel);
			return;
	}
}
