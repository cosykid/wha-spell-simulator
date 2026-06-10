import { clamp, randomBetween } from '../../utils/geometry.js';
import {
	convergePoint,
	effectGravity,
	effectOpacity,
	effectSuspension,
	elementFlow,
	particleAlpha,
	spellLifetimeFrames,
	steadyParticleAlpha
} from './effectUtils.js';
import { ElementEffect } from './elementEffect.js';
import type { AppConfig, RingInfo, Vector } from '../../types.js';
import type { ElementFlow, Particle, Portal, RenderSpellIR } from './effectUtils.js';

const DEPTH_SCALE = 0.58;
const WATER_ALPHA_SCALE = 0.58;

// Renderer-only flow controls translated from SpellIR values. These knobs stay out of the public IR.
interface WaterFlowConfig extends ElementFlow {
	suspended: boolean;
	gravity: number;
	suspension: number;
	directionCoherence: number;
	converging: boolean;
	convergenceProgress: number;
	sourceRadiusX: number;
	sourceRadiusY: number;
	horizontalSpeed: number;
	verticalSpeed: number;
	gravityForce: number;
	streamLength: number;
	streamDepth: number;
	lateralPush: number;
	depthPush: number;
	maxHeightHint: number;
	suspendedLife: number;
	suspendedHeight: number;
	suspendedRadius: number;
	suspendedBob: number;
	suspendedWander: number;
	suspendedTension: number;
	suspendedDamping: number;
	minRadius: number;
	radiusScale: number;
}

/** Water particle with 3D-ish local coordinates (forward, height, depth, lateral). */
interface WaterParticle extends Particle {
	sourceX: number;
	sourceY: number;
	forward: number;
	height: number;
	depth: number;
	lateral: number;
	vForward: number;
	vHeight: number;
	vDepth: number;
	vLateral: number;
	baseRadius: number;
	homeForward?: number;
	homeHeight?: number;
	homeDepth?: number;
	homeLateral?: number;
}

interface VisibleWaterParticle {
	projected: Vector;
	alpha: number;
}

