import { randomBetween } from "../../utils/geometry.js";
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
} from "./effectUtils.js";

function earthFlowConfig(spellIR, ring, portal, frame) {
  const flow = elementFlow(spellIR, portal, frame);
  const { scale, focus, convergence } = flow;

  return {
    ...flow,
    sourceRadiusX: narrowedByFocusAndConvergence(Math.min(0.78, 0.34 + scale * 0.1 + spellIR.spread * 0.18), focus, convergence.strength, 0.28, 0.32),
    sourceRadiusY: narrowedByFocusAndConvergence(Math.min(0.78, 0.4 + scale * 0.08 + spellIR.spread * 0.16), focus, convergence.strength, 0.28, 0.32),
    surfaceJitter: narrowedByFocusAndConvergence(ring.radius * (0.025 + spellIR.spread * 0.06) * scale, focus, convergence.strength, 0.4, 0.34),
    speed: randomBetween(0.8, 2.8) * (0.6 + spellIR.force) * (0.9 + scale * 0.08) * (1 - convergence.strength * 0.32)
  };
}

function spawnEarthParticle(spellIR, portal, flow) {
  const source = randomPortalPoint(
    portal,
    flow.sourceRadiusX,
    flow.sourceRadiusY
  );
  const phase = randomBetween(0, Math.PI * 2);

  return {
    x: source.x + flow.side.x * randomBetween(-flow.surfaceJitter, flow.surfaceJitter),
    y: source.y + flow.side.y * randomBetween(-flow.surfaceJitter, flow.surfaceJitter),
    vx: flow.direction.x * flow.speed + randomBetween(-0.35, 0.35) * flow.scale,
    vy: flow.direction.y * flow.speed + randomBetween(-0.35, 0.35) * flow.scale,
    radius: randomBetween(4, 11) * (0.85 + flow.scale * 0.2),
    phase,
    age: 0,
    life: flow.convergence.active ? flow.convergence.life : randomBetween(50, 92)
  };
}

export function drawEarthEffect(ctx, state, spellIR, ring, dt, config) {
  const scale = effectScale(spellIR);
  const opacity = effectOpacity(spellIR);
  const portal = activePortalPlane(ctx.canvas, ring);
  state.earthFrame = (state.earthFrame ?? 0) + dt;
  const flow = earthFlowConfig(spellIR, ring, portal, state.earthFrame);
  const targetCount = scaledParticleCount((68 + spellIR.force * 78) * (0.82 + scale * 0.28), spellIR, config);
  while (state.particles.length < targetCount) {
    state.particles.push(spawnEarthParticle(spellIR, portal, flow));
  }

  for (const particle of state.particles) {
    particle.age += dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 0.985 - flow.convergence.progress * 0.05;
    particle.vy *= 0.985 - flow.convergence.progress * 0.05;

    const depth = particleDepth(particle);
    const alpha = flow.convergence.active
      ? steadyParticleAlpha(particle, spellIR, 10) * (0.78 + depth * 0.22)
      : particleAlpha(particle) * (0.78 + depth * 0.22) * opacity;
    const size = particle.radius * (0.9 + depth * 0.54) * (1 - flow.convergence.progress * 0.22);
    const point = convergePoint(particle, flow.convergence, particle.phase, 1.08);
    ctx.fillStyle = `rgba(111, 83, 45, ${alpha * 0.72})`;
    ctx.beginPath();
    ctx.rect(point.x - size / 2, point.y - size / 2, size, size);
    ctx.fill();
  }

  pruneParticles(state);
}
