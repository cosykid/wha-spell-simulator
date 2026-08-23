/**
 * @file The beam cell: R-05's aimed column, performed as a drawn column.
 *
 * Three forms, one axis. A bright core spine stands in the aperture footprint
 * and leans onto `aim`; three to five ink ribbons twist around it, alpha-banded
 * by the axial flow; and one strand per drawn column runs in along the paper and
 * up into the foot, so a three-column seal reads as three-fold convergence
 * rather than as one averaged spike.
 *
 * The flow phase is the cell's only clock. It is integrated from the drive
 * envelope, and it moves the banding, the ribbon twist and the feeders together,
 * which is what makes the column read as climbing in a still frame.
 *
 * What each beat looks like:
 *
 * | beat      | the cell                                                     |
 * | --------- | ------------------------------------------------------------ |
 * | charge    | nothing. R-01 lets only the ambient medium manifest here.     |
 * | strike    | the shaft punches out, flaring, and the tongue overshoots.     |
 * | body      | it settles onto its standing length and sustains, ink climbing.|
 * | release   | it commits: the tongue lets go and flies, the strands give up. |
 * | afterglow | the ribbons feather away and the shaft fades where it stood.   |
 *
 * @example
 * const beam = createBeamCell(track, { seed, look, quality });
 */

import { createBeamSpine } from './forms/beamSpine.js';
import { createBeamRibbons } from './forms/beamRibbons.js';
import { createBeamFeeders } from './forms/beamFeeders.js';
import { mulberry32 } from '../stage/rng.js';
import { clamp } from '../../utils/geometry.js';
import * as THREE from 'three';
import type { Cell, CellContext, CellFrame } from './cell.js';
import type { Beat, Track } from '../../types.js';

const BEAM_CELL = {
	/** Seal units of shaft per unit of the track's `reach`. A column stands well past the ring. */
	lengthPerReach: 1.45,
	/** Turns of flow pattern per seal unit the beam pushes. */
	turnsPerUnit: 0.55,
	/** Spine radius at the throat, as a fraction of the beam's footprint. */
	spineWidth: 0.44,
	/** Sheath radius at the throat, as a fraction of the footprint. */
	sheathRadius: 0.52,
	/** How much of the shaft the ribbons run along, so they never fly past the tongue. */
	sheathReach: 0.76,
	/** Ribbons in the sheath. The catalog's three to five. */
	ribbons: { min: 3, max: 5 },
	/** Seal units the feeder strands climb before they meet the foot. */
	feederRise: 0.85,
	/** Fraction of its own radius a strand closes to at the throat. */
	feederThroat: 0.32,
	alpha: { spine: 0.95, ribbons: 0.85, feeders: 1 }
} as const;

/**
 * The three jets a score can hold, as form. Ids are stable and derived from the
 * plan (`score/tracks/jet.ts`), so this is the score naming its own beams.
 */
type BeamVariant = 'column' | 'valve' | 'plume';

interface VariantForm {
	length: number;
	girth: number;
	alpha: number;
	/** Seal units the root is thrown clear of the center, along the aim's heading. */
	offset: number;
	/** Seal units the root stands off the paper. */
	lift: number;
}

const BEAM_VARIANTS: Record<BeamVariant, VariantForm> = {
	column: { length: 1, girth: 1, alpha: 1, offset: 0, lift: 0 },
	// R-09's valve throws through an aperture cut on the far side, so its gout
	// leaves the rim rather than the center, and it runs fatter and shorter than
	// anything a column drew. `reach` already scales the throw.
	valve: { length: 0.72, girth: 1.25, alpha: 1, offset: 0.55, lift: 0.14 },
	// R-11's designed default: present, and quieter than a drawn column.
	plume: { length: 0.55, girth: 0.72, alpha: 0.5, offset: 0, lift: 0 }
};

/** How present the beam is through each beat. Alpha and density, never length. */
const BEAM_PRESENCE: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => 0.35 + 0.65 * t * (2 - t),
	body: () => 1,
	release: (t) => 1 - 0.35 * t,
	afterglow: (t) => 0.65 * (1 - t) * (1 - t)
};

/** How far the shaft reaches, as a fraction of its standing length. */
const BEAM_EXTENT: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => 0.3 + 0.95 * t,
	body: (t) => 1.25 - 0.25 * t,
	release: (t) => 1 + 0.55 * t,
	afterglow: (t) => 1.55 + 0.1 * t
};

/**
 * How fat the shaft runs, as a fraction of its footprint width. The strike's
 * hump is the punch: it flares mid-beat and is back to its standing girth by
 * the time the body takes over.
 */
const BEAM_GIRTH: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => 0.45 + 0.55 * t + 0.55 * Math.sin(Math.PI * t),
	body: (t) => 1 - 0.15 * t,
	release: (t) => 0.85 - 0.3 * t,
	afterglow: (t) => 0.55 - 0.3 * t
};

/** How lit the tongue at the head is: the impulse, and then the commit. */
const BEAM_TONGUE: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => t * (2 - t),
	body: (t) => 1 - 0.8 * t,
	release: (t) => 0.2 + 0.55 * t,
	afterglow: (t) => 0.75 * (1 - t)
};

/** How much of the shaft the ribbons still sheathe before they feather off. */
const RIBBON_FEATHER: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => 0.55 + 0.35 * t,
	body: () => 0.9,
	release: (t) => 0.9 - 0.45 * t,
	afterglow: (t) => 0.45 - 0.35 * t
};

