/**
 * @file The one place a track's kind is switched on, as `sim/primitives/registry.ts`
 * was for the sim. Every other line of the stage is kind-agnostic, so adding a
 * cell is one row here and one file beside it.
 *
 * It is a function rather than a lookup table because the params type follows the
 * kind: a `Track<'burst'>` may only be handed to the burst cell, and the switch
 * is what proves it. `ScoreTrack` covers every `PrimitiveKind` except R-13's
 * deferred `vessel`, so the switch is exhaustive without it.
 *
 * @example
 * const cell = cellFor(track, { seed, look, quality });
 */

import { createBurstCell } from './burst.js';
import { createUnbuiltCell } from './unbuilt.js';
import type { Cell, CellContext } from './cell.js';
import type { ScoreTrack } from '../../types.js';

export function cellFor(track: ScoreTrack, ctx: CellContext): Cell {
	switch (track.kind) {
		case 'burst':
			return createBurstCell(track, ctx);
		// Phase 3 of `docs/animation-cells.md` gives each of these a performer:
		// beam, fan, vortex, hold, intake and ambient, against looks v2 profiles.
		case 'jet':
		case 'fan':
		case 'vortex':
		case 'hold':
		case 'intake':
		case 'shimmer':
			return createUnbuiltCell(track);
	}
}
