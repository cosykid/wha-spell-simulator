/**
 * @file The one place a track's kind is switched on. Every other line of the
 * stage is kind-agnostic, so adding a cell is one row here and one file beside
 * it.
 *
 * It is a function rather than a lookup table because the params type follows the
 * kind: a `Track<'burst'>` may only be handed to the burst cell, and the switch
 * is what proves it. `ScoreTrack` covers every `PrimitiveKind` except R-13's
 * deferred `vessel`, so the switch is exhaustive without it.
 *
 * @example
 * const cell = cellFor(track, { seed, look, quality, channel });
 */

import { createBurstCell } from './burst.js';
import { createFanCell } from './fan.js';
import { createHoldCell } from './hold.js';
import { createIntakeCell } from './intake.js';
import { createJetCell } from './jet.js';
import { createShimmerCell } from './shimmer.js';
import { createVortexCell } from './vortex.js';
import type { Cell, CellContext } from './cell.js';
import type { ScoreTrack } from '../../types.js';

export function cellFor(track: ScoreTrack, ctx: CellContext): Cell {
	switch (track.kind) {
		case 'burst':
			return createBurstCell(track, ctx);
		case 'vortex':
			return createVortexCell(track, ctx);
		case 'intake':
			return createIntakeCell(track, ctx);
		case 'hold':
			return createHoldCell(track, ctx);
		case 'shimmer':
			return createShimmerCell(track, ctx);
		case 'jet':
			return createJetCell(track, ctx);
		case 'fan':
			return createFanCell(track, ctx);
	}
}