export class WaterEffect extends ElementEffect<WaterParticle, WaterFlowConfig> {
	protected createFlow(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		frame: number
	): WaterFlowConfig {
		const flow = elementFlow(spellIR, portal, frame);
		const { scale, focus, convergence, mod } = flow;
		const gravity = effectGravity(spellIR);
		const suspension = effectSuspension(spellIR);
		const directionIR = spellIR.direction ?? ({} as RenderSpellIR['direction']);
		const directionCoherence = clamp(
			spellIR.directionCoherence ?? Math.hypot(directionIR.x ?? 0, directionIR.y ?? 0)
		);
		const convergenceStrength = convergence.strength;
		const convergenceProgress = convergence.progress;
		// Dispersion widens the spilling source and weakens the forward jet so the
		// water pours out on all sides; bolt speeds the stream up via the modifier.
		const dispersionWiden = 1 + mod.dispersion * 0.7;
		const dispersionPush = 1 + mod.dispersion * 1.3;
		const dispersionForward = 1 - mod.dispersion * 0.45;
		const horizontalShare = clamp(Math.hypot(directionIR.x ?? 0, directionIR.y ?? 0));
		const verticalShare = clamp(directionIR.z ?? 1);
		const sourceScale =
			Math.min(0.72, (0.22 + scale * 0.06 + spellIR.spread * 0.18) * dispersionWiden) *
			(1 - convergenceStrength * 0.36) *
			(1 - focus * 0.24);
		const pressure = (3.15 + spellIR.force * 5.65) * (0.88 + scale * 0.12) * mod.speedMul;
		const suspendedRadius =
			ring.radius *
			(0.18 + spellIR.spread * 0.18 + scale * 0.035) *
			(1 - convergenceStrength * 0.5) *
			(1 - focus * 0.28);
		const travelFactor = 1 - suspension * 0.78;

		return {
			...flow,
			suspended: suspension >= 0.55,
			gravity,
			suspension,
			directionCoherence,
			converging: convergence.active,
			convergenceProgress,
			sourceRadiusX: portal.radiusX * sourceScale,
			sourceRadiusY: portal.radiusY * sourceScale,
			horizontalSpeed:
				pressure * (0.08 + (0.22 + horizontalShare * 0.86) * travelFactor) * dispersionForward,
			verticalSpeed:
				pressure * (0.16 + (0.62 + verticalShare * 0.52) * travelFactor) * dispersionForward,
			gravityForce:
				(0.052 + spellIR.force * 0.038 + (1 - spellIR.stability) * 0.018) *
				gravity *
				(1 - Math.max(convergenceStrength, convergenceProgress)),
			streamLength:
				ring.radius *
				(0.16 +
					scale * 0.04 +
					(0.76 + spellIR.range * 0.34 + spellIR.force * 0.96) * travelFactor) *
				(1 - convergenceStrength * 0.34),
			streamDepth:
				ring.radius *
				(0.035 + spellIR.spread * 0.07 + suspension * 0.08) *
				(0.8 + scale * 0.18) *
				(1 - convergenceStrength * 0.48) *
				(1 - focus * 0.38),
			lateralPush:
				ring.radius *
				(0.004 + spellIR.spread * 0.018) *
				(1.12 - spellIR.stability * 0.38) *
				(1 - convergenceStrength * 0.44) *
				(1 - focus * 0.42) *
				dispersionPush,
			depthPush:
				ring.radius *
				(0.004 + spellIR.spread * 0.016) *
				(1.08 - spellIR.stability * 0.34) *
				(1 - convergenceStrength * 0.44) *
				(1 - focus * 0.42) *
				dispersionPush,
			maxHeightHint: ring.radius * (0.9 + spellIR.force * 1.2 + scale * 0.12),
			suspendedLife: spellLifetimeFrames(spellIR),
			suspendedHeight:
				ring.radius * (0.34 + spellIR.force * 0.16 + spellIR.spread * 0.1 + scale * 0.08),
			suspendedRadius,
			suspendedBob: ring.radius * (0.008 + (1 - spellIR.stability) * 0.012),
			suspendedWander: suspendedRadius * (0.05 + (1 - spellIR.stability) * 0.08),
			suspendedTension: 0.012 + spellIR.stability * 0.014,
			suspendedDamping: 0.958 + spellIR.stability * 0.026,
			minRadius: 3.6 * (0.86 + scale * 0.14),
			radiusScale:
				(0.82 + scale * 0.2) * (0.92 + spellIR.force * 0.18) * (1 - convergenceStrength * 0.14)
		};
	}

	protected baseParticleCount(
		spellIR: RenderSpellIR,
		flow: WaterFlowConfig,
		_config: AppConfig
	): number {
		const baseCount = flow.suspended
			? 118 + spellIR.force * 74 + spellIR.spread * 56
			: 96 + spellIR.force * 122;
		return baseCount * (0.66 + flow.scale * 0.22);
	}

	// Pick a starting point on the tilted ring surface, then the particle lifts away from that point.
	private randomPortalSource(portal: Portal, flow: WaterFlowConfig): Vector {
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.sqrt(Math.random());

		return {
			x: portal.center.x + Math.cos(angle) * flow.sourceRadiusX * radius,
			y: portal.center.y + Math.sin(angle) * flow.sourceRadiusY * radius
		};
	}

