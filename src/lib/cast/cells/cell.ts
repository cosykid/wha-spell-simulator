/**
 * @file The cell contract, from `docs/animation-cells.md`. A parcel belonged to
 * exactly one track; a **cell is one track**, performing that track's envelopes
 * as macroscopic animated form.
 *
 * Four rules, inherited and new:
 *
 * - **A cell feels only its own track.** No cell reads another cell, the score,
 *   or the wall clock. Couplings arrive the way they did in the sim: the stage
 *   applies the holder's constraint to a captured cell's declared bound.
 * - **Deterministic replay.** `update` is a function of (track, ctx, frames so
 *   far). Seeded RNG only, from `ctx.seed`; `Math.random` and `Date.now` are
 *   banned below `stage/` exactly as they were below `render/`.
 * - **Phase-locked patterning.** A procedural surface pattern must be driven by
 *   the same phase its geometry moves by, or the form reads as mush.
 * - **Beats are visible.** Every cell states what it does in charge (nothing
 *   non-ambient manifests, R-01), strike (impulse), body (sustain, the one beat
 *   that stretches, R-02), release (commit) and afterglow (dissipate). A cell
 *   whose five beats look identical is a bug.
 *
 * @example
 * const cell = cellFor(track, { seed, look, quality });
 * sealRoot.add(cell.group);
 */

import type * as THREE from 'three';
import type { Beat, ScoreTrack, Vec3 } from '../../types.js';
import type { LookRow } from '../looks/look.js';

/** What a cell is built with. Fixed for the life of the cell. */
export interface CellContext {
	/** Derived from the score signature and the track's index. Seeds the cell's rng. */
	seed: number;
	/** The resolved material profile, indexed by the track's own `look` role. */
	look: LookRow;
	/** The seal's drawing quality, 0..1. Form roughness, never magnitude: the score already paid for strength. */
	quality: number;
}

/** One fixed step of the cast, as the cell sees it. */
export interface CellFrame {
	/** Cast time, milliseconds from activation. Always a whole number of steps. */
	tMs: number;
	beat: Beat;
	/** How far through `beat`, 0 at its start and 1 at its end. */
	beatT: number;
	/** The track's emission envelope at `tMs`, in the score's own units. */
	emission: number;
	/** The track's drive envelope at `tMs`: a velocity scale. */
	drive: number;
	/** Step length. Fixed, so fresh-to-t and incremental stepping agree. */
	dtMs: number;
}

/**
 * A ceiling a holder imposes on the cells the plan declared it captures. This is
 * the whole of a coupling: the stage reads it off the holder after every step and
 * hands it to each captured cell, which decides for itself what the ceiling means
 * for its own form. Neither cell ever sees the other.
 */
export interface CellConstraint {
	/** Seal space. Where the holder keeps what it holds. */
	at: Vec3;
	/** Seal units of shell around `at`. A captured form may not reach past it. */
	radius: number;
	/** 0..1, how closed the grip is. Zero holds nothing, so nothing is capped. */
	closed: number;
}

/** One track's performer. */
export interface Cell {
	/** Parented under the stage's seal-space root, so its transform is seal space. */
	readonly group: THREE.Group;
	update(frame: CellFrame): void;
	/** Every geometry, material and texture the cell made. */
	dispose(): void;
	/**
	 * Holder side of a coupling, optional. What this cell imposes on what it holds,
	 * as of the last {@link Cell.update}. `null` while it grips nothing (R-16's
	 * rotor never does). The stage only reads it, and the object stays the cell's
	 * own: it is valid until the next step, so a reader may not keep it.
	 */
	constraint?(): CellConstraint | null;
	/**
	 * Captured side of a coupling, optional. The stage hands over the holder's
	 * ceiling after every step. A cell that does not implement this is never
	 * capped, which is exactly what an uncaptured cell is, so adding a cell to the
	 * stage never requires thinking about couplings at all.
	 */
	bind?(constraint: CellConstraint | null): void;
}

export type CellFactory = (track: ScoreTrack, ctx: CellContext) => Cell;
