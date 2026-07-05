/**
 * The spell catalog. Adding a spell = composing builder helpers into a `Seal`.
 * All geometry in seal units (ring radius = 1); azimuth 0° = +x, 90° = world +z.
 */
import { deg, fromAngle, scale, v2, type Vec2 } from './math2';
import type {
	ColumnSign,
	ConvergenceSign,
	LevitationSign,
	OrbSign,
	PullSign,
	RegionSign,
	Seal,
	Sign
} from './model';

// ---------------------------------------------------------------- builders

export function columnAt(pos: Vec2, dirDeg: number, len: number): ColumnSign {
	return { kind: 'column', pos, dir: fromAngle(deg(dirDeg)), len };
}

export function regionAt(pos: Vec2, dirDeg: number): RegionSign {
	return { kind: 'region', pos, dir: fromAngle(deg(dirDeg)) };
}

export function levitationAt(pos: Vec2, dirDeg: number, len: number): LevitationSign {
	return { kind: 'levitation', pos, dir: fromAngle(deg(dirDeg)), len };
}

/**
 * Ring of levitation arrows. facing: "in" (tails at the rim, heads inward —
 * the canon default) | "out" | "ccw" (tangential pinwheel). longIndex marks
 * one longer stem (the lev misfire probe).
 */
export function levitationRing(
	count: number,
	len = 0.5,
	radius = 0.9,
	azOffset = 45,
	facing: 'in' | 'out' | 'ccw' = 'in',
	longIndex = -1,
	longFactor = 2
): LevitationSign[] {
	const out: LevitationSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = azOffset + (i / count) * 360;
		const rhat = fromAngle(deg(az));
		const dir =
			facing === 'in' ? scale(rhat, -1) : facing === 'out' ? rhat : fromAngle(deg(az + 90));
		// outward stems would exit the ring: pull the tail in, head stays at the rim
		const pos = scale(rhat, facing === 'out' ? radius - len : radius);
		out.push({
			kind: 'levitation',
			pos,
			dir,
			len: i === longIndex ? len * longFactor : len
		});
	}
	return out;
}

export function pullAt(pos: Vec2, dirDeg: number, len: number): PullSign {
	return { kind: 'pull', pos, dir: fromAngle(deg(dirDeg)), len };
}

/** Convergence triangle (§8): dir is decorative — the law reads only len. */
export function convergenceAt(pos: Vec2, dirDeg: number, len: number): ConvergenceSign {
	return { kind: 'convergence', pos, dir: fromAngle(deg(dirDeg)), len };
}

/** Ring of convergence triangles, apexes drawn inward (canon styling, §8). */
export function convergenceRing(
	count: number,
	len = 0.35,
	radius = 0.88,
	azOffset = 0
): ConvergenceSign[] {
	const out: ConvergenceSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = azOffset + (i / count) * 360;
		out.push(convergenceAt(scale(fromAngle(deg(az)), radius), az + 180, len));
	}
	return out;
}

/**
 * Ring of pull arrows (tail parsing: pos = tail, dir = tail → tip).
 * facing: "in" (tails at the rim, tips inward — grasping wind) | "out"
 * (inverted: push) | "ccw" (tangential: pure twist). slantDeg rotates every
 * arrow off its radial line — the wiki diagram's helix knob: pull weakens as
 * cos(slant), twist grows as sin(slant), turning the way the arrows point.
 */
export function pullRing(
	count: number,
	facing: 'in' | 'out' | 'ccw' = 'in',
	len = 0.5,
	radius = 0.9,
	slantDeg = 0
): PullSign[] {
	const out: PullSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = 45 + (i / count) * 360;
		const rhat = fromAngle(deg(az));
		const dirDeg =
			facing === 'in' ? az + 180 + slantDeg : facing === 'out' ? az + slantDeg : az + 90;
		// outward tips would exit the ring: pull the tail in, tip stays at the rim
		const pos = scale(rhat, facing === 'out' ? radius - len : radius);
		out.push(pullAt(pos, dirDeg, len));
	}
	return out;
}

/** Orb glyph (§9): a circle with a line through it — dir is decorative, the law reads only the diameter. */
export function orbAt(pos: Vec2, dirDeg: number, len: number): OrbSign {
	return { kind: 'orb', pos, dir: fromAngle(deg(dirDeg)), len };
}