	private spawnSuspendedParticle(
		spellIR: RenderSpellIR,
		portal: Portal,
		flow: WaterFlowConfig
	): WaterParticle {
		const angle = Math.random() * Math.PI * 2;
		const spread = Math.sqrt(Math.random()) * flow.suspendedRadius;
		const phase = randomBetween(0, Math.PI * 2);
		const wobble = Math.sin(this.frame * 0.06 + phase) * (1 - spellIR.stability) * 0.52;
		const homeLateral = Math.cos(angle) * spread;
		const homeDepth = Math.sin(angle) * spread;
		const baseRadius = randomBetween(7.4, 14.6) * flow.radiusScale;
		const homeForward =
			flow.directionCoherence * flow.suspendedRadius * 0.72 +
			randomBetween(-flow.suspendedRadius * 0.08, flow.suspendedRadius * 0.08);

		return {
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			sourceX: portal.center.x,
			sourceY: portal.center.y,
			forward:
				homeForward + randomBetween(-flow.suspendedRadius * 0.04, flow.suspendedRadius * 0.04),
			height: flow.suspendedHeight + randomBetween(-flow.suspendedBob, flow.suspendedBob),
			depth: homeDepth,
			lateral: homeLateral,
			vForward: randomBetween(-0.28, 0.28) * flow.horizontalSpeed,
			vHeight: randomBetween(-0.24, 0.24),
			vDepth: randomBetween(-flow.depthPush, flow.depthPush) * 0.52 + wobble * 0.2,
			vLateral: randomBetween(-flow.lateralPush, flow.lateralPush) * 0.52 + wobble,
			homeForward,
			homeHeight: flow.suspendedHeight + randomBetween(-flow.suspendedBob, flow.suspendedBob),
			homeDepth,
			homeLateral,
			baseRadius,
			radius: baseRadius,
			phase,
			age: 0,
			life: flow.suspendedLife
		};
	}

	// Water particles use small local 3D-ish coordinates: forward, height, depth, and lateral spread.
	protected spawnParticle(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		flow: WaterFlowConfig
	): WaterParticle {
		if (flow.suspended) {
			return this.spawnSuspendedParticle(spellIR, portal, flow);
		}

		const source = this.randomPortalSource(portal, flow);
		const phase = randomBetween(0, Math.PI * 2);
		const streamRadius = Math.max(flow.sourceRadiusX, flow.sourceRadiusY);
		const baseRadius = randomBetween(6.4, 12.8) * flow.radiusScale;
		const wobble = Math.sin(this.frame * 0.08 + phase) * (1 - spellIR.stability) * 0.65;

		return {
			x: 0,
			y: 0,
			vx: 0,
			vy: 0,
			sourceX: source.x,
			sourceY: source.y,
			forward: randomBetween(-streamRadius * 0.04, streamRadius * 0.06),
			height: randomBetween(0, ring.radius * 0.04),
			depth: randomBetween(-flow.streamDepth, flow.streamDepth),
			lateral: randomBetween(-flow.streamDepth, flow.streamDepth),
			vForward: randomBetween(0.82, 1.18) * flow.horizontalSpeed,
			vHeight: randomBetween(0.86, 1.18) * flow.verticalSpeed,
			vDepth: randomBetween(-flow.depthPush, flow.depthPush) + wobble * 0.28,
			vLateral: randomBetween(-flow.lateralPush, flow.lateralPush) + wobble,
			baseRadius,
			radius: baseRadius,
			phase,
			age: 0,
			life: flow.converging
				? flow.suspendedLife
				: randomBetween(56, 98) * (0.84 + spellIR.stability * 0.32) * flow.mod.lifeMul
		};
	}

	private updateSuspendedParticle(
		particle: WaterParticle,
		flow: WaterFlowConfig,
		dt: number
	): void {
		particle.age += dt;

		const targetForward =
			particle.homeForward! +
			Math.cos(particle.phase + particle.age * 0.026) * flow.suspendedWander * 0.18;
		const targetHeight =
			particle.homeHeight! +
			Math.sin(particle.phase * 1.4 + particle.age * 0.028) * flow.suspendedBob;
		const targetLateral =
			particle.homeLateral! +
			Math.sin(particle.phase + particle.age * 0.034) * flow.suspendedWander;
		const targetDepth =
			particle.homeDepth! +
			Math.cos(particle.phase * 1.2 + particle.age * 0.032) * flow.suspendedWander;

		particle.vForward += (targetForward - particle.forward) * flow.suspendedTension * dt;
		particle.vHeight += (targetHeight - particle.height) * flow.suspendedTension * dt;
		particle.vLateral += (targetLateral - particle.lateral) * flow.suspendedTension * dt;
		particle.vDepth += (targetDepth - particle.depth) * flow.suspendedTension * dt;

		particle.forward += particle.vForward * dt;
		particle.height += particle.vHeight * dt;
		particle.lateral += particle.vLateral * dt;
		particle.depth += particle.vDepth * dt;

		particle.vForward *= flow.suspendedDamping;
		particle.vHeight *= flow.suspendedDamping;
		particle.vLateral *= flow.suspendedDamping;
		particle.vDepth *= flow.suspendedDamping;

		const shimmer = 0.95 + Math.sin(particle.phase + particle.age * 0.12) * 0.05;
		particle.radius = Math.max(flow.minRadius, particle.baseRadius * shimmer);
	}

