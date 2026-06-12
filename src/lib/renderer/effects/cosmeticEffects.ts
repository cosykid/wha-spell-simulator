import { randomBetween } from '../../utils/geometry.js';
import { activePortalPlane, randomPortalPoint } from './effectUtils.js';
import type { RenderSpellIR } from './effectUtils.js';
import type { RingInfo } from '../../types.js';

/**
 * Cosmetic particle drawn as a small flourish during an active spell cast.
 * Independent of the element effect system — purely decorative, themed by the
 * player's equipped "drawing effect" cosmetic (see `COSMETIC_ITEMS` in
 * `gachaStore.svelte.ts`).
 */
interface CosmeticParticle {
	x: number;
	y: number;
	vx: number;
	vy: number;
	age: number;
	life: number;
	radius: number;
	rotation: number;
	spin: number;
}

export interface CosmeticEffectState {
	particles: CosmeticParticle[];
	frame: number;
}

export function createCosmeticEffectState(): CosmeticEffectState {
	return { particles: [], frame: 0 };
}

export function resetCosmeticEffectState(state: CosmeticEffectState): void {
	state.particles = [];
	state.frame = 0;
}

interface CosmeticEffectStyle {
	/** Target particle count while the spell is actively casting. */
	count: number;
	/** Average lifetime in frames. */
	life: number;
	draw: (ctx: CanvasRenderingContext2D, particle: CosmeticParticle, alpha: number) => void;
	spawn: (particle: CosmeticParticle) => void;
}

function spawnDrift(particle: CosmeticParticle, opts: { speed: number; spin: number }): void {
	const angle = Math.random() * Math.PI * 2;
	particle.vx = Math.cos(angle) * randomBetween(0.1, opts.speed);
	particle.vy = Math.sin(angle) * randomBetween(0.1, opts.speed) - 0.2;
	particle.rotation = randomBetween(0, Math.PI * 2);
	particle.spin = randomBetween(-opts.spin, opts.spin);
}

const STYLES: Record<string, CosmeticEffectStyle> = {
	'effect-embers': {
		count: 26,
		life: 70,
		spawn: (p) => spawnDrift(p, { speed: 0.6, spin: 0.02 }),
		draw: (ctx, p, alpha) => {
			const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radius * 1.6);
			gradient.addColorStop(0, `rgba(255, 200, 120, ${alpha * 0.9})`);
			gradient.addColorStop(0.5, `rgba(255, 107, 53, ${alpha * 0.6})`);
			gradient.addColorStop(1, 'rgba(255, 107, 53, 0)');
			ctx.fillStyle = gradient;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.radius * 1.6, 0, Math.PI * 2);
			ctx.fill();
		}
	},
	'effect-starfall': {
		count: 22,
		life: 80,
		spawn: (p) => spawnDrift(p, { speed: 0.45, spin: 0.06 }),
		draw: (ctx, p, alpha) => {
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.fillStyle = `rgba(248, 213, 107, ${alpha})`;
			ctx.shadowColor = `rgba(248, 213, 107, ${alpha * 0.8})`;
			ctx.shadowBlur = 6;
			drawStar(ctx, p.radius);
			ctx.restore();
		}
	},
	'effect-frost': {
		count: 24,
		life: 60,
		spawn: (p) => spawnDrift(p, { speed: 0.3, spin: 0.03 }),
		draw: (ctx, p, alpha) => {
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.strokeStyle = `rgba(168, 216, 234, ${alpha})`;
			ctx.lineWidth = 1.4;
			drawSnowflake(ctx, p.radius);
			ctx.restore();
		}
	},
	'effect-petals': {
		count: 22,
		life: 90,
		spawn: (p) => spawnDrift(p, { speed: 0.35, spin: 0.04 }),
		draw: (ctx, p, alpha) => {
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.fillStyle = `rgba(255, 183, 197, ${alpha * 0.9})`;
			ctx.beginPath();
			ctx.ellipse(0, 0, p.radius, p.radius * 0.55, 0, 0, Math.PI * 2);
			ctx.fill();
			ctx.restore();
		}
	},
	'effect-bubbles': {
		count: 20,
		life: 64,
		spawn: (p) => {
			p.vx = randomBetween(-0.18, 0.18);
			p.vy = -randomBetween(0.3, 0.7);
			p.rotation = 0;
			p.spin = 0;
		},
		draw: (ctx, p, alpha) => {
			ctx.save();
			ctx.strokeStyle = `rgba(116, 185, 255, ${alpha * 0.85})`;
			ctx.fillStyle = `rgba(116, 185, 255, ${alpha * 0.18})`;
			ctx.lineWidth = 1.2;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
			ctx.fill();
			ctx.stroke();
			ctx.restore();
		}
	},
	'effect-runes': {
		count: 14,
		life: 64,
		spawn: (p) => spawnDrift(p, { speed: 0.18, spin: 0.015 }),
		draw: (ctx, p, alpha) => {
			ctx.save();
			ctx.translate(p.x, p.y);
			ctx.rotate(p.rotation);
			ctx.strokeStyle = `rgba(162, 155, 254, ${alpha})`;
			ctx.lineWidth = 1.4;
			drawRune(ctx, p.radius);
			ctx.restore();
		}
	},
	'effect-dust': {
		count: 30,
		life: 50,
		spawn: (p) => spawnDrift(p, { speed: 0.4, spin: 0 }),
		draw: (ctx, p, alpha) => {
			ctx.fillStyle = `rgba(223, 230, 233, ${alpha * 0.8})`;
			ctx.beginPath();
			ctx.arc(p.x, p.y, p.radius * 0.5, 0, Math.PI * 2);
			ctx.fill();
		}
	}
};