/** Orb glyphs on the diagonals, through-lines radial (the canon corner styling). */
export function orbCorners(count = 4, len = 0.26, radius = 0.62, azOffset = 45): OrbSign[] {
	const out: OrbSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = azOffset + (i / count) * 360;
		out.push(orbAt(scale(fromAngle(deg(az)), radius), az, len));
	}
	return out;
}

/** Ring of column signs. facing: "in" | "out" | "ccw" (tangential pinwheel). */
export function columnRing(
	count: number,
	facing: 'in' | 'out' | 'ccw',
	len = 0.45,
	radius = 0.85,
	longIndex = -1,
	longFactor = 1.9
): ColumnSign[] {
	const out: ColumnSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = (i / count) * 360;
		const rhat = fromAngle(deg(az));
		const dir =
			facing === 'in' ? scale(rhat, -1) : facing === 'out' ? rhat : fromAngle(deg(az + 90));
		// application point sits so the stem stays inside the ring
		const pos = scale(rhat, facing === 'out' ? radius - len : radius);
		const L = i === longIndex ? len * longFactor : len;
		out.push({ kind: 'column', pos, dir, len: L });
	}
	return out;
}

/** Ring of region chevrons pointing in or out. */
export function regionRing(count: number, facing: 'in' | 'out', radius = 0.9): RegionSign[] {
	const out: RegionSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = (i / count) * 360;
		const rhat = fromAngle(deg(az));
		out.push({
			kind: 'region',
			pos: scale(rhat, radius),
			dir: facing === 'in' ? scale(rhat, -1) : rhat
		});
	}
	return out;
}

/** Opposed chevron pairs facing each other across the ring line (floating drops). */
export function opposedRing(count: number, rInner = 0.82, rOuter = 1.0): RegionSign[] {
	const out: RegionSign[] = [];
	for (let i = 0; i < count; i++) {
		const az = (i / count) * 360;
		const rhat = fromAngle(deg(az));
		out.push({ kind: 'region', pos: scale(rhat, rInner), dir: rhat }); // inner points out
		out.push({
			kind: 'region',
			pos: scale(rhat, rOuter),
			dir: scale(rhat, -1)
		}); // outer points in
	}
	return out;
}

/** Opposed pairs along the x-diameter (the demo's "curtain" row). */
export function midlinePairs(xs: number[] = [-0.65, -0.25, 0.25, 0.65], gap = 0.14): RegionSign[] {
	const out: RegionSign[] = [];
	for (const x of xs) {
		out.push({ kind: 'region', pos: v2(x, gap), dir: v2(0, -1) }); // top points down
		out.push({ kind: 'region', pos: v2(x, -gap), dir: v2(0, 1) }); // bottom points up
	}
	return out;
}

/** Crossed opposed pairs at the center (the demo's point-source "pin"). */
export function centerPin(gap = 0.08): RegionSign[] {
	return [
		regionAt(v2(-gap, 0), 0),
		regionAt(v2(gap, 0), 180),
		regionAt(v2(0, -gap), 90),
		regionAt(v2(0, gap), 270)
	];
}

// ---------------------------------------------------------------- catalog

const sealsWaveRegions = (): Sign[] => {
	// Chevrons between the west-half columns, all pointing EAST (water-bolt
	// style side gate). Model prediction: dead-inward chevrons would leave the
	// jet vertical — the canon diagonal surge needs a sideways gate.
	const out: Sign[] = [];
	for (const az of [112.5, 157.5, 202.5, 247.5]) {
		const rhat = fromAngle(deg(az));
		out.push({ kind: 'region', pos: scale(rhat, 0.93), dir: v2(1, 0) });
	}
	return out;
};

/** §9.1 discriminator: three inward columns clustered on the south rim. */
const halfRingColumns = (): Sign[] =>
	[240, 270, 300].map((az) => columnAt(scale(fromAngle(deg(az)), 0.85), az + 180, 0.45));

/** Pure quadrupole: in along x, out along z, equal weight — all moments cancel. */
const quadrupoleColumns = (): Sign[] => [
	columnAt(v2(0.7, 0), 180, 0.3),
	columnAt(v2(-0.7, 0), 0, 0.3),
	columnAt(v2(0, 0.7), 90, 0.3),
	columnAt(v2(0, -0.7), 270, 0.3)
];

