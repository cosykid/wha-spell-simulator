// Field-driven effect: one renderer for every element, used whenever the
// compiled spell carries field sources. Particles live in seal space, spawn
// where the domain allows, and advect through the superposed sign forces —
// leaning columns, angled-pull vortices, and on-ring droplets all emerge from
// the field sum rather than per-element special cases.

import { clamp, randomBetween } from '../../utils/geometry.js';
import { sampleFieldForce, spawnDomainPosition } from '../../field/sampleField.js';
import {
	activePortalPlane,
	effectOpacity,
	effectScale,
	particleAlpha,
	pruneParticles,
	scaledParticleCount
} from './effectUtils.js';
import type { AppConfig, ElementId, RingInfo, SpellField } from '../../types.js';
import type { EffectState, Particle, Portal, RenderSpellIR } from './effectUtils.js';

// Seal-space integration constants; dt is in 60fps frames.
const FIELD_MOTION = {
	// In-plane acceleration per unit of field force.
	planarAccel: 0.0016,
	// Out-of-plane acceleration per unit of field force (columns, buoyancy).
	liftAccel: 0.0024,
	// Constant downward pull on airborne particles; buoyancy must beat this.
	gravity: 0.0015,
	drag: 0.955,
	// Beyond this seal-space distance a particle respawns.
	bounds: 2.6,
	fadeInFrames: 6
};

const PARTICLE_SHAPE = {
	minLife: 50,
	maxLife: 110,
	minRadius: 7,
	maxRadius: 16,
	minSpawnHeight: 0.02,
	maxSpawnHeight: 0.12,
	// Screen height of one seal-space z unit, as a fraction of the portal's x radius.
	heightScale: 0.8,
	// Frames of field force applied at spawn so streams read immediately.
	warmupFrames: 9,
	jitter: 0.004,
	// Frames of motion the streak tail trails behind each particle, making the
	// flow direction readable in a single frame.
	streakFrames: 7
};

const ELEMENT_PALETTES: Record<ElementId, { inner: string; outer: string }> = {
	fire: { inner: '255, 242, 160', outer: '243, 116, 43' },
	water: { inner: '128, 218, 255', outer: '18, 122, 218' },
	wind: { inner: '224, 248, 231', outer: '184, 232, 215' },
	earth: { inner: '214, 189, 148', outer: '111, 83, 45' },
	light: { inner: '255, 252, 214', outer: '255, 249, 180' }
};

interface FieldParticle extends Particle {
	sx: number;
	sy: number;
	sz: number;
	svx: number;
	svy: number;
	svz: number;
}

function spawnFieldParticle(spellIR: RenderSpellIR, field: SpellField): FieldParticle {
	const scale = effectScale(spellIR);
	const at = spawnDomainPosition(field.domain);
	const force = sampleFieldForce(field, at);
	const warmup = FIELD_MOTION.planarAccel * PARTICLE_SHAPE.warmupFrames;
	const jitter = PARTICLE_SHAPE.jitter * (1 - spellIR.stability * 0.5);

	return {
		x: 0,
		y: 0,
		vx: 0,
		vy: 0,
		sx: at.x,
		sy: at.y,
		sz: randomBetween(PARTICLE_SHAPE.minSpawnHeight, PARTICLE_SHAPE.maxSpawnHeight),
		svx: force.x * warmup + randomBetween(-jitter, jitter),
		svy: force.y * warmup + randomBetween(-jitter, jitter),
		svz: force.z * FIELD_MOTION.liftAccel * PARTICLE_SHAPE.warmupFrames,
		age: 0,
		life: randomBetween(PARTICLE_SHAPE.minLife, PARTICLE_SHAPE.maxLife),
		radius:
			randomBetween(PARTICLE_SHAPE.minRadius, PARTICLE_SHAPE.maxRadius) *
			(0.7 + scale * 0.25) *
			(0.8 + spellIR.strength * 0.4),
		phase: randomBetween(0, Math.PI * 2)
	};
}

