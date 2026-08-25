/**
 * @file The cell contract. A parcel belonged to exactly one track; **a cell is
 * one track**, and what it performs is a choreography rather than a shape.
 *
 * Since the volume rework a cell owns no geometry and no tracer loop. It
 * writes its channel's `TrackFlow` — which mouth its matter is born from,
 * where its form stands, the kind-shaped forces on top of the element's own
 * physics — and the shared substrate (`cast/volume/`) advects the tracers and
 * skins them as one merged body. An archetype is a mouth plus a flow, which is
 * why seven of them can read as one medium. See `docs/animation-volume.md`.
 *
 * Four rules, inherited and unchanged:
 *
 * - **A cell feels only its own track.** No cell reads another cell, the score,
 *   or the wall clock. Couplings arrive as a value: the stage applies the
 *   holder's constraint to a captured cell's declared bound.
 * - **Deterministic replay.** `update` is a function of (track, ctx, frames so
 *   far). Seeded RNG only, from `ctx.seed`; `Math.random` and `Date.now` are
 *   banned below `stage/`.
 * - **Phase-locked patterning.** Anything a cell writes that patterns the mass
 *   is driven by the same phase the mass moves by. The skin is polygonized off
 *   the very tracers the flow advects, which is that rule taken as far as it
 *   goes.
 * - **Beats are visible.** Every cell states what it does in charge (nothing
 *   non-ambient manifests, R-01), strike (impulse), body (sustain, the one beat
 *   that stretches, R-02), release (commit) and afterglow (dissipate). A cell
 *   whose five beats look identical is a bug.
 *
 * @example
 * const cell = cellFor(track, { seed, look, quality, channel });
 */

import type { Beat, ScoreTrack, Vec3 } from '../../types.js';
import type { LookRow } from '../looks/look.js';
import type { VolumeChannel } from '../volume/substrate.js';

/** What a cell is built with. Fixed for the life of the cell. */
export interface CellContext {
	/** Derived from the score signature and the track's index. Seeds the cell's rng. */
	seed: number;
	/** The resolved material profile, indexed by the track's own `look` role. */
	look: LookRow;
	/** The seal's drawing quality, 0..1. Form roughness, never magnitude. */
	quality: number;
	/** This cell's own seat at the shared substrate. Its whole output surface. */
	channel: VolumeChannel;
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

/**
 * What a cell reached, as plain numbers. This is the whole of what the golden
 * tier and the probe table may read, and it is deliberately CPU-only: the mass
 * itself lives in a GPU texture no assertion can see, so what is asserted on is
 * the choreography that put it there.
 */
export interface CellReport {
	/** How loudly this cell is painting, 0..1. Zero is silence, which R-01 requires. */
	ink: number;
	/** Where the mass stands: the seal-space centroid of the cell's live tracers. */
	at: Vec3;
	/** Where the form the cell declares is rooted, in seal space. */
	from: Vec3;
	/** The point that form reaches to, along its own axis. */
	tip: Vec3;
	/** Live tracers, and every tracer this cell has ever spawned. */
	marks: number;
	born: number;
	/** Named scalars this kind publishes. One entry is one claim a probe can pin. */
	detail: Record<string, number>;
}

/** One track's performer. */
export interface Cell {
	update(frame: CellFrame): void;
	/** What this cell reached at the last {@link Cell.update}. */
	report(): CellReport;
	/** Give back whatever the cell holds. Its channel stops painting. */
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
