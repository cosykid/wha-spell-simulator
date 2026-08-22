import { perpendicularVector, randomBetween } from '../../utils/geometry.js';
import { activePortalPlane } from '../../portal/portal.js';
import {
	boltBurst,
	convergePoint,
	effectOpacity,
	effectScale,
	elementFlow,
	emissionDirection,
	emissionModifier,
	narrowedByFocusAndConvergence,
	particleAlpha,
	particleDepth,
	pruneParticles,
	randomPortalPoint,
	scaledParticleCount,
	steadyParticleAlpha
} from './effectUtils.js';
import type { AppConfig, RingInfo } from '../../types.js';
import type { Portal } from '../../portal/portal.js';
import type {
	RenderSpellIR,
	EffectState,
	Particle,
	ElementFlow,
	EmissionModifier
} from './effectUtils.js';

// ---------------------------------------------------------------------------
// Wind-specific flow config
// ---------------------------------------------------------------------------

interface WindFlowConfig extends ElementFlow {
	sourceRadiusX: number;
	sourceRadiusY: number;
	surfaceJitter: number;
	speed: number;
	mod: EmissionModifier;
}

interface WindParticle extends Particle {
	curl: number;
}

// ---------------------------------------------------------------------------
// Flow config
// ---------------------------------------------------------------------------

function windFlowConfig(
	spellIR: RenderSpellIR,
	ring: RingInfo,
	portal: Portal,
	frame: number
): WindFlowConfig {
	const flow = elementFlow(spellIR, portal, frame);
	const { scale, focus, convergence } = flow;

	return {
		...flow,
		sourceRadiusX: narrowedByFocusAndConvergence(
			Math.min(0.92, 0.44 + scale * 0.1 + spellIR.spread * 0.24),
			focus,
			convergence.strength,
			0.3,
			0.28
		),
		sourceRadiusY: narrowedByFocusAndConvergence(
			Math.min(0.92, 0.5 + scale * 0.08 + spellIR.spread * 0.22),
			focus,
			convergence.strength,
			0.3,
			0.28
		),
		surfaceJitter: narrowedByFocusAndConvergence(
			ring.radius * (0.04 + spellIR.spread * 0.1) * scale,
			focus,
			convergence.strength,
			0.42,
			0.34
		),
		speed:
			randomBetween(2.4, 5.2) *
			(0.6 + spellIR.force) *
			(0.88 + scale * 0.12) *
			(1 - convergence.strength * 0.28) *
			// Aeroform is a slow, drifting gas rather than a sharp gust.
			(spellIR.sigil === 'aeroform' ? 0.72 : 1),
		mod: emissionModifier(spellIR)
	};
}

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

function spawnWindParticle(
	spellIR: RenderSpellIR,
	portal: Portal,
	flow: WindFlowConfig
): WindParticle {
	const source = randomPortalPoint(portal, flow.sourceRadiusX, flow.sourceRadiusY);
	const phase = randomBetween(0, Math.PI * 2);
	const emitDir = emissionDirection(flow.direction, flow.mod);
	const emitSide = perpendicularVector(emitDir);
	const jitter = randomBetween(-0.22, 0.22) * flow.scale * flow.mod.jitterMul;

	return {
		x: source.x + emitSide.x * randomBetween(-flow.surfaceJitter, flow.surfaceJitter),
		y: source.y + emitSide.y * randomBetween(-flow.surfaceJitter, flow.surfaceJitter),
		vx: emitDir.x * flow.speed * flow.mod.speedMul + emitSide.x * jitter,
		vy: emitDir.y * flow.speed * flow.mod.speedMul + emitSide.y * jitter,
		curl:
			randomBetween(-0.018, 0.018) *
			(1 + (1 - spellIR.stability) * 3) *
			// Wind Underfoot rolls and swirls low along the surface.
			(spellIR.sigil === 'wind-underfoot' ? 2.2 : 1),
		phase,
		age: 0,
		life: flow.convergence.active
			? flow.convergence.life
			: randomBetween(38, 76) * flow.mod.lifeMul,
		radius: 0
	};
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function drawWindEffect(
	ctx: CanvasRenderingContext2D,
	state: EffectState,
	spellIR: RenderSpellIR,
	ring: RingInfo,
	dt: number,
	config: AppConfig
): void {
	const scale = effectScale(spellIR);
	const opacity = effectOpacity(spellIR);
	const portal = activePortalPlane(ctx.canvas, ring, spellIR.portalFit);
	state.windFrame = ((state.windFrame as number | undefined) ?? 0) + dt;
	const flow = windFlowConfig(spellIR, ring, portal, state.windFrame as number);
	const targetCount = Math.round(
		scaledParticleCount((92 + spellIR.force * 104) * (0.82 + scale * 0.32), spellIR, config) *
			boltBurst(state.windFrame as number, flow.mod.bolt)
	);
	while (state.particles.length < targetCount) {
		state.particles.push(spawnWindParticle(spellIR, portal, flow));
	}

	// Per-variant palette so aeroform reads pale and gaseous and wind-underfoot reads earthy.
	const variant = spellIR.sigil;
	const outerColor =
		variant === 'aeroform'
			? '205, 232, 240'
			: variant === 'wind-underfoot'
				? '150, 205, 160'
				: '184, 232, 215';
	const innerColor =
		variant === 'aeroform'
			? '240, 250, 255'
			: variant === 'wind-underfoot'
				? '205, 240, 200'
				: '224, 248, 231';
	const outerWidthMul = variant === 'aeroform' ? 3.4 : 2.7;
	const variantAlphaMul = variant === 'aeroform' ? 0.72 : 1;

	ctx.lineCap = 'round';
	for (const particle of state.particles) {
		const wp = particle as WindParticle;
		wp.age += dt;
		const oldX = wp.x;
		const oldY = wp.y;
		wp.vx += -wp.vy * wp.curl * dt;
		wp.vy += wp.vx * wp.curl * dt;
		wp.x += wp.vx * dt;
		wp.y += wp.vy * dt;
		wp.vx *= 1 - flow.convergence.progress * 0.045;
		wp.vy *= 1 - flow.convergence.progress * 0.045;

		const depth = particleDepth(wp);
		const alpha = flow.convergence.active
			? steadyParticleAlpha(wp, spellIR, 10) * (0.78 + depth * 0.2)
			: particleAlpha(wp) * (0.78 + depth * 0.2) * opacity;
		const lineWidth = (2.5 + spellIR.force * 3) * (0.88 + scale * 0.22) * (0.9 + depth * 0.64);
		const start = convergePoint({ x: oldX, y: oldY }, flow.convergence, wp.phase, 1.1);
		const end = convergePoint(wp, flow.convergence, wp.phase + 0.27, 1.1);

		ctx.strokeStyle = `rgba(${outerColor}, ${alpha * 0.22 * variantAlphaMul})`;
		ctx.lineWidth = lineWidth * outerWidthMul;
		ctx.beginPath();
		ctx.moveTo(start.x, start.y);
		ctx.lineTo(end.x, end.y);
		ctx.stroke();

		ctx.strokeStyle = `rgba(${innerColor}, ${alpha * 0.86 * variantAlphaMul})`;
		ctx.lineWidth = lineWidth;
		ctx.beginPath();
		ctx.moveTo(start.x, start.y);
		ctx.lineTo(end.x, end.y);
		ctx.stroke();
	}

	pruneParticles(state);
}
