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
  portalOutDirection,
  pruneParticles,
  scaledParticleCount,
  spellLifetimeFrames,
  steadyParticleAlpha
} from "./effectUtils.js";

const DEPTH_SCALE = 0.58;
const WATER_ALPHA_SCALE = 0.58;

// Translate SpellIR values into renderer-only flow controls. These knobs stay out of the public IR.
function waterFlowConfig(spellIR, ring, portal, frame) {
  const scale = effectScale(spellIR);
  const focus = effectFocus(spellIR);
  const gravity = effectGravity(spellIR);
  const suspension = effectSuspension(spellIR);
  const suspended = suspension >= 0.55;
  const direction = portalOutDirection(spellIR);
  const side = perpendicularVector(direction);
  const directionIR = spellIR.direction ?? {};
  const directionCoherence = clamp(spellIR.directionCoherence ?? Math.hypot(directionIR.x ?? 0, directionIR.y ?? 0));
  const convergence = convergenceFlow(spellIR, portal, frame);
  const convergenceStrength = convergence.strength;
  const convergenceProgress = convergence.progress;
  const horizontalShare = clamp(Math.hypot(directionIR.x ?? 0, directionIR.y ?? 0));
  const verticalShare = clamp(directionIR.z ?? 1);
  const sourceScale = Math.min(0.64, 0.22 + scale * 0.06 + spellIR.spread * 0.18) * (1 - convergenceStrength * 0.36) * (1 - focus * 0.24);
  const pressure = (3.15 + spellIR.force * 5.65) * (0.88 + scale * 0.12);
  const suspendedRadius = ring.radius * (0.18 + spellIR.spread * 0.18 + scale * 0.035) * (1 - convergenceStrength * 0.5) * (1 - focus * 0.28);
  const travelFactor = 1 - suspension * 0.78;

  return {
    suspended,
    gravity,
    suspension,
    direction,
    directionCoherence,
    side,
    convergence,
    converging: convergence.active,
    convergenceProgress: convergence.progress,
    sourceRadiusX: portal.radiusX * sourceScale,
    sourceRadiusY: portal.radiusY * sourceScale,
    horizontalSpeed: pressure * (0.08 + (0.22 + horizontalShare * 0.86) * travelFactor),
    verticalSpeed: pressure * (0.16 + (0.62 + verticalShare * 0.52) * travelFactor),
    gravityForce:
      (0.052 + spellIR.force * 0.038 + (1 - spellIR.stability) * 0.018) *
      gravity *
      (1 - Math.max(convergenceStrength, convergenceProgress)),
    streamLength:
      ring.radius *
      (0.16 + scale * 0.04 + (0.76 + spellIR.range * 0.34 + spellIR.force * 0.96) * travelFactor) *
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
      (1 - focus * 0.42),
    depthPush:
      ring.radius *
      (0.004 + spellIR.spread * 0.016) *
      (1.08 - spellIR.stability * 0.34) *
      (1 - convergenceStrength * 0.44) *
      (1 - focus * 0.42),
    maxHeightHint: ring.radius * (0.9 + spellIR.force * 1.2 + scale * 0.12),
    suspendedLife: spellLifetimeFrames(spellIR),
    suspendedHeight: ring.radius * (0.34 + spellIR.force * 0.16 + spellIR.spread * 0.1 + scale * 0.08),
    suspendedRadius,
    suspendedBob: ring.radius * (0.008 + (1 - spellIR.stability) * 0.012),
    suspendedWander: suspendedRadius * (0.05 + (1 - spellIR.stability) * 0.08),
    suspendedTension: 0.012 + spellIR.stability * 0.014,
    suspendedDamping: 0.958 + spellIR.stability * 0.026,
    minRadius: 3.6 * (0.86 + scale * 0.14),
    radiusScale: (0.82 + scale * 0.2) * (0.92 + spellIR.force * 0.18) * (1 - convergenceStrength * 0.14)
  };
}

// Pick a starting point on the tilted ring surface, then the particle lifts away from that point.
function randomPortalSource(portal, flow) {
  const angle = Math.random() * Math.PI * 2;
  const radius = Math.sqrt(Math.random());

  return {
    x: portal.center.x + Math.cos(angle) * flow.sourceRadiusX * radius,
    y: portal.center.y + Math.sin(angle) * flow.sourceRadiusY * radius
  };
}