	// A light projectile step gives the stream a faucet-like arc without needing a real 3D renderer.
	protected updateParticle(particle: WaterParticle, flow: WaterFlowConfig, dt: number): void {
		if (flow.suspended) {
			this.updateSuspendedParticle(particle, flow, dt);
			return;
		}

		particle.age += dt;

		const ageRatio = particle.age / Math.max(1, particle.life);
		const wobble = Math.sin(particle.phase + particle.age * 0.14) * (1 - ageRatio);
		particle.vHeight -= flow.gravityForce * dt;
		particle.vLateral += wobble * flow.lateralPush * 0.032 * dt;
		particle.vDepth += Math.cos(particle.phase + particle.age * 0.11) * flow.depthPush * 0.026 * dt;

		particle.forward += particle.vForward * dt;
		particle.height += particle.vHeight * dt;
		particle.lateral += particle.vLateral * dt;
		particle.depth += particle.vDepth * dt;

		const hold = flow.convergenceProgress;
		particle.vForward *= 0.993 - hold * 0.035;
		particle.vHeight *= 1 - hold * 0.06;
		particle.vLateral *= 0.984 - hold * 0.04;
		particle.vDepth *= 0.986 - hold * 0.04;

		const speed = Math.hypot(
			particle.vForward,
			particle.vHeight,
			particle.vLateral,
			particle.vDepth
		);
		const shimmer = 0.94 + Math.sin(particle.phase + particle.age * 0.18) * 0.06;
		particle.radius = Math.max(flow.minRadius, particle.baseRadius - speed * 0.18) * shimmer;

		if (
			!flow.converging &&
			(particle.forward > flow.streamLength || particle.height < -flow.sourceRadiusY * 0.72)
		) {
			particle.age = particle.life + 1;
		}
	}

	// Project the local 3D-ish particle state back onto the existing 2D effect canvas.
	private projectParticle(particle: WaterParticle, flow: WaterFlowConfig): Vector {
		const base = {
			x: particle.sourceX + flow.direction.x * particle.forward + flow.side.x * particle.lateral,
			y:
				particle.sourceY +
				flow.direction.y * particle.forward -
				particle.height +
				particle.depth * DEPTH_SCALE
		};

		return convergePoint(base, flow.convergence, particle.phase);
	}

	// Broad blue blobs overlap first, giving the stream its transparent water body.
	private drawMass(
		ctx: CanvasRenderingContext2D,
		projected: Vector,
		particle: WaterParticle,
		flow: WaterFlowConfig,
		alpha: number
	): void {
		const heightRatio = clamp(particle.height / Math.max(1, flow.maxHeightHint));
		const radius =
			particle.radius * (1.5 + heightRatio * 0.22) * (1 - flow.convergenceProgress * 0.28);
		const gradient = ctx.createRadialGradient(
			projected.x - radius * 0.16,
			projected.y - radius * 0.18,
			0,
			projected.x,
			projected.y,
			radius * 1.24
		);

		gradient.addColorStop(0, `rgba(87, 190, 245, ${alpha * 0.16})`);
		gradient.addColorStop(0.28, `rgba(36, 150, 229, ${alpha * 0.2})`);
		gradient.addColorStop(0.68, `rgba(8, 95, 202, ${alpha * 0.14})`);
		gradient.addColorStop(1, 'rgba(4, 61, 173, 0)');

		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
		ctx.fill();
	}

