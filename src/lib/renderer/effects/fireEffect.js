import { clamp, perpendicularVector, randomBetween } from "../../utils/geometry.js";
import {
  activePortalPlane,
  convergenceFlow,
  convergePoint,
  effectFocus,
  effectGravity,
  effectOpacity,
  effectScale,
  effectSuspension,
  particleAlpha,
  particleDepth,
  portalOutDirection,
  pruneParticles,
  randomPortalPoint,
  scaledParticleCount,
  spellLifetimeFrames,
  steadyParticleAlpha
} from "./effectUtils.js";

function fireFlowConfig(spellIR, ring, portal, frame) {
  const direction = portalOutDirection(spellIR);
  const side = perpendicularVector(direction);
  const scale = effectScale(spellIR);
  const focus = effectFocus(spellIR);
  const gravity = effectGravity(spellIR);
  const suspension = effectSuspension(spellIR);
  const suspended = suspension >= 0.55;
  const convergence = convergenceFlow(spellIR, portal, frame);

  return {
    suspended,
    gravity,
    suspension,
    direction,
    side,
    convergence,
    suspendedLife: spellLifetimeFrames(spellIR),
    suspendedHeight: ring.radius * (0.34 + spellIR.force * 0.18 + scale * 0.08),
    suspendedRadiusX: ring.radius * (0.16 + spellIR.spread * 0.16 + scale * 0.04) * (1 - convergence.strength * 0.48) * (1 - focus * 0.28),
    suspendedRadiusY: ring.radius * (0.11 + spellIR.spread * 0.12 + scale * 0.028) * (1 - convergence.strength * 0.48) * (1 - focus * 0.28),
    suspendedBob: ring.radius * (0.008 + (1 - spellIR.stability) * 0.014),
    suspendedWander: ring.radius * (0.012 + spellIR.spread * 0.03) * (1 - convergence.strength * 0.46) * (1 - focus * 0.44),
    suspendedTension: 0.014 + spellIR.stability * 0.018,
    suspendedDamping: 0.954 + spellIR.stability * 0.03
  };
}

function spawnSuspendedFireParticle(spellIR, ring, portal, flow, frame) {
  const scale = effectScale(spellIR);
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random());
  const phase = randomBetween(0, Math.PI * 2);
  const homeX = portal.center.x + Math.cos(angle) * flow.suspendedRadiusX * radius;
  const homeY = portal.center.y - flow.suspendedHeight + Math.sin(angle) * flow.suspendedRadiusY * radius;
  const startJitter = ring.radius * 0.025;
  const flicker = Math.sin(frame * 0.11 + phase) * (1 - spellIR.stability) * 0.42;

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

function spawnFlowFireParticle(spellIR, ring, portal, flow) {
  const scale = effectScale(spellIR);
  const focus = effectFocus(spellIR);
  const convergence = flow.convergence;
  const source = randomPortalPoint(
    portal,
    Math.min(0.84, 0.36 + scale * 0.12 + spellIR.spread * 0.2) * (1 - convergence.strength * 0.34) * (1 - focus * 0.24),
    Math.min(0.84, 0.42 + scale * 0.1 + spellIR.spread * 0.18) * (1 - convergence.strength * 0.34) * (1 - focus * 0.24)
  );
  const surfaceJitter = ring.radius * (0.025 + spellIR.spread * 0.05) * scale * (1 - focus * 0.4);
  const speed =
    randomBetween(1.8, 4.2) *
    (0.5 + spellIR.force) *
    (0.92 + scale * 0.12) *
    (1 - flow.suspension * 0.42) *
    (1 - convergence.strength * 0.24);
  const jitter = (1 - spellIR.stability) * 1.8 * (1 - flow.suspension * 0.3) * (1 - convergence.strength * 0.4) * (1 - focus * 0.46);
  const phase = randomBetween(0, Math.PI * 2);

  return {
    x: source.x + flow.side.x * randomBetween(-surfaceJitter, surfaceJitter),
    y: source.y + flow.side.y * randomBetween(-surfaceJitter, surfaceJitter),
    vx: flow.direction.x * speed + flow.side.x * randomBetween(-jitter, jitter),
    vy: flow.direction.y * speed + flow.side.y * randomBetween(-jitter, jitter),
    radius: randomBetween(5, 14) * (0.75 + spellIR.force) * (0.82 + scale * 0.28),
    phase,
    age: 0,
    life: convergence.active ? convergence.life : randomBetween(32, 62) * (0.88 + spellIR.stability * 0.34)
  };
}

function spawnFireParticle(spellIR, ring, portal, flow, frame) {
  return flow.suspended
    ? spawnSuspendedFireParticle(spellIR, ring, portal, flow, frame)
    : spawnFlowFireParticle(spellIR, ring, portal, flow);
}

function updateSuspendedFireParticle(particle, flow, dt) {
  particle.age += dt;

  const targetX = particle.homeX + Math.sin(particle.phase + particle.age * 0.038) * flow.suspendedWander;
  const targetY = particle.homeY + Math.sin(particle.phase * 1.7 + particle.age * 0.048) * flow.suspendedBob;
  particle.vx += (targetX - particle.x) * flow.suspendedTension * dt;
  particle.vy += (targetY - particle.y) * flow.suspendedTension * dt;
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  particle.vx *= flow.suspendedDamping;
  particle.vy *= flow.suspendedDamping;
}

function updateFlowFireParticle(particle, flow, dt) {
  particle.age += dt;
  particle.x += particle.vx * dt;
  particle.y += particle.vy * dt;
  particle.vx *= 0.992 - flow.convergence.progress * 0.045;
  particle.vy *= 0.992 - flow.convergence.progress * 0.045;
}

function drawFireParticle(ctx, particle, flow, spellIR, opacity) {
  const depth = flow.suspended ? clamp(0.5 + Math.sin(particle.phase + particle.age * 0.08) * 0.28) : particleDepth(particle);
  const alpha = flow.suspended || flow.convergence.active
    ? steadyParticleAlpha(particle, spellIR, 10) * (0.82 + depth * 0.22)
    : particleAlpha(particle) * (0.78 + depth * 0.24) * opacity;
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

export function drawFireEffect(ctx, state, spellIR, ring, dt, config) {
  const scale = effectScale(spellIR);
  const opacity = effectOpacity(spellIR);
  const portal = activePortalPlane(ctx.canvas, ring);
  state.fireFrame = (state.fireFrame ?? 0) + dt;
  const flow = fireFlowConfig(spellIR, ring, portal, state.fireFrame);
  const baseCount = flow.suspended ? 96 + spellIR.force * 74 + spellIR.spread * 52 : config.renderer.particleBaseCount + spellIR.force * 92;
  const targetCount = scaledParticleCount(
    baseCount * (0.78 + scale * 0.32),
    spellIR,
    config
  );
  while (state.particles.length < targetCount) {
    state.particles.push(spawnFireParticle(spellIR, ring, portal, flow, state.fireFrame));
  }

  for (const particle of state.particles) {
    if (flow.suspended) {
      updateSuspendedFireParticle(particle, flow, dt);
    } else {
      updateFlowFireParticle(particle, flow, dt);
    }
    drawFireParticle(ctx, particle, flow, spellIR, opacity);
  }

  pruneParticles(state);
}
