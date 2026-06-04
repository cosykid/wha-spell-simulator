import { randomBetween } from '../../utils/geometry.js';
import {
	activePortalPlane,
	convergePoint,
	effectOpacity,
	effectScale,
	elementFlow,
	narrowedByFocusAndConvergence,
	particleAlpha,
	particleDepth,
	pruneParticles,
	randomPortalPoint,
	scaledParticleCount,
	steadyParticleAlpha
} from './effectUtils.js';
import type { AppConfig, RingInfo, Vector } from '../../types.js';
import type { RenderSpellIR, EffectState, Particle, Portal, ElementFlow } from './effectUtils.js';

// ---------------------------------------------------------------------------
// Light-specific flow config
// ---------------------------------------------------------------------------

interface LightFlowConfig extends ElementFlow {
	sourceRadiusX: number;
	sourceRadiusY: number;
	speed: number;
	sideJitter: number;
	laneCohesion: number;
	lateralDamping: number;
	trailLength: number;
}

interface LightParticle extends Particle {
	sourceX: number;
	sourceY: number;
	speed: number;
	travel: number;
	trail: Vector[];
}

// ---------------------------------------------------------------------------
// Flow config
// ---------------------------------------------------------------------------

function lightFlowConfig(
	spellIR: RenderSpellIR,
	ring: RingInfo,
	portal: Portal,
	frame: number
): LightFlowConfig {
	const flow = elementFlow(spellIR, portal, frame);
	const { scale, focus, convergence } = flow;

	return {
		...flow,
		sourceRadiusX: narrowedByFocusAndConvergence(
			Math.min(0.92, 0.46 + scale * 0.1 + spellIR.spread * 0.2),
			focus,
			convergence.strength,
			0.28,
			0.3
		),
		sourceRadiusY: narrowedByFocusAndConvergence(
			Math.min(0.92, 0.52 + scale * 0.08 + spellIR.spread * 0.18),
			focus,
			convergence.strength,
			0.28,
			0.3
		),
		speed: (1.85 + spellIR.force * 3.2) * (0.9 + scale * 0.1) * (1 - convergence.strength * 0.26),
		sideJitter: narrowedByFocusAndConvergence(
			ring.radius * (0.006 + spellIR.spread * 0.018) * scale,
			focus,
			convergence.strength,
			0.4,
			0.34
		),
		laneCohesion: 0.074 + spellIR.stability * 0.06 + convergence.progress * 0.04 + focus * 0.04,
		lateralDamping: 0.22 + spellIR.stability * 0.24 + convergence.progress * 0.22 + focus * 0.14,
		trailLength: Math.round(17 + spellIR.stability * 10)
	};
}

// ---------------------------------------------------------------------------
// Spawn
// ---------------------------------------------------------------------------

function spawnLightParticle(
	spellIR: RenderSpellIR,
	ring: RingInfo,
	portal: Portal,
	flow: LightFlowConfig
): LightParticle {
	const scale = effectScale(spellIR);
	const source = randomPortalPoint(portal, flow.sourceRadiusX, flow.sourceRadiusY);
	const x = source.x + flow.side.x * randomBetween(-flow.sideJitter, flow.sideJitter);
	const y = source.y + flow.side.y * randomBetween(-flow.sideJitter, flow.sideJitter);
	const speed = randomBetween(0.82, 1.18) * flow.speed;
	const phase = randomBetween(0, Math.PI * 2);

	return {
		x,
		y,
		sourceX: source.x,
		sourceY: source.y,
		vx: flow.direction.x * speed + flow.side.x * randomBetween(-0.025, 0.025) * scale,
		vy: flow.direction.y * speed + flow.side.y * randomBetween(-0.025, 0.025) * scale,
		speed,
		radius: randomBetween(4.4, 8.6) * (0.86 + scale * 0.2),
		phase,
		travel: 0,
		age: 0,
		life: flow.convergence.active
			? flow.convergence.life
			: randomBetween(76, 132) * (0.86 + spellIR.stability * 0.34),
		trail: new Array(flow.trailLength).fill(null).map(() => ({ x, y }))
	};
}

// ---------------------------------------------------------------------------
// Update
// ---------------------------------------------------------------------------