function spawnSuspendedWaterParticle(spellIR, portal, flow, frame) {
  const angle = Math.random() * Math.PI * 2;
  const spread = Math.sqrt(Math.random()) * flow.suspendedRadius;
  const phase = randomBetween(0, Math.PI * 2);
  const wobble = Math.sin(frame * 0.06 + phase) * (1 - spellIR.stability) * 0.52;
  const homeLateral = Math.cos(angle) * spread;
  const homeDepth = Math.sin(angle) * spread;
  const baseRadius = randomBetween(7.4, 14.6) * flow.radiusScale;
  const homeForward = flow.directionCoherence * flow.suspendedRadius * 0.72 + randomBetween(
    -flow.suspendedRadius * 0.08,
    flow.suspendedRadius * 0.08
  );

  return {
    sourceX: portal.center.x,
    sourceY: portal.center.y,
    forward: homeForward + randomBetween(-flow.suspendedRadius * 0.04, flow.suspendedRadius * 0.04),
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
function spawnWaterParticle(spellIR, ring, portal, flow, frame) {
  if (flow.suspended) {
    return spawnSuspendedWaterParticle(spellIR, portal, flow, frame);
  }

  const source = randomPortalSource(portal, flow);
  const phase = randomBetween(0, Math.PI * 2);
  const streamRadius = Math.max(flow.sourceRadiusX, flow.sourceRadiusY);
  const baseRadius = randomBetween(6.4, 12.8) * flow.radiusScale;
  const wobble = Math.sin(frame * 0.08 + phase) * (1 - spellIR.stability) * 0.65;

  return {
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
    life: flow.converging ? flow.suspendedLife : randomBetween(56, 98) * (0.84 + spellIR.stability * 0.32)
  };
}

function updateSuspendedWaterParticle(particle, flow, dt) {
  particle.age += dt;

  const targetForward = particle.homeForward + Math.cos(particle.phase + particle.age * 0.026) * flow.suspendedWander * 0.18;
  const targetHeight = particle.homeHeight + Math.sin(particle.phase * 1.4 + particle.age * 0.028) * flow.suspendedBob;
  const targetLateral = particle.homeLateral + Math.sin(particle.phase + particle.age * 0.034) * flow.suspendedWander;
  const targetDepth = particle.homeDepth + Math.cos(particle.phase * 1.2 + particle.age * 0.032) * flow.suspendedWander;

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
function updateWaterParticle(particle, flow, dt) {
  if (flow.suspended) {
    updateSuspendedWaterParticle(particle, flow, dt);
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

  const speed = Math.hypot(particle.vForward, particle.vHeight, particle.vLateral, particle.vDepth);
  const shimmer = 0.94 + Math.sin(particle.phase + particle.age * 0.18) * 0.06;
  particle.radius = Math.max(flow.minRadius, particle.baseRadius - speed * 0.18) * shimmer;

  if (!flow.converging && (particle.forward > flow.streamLength || particle.height < -flow.sourceRadiusY * 0.72)) {
    particle.age = particle.life + 1;
  }
}

// Project the local 3D-ish particle state back onto the existing 2D effect canvas.
function projectWaterParticle(particle, flow) {
  const base = {
    x: particle.sourceX + flow.direction.x * particle.forward + flow.side.x * particle.lateral,
    y: particle.sourceY + flow.direction.y * particle.forward - particle.height + particle.depth * DEPTH_SCALE
  };

  return convergePoint(base, flow.convergence, particle.phase);
}

// Broad blue blobs overlap first, giving the stream its transparent water body.
function drawWaterMass(ctx, projected, particle, flow, alpha) {
  const heightRatio = clamp(particle.height / Math.max(1, flow.maxHeightHint));
  const radius = particle.radius * (1.5 + heightRatio * 0.22) * (1 - flow.convergenceProgress * 0.28);
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
  gradient.addColorStop(1, "rgba(4, 61, 173, 0)");

  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// A smaller inner pass keeps the blobs readable without letting white dominate the water.
function drawWaterCore(ctx, projected, particle, flow, alpha) {
  const heightRatio = clamp(particle.height / Math.max(1, flow.maxHeightHint));
  const radius = particle.radius * (0.94 + heightRatio * 0.18) * (1 - flow.convergenceProgress * 0.24);
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
  core.addColorStop(1, "rgba(7, 83, 202, 0)");

  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(projected.x, projected.y, radius, 0, Math.PI * 2);
  ctx.fill();
}

// Tiny deterministic highlights add a wet edge while avoiding frame-to-frame sparkle.
function drawWaterHighlight(ctx, projected, particle, alpha) {
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

function visibleWaterParticle(particle, flow, spellIR) {
  const alpha =
    flow.suspended || flow.converging
      ? steadyParticleAlpha(particle, spellIR, 12)
      : particleAlpha(particle) * Math.min(1, particle.age / 8) * effectOpacity(spellIR);
  if (alpha <= 0) {
    return null;
  }

  const projected = projectWaterParticle(particle, flow);
  if (!Number.isFinite(projected.x) || !Number.isFinite(projected.y)) {
    return null;
  }

  return { projected, alpha: alpha * WATER_ALPHA_SCALE };
}

export function drawWaterEffect(ctx, state, spellIR, ring, dt, config) {
  const scale = effectScale(spellIR);
  const portal = activePortalPlane(ctx.canvas, ring);
  state.waterFrame = (state.waterFrame ?? 0) + dt;
  const flow = waterFlowConfig(spellIR, ring, portal, state.waterFrame);
  const baseCount = flow.suspended ? 118 + spellIR.force * 74 + spellIR.spread * 56 : 96 + spellIR.force * 122;
  const targetCount = scaledParticleCount(baseCount * (0.66 + scale * 0.22), spellIR, config);

  while (state.particles.length < targetCount) {
    state.particles.push(spawnWaterParticle(spellIR, ring, portal, flow, state.waterFrame));
  }

  const visibleParticles = [];
  for (const particle of state.particles) {
    updateWaterParticle(particle, flow, dt);
    const visible = visibleWaterParticle(particle, flow, spellIR);
    if (visible) {
      visibleParticles.push({ particle, ...visible });
    }
  }

  // Draw low-alpha blue layers first so the paper can show through the water body.
  ctx.save();
  ctx.globalCompositeOperation = "source-over";
  for (const { particle, projected, alpha } of visibleParticles) {
    drawWaterMass(ctx, projected, particle, flow, alpha);
  }

  ctx.globalCompositeOperation = "screen";
  for (const { particle, projected, alpha } of visibleParticles) {
    drawWaterCore(ctx, projected, particle, flow, alpha);
    drawWaterHighlight(ctx, projected, particle, alpha);
  }
  ctx.restore();

  pruneParticles(state);
}
