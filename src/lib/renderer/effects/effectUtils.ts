import { clamp, normalizeVector, perpendicularVector } from '../../utils/geometry.js';
import type { AppConfig, SpellIR, RingInfo, Vector } from '../../types.js';

// ---------------------------------------------------------------------------
// Render-time SpellIR extension
// ---------------------------------------------------------------------------

/**
 * The effect draw functions receive the compiled SpellIR augmented with two
 * runtime scalars that spellEffectRenderer spreads into a copy of the SpellIR
 * before passing it to element effects:
 * - `emission` (0..1) fades the effect out at end-of-duration.
 * - `portalFit` (0..1) scales the portal tilt's vertical metrics back onto the
 *   visible area on landscape, matching the CSS (see {@link activePortalPlane}).
 *   Defaults to 1 (canvas fills the viewport).
 */
export type RenderSpellIR = SpellIR & { emission?: number; portalFit?: number };

// ---------------------------------------------------------------------------
// Shared particle / portal types used across element effects
// ---------------------------------------------------------------------------

/** A screen-space elliptical portal from which effects emit. */
export interface Portal {
	center: Vector;
	radiusX: number;
	radiusY: number;
	scaleY: number;
}

/** State produced by convergenceFlow, shared by element flow configs. */
export interface ConvergenceFlow {
	active: boolean;
	strength: number;
	progress: number;
	rigidity: number;
	origin: Vector;
	direction: Vector;
	side: Vector;
	radiusX: number;
	radiusY: number;
	life: number;
}

/** Common element flow fields returned by elementFlow(). */
export interface ElementFlow {
	direction: Vector;
	side: Vector;
	scale: number;
	focus: number;
	convergence: ConvergenceFlow;
}

/** Minimal particle shape shared by all effects. */
export interface Particle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	radius: number;
	phase: number;
	[key: string]: unknown;
}

/** Per-effect mutable render state stored on the SpellEffectRenderer. */
export interface EffectState {
	particles: Particle[];
	[key: string]: unknown;
}

// ---------------------------------------------------------------------------
// State helpers
// ---------------------------------------------------------------------------

export function resetParticleState(state: EffectState): void {
	for (const key of Object.keys(state)) {
		delete state[key];
	}
	state.particles = [];
}

// ---------------------------------------------------------------------------
// Per-particle alpha helpers
// ---------------------------------------------------------------------------

export function particleAlpha(particle: Particle): number {
	return clamp(1 - particle.age / particle.life);
}

export function steadyParticleAlpha(
	particle: Particle,
	spellIR: RenderSpellIR,
	fadeInFrames: number = 10
): number {
	return Math.min(1, particle.age / fadeInFrames) * effectOpacity(spellIR);
}

// ---------------------------------------------------------------------------
// SpellIR-derived scalars
// ---------------------------------------------------------------------------

export function spellLifetimeFrames(spellIR: RenderSpellIR, extraFrames: number = 36): number {
	const durationSeconds = Number(spellIR?.duration);
	return Number.isFinite(durationSeconds) && durationSeconds > 0
		? durationSeconds * 60 + extraFrames
		: 600;
}

export function effectScale(spellIR: RenderSpellIR): number {
	return Math.max(1, spellIR?.effectScale ?? 1);
}

export function effectOpacity(spellIR: RenderSpellIR): number {
	return clamp(spellIR?.emission ?? 1);
}

export function effectGravity(spellIR: RenderSpellIR): number {
	return clamp(spellIR?.gravity ?? 1);
}

export function effectFocus(spellIR: RenderSpellIR): number {
	return clamp(spellIR?.focus ?? 0.5);
}

export function effectSuspension(spellIR: RenderSpellIR): number {
	return 1 - effectGravity(spellIR);
}

// ---------------------------------------------------------------------------
// Shared element flow: SpellIR direction, focus, scale, and convergence are the base for every element effect.
// ---------------------------------------------------------------------------

