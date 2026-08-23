/**
 * @file The hold cell: R-13's spring, performed as a contained presence in the
 * air above the seal. Three forms and no dots — a shell that breathes with the
 * grip, ink rings orbiting it at the hold's own spin, and faint tethers bowing
 * back to the seal rim that holds it there.
 *
 * What each beat looks like:
 *
 * | beat      | the cell                                                        |
 * | --------- | --------------------------------------------------------------- |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.        |
 * | strike    | the shell snaps shut, a grip pulse runs it, the rings kick over. |
 * | body      | the ball fills toward capacity and breathes; the rings turn.     |
 * | release   | the grip does not let go: the ball rides, the tethers thin.      |
 * | afterglow | the shell dims and the rings coast down where they stand.        |
 *
 * Two rulings are visible in it. **R-16**: `spin` turns the rings whether or not
 * anything is gripped, so a levitation pinwheel is a rotor around a shell with no
 * tension in it. **R-20**: the ball's held mass accumulates from the track's own
 * emission against `capacity`, approaching it asymptotically and never passing
 * it, and that fill is the whole of what the cell offers a coupling.
 *
 * (R-17's inverted case never reaches here: the plan resolves no hold at all, so
 * the score builds no track and the stage builds no cell.)
 */

import { createHoldShell } from './forms/holdShell.js';
import { createOrbitRings, type RingPlacement } from './forms/orbitRings.js';
import { createTetherWisps, type WispStrand } from './forms/tetherWisps.js';
import { mulberry32, type Rng } from '../rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellConstraint, CellContext, CellFrame } from './cell.js';
import type { Beat, Track } from '../../types.js';

const HOLD_CELL = {
	/** Ink rings around the ball. Two or three: more reads as a gyroscope toy. */
	rings: { min: 2, max: 3 },
	/** Ring orbit as a multiple of the shell radius, and how far the seed may lean one. */
	ringOrbit: { min: 1.35, max: 1.95 },
	ringTilt: { min: 0.18, max: 1.15 },
	/** Seal units of ring band, before the material's own ribbon width. */
	ringWidth: { base: 0.012, perRibbon: 0.11 },
	/** Tethers from the rim to the ball. */
	strands: { min: 3, max: 5 },
	/** Shell radius as a multiple of the blob radius: empty, and brim full. */
	shell: { empty: 0.7, full: 1.55 },
	/** How much of the shell radius the breathing swings. */
	breath: 0.07,
	/**
	 * The `capacity` a fully gripped hold reaches, from `score/tracks/hold.ts`'s
	 * `capacityPerGrip`. The cell reads grip strength back off it because capacity
	 * is linear in the grip, and a cell may not see the plan.
	 */
	fullCapacity: 45,
	/**
	 * Capacity below which a hold is not gripping, as a fraction of a full one.
	 * R-16's rotor arrives here with a capacity of about 1e-15 rather than a clean
	 * zero, because the plan's spin and grip are trigonometry, and half a parcel of
	 * capacity is not a grip.
	 */
	gripFloor: 0.01,
	/** Peak alphas. Ink piles up additively, so nothing here is opaque. */
	alpha: { shell: 0.72, rings: 0.92, wisps: 0.42 },
	/** What a shell with no grip in it keeps, so R-16's rotor still has a middle. */
	griplessShell: 0.16,
	/** Fraction of its turn the rotor keeps once the drive envelope closes. */
	coast: 0.3
} as const;

/** How present the hold is through each beat, on top of what its envelopes say. */
const HOLD_PRESENCE: Record<Beat, (beatT: number) => number> = {
	charge: () => 0,
	strike: (t) => t * (2 - t),
	body: (t) => 1 - 0.12 * t,
	release: (t) => 0.88 - 0.18 * t,
	afterglow: (t) => 0.7 * (1 - t) * (1 - t)
};

function seededRings(rng: Rng, quality: number): RingPlacement[] {
	const count =
		HOLD_CELL.rings.min + Math.floor(rng() * (HOLD_CELL.rings.max - HOLD_CELL.rings.min + 1));
	// A sloppier seal hangs its rings at sloppier angles. Form only, never strength.
	const lean =
		HOLD_CELL.ringTilt.min +
		(HOLD_CELL.ringTilt.max - HOLD_CELL.ringTilt.min) * (1 - 0.5 * quality);
	const orbit = HOLD_CELL.ringOrbit;
	return Array.from({ length: count }, (_, index) => ({
		tilt: HOLD_CELL.ringTilt.min + rng() * lean,
		twist: rng() * Math.PI * 2,
		radius: orbit.min + ((orbit.max - orbit.min) * index) / Math.max(1, count - 1),
		speed: 0.7 + rng() * 0.3
	}));
}

function seededStrands(rng: Rng): WispStrand[] {
	const count =
		HOLD_CELL.strands.min + Math.floor(rng() * (HOLD_CELL.strands.max - HOLD_CELL.strands.min + 1));
	const offset = rng() * Math.PI * 2;
	return Array.from({ length: count }, (_, index) => ({
		bearing: offset + (index / count) * Math.PI * 2,
		bow: rng() * 2 - 1
	}));
}