function updateFieldParticle(particle: FieldParticle, field: SpellField, dt: number): void {
	particle.age += dt;

	const force = sampleFieldForce(field, { x: particle.sx, y: particle.sy });
	particle.svx += force.x * FIELD_MOTION.planarAccel * dt;
	particle.svy += force.y * FIELD_MOTION.planarAccel * dt;
	particle.svz += (force.z * FIELD_MOTION.liftAccel - FIELD_MOTION.gravity) * dt;

	particle.sx += particle.svx * dt;
	particle.sy += particle.svy * dt;
	particle.sz += particle.svz * dt;

	// The seal plane is the floor: grounded particles pool instead of sinking.
	if (particle.sz < 0) {
		particle.sz = 0;
		particle.svz = 0;
	}

	const drag = Math.pow(FIELD_MOTION.drag, dt);
	particle.svx *= drag;
	particle.svy *= drag;
	particle.svz *= drag;

	const distance = Math.hypot(particle.sx, particle.sy, particle.sz);
	if (distance > FIELD_MOTION.bounds) {
		particle.age = particle.life;
	}
}

function drawFieldParticle(
	ctx: CanvasRenderingContext2D,
	particle: FieldParticle,
	portal: Portal,
	palette: { inner: string; outer: string },
	opacity: number
): void {
	const x = portal.center.x + particle.sx * portal.radiusX;
	const y =
		portal.center.y +
		particle.sy * portal.radiusY -
		particle.sz * portal.radiusX * PARTICLE_SHAPE.heightScale;
	const fadeIn = Math.min(1, particle.age / FIELD_MOTION.fadeInFrames);
	const alpha = clamp(particleAlpha(particle) * fadeIn * opacity * 1.2);
	const radius = particle.radius * (0.9 + Math.min(particle.sz, 1.4) * 0.2);

	particle.x = x;
	particle.y = y;

	// Streak tail along the recent motion, so the field's flow shows in stills.
	const streak = PARTICLE_SHAPE.streakFrames;
	const tailX = x - particle.svx * streak * portal.radiusX;
	const tailY =
		y -
		particle.svy * streak * portal.radiusY +
		particle.svz * streak * portal.radiusX * PARTICLE_SHAPE.heightScale;
	ctx.strokeStyle = `rgba(${palette.outer}, ${alpha * 0.45})`;
	ctx.lineWidth = Math.max(1.5, radius * 0.4);
	ctx.lineCap = 'round';
	ctx.beginPath();
	ctx.moveTo(tailX, tailY);
	ctx.lineTo(x, y);
	ctx.stroke();

	const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
	gradient.addColorStop(0, `rgba(${palette.inner}, ${alpha})`);
	gradient.addColorStop(0.5, `rgba(${palette.outer}, ${alpha * 0.7})`);
	gradient.addColorStop(1, `rgba(${palette.outer}, 0)`);
	ctx.fillStyle = gradient;
	ctx.beginPath();
	ctx.arc(x, y, radius, 0, Math.PI * 2);
	ctx.fill();
}

export function drawFieldEffect(
	ctx: CanvasRenderingContext2D,
	state: EffectState,
	spellIR: RenderSpellIR,
	ring: RingInfo,
	dt: number,
	config: AppConfig
): void {
	const field = spellIR.field;
	if (!field?.sources.length) {
		return;
	}

	const portal = activePortalPlane(ctx.canvas, ring, spellIR.portalFit);
	const opacity = effectOpacity(spellIR);
	const palette = ELEMENT_PALETTES[spellIR.element ?? 'light'] ?? ELEMENT_PALETTES.light;
	const baseCount =
		config.renderer.particleBaseCount * (0.7 + clamp(field.domain.strength) * 0.2) +
		spellIR.force * 80;
	const targetCount = scaledParticleCount(baseCount, spellIR, config);

	while (state.particles.length < targetCount) {
		state.particles.push(spawnFieldParticle(spellIR, field));
	}

	for (const particle of state.particles) {
		updateFieldParticle(particle as FieldParticle, field, dt);
		drawFieldParticle(ctx, particle as FieldParticle, portal, palette, opacity);
	}

	pruneParticles(state);
}