export function elementFlow(spellIR: RenderSpellIR, portal: Portal, frame: number): ElementFlow {
	const direction = portalOutDirection(spellIR);
	return {
		direction,
		side: perpendicularVector(direction),
		scale: effectScale(spellIR),
		focus: effectFocus(spellIR),
		convergence: convergenceFlow(spellIR, portal, frame)
	};
}

// Focus narrows the source area. Convergence narrows it further so compressed effects do not keep spawning wide.
export function narrowedByFocusAndConvergence(
	value: number,
	focus: number,
	convergenceStrength: number,
	focusWeight: number,
	convergenceWeight: number
): number {
	return value * (1 - convergenceStrength * convergenceWeight) * (1 - focus * focusWeight);
}

// ---------------------------------------------------------------------------
// Convergence
// ---------------------------------------------------------------------------

function manifestationStrength(spellIR: RenderSpellIR, id: string): number {
	return clamp(spellIR?.manifestations?.[id]?.strength ?? 0);
}

function smoothstep(value: number): number {
	const clamped = clamp(value);
	return clamped * clamped * (3 - 2 * clamped);
}

interface ConvergenceManifestation {
	point?: { x?: number; y?: number };
	radius?: number;
	rigidity?: number;
	strength?: number;
}

function effectConvergence(spellIR: RenderSpellIR): {
	strength: number;
	point: Vector;
	radius: number;
	rigidity: number;
} {
	const convergence = (spellIR?.manifestations?.convergence ?? {}) as ConvergenceManifestation;
	const strength = manifestationStrength(spellIR, 'convergence');
	return {
		strength,
		point: {
			x: clamp(convergence.point?.x ?? 0, -1, 1),
			y: clamp(convergence.point?.y ?? 0, -1, 1)
		},
		radius: clamp(convergence.radius ?? 0.14, 0.03, 0.6),
		rigidity: clamp(convergence.rigidity ?? strength)
	};
}

export function convergenceFlow(
	spellIR: RenderSpellIR,
	portal: Portal,
	frame: number
): ConvergenceFlow {
	const convergence = effectConvergence(spellIR);
	const active = convergence.strength > 0.001;
	const lifetime = spellLifetimeFrames(spellIR, 0);
	const shrinkFrames = Math.max(18, lifetime * 0.26);
	const progress = active ? convergence.strength * smoothstep(frame / shrinkFrames) : 0;
	const direction = portalOutDirection(spellIR);
	const side = perpendicularVector(direction);
	const origin = {
		x:
			portal.center.x +
			side.x * convergence.point.x * portal.radiusX +
			direction.x * convergence.point.y * portal.radiusY,
		y:
			portal.center.y +
			side.y * convergence.point.x * portal.radiusX +
			direction.y * convergence.point.y * portal.radiusY
	};

	return {
		active,
		strength: convergence.strength,
		progress,
		rigidity: convergence.rigidity,
		origin,
		direction,
		side,
		radiusX: portal.radiusX * convergence.radius,
		radiusY: portal.radiusY * convergence.radius,
		life: lifetime + 36
	};
}

// Convergence keeps the current forward motion and compresses only the sideways spread around that path.
export function convergePoint(
	point: Vector,
	convergence: ConvergenceFlow,
	phase: number = 0,
	radiusScale: number = 1
): Vector {
	if (!convergence?.active || convergence.progress <= 0) {
		return point;
	}

	const finalSpread = 0.18 + (1 - convergence.rigidity) * 0.28;
	const remainingSpread = finalSpread + (1 - convergence.progress) * (1 - finalSpread);
	const relative = {
		x: point.x - convergence.origin.x,
		y: point.y - convergence.origin.y
	};
	const forward = relative.x * convergence.direction.x + relative.y * convergence.direction.y;
	const centerline = {
		x: convergence.origin.x + convergence.direction.x * forward,
		y: convergence.origin.y + convergence.direction.y * forward
	};
	const compressed = {
		x:
			centerline.x +
			convergence.side.x * Math.cos(phase) * convergence.radiusX * remainingSpread * radiusScale,
		y:
			centerline.y +
			convergence.side.y *
				Math.sin(phase * 1.37) *
				convergence.radiusY *
				remainingSpread *
				radiusScale
	};

	return {
		x: point.x + (compressed.x - point.x) * convergence.progress,
		y: point.y + (compressed.y - point.y) * convergence.progress
	};
}

