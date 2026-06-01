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

function windFlowConfig(spellIR, ring, portal, frame) {
  const flow = elementFlow(spellIR, portal, frame);
  const { scale, focus, convergence } = flow;

  return {
    ...flow,
    sourceRadiusX: narrowedByFocusAndConvergence(Math.min(0.92, 0.44 + scale * 0.1 + spellIR.spread * 0.24), focus, convergence.strength, 0.3, 0.28),
    sourceRadiusY: narrowedByFocusAndConvergence(Math.min(0.92, 0.5 + scale * 0.08 + spellIR.spread * 0.22), focus, convergence.strength, 0.3, 0.28),
    surfaceJitter: narrowedByFocusAndConvergence(ring.radius * (0.04 + spellIR.spread * 0.1) * scale, focus, convergence.strength, 0.42, 0.34),
    speed: randomBetween(2.4, 5.2) * (0.6 + spellIR.force) * (0.88 + scale * 0.12) * (1 - convergence.strength * 0.28)
  };
}

function spawnWindParticle(spellIR, portal, flow) {
  const source = randomPortalPoint(
    portal,
    flow.sourceRadiusX,
    flow.sourceRadiusY
  );
  const phase = randomBetween(0, Math.PI * 2);

  return {
    x: source.x + flow.side.x * randomBetween(-flow.surfaceJitter, flow.surfaceJitter),
    y: source.y + flow.side.y * randomBetween(-flow.surfaceJitter, flow.surfaceJitter),
    vx: flow.direction.x * flow.speed + flow.side.x * randomBetween(-0.22, 0.22) * flow.scale,
    vy: flow.direction.y * flow.speed + flow.side.y * randomBetween(-0.22, 0.22) * flow.scale,
    curl: randomBetween(-0.018, 0.018) * (1 + (1 - spellIR.stability) * 3),
    phase,
    age: 0,
    life: flow.convergence.active ? flow.convergence.life : randomBetween(38, 76)
  };
}

export function drawWindEffect(ctx, state, spellIR, ring, dt, config) {
  const scale = effectScale(spellIR);
  const opacity = effectOpacity(spellIR);
  const portal = activePortalPlane(ctx.canvas, ring);
  state.windFrame = (state.windFrame ?? 0) + dt;
  const flow = windFlowConfig(spellIR, ring, portal, state.windFrame);
  const targetCount = scaledParticleCount((92 + spellIR.force * 104) * (0.82 + scale * 0.32), spellIR, config);
  while (state.particles.length < targetCount) {
    state.particles.push(spawnWindParticle(spellIR, portal, flow));
  }

  ctx.lineCap = "round";
  for (const particle of state.particles) {
    particle.age += dt;
    const oldX = particle.x;
    const oldY = particle.y;
    particle.vx += -particle.vy * particle.curl * dt;
    particle.vy += particle.vx * particle.curl * dt;
    particle.x += particle.vx * dt;
    particle.y += particle.vy * dt;
    particle.vx *= 1 - flow.convergence.progress * 0.045;
    particle.vy *= 1 - flow.convergence.progress * 0.045;

    const depth = particleDepth(particle);
    const alpha = flow.convergence.active
      ? steadyParticleAlpha(particle, spellIR, 10) * (0.78 + depth * 0.2)
      : particleAlpha(particle) * (0.78 + depth * 0.2) * opacity;
    const lineWidth = (2.5 + spellIR.force * 3) * (0.88 + scale * 0.22) * (0.9 + depth * 0.64);
    const start = convergePoint({ x: oldX, y: oldY }, flow.convergence, particle.phase, 1.1);
    const end = convergePoint(particle, flow.convergence, particle.phase + 0.27, 1.1);

    ctx.strokeStyle = `rgba(184, 232, 215, ${alpha * 0.22})`;
    ctx.lineWidth = lineWidth * 2.7;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();

    ctx.strokeStyle = `rgba(224, 248, 231, ${alpha * 0.86})`;
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.moveTo(start.x, start.y);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
  }

  pruneParticles(state);
}