function drawStar(ctx: CanvasRenderingContext2D, radius: number): void {
	ctx.beginPath();
	for (let i = 0; i < 4; i++) {
		const angle = (Math.PI / 2) * i;
		ctx.moveTo(0, 0);
		ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
	}
	ctx.lineWidth = 1.4;
	ctx.strokeStyle = ctx.fillStyle as string;
	ctx.stroke();
	ctx.beginPath();
	ctx.arc(0, 0, radius * 0.25, 0, Math.PI * 2);
	ctx.fill();
}

function drawSnowflake(ctx: CanvasRenderingContext2D, radius: number): void {
	ctx.beginPath();
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i;
		const x = Math.cos(angle) * radius;
		const y = Math.sin(angle) * radius;
		ctx.moveTo(0, 0);
		ctx.lineTo(x, y);
	}
	ctx.stroke();
}

function drawRune(ctx: CanvasRenderingContext2D, radius: number): void {
	ctx.beginPath();
	ctx.moveTo(0, -radius);
	ctx.lineTo(0, radius);
	ctx.moveTo(-radius * 0.6, -radius * 0.3);
	ctx.lineTo(radius * 0.6, radius * 0.5);
	ctx.moveTo(-radius * 0.6, radius * 0.5);
	ctx.lineTo(radius * 0.6, -radius * 0.3);
	ctx.stroke();
}

/**
 * Draws the cosmetic flourish for `effectId` onto the effect canvas. Only
 * active while `spellIR.active` (a successfully cast spell). `emission` fades
 * the effect out the same way element effects do.
 */
export function drawCosmeticEffect(
	ctx: CanvasRenderingContext2D,
	state: CosmeticEffectState,
	effectId: string,
	spellIR: RenderSpellIR,
	ring: RingInfo,
	dt: number
): void {
	const style = STYLES[effectId];
	if (!style) return;

	const emission = Math.max(0, Math.min(1, spellIR.emission ?? 1));
	state.frame += dt;
	const portal = activePortalPlane(ctx.canvas, ring);

	const targetCount = Math.round(style.count * emission);
	while (emission > 0 && state.particles.length < targetCount) {
		const point = randomPortalPoint(portal, 1.05, 1.05);
		const particle: CosmeticParticle = {
			x: point.x,
			y: point.y,
			vx: 0,
			vy: 0,
			age: 0,
			life: randomBetween(style.life * 0.7, style.life * 1.3),
			radius: randomBetween(3, 7),
			rotation: 0,
			spin: 0
		};
		style.spawn(particle);
		state.particles.push(particle);
	}

	for (const particle of state.particles) {
		particle.age += dt;
		particle.x += particle.vx * dt;
		particle.y += particle.vy * dt;
		particle.rotation += particle.spin * dt;
		const alpha = Math.max(0, 1 - particle.age / particle.life) * emission;
		if (alpha > 0) {
			style.draw(ctx, particle, alpha);
		}
	}

	state.particles = state.particles.filter((p) => p.age < p.life);
}