	// A smaller inner pass keeps the blobs readable without letting white dominate the water.
	private drawCore(
		ctx: CanvasRenderingContext2D,
		projected: Vector,
		particle: WaterParticle,
		flow: WaterFlowConfig,
		alpha: number
	): void {
		const heightRatio = clamp(particle.height / Math.max(1, flow.maxHeightHint));
		const radius =
			particle.radius * (0.94 + heightRatio * 0.18) * (1 - flow.convergenceProgress * 0.24);
		const core = ctx.createRadialGradient(
			projected.x - radius * 0.28,
			projected.y - radius * 0.3,
			0,
			projected.x,
			projected.y,
			radius * 1.08
		);

		core.addColorStop(0, `rgba(128, 218, 255, ${alpha * 0.07})`);
		core.addColorStop(0.24, `rgba(55, 171, 238, ${alpha * 0.14})`);
		core.addColorStop(0.72, `rgba(18, 122, 218, ${alpha * 0.1})`);
		core.addColorStop(1, 'rgba(7, 83, 202, 0)');

		ctx.fillStyle = core;
		ctx.beginPath();
		ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
		ctx.fill();
	}

	// Tiny deterministic highlights add a wet edge while avoiding frame-to-frame sparkle.
	private drawHighlight(
		ctx: CanvasRenderingContext2D,
		projected: Vector,
		particle: WaterParticle,
		alpha: number
	): void {
		if (Math.sin(particle.phase * 1.7) < -0.28) {
			return;
		}

		const radius = particle.radius * (0.18 + (Math.sin(particle.phase * 2.3) * 0.5 + 0.5) * 0.14);
		ctx.fillStyle = `rgba(210, 245, 255, ${alpha * 0.05})`;
		ctx.beginPath();
		ctx.ellipse(
			projected.x - particle.radius * 0.18,
			projected.y - particle.radius * 0.24,
			radius * 1.24,
			radius * 0.72,
			-0.34,
			0,
			Math.PI * 2
		);
		ctx.fill();
	}

	private visibleParticle(
		particle: WaterParticle,
		flow: WaterFlowConfig,
		spellIR: RenderSpellIR
	): VisibleWaterParticle | null {
		const alpha =
			flow.suspended || flow.converging
				? steadyParticleAlpha(particle, spellIR, 12)
				: particleAlpha(particle) * Math.min(1, particle.age / 8) * effectOpacity(spellIR);
		if (alpha <= 0) {
			return null;
		}

		const projected = this.projectParticle(particle, flow);
		if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
			return null;
		}

		return { projected, alpha: alpha * WATER_ALPHA_SCALE };
	}

	/** Single-particle draw honoring the base contract; renderParticles batches the passes instead. */
	protected drawParticle(
		ctx: CanvasRenderingContext2D,
		particle: WaterParticle,
		flow: WaterFlowConfig,
		spellIR: RenderSpellIR
	): void {
		const visible = this.visibleParticle(particle, flow, spellIR);
		if (!visible) {
			return;
		}
		this.drawMass(ctx, visible.projected, particle, flow, visible.alpha);
		this.drawCore(ctx, visible.projected, particle, flow, visible.alpha);
		this.drawHighlight(ctx, visible.projected, particle, visible.alpha);
	}

	// Water needs layered compositing: all low-alpha blue mass blobs first so the
	// paper shows through, then a screen pass for cores and highlights.
	protected renderParticles(
		ctx: CanvasRenderingContext2D,
		spellIR: RenderSpellIR,
		flow: WaterFlowConfig,
		dt: number
	): void {
		const visibleParticles: Array<VisibleWaterParticle & { particle: WaterParticle }> = [];
		for (const particle of this.particles) {
			this.updateParticle(particle, flow, dt);
			const visible = this.visibleParticle(particle, flow, spellIR);
			if (visible) {
				visibleParticles.push({ particle, ...visible });
			}
		}

		ctx.save();
		ctx.globalCompositeOperation = 'source-over';
		for (const { particle, projected, alpha } of visibleParticles) {
			this.drawMass(ctx, projected, particle, flow, alpha);
		}

		ctx.globalCompositeOperation = 'screen';
		for (const { particle, projected, alpha } of visibleParticles) {
			this.drawCore(ctx, projected, particle, flow, alpha);
			this.drawHighlight(ctx, projected, particle, alpha);
		}
		ctx.restore();
	}
}