/** How hard the drawn columns are still feeding the beam. */
const FEEDER_PRESENCE: Record<Beat, (t: number) => number> = {
	charge: () => 0,
	strike: (t) => t * (2 - t),
	body: (t) => 1 - 0.3 * t,
	release: (t) => 0.7 - 0.5 * t,
	afterglow: (t) => 0.2 * (1 - t)
};

/** An envelope's curve value, 0..1, with its gain divided back out. */
function shapeOf(value: number, gain: number): number {
	return gain > 0 ? clamp(value / gain) : 0;
}

function variantOf(track: Track<'jet'>): BeamVariant {
	if (track.id === 'jet-exhaust') {
		return 'valve';
	}
	return track.id === 'jet-default' ? 'plume' : 'column';
}

/**
 * Ribbons in the sheath: the seal's own fold where it snapped to one, the drawn
 * columns otherwise, and the catalog's three either way. Count keeps paying
 * magnitude in the score (R-05); here it only shapes the sheath.
 */
function ribbonCount(track: Track<'jet'>): number {
	const asked = track.params.symmetry ?? track.params.sites.length;
	return Math.min(Math.max(asked, BEAM_CELL.ribbons.min), BEAM_CELL.ribbons.max);
}

export function createBeamCell(track: Track<'jet'>, ctx: CellContext): Cell {
	const rng = mulberry32(ctx.seed);
	const look = ctx.look[track.look];
	const material = ctx.look.material;
	const form = BEAM_VARIANTS[variantOf(track)];
	// A sloppier seal breaks a rougher form. The score already paid for strength,
	// so quality buys shape here and nothing else.
	const roughness = 0.35 + 0.65 * (1 - clamp(ctx.quality));

	const spine = createBeamSpine({ look, hot: ctx.look.core, material });
	const ribbons = createBeamRibbons({
		look,
		material,
		count: ribbonCount(track),
		roughness,
		rng
	});
	const feeders = createBeamFeeders({
		look,
		material,
		sites: track.params.sites,
		roughness,
		rng
	});
	spine.mesh.name = 'beam-spine';
	ribbons.mesh.name = 'beam-ribbons';
	feeders.mesh.name = 'beam-feeders';

	// The shaft leans onto the aim; the strands stay on the paper the columns were
	// drawn on, so the two only meet at the foot.
	const axis = new THREE.Vector3(
		track.params.axis.x,
		track.params.axis.y,
		track.params.axis.z
	).normalize();
	const aimed = new THREE.Group();
	aimed.name = 'beam-aimed';
	aimed.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), axis);
	const heading = Math.hypot(axis.x, axis.y);
	if (heading > 1e-6) {
		aimed.position.set(
			(axis.x / heading) * form.offset,
			(axis.y / heading) * form.offset,
			form.lift
		);
	} else {
		aimed.position.set(0, 0, form.lift);
	}
	aimed.add(spine.mesh, ribbons.mesh);

	const group = new THREE.Group();
	group.name = `cell-${track.id}`;
	group.add(aimed, feeders.mesh);

	const standing = track.params.reach * BEAM_CELL.lengthPerReach * form.length;
	const footprint = track.params.footprint;
	// R-11's quiet plume and a heavy element both hold their length longer; the
	// look table's `trailPersistence` is what says how long ink outlives its push.
	const persistence = clamp(material.trailPersistence);

	/** Seal units the beam has pushed. The cell's only accumulated state. */
	let pushedUnits = 0;

	return {
		group,
		update(frame: CellFrame) {
			// R-01: the charge belongs to the ambient medium, so a beam is not merely
			// dark here, it is absent.
			group.visible = frame.beat !== 'charge';
			if (!group.visible) {
				return;
			}

			pushedUnits += track.params.speed * frame.drive * (frame.dtMs / 1000);
			const flow = pushedUnits * BEAM_CELL.turnsPerUnit;
			const density = 0.6 + 0.4 * shapeOf(frame.emission, track.emission.gain);
			const presence = BEAM_PRESENCE[frame.beat](frame.beatT) * density * form.alpha;
			const length = standing * BEAM_EXTENT[frame.beat](frame.beatT);
			const girth = footprint * form.girth * BEAM_GIRTH[frame.beat](frame.beatT);

			spine.setShaft({
				length,
				width: girth * BEAM_CELL.spineWidth,
				alpha: presence * BEAM_CELL.alpha.spine,
				tip: BEAM_TONGUE[frame.beat](frame.beatT),
				flow
			});
			ribbons.setSheath({
				length: length * BEAM_CELL.sheathReach,
				radius: girth * BEAM_CELL.sheathRadius,
				width: material.ribbonWidth * 0.5,
				alpha: presence * BEAM_CELL.alpha.ribbons,
				flow,
				feather: RIBBON_FEATHER[frame.beat](frame.beatT) + 0.1 * persistence
			});
			feeders.setFlow({
				rise: BEAM_CELL.feederRise,
				throat: BEAM_CELL.feederThroat,
				width: material.ribbonWidth * 0.9,
				alpha: FEEDER_PRESENCE[frame.beat](frame.beatT) * density * BEAM_CELL.alpha.feeders,
				flow
			});
		},
		dispose() {
			group.clear();
			aimed.clear();
			spine.dispose();
			ribbons.dispose();
			feeders.dispose();
		}
	};
}