// ---------------------------------------------------------------------------
// Dispersion & bolt manifestations
//
// These two manifestations reshape emission for every element effect through a
// small shared modifier, so a `dispersion` or `bolt` sign behaves consistently
// regardless of the sigil it is paired with.
// ---------------------------------------------------------------------------

export function effectDispersion(spellIR: RenderSpellIR): number {
	return manifestationStrength(spellIR, 'dispersion');
}

export function effectBolt(spellIR: RenderSpellIR): number {
	return manifestationStrength(spellIR, 'bolt');
}

/** Shared per-particle emission shaping derived from dispersion and bolt. */
export interface EmissionModifier {
	dispersion: number;
	bolt: number;
	/** Speed multiplier — bolt loosed particles travel faster. */
	speedMul: number;
	/** Lifetime multiplier — bolt particles are short streaks that shoot and fade. */
	lifeMul: number;
	/** Lateral jitter multiplier — bolt tightens the spray into a focused line. */
	jitterMul: number;
}

export function emissionModifier(spellIR: RenderSpellIR): EmissionModifier {
	const dispersion = effectDispersion(spellIR);
	const bolt = effectBolt(spellIR);
	return {
		dispersion,
		bolt,
		speedMul: 1 + bolt * 1.5,
		lifeMul: 1 - bolt * 0.52,
		jitterMul: 1 - bolt * 0.66
	};
}

// Particles sprayed by dispersion sit on the same tilted portal plane the ring
// is drawn on, so the vertical component of a random outward direction is
// squashed to match that foreshortening.
const PORTAL_PLANE_Y_SQUASH = 0.55;

/**
 * Per-particle emission direction. With no dispersion this is the spell's
 * forward direction; dispersion blends it toward a random outward direction on
 * the portal plane so the element pours out on all sides at once.
 */
export function emissionDirection(base: Vector, mod: EmissionModifier): Vector {
	if (mod.dispersion <= 0) {
		return base;
	}
	const angle = Math.random() * Math.PI * 2;
	const radial = normalizeVector({
		x: Math.cos(angle),
		y: Math.sin(angle) * PORTAL_PLANE_Y_SQUASH
	});
	return normalizeVector({
		x: base.x + (radial.x - base.x) * mod.dispersion,
		y: base.y + (radial.y - base.y) * mod.dispersion
	});
}

/**
 * Population pulse for the bolt manifestation. Returns a 0..1 multiplier on the
 * target particle count so emission arrives in rhythmic volleys rather than a
 * steady stream; combined with the shortened bolt lifetime this reads as
 * discrete projectiles.
 */
export function boltBurst(frame: number, bolt: number): number {
	if (bolt <= 0) {
		return 1;
	}
	const pulse = 0.5 + 0.5 * Math.sin(frame * 0.12);
	return 1 - bolt * 0.82 * pulse;
}

// ---------------------------------------------------------------------------
// Particle count
// ---------------------------------------------------------------------------

export function scaledParticleCount(
	baseCount: number,
	spellIR: RenderSpellIR,
	config: AppConfig
): number {
	return Math.min(config.renderer.particleCap, Math.round(baseCount * effectOpacity(spellIR)));
}

// ---------------------------------------------------------------------------
// Portal geometry
//
// On activation the paper is shrunk and tilted back by CSS (see `.portal-active`
// in styles/canvas.css). These constants mirror that transform so effects — drawn
// flat and anchored to the ring in canvas space — land on the same on-screen
// portal. Keep them in sync with canvas.css:
//   PORTAL_SHRINK   <-> scale()                 PORTAL_SCALE_Y <-> rotateX(62deg)
//   PORTAL_ORIGIN_Y <-> transform-origin y      PORTAL_LIFT_Y  <-> translateY
//
// The CSS scales its vertical metrics by `var(--portal-fit)` so the tilt stays on
// screen on landscape. The functions below take the same `portalFit` (default 1)
// and apply it to PORTAL_ORIGIN_Y and PORTAL_LIFT_Y to track the CSS.
// ---------------------------------------------------------------------------

