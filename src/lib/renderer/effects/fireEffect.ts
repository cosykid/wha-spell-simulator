import { clamp, perpendicularVector, randomBetween } from '../../utils/geometry.js';
import {
	convergePoint,
	effectGravity,
	effectOpacity,
	effectSuspension,
	elementFlow,
	emissionDirection,
	particleAlpha,
	particleDepth,
	randomPortalPoint,
	spellLifetimeFrames,
	steadyParticleAlpha
} from './effectUtils.js';
import { ElementEffect } from './elementEffect.js';
import type { AppConfig, RingInfo } from '../../types.js';
import type { ElementFlow, Particle, Portal, RenderSpellIR } from './effectUtils.js';

interface FireFlowConfig extends ElementFlow {
	suspended: boolean;
	gravity: number;
	suspension: number;
	suspendedLife: number;
	suspendedHeight: number;
	suspendedRadiusX: number;
	suspendedRadiusY: number;
	suspendedBob: number;
	suspendedWander: number;
	suspendedTension: number;
	suspendedDamping: number;
}

interface FireParticle extends Particle {
	homeX?: number;
	homeY?: number;
}

export class FireEffect extends ElementEffect<FireParticle, FireFlowConfig> {
	protected createFlow(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		frame: number
	): FireFlowConfig {
		const flow = elementFlow(spellIR, portal, frame);
		const { scale, focus, convergence } = flow;
		const suspension = effectSuspension(spellIR);

		return {
			...flow,
			suspended: suspension >= 0.55,
			gravity: effectGravity(spellIR),
			suspension,
			suspendedLife: spellLifetimeFrames(spellIR),
			suspendedHeight: ring.radius * (0.34 + spellIR.force * 0.18 + scale * 0.08),
			suspendedRadiusX:
				ring.radius *
				(0.16 + spellIR.spread * 0.16 + scale * 0.04) *
				(1 - convergence.strength * 0.48) *
				(1 - focus * 0.28),
			suspendedRadiusY:
				ring.radius *
				(0.11 + spellIR.spread * 0.12 + scale * 0.028) *
				(1 - convergence.strength * 0.48) *
				(1 - focus * 0.28),
			suspendedBob: ring.radius * (0.008 + (1 - spellIR.stability) * 0.014),
			suspendedWander:
				ring.radius *
				(0.012 + spellIR.spread * 0.03) *
				(1 - convergence.strength * 0.46) *
				(1 - focus * 0.44),
			suspendedTension: 0.014 + spellIR.stability * 0.018,
			suspendedDamping: 0.954 + spellIR.stability * 0.03
		};
	}

	protected baseParticleCount(
		spellIR: RenderSpellIR,
		flow: FireFlowConfig,
		config: AppConfig
	): number {
		const baseCount = flow.suspended
			? 96 + spellIR.force * 74 + spellIR.spread * 52
			: config.renderer.particleBaseCount + spellIR.force * 92;
		return baseCount * (0.78 + flow.scale * 0.32);
	}

	protected spawnParticle(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		flow: FireFlowConfig
	): FireParticle {
		return flow.suspended
			? this.spawnSuspendedParticle(spellIR, ring, portal, flow)
			: this.spawnFlowParticle(spellIR, ring, portal, flow);
	}

	private spawnSuspendedParticle(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		flow: FireFlowConfig
	): FireParticle {
		const scale = flow.scale;
		const angle = Math.random() * Math.PI * 2;
		const radius = Math.sqrt(Math.random());
		const phase = randomBetween(0, Math.PI * 2);
		const homeX = portal.center.x + Math.cos(angle) * flow.suspendedRadiusX * radius;
		const homeY =
			portal.center.y - flow.suspendedHeight + Math.sin(angle) * flow.suspendedRadiusY * radius;
		const startJitter = ring.radius * 0.025;
		const flicker = Math.sin(this.frame * 0.11 + phase) * (1 - spellIR.stability) * 0.42;

		return {
			x: homeX + randomBetween(-startJitter, startJitter),
			y: homeY + randomBetween(-startJitter, startJitter),
			vx: randomBetween(-0.28, 0.28) + flicker * 0.32,
			vy: randomBetween(-0.22, 0.22),
			homeX,
			homeY,
			radius: randomBetween(8, 18) * (0.86 + spellIR.force * 0.22) * (0.82 + scale * 0.28),
			phase,
			age: 0,
			life: flow.suspendedLife
		};
	}