const flameShotStacks = (): Sign[] => {
	const out: Sign[] = [];
	for (const x of [-0.55, 0.55])
		for (const y of [-0.3, -0.05, 0.2, 0.45, 0.7]) out.push(regionAt(v2(x, y), 90));
	return out;
};

export const SPELLS: Seal[] = [
	{
		name: 'Blank ring — shockwave',
		desc: 'No signs: the bare burst, all directions except under the seal.',
		element: 'light',
		signs: []
	},
	{
		name: 'Watershot — balanced ring ×8',
		desc: 'Inward columns cancel laterally (P=0); convergence C=S makes a vertical jet.',
		element: 'water',
		signs: columnRing(8, 'in')
	},
	{
		name: "Coco's misfire — one long sign",
		desc: 'The east sign is longer: net P points the way it points (west) → tilted jet.',
		element: 'water',
		signs: columnRing(8, 'in', 0.45, 0.85, 0, 1.9)
	},
	{
		name: 'Light beam — element swap',
		desc: 'Same seal as watershot, light sigil: element equivalence in action.',
		element: 'light',
		signs: columnRing(8, 'in')
	},
	{
		name: 'Crystal shard — inverted ring',
		desc: 'Outward columns: C < 0 → divergence fan, radial eruption at the rim.',
		element: 'crystal',
		signs: columnRing(8, 'out', 0.5, 0.95)
	},
	{
		name: 'Two opposed columns',
		desc: 'Minimal clash: two inward signs, P=0, C>0 → a thin vertical jet.',
		element: 'water',
		signs: [columnAt(v2(0.85, 0), 180, 0.6), columnAt(v2(-0.85, 0), 0, 0.6)]
	},
	{
		name: 'Central column — flame shot core',
		desc: 'One column through the center: w≈0 kills convergence → flat directed shot.',
		element: 'fire',
		signs: [columnAt(v2(0, -0.5), 90, 1.0)]
	},
	{
		name: 'Lone rim column — engine',
		desc: 'Edge-case pair, left seal: a column ADDS budget and steers the whole emission → one fast jet (flux law lifts it ~40°; §4 open).',
		element: 'fire',
		signs: [columnAt(v2(0, -0.85), 90, 0.6)]
	},
	{
		name: 'Lone chevron gate — valve',
		desc: 'Edge-case pair, right seal: zero momentum — the bare burst is merely channeled north. Compare the engine.',
		element: 'fire',
		signs: [regionAt(v2(0, -0.9), 90)]
	},
	{
		name: 'Edge: column vs gate — duel',
		desc: 'Column drives south, gate forbids southward flow: budget re-exits up + north. Constraints trump drives; no crash.',
		element: 'fire',
		signs: [columnAt(v2(0, 0.85), 270, 0.5), regionAt(v2(0, -0.9), 90)]
	},
	{
		name: 'Pinwheel — vortex prediction',
		desc: 'Tangential columns: P=0, C=0, Γ=S → pure swirl (+ burst updraft).',
		element: 'wind',
		signs: columnRing(8, 'ccw', 0.5)
	},
	{
		name: 'Region: all inward — collimator',
		desc: 'Demo L1: whole disk manifests, burst is fenced into a vertical column. No column signs!',
		element: 'light',
		signs: regionRing(4, 'in')
	},
	{
		name: 'Region: all outward — moat',
		desc: 'Demo L2: interior forbidden, source relocates to an annulus, fan flows outward.',
		element: 'light',
		signs: regionRing(4, 'out')
	},
	{
		name: 'Region: opposed ring — floating drops',
		desc: 'Demo L3: manifestation pinned to the ring line, rising curtain.',
		element: 'water',
		signs: opposedRing(4)
	},
	{
		name: 'Region: mid-line pairs — curtain',
		desc: 'Demo L4: opposed pairs pin the magic to the diameter stripe.',
		element: 'water',
		signs: midlinePairs()
	},
	{
		name: 'Region: center pin — beam',
		desc: 'Demo L5: crossed pairs collapse the source to a point; exhaust is vertical.',
		element: 'light',
		signs: centerPin()
	},
	{
		name: 'Region: single shutter (1/3 deep)',
		desc: "Demo R3: fence through the sign's line; only the front of the disk manifests, channeled east.",
		element: 'light',
		signs: [regionAt(v2(-0.33, 0), 0)]
	},
	{
		name: 'Region: shutter + stage (R5)',
		desc: 'Rearmost gate (rim) sets the boundary — full disk; the deeper stage adds bias and reach.',
		element: 'light',
		signs: [regionAt(v2(-0.97, 0), 0), regionAt(v2(0.3, 0), 0)]
	},
	{
		name: 'Rising wave — columns + half region',
		desc: 'Balanced columns (vertical C) + west-half chevrons biasing east → diagonal surge.',
		element: 'water',
		signs: [...columnRing(8, 'in', 0.42), ...sealsWaveRegions()]
	},
	{
		name: 'Flame shot — column + side barrels',
		desc: 'Central column (flat P) + 2×5 forward chevrons: collimated, extended beam.',
		element: 'fire',
		signs: [columnAt(v2(0, -0.55), 90, 1.3), ...flameShotStacks()]
	},
	{
		name: 'Pyreball — levitation ×4',
		desc: 'Four inward lev arrows on the diagonals: the force pair grips a churning fire ball at h₀; the burst is recaptured, not rule-suppressed, and the feed stops once the ball is full.',
		element: 'fire',
		signs: levitationRing(4, 0.5, 0.9)
	},
	{
		name: 'Waterball — long signs, higher hover',
		desc: 'Same seal, stems ×1.6: longer stems hover the ball higher (h₀ ∝ λ̄); it fills to capacity (W_max ∝ C_lev), then the feed stops — just a suspended ball.',
		element: 'water',
		signs: levitationRing(4, 0.8, 0.9)
	},
	{
		name: 'Skysoaring — lone lev arrow (readout)',
		desc: 'Wind streams through the grip: wash pours out opposite the arrow, thrust on the substrate points along it (see readout). Movable seal = later chapter.',
		element: 'wind',
		signs: [levitationAt(v2(0, -0.8), 90, 1.6)]
	},
	{
		name: 'Wind lev ring — ground fan (prediction)',
		desc: 'Balanced lev arrows + wind: nothing to grip, the pair pumps air straight up — a fan; the ground takes the downward reaction.',
		element: 'wind',
		signs: levitationRing(4, 0.5, 0.9)
	},

	// ---- pull: the ambient coupling (GROUND_TRUTH §7) ------------------------
	{
		name: 'Grasping wind — pull ring ×4',
		desc: 'Canon ch.14: inward pull arrows sink the ambient medium onto the seal (reversed burst kernel). The grasp pools and charges like a capacitor — at G_max ∝ C_p the pull dies. Pull-only seal: nothing manifests, no shockwave — pure intake.',
		element: 'wind',
		signs: pullRing(4, 'in', 0.5, 0.9)
	},
	{
		name: 'Grasping wind, slanted — apple twist',
		desc: "Tetia's trick: 30° slant trades pull (cos) for twist (sin) — helical inflow turning the way the arrows point, gentler on the tree.",
		element: 'wind',
		signs: pullRing(4, 'in', 0.5, 0.9, 30)
	},
	{
		name: 'Pull pinwheel — pure twist',
		desc: 'The 90° limit of the wiki diagram: C_p=0, pure ambient swirl, zero net inflow — and nothing gathers, so it never self-limits. Pull-only: no shockwave, the ambient swirl is the whole spell.',
		element: 'wind',
		signs: pullRing(4, 'ccw', 0.5, 0.9)
	},
	{
		name: 'Repel ring — inverted pull',
		desc: "Wiki: 'likely pushes'. The sink's exact time-reverse (signed kernel ruling): hemispherical outflow, up on axis, lateral near the plane. Gathers nothing → no capacitor, blows forever.",
		element: 'wind',
		signs: pullRing(4, 'out', 0.5, 0.9)
	},
	{
		name: 'Vacuum snout — pull + barrel',
		desc: 'Region gates the FIELD (§7 ruling): a north barrel on a pull ring clips southward suction — matter is inhaled from the south only, with staged reach, and re-exhausted north (pressure-box). A one-way intake; transiting matter barely charges the grasp.',
		element: 'wind',
		signs: [...pullRing(4, 'in', 0.5, 0.9), regionAt(v2(0, -0.9), 90), regionAt(v2(0, -0.3), 90)]
	},
	{
		name: 'Earth conveyor — wall bend (loose)',
		desc: "Wall bend's two parallel pulls (tails near center, w≈0 → almost pure P_p): ambient earth is caught upstream, carried across the seal, delivered downstream. Canon seal carries extra unmodeled signs.",
		element: 'earth',
		signs: [pullAt(v2(-0.2, 0.1), 270, 0.75), pullAt(v2(0.2, 0.1), 270, 0.75)]
	},
	{
		name: 'Flame burst — column + pull ring',
		desc: 'Canon: pull and column coexist on one ring. The column restores manifestation (a pull-ONLY seal would stay silent): the flame jet fires north while ambient matter is inhaled — decoupled populations counter-stream. Air-as-fuel is cross-element combustion, parked.',
		element: 'fire',
		signs: [columnAt(v2(0, -0.5), 90, 1.0), ...pullRing(4, 'in', 0.5, 0.9)]
	},

	// ---- edge-case probes (todo_edgecases.md): each pins an open question ----
	{
		name: 'Edge: half ring — surge angle probe',
		desc: 'Three inward columns on the south rim: the flux law lifts the surge to ≈43°; clash bookkeeping (V=S−|P|) keeps it nearly flat. The cheapest §9.1 discriminator.',
		element: 'water',
		signs: halfRingColumns()
	},
	{
		name: 'Edge: quadrupole — cancelled ink',
		desc: "2 inward + 2 outward at equal weight: S=1.2 yet P=C=Γ=0. Flux law: a blank ring. Clash law: a vertical jet. A real nozzle: in along x, out along z. First moments can't tell.",
		element: 'wind',
		signs: quadrupoleColumns()
	},
	{
		name: 'Edge: two chevrons — quarter arc',
		desc: 'Inward chevrons at E and N fuse into a FULL ring fence: the naked SW quadrant is collimated too. One chevron = shutter (R2); two = dome — should the fence span only the covered arc?',
		element: 'light',
		signs: [
			regionAt(scale(fromAngle(deg(0)), 0.9), 180),
			regionAt(scale(fromAngle(deg(90)), 0.9), 270)
		]
	},
	{
		name: 'Edge: lev pinwheel — rotor?',
		desc: "Tangential lev arrows: C_lev=0, Γ_lev=1.8. §6 predicts a rotor and §7's spin term isn't gated on C_lev, but the sim nests spin inside the grip — today this is a dud burst.",
		element: 'fire',
		signs: levitationRing(4, 0.5, 0.9, 45, 'ccw')
	},
	{
		name: 'Edge: lopsided grip — lev misfire',
		desc: 'East lev arrow ×2: P_lev points west, the ball displaces EAST (−s·P_lev) — toward the long sign, the mirror of the column misfire which tilts where the long sign points. §9.5: no canon.',
		element: 'water',
		signs: levitationRing(4, 0.5, 0.9, 0, 'in', 0, 2)
	},
	{
		name: 'Edge: inverted lev ring — press or dud?',
		desc: "Outward lev arrows: C_lev<0 grips nothing (§9.6) — today a dud burst, ink wasted. Alternatives: a 'press' pinning the zone onto the substrate, or a repulsor flinging bodies out.",
		element: 'crystal',
		signs: levitationRing(4, 0.5, 0.9, 45, 'out')
	},
	{
		name: 'Edge: fountain vs grip — jet through the ball',
		desc: 'Watershot columns + a lev hold ring: the jet (∝C=3.06) outruns the grip (∝C_lev=1.7), the ball never forms, the feed never stops. Drive-vs-grip composition is unspecified in GROUND_TRUTH.',
		element: 'water',
		signs: [...columnRing(8, 'in'), ...levitationRing(4, 0.5, 0.9)]
	},

	// ---- convergence: the lens (GROUND_TRUTH §8) ------------------------------
	{
		name: 'Floatglow lamp — lev + convergence',
		desc: "Canon (wall-anchored): the pyreball's exact lev ring + four triangles. The lens is the delta — blob radius ÷F, spring ×F, rigidity damps the churn: a smaller, denser, STEADY ball. Same W_max (capacity belongs to C_lev).",
		element: 'light',
		signs: [...levitationRing(4, 0.5, 0.9), ...convergenceRing(4, 0.35, 0.88, 0)]
	},
	{
		name: 'Bare focus — candle plume',
		desc: 'Four triangles and nothing else: the lens pinches the burst toward the axis — a narrow rising plume, faster through the throat. No hold (lens, not focal spring) and no point source (not a spawn pin).',
		element: 'fire',
		signs: convergenceRing(4, 0.35, 0.85, 45)
	},
	{
		name: 'Focused watershot — beam lens',
		desc: 'Watershot ring + four triangles: tube radius ÷F, core speed ×F — a tighter, faster jet (the ancient light beacon rhyme). Region still owns reach; the lens trades width for speed.',
		element: 'water',
		signs: [...columnRing(8, 'in'), ...convergenceRing(4, 0.3, 0.68, 22.5)]
	},
	{
		name: 'Sylph shoes — strut (lev + conv)',
		desc: 'Canon: wind + alternating levitation/convergence. The wash tube narrows and stiffens into a load-bearing strut; the thrust readout is unchanged — the lens shapes, the pair still pumps.',
		element: 'wind',
		signs: [...levitationRing(4, 0.5, 0.9), ...convergenceRing(4, 0.35, 0.88, 0)]
	},
	{
		name: 'Focused intake — pull + conv',
		desc: "Seal-wide lens ruling: u_amb is the spell's own magic acting at a distance, so the lens focuses it too — the intake throat narrows and turns axial: ambient matter rains down the axis instead of streaming in along the plane.",
		element: 'wind',
		signs: [...pullRing(4, 'in', 0.5, 0.9), ...convergenceRing(4, 0.35, 0.88, 0)]
	},

	// ---- orb: the vessel (GROUND_TRUTH §9) ------------------------------------
	{
		name: 'Water Orb — canon cup',
		desc: 'Canon ch.53: two balanced columns + four orbs. The seal is silent (manipulate mode) — the vessel captures the column budget, C₊ lifts the invisible sphere. Poured water is contained through the one-way shell, pools bottom-up (gravity is local law inside), and is held indefinitely.',
		element: 'water',
		signs: [columnAt(v2(-0.8, 0), 0, 0.55), columnAt(v2(0.8, 0), 180, 0.55), ...orbCorners()],
		pour: true
	},
	{
		name: 'Bare cup — orb only',
		desc: 'Four orbs and nothing else: no columns, so the sphere rests tangent on the disk, and the seal emits nothing — an empty invisible cup until the pour arrives. Ambient haze that happened to sit inside condenses (population-blind shell).',
		element: 'water',
		signs: orbCorners(),
		pour: true
	},
	{
		name: 'Lopsided cup — one column',
		desc: 'One west-rim column pointing east: no jet fires — the captured aggregate parks the vessel along +P̂ (east, the aim reading: where the jet would have gone; §12.15, no canon) and lifts it by C₊.',
		element: 'water',
		signs: [columnAt(v2(-0.85, 0), 0, 0.6), ...orbCorners()],
		pour: true
	},
	{
		name: 'Self-filling canteen — orb + pull',
		desc: 'Prediction: the intake delivers ambient water through the one-way shell. Contained matter counts against G_max (the shell is a raised grasp), so the intake throttles as the cup fills — self-limiting, like every grasp.',
		element: 'water',
		signs: [...orbCorners(4, 0.26, 0.62, 0), ...pullRing(4, 'in', 0.5, 0.9)]
	},
	{
		name: 'Stirred cup — orb + pinwheel',
		desc: 'Tangential columns on a vessel: the WHOLE aggregate re-reads — P and C₊ place the sphere, Γ stirs it. The poured water circulates about the axis instead of settling still (prediction).',
		element: 'water',
		signs: [...columnRing(8, 'ccw', 0.5), ...orbCorners()],
		pour: true
	},
	{
		name: 'Focused cup — orb + convergence',
		desc: 'The lens divides every envelope width (§8): the vessel shrinks to r/F — a smaller, denser cup of the same pour. The speed boost has nothing to act on: nothing flows.',
		element: 'water',
		signs: [...orbCorners(), ...convergenceRing(4, 0.35, 0.88, 0)],
		pour: true
	},
	{
		name: 'Edge: overfill — thimble cup',
		desc: 'Four tiny orbs, the same bottle: capacity is geometric (§9, excluded volume) — a full shell has no room, arrivals are rejected at the packed surface and spill down the outside. No capacity constant anywhere.',
		element: 'water',
		signs: orbCorners(4, 0.03, 0.62, 45),
		pour: true
	}
];