export const PORTAL_SHRINK = 0.45;
const PORTAL_SCALE_Y = 0.44;
const PORTAL_ORIGIN_Y = 0.64;
const PORTAL_LIFT_Y = 0.1;

// The portal tilt's vertical pivot as a canvas-height fraction. Written as an
// offset from centre scaled by portalFit so it tracks the CSS transform-origin
// (50% + 14% * --portal-fit). portalFit 1 reproduces the fixed PORTAL_ORIGIN_Y.
function portalOriginY(canvas: HTMLCanvasElement, portalFit: number): number {
	return canvas.height * (0.5 + (PORTAL_ORIGIN_Y - 0.5) * portalFit);
}

/**
 * Shrinks a ring toward the portal tilt origin by {@link PORTAL_SHRINK}, mirroring
 * the CSS `scale()` on the activated paper. Effects are anchored to the ring in
 * canvas space, so feeding them the scaled ring shrinks the whole effect — base
 * ellipse and every radius-derived plume size — onto the smaller portal at once.
 */
export function portalScaledRing(
	ring: RingInfo,
	canvas: HTMLCanvasElement,
	portalFit: number = 1
): RingInfo {
	const originX = canvas.width / 2;
	const originY = portalOriginY(canvas, portalFit);
	return {
		...ring,
		center: {
			x: originX + (ring.center.x - originX) * PORTAL_SHRINK,
			y: originY + (ring.center.y - originY) * PORTAL_SHRINK
		},
		radius: ring.radius * PORTAL_SHRINK
	};
}

// The activated paper is drawn as a tilted ellipse, so effects emit from that same screen-space portal.
export function activePortalPlane(
	canvas: HTMLCanvasElement,
	ring: RingInfo,
	portalFit: number = 1
): Portal {
	const originY = portalOriginY(canvas, portalFit);
	const liftY = canvas.height * PORTAL_LIFT_Y * portalFit;
	return {
		center: {
			x: ring.center.x,
			y: originY + (ring.center.y - originY) * PORTAL_SCALE_Y + liftY
		},
		radiusX: ring.radius,
		radiusY: ring.radius * PORTAL_SCALE_Y,
		scaleY: PORTAL_SCALE_Y
	};
}

export function randomPortalPoint(
	portal: Portal,
	radiusXScale: number = 1,
	radiusYScale: number = radiusXScale
): Vector {
	const angle = Math.random() * Math.PI * 2;
	const radius = Math.sqrt(Math.random());
	return {
		x: portal.center.x + Math.cos(angle) * portal.radiusX * radiusXScale * radius,
		y: portal.center.y + Math.sin(angle) * portal.radiusY * radiusYScale * radius
	};
}

// ---------------------------------------------------------------------------
// Direction helpers
// ---------------------------------------------------------------------------

// Convert paper-local x/y/z direction into screen space. Positive z points out of the paper toward the top.
export function portalOutDirection(spellIR: RenderSpellIR): Vector {
	const direction = spellIR?.direction ?? ({} as RenderSpellIR['direction']);
	const paperX = direction.x ?? 0;
	const paperY = direction.y ?? -1;
	const paperZ = direction.z ?? 0;

	return normalizeVector({
		x: paperX,
		y: paperY * PORTAL_SCALE_Y - paperZ
	});
}

// ---------------------------------------------------------------------------
// Particle utilities
// ---------------------------------------------------------------------------

export function particleDepth(particle: Particle): number {
	return clamp(particle.age / Math.max(1, particle.life));
}

export function pruneParticles(state: EffectState): void {
	state.particles = state.particles.filter((particle) => particle.age < particle.life);
}