function updateLightParticle(particle: LightParticle, flow: LightFlowConfig, dt: number): void {
	particle.age += dt;
	particle.travel += particle.speed * dt;

	const targetX = particle.sourceX + flow.direction.x * particle.travel;
	const targetY = particle.sourceY + flow.direction.y * particle.travel;
	const lateralVelocity = particle.vx * flow.side.x + particle.vy * flow.side.y;

	particle.vx += (targetX - particle.x) * flow.laneCohesion * dt;
	particle.vy += (targetY - particle.y) * flow.laneCohesion * dt;
	particle.vx -= flow.side.x * lateralVelocity * flow.lateralDamping * dt;
	particle.vy -= flow.side.y * lateralVelocity * flow.lateralDamping * dt;
	particle.x += particle.vx * dt;
	particle.y += particle.vy * dt;
	particle.vx *= 0.992 - flow.convergence.progress * 0.045;
	particle.vy *= 0.992 - flow.convergence.progress * 0.045;

	particle.trail.unshift({ x: particle.x, y: particle.y });
	particle.trail.length = flow.trailLength;
}

// ---------------------------------------------------------------------------
// Draw helpers
// ---------------------------------------------------------------------------

function traceLightTrail(
	ctx: CanvasRenderingContext2D,
	trail: Vector[],
	flow: LightFlowConfig,
	phase: number
): void {
	if (!trail?.length) {
		return;
	}

	const projectedTrail = trail.map((point, index) =>
		convergePoint(point, flow.convergence, phase + index * 0.13, 0.9)
	);
	ctx.beginPath();
	ctx.moveTo(projectedTrail[0].x, projectedTrail[0].y);
	for (let index = 1; index < projectedTrail.length - 1; index += 1) {
		const current = projectedTrail[index];
		const next = projectedTrail[index + 1];
		ctx.quadraticCurveTo(current.x, current.y, (current.x + next.x) / 2, (current.y + next.y) / 2);
	}

	const last = projectedTrail[projectedTrail.length - 1];
	ctx.lineTo(last.x, last.y);
}

function drawLightStream(
	ctx: CanvasRenderingContext2D,
	particle: LightParticle,
	spellIR: RenderSpellIR,
	flow: LightFlowConfig
): void {
	const depth = particleDepth(particle);
	const alpha = flow.convergence.active
		? steadyParticleAlpha(particle, spellIR, 10)
		: particleAlpha(particle) * Math.min(1, particle.age / 8) * effectOpacity(spellIR);
	const lineWidth =
		particle.radius *
		(1.35 + depth * 0.46) *
		(0.92 + spellIR.force * 0.22) *
		(1 - flow.convergence.progress * 0.22);

	ctx.save();
	ctx.lineCap = 'round';
	ctx.lineJoin = 'round';
	ctx.strokeStyle = `rgba(255, 249, 180, ${alpha * 0.11})`;
	ctx.lineWidth = lineWidth * 6.4;
	traceLightTrail(ctx, particle.trail, flow, particle.phase);
	ctx.stroke();

	ctx.strokeStyle = `rgba(255, 249, 180, ${alpha * 0.26})`;
	ctx.lineWidth = lineWidth * 2.6;
	traceLightTrail(ctx, particle.trail, flow, particle.phase);
	ctx.stroke();

	ctx.strokeStyle = `rgba(255, 249, 180, ${alpha * 0.36})`;
	ctx.lineWidth = Math.max(1, lineWidth * 0.72);
	traceLightTrail(ctx, particle.trail, flow, particle.phase);
	ctx.stroke();
	ctx.restore();
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function drawLightEffect(
	ctx: CanvasRenderingContext2D,
	state: EffectState,
	spellIR: RenderSpellIR,
	ring: RingInfo,
	dt: number,
	config: AppConfig
): void {
	const scale = effectScale(spellIR);
	const portal = activePortalPlane(ctx.canvas, ring);
	state.lightFrame = ((state.lightFrame as number | undefined) ?? 0) + dt;
	const flow = lightFlowConfig(spellIR, ring, portal, state.lightFrame as number);
	const targetCount = scaledParticleCount(
		(34 + spellIR.force * 38) * (0.78 + scale * 0.28),
		spellIR,
		config
	);

	while (state.particles.length < targetCount) {
		state.particles.push(spawnLightParticle(spellIR, ring, portal, flow));
	}

	for (const particle of state.particles) {
		updateLightParticle(particle as LightParticle, flow, dt);
		drawLightStream(ctx, particle as LightParticle, spellIR, flow);
	}

	pruneParticles(state);
}