	private spawnFlowParticle(
		spellIR: RenderSpellIR,
		ring: RingInfo,
		portal: Portal,
		flow: FireFlowConfig
	): FireParticle {
		const scale = flow.scale;
		const focus = flow.focus;
		const convergence = flow.convergence;
		const source = randomPortalPoint(
			portal,
			Math.min(0.84, 0.36 + scale * 0.12 + spellIR.spread * 0.2) *
				(1 - convergence.strength * 0.34) *
				(1 - focus * 0.24),
			Math.min(0.84, 0.42 + scale * 0.1 + spellIR.spread * 0.18) *
				(1 - convergence.strength * 0.34) *
				(1 - focus * 0.24)
		);
		const surfaceJitter =
			ring.radius *
			(0.025 + spellIR.spread * 0.05) *
			scale *
			(1 - focus * 0.4) *
			flow.mod.jitterMul;
		const speed =
			randomBetween(1.8, 4.2) *
			(0.5 + spellIR.force) *
			(0.92 + scale * 0.12) *
			(1 - flow.suspension * 0.42) *
			(1 - convergence.strength * 0.24) *
			flow.mod.speedMul;
		const jitter =
			(1 - spellIR.stability) *
			1.8 *
			(1 - flow.suspension * 0.3) *
			(1 - convergence.strength * 0.4) *
			(1 - focus * 0.46) *
			flow.mod.jitterMul;
		const emitDir = emissionDirection(flow.direction, flow.mod);
		const emitSide = perpendicularVector(emitDir);
		const phase = randomBetween(0, Math.PI * 2);

		return {
			x: source.x + emitSide.x * randomBetween(-surfaceJitter, surfaceJitter),
			y: source.y + emitSide.y * randomBetween(-surfaceJitter, surfaceJitter),
			vx: emitDir.x * speed + emitSide.x * randomBetween(-jitter, jitter),
			vy: emitDir.y * speed + emitSide.y * randomBetween(-jitter, jitter),
			radius: randomBetween(5, 14) * (0.75 + spellIR.force) * (0.82 + scale * 0.28),
			phase,
			age: 0,
			life: convergence.active
				? convergence.life
				: randomBetween(32, 62) * (0.88 + spellIR.stability * 0.34) * flow.mod.lifeMul
		};
	}

	protected updateParticle(particle: FireParticle, flow: FireFlowConfig, dt: number): void {
		particle.age += dt;

		if (flow.suspended) {
			const targetX =
				particle.homeX! + Math.sin(particle.phase + particle.age * 0.038) * flow.suspendedWander;
			const targetY =
				particle.homeY! + Math.sin(particle.phase * 1.7 + particle.age * 0.048) * flow.suspendedBob;
			particle.vx += (targetX - particle.x) * flow.suspendedTension * dt;
			particle.vy += (targetY - particle.y) * flow.suspendedTension * dt;
			particle.x += particle.vx * dt;
			particle.y += particle.vy * dt;
			particle.vx *= flow.suspendedDamping;
			particle.vy *= flow.suspendedDamping;
			return;
		}

		particle.x += particle.vx * dt;
		particle.y += particle.vy * dt;
		particle.vx *= 0.992 - flow.convergence.progress * 0.045;
		particle.vy *= 0.992 - flow.convergence.progress * 0.045;
	}

	protected drawParticle(
		ctx: CanvasRenderingContext2D,
		particle: FireParticle,
		flow: FireFlowConfig,
		spellIR: RenderSpellIR
	): void {
		const depth = flow.suspended
			? clamp(0.5 + Math.sin(particle.phase + particle.age * 0.08) * 0.28)
			: particleDepth(particle);
		const alpha =
			flow.suspended || flow.convergence.active
				? steadyParticleAlpha(particle, spellIR, 10) * (0.82 + depth * 0.22)
				: particleAlpha(particle) * (0.78 + depth * 0.24) * effectOpacity(spellIR);
		const displayRadius = flow.suspended
			? particle.radius * (1.04 + depth * 0.22) * (1 - flow.convergence.progress * 0.2)
			: particle.radius * (0.86 + depth * 0.64) * (1 - flow.convergence.progress * 0.24);
		const point = convergePoint(particle, flow.convergence, particle.phase);
		const gradient = ctx.createRadialGradient(
			point.x,
			point.y,
			0,
			point.x,
			point.y,
			displayRadius * (1.2 - alpha * 0.2)
		);

		gradient.addColorStop(0, `rgba(255, 242, 160, ${alpha * 0.9})`);
		gradient.addColorStop(0.45, `rgba(243, 116, 43, ${alpha * 0.7})`);
		gradient.addColorStop(1, `rgba(176, 47, 32, 0)`);
		ctx.fillStyle = gradient;
		ctx.beginPath();
		ctx.arc(point.x, point.y, displayRadius, 0, Math.PI * 2);
		ctx.fill();
	}
}