/** A held place in the air: the ball, its rings, and what ties it to the seal. */
export function createHoldCell(track: Track<'hold'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const params = track.params;
	const look = ctx.look[track.look];
	const material = ctx.look.material;
	const quality = clamp(ctx.quality);

	// Capacity is linear in the plan's grip, so it is the one honest read of how
	// hard this hold grips. R-16's rotor has none, and grips nothing.
	const gripStrength = clamp(params.capacity / HOLD_CELL.fullCapacity);
	const grips = gripStrength >= HOLD_CELL.gripFloor;
	// Tangential rate over the arm it acts on: the rings' angular speed.
	const spinRate = params.spin / Math.max(params.radius, 1e-3);

	const shell = createHoldShell({ look, material });
	const rings = createOrbitRings({ look, material, rings: seededRings(rng, quality) });
	const wisps = createTetherWisps({ look, material, strands: seededStrands(rng) });
	shell.mesh.name = 'hold-shell';
	rings.mesh.name = 'hold-rings';
	wisps.mesh.name = 'hold-wisps';

	// The ball and its rings live at the hover locus; the tethers reach back to the
	// seal rim, so they stay in seal-origin space and carry the locus as a uniform.
	const orb = new THREE.Group();
	orb.position.set(params.at.x, params.at.y, params.at.z);
	orb.add(shell.mesh, rings.mesh);

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(orb, wisps.mesh);

	/** R-20's held mass, and the two phases everything is patterned by. */
	let heldMass = 0;
	let spinPhase = 0;
	let bobPhase = 0;

	// The ceiling this cell publishes, rewritten in place each step. The stage may
	// read it; nothing may keep it. The tethers' anchor is the same story: both are
	// owned here so the update loop allocates nothing.
	const ceiling: CellConstraint = {
		at: { x: params.at.x, y: params.at.y, z: params.at.z },
		radius: 0,
		closed: 0
	};
	const anchor = { x: params.at.x, y: params.at.y, z: params.at.z };

	return {
		group,
		update(frame: CellFrame) {
			// R-01: the charge belongs to the ambient medium alone, so the hold is
			// absent here rather than merely dark.
			group.visible = frame.beat !== 'charge';
			if (!group.visible) {
				return;
			}

			const stepS = frame.dtMs / 1000;
			// R-20. The feed accumulates in the ball and the valve closes as it
			// fills, so the mass approaches capacity and never reaches it.
			if (grips) {
				heldMass += frame.emission * stepS * Math.max(0, 1 - heldMass / params.capacity);
			}
			const fill = grips ? clamp(heldMass / params.capacity) : 0;

			// R-16. The rotor turns on its own spin whether or not it grips, and
			// coasts rather than stopping dead when the drive envelope closes.
			spinPhase += spinRate * (HOLD_CELL.coast + (1 - HOLD_CELL.coast) * frame.drive) * stepS;
			bobPhase += params.bobRate * stepS;

			const breath = 1 + HOLD_CELL.breath * Math.sin(bobPhase);
			const radius =
				params.radius *
				(HOLD_CELL.shell.empty + (HOLD_CELL.shell.full - HOLD_CELL.shell.empty) * fill) *
				breath;
			const presence = HOLD_PRESENCE[frame.beat](frame.beatT);
			// The ball bobs on the same phase it breathes by: one slow settle.
			orb.position.z = params.at.z + params.radius * HOLD_CELL.breath * Math.sin(bobPhase);

			shell.setShell({
				radius,
				alpha:
					presence *
					HOLD_CELL.alpha.shell *
					(HOLD_CELL.griplessShell + (1 - HOLD_CELL.griplessShell) * (grips ? gripStrength : 0)),
				grip: gripStrength * fill,
				// The grip closes over the strike, and only there.
				pulse: frame.beat === 'strike' ? frame.beatT : 0,
				phase: bobPhase
			});
			rings.setRings({
				radius,
				width: HOLD_CELL.ringWidth.base + HOLD_CELL.ringWidth.perRibbon * material.ribbonWidth,
				alpha: presence * HOLD_CELL.alpha.rings,
				spin: spinPhase,
				bob: bobPhase
			});
			anchor.z = orb.position.z;
			wisps.setWisps({
				at: anchor,
				stop: radius,
				// The tethers are the faintest thing the cell draws, and they thin as
				// the ball settles into being held rather than being filled.
				alpha: presence * HOLD_CELL.alpha.wisps * (1 - 0.45 * fill),
				width: 0.012 + 0.03 * material.ribbonWidth,
				phase: bobPhase + spinPhase
			});

			ceiling.radius = radius;
			ceiling.closed = fill * gripStrength;
		},
		constraint() {
			// R-16: a rotor holds nothing, so it constrains nothing.
			return grips ? ceiling : null;
		},
		dispose() {
			orb.clear();
			group.clear();
			shell.dispose();
			rings.dispose();
			wisps.dispose();
		}
	};
}
