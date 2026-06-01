import { drawFireEffect } from "./effects/fireEffect.js";
import { drawWaterEffect } from "./effects/waterEffect.js";
import { drawWindEffect } from "./effects/windEffect.js";
import { drawEarthEffect } from "./effects/earthEffect.js";
import { drawLightEffect } from "./effects/lightEffect.js";
import { resetParticleState } from "./effects/effectUtils.js";
import { clamp } from "../utils/geometry.js";

const SPELL_END_FADE_MS = 420;
const TARGET_FRAME_MS = 16.67;
const DELTA_FRAME_MIN = 0.4;
const DELTA_FRAME_MAX = 2.5;
const FULL_CIRCLE_RAD = Math.PI * 2;
const RING_GLOW_IDLE_ALPHA = 0.06;
const RING_GLOW_PREPARED_ALPHA = 0.12;
const RING_GLOW_LINE_WIDTH = 6;
const PREPARED_PULSE_PERIOD_MS = 520;
const PREPARED_GLOW_BASE_ALPHA = 0.08;
const PREPARED_GLOW_PULSE_ALPHA = 0.05;
const PREPARED_GLOW_RADIUS_SCALE = 0.7;
const FAILED_FLICKER_PERIOD_MS = 70;
const FAILED_FLICKER_BASE_ALPHA = 0.14;
const FAILED_FLICKER_PULSE_ALPHA = 0.16;
const FAILED_FLICKER_LINE_WIDTH = 7;
const FAILED_FLICKER_DASH = [10, 14];
const FAILED_FLICKER_RADIUS_SCALE = 0.92;
const FAILED_FLICKER_RADIUS_PULSE_SCALE = 0.02;

const EFFECTS = {
  fire: drawFireEffect,
  water: drawWaterEffect,
  wind: drawWindEffect,
  earth: drawEarthEffect,
  light: drawLightEffect
};

function spellDurationMs(spellIR) {
  const durationSeconds = Number(spellIR?.duration);
  return Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds * 1000 : 0;
}

function spellEmission(spellIR, timestamp) {
  const durationMs = spellDurationMs(spellIR);
  if (!spellIR?.active || durationMs <= 0 || typeof spellIR.activatedAt !== "number") {
    return 0;
  }

  const elapsed = Math.max(0, timestamp - spellIR.activatedAt);
  if (elapsed <= durationMs) {
    return 1;
  }

  return clamp(1 - (elapsed - durationMs) / SPELL_END_FADE_MS);
}

export class SpellEffectRenderer {
  constructor(canvas, config) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.config = config;
    this.state = { particles: [] };
    this.lastSignature = null;
    this.lastTime = null;
  }

  render(spellIR, ring, timestamp, options = {}) {
    const width = this.canvas.width;
    const height = this.canvas.height;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, width, height);

    if (!ring?.found || !spellIR) {
      return;
    }

    const dt = Math.min(
      DELTA_FRAME_MAX,
      Math.max(DELTA_FRAME_MIN, this.lastTime === null ? 1 : (timestamp - this.lastTime) / TARGET_FRAME_MS)
    );
    this.lastTime = timestamp;

    if (this.lastSignature !== spellIR.signature) {
      this.lastSignature = spellIR.signature;
      resetParticleState(this.state);
    }

    if (!spellIR.active && options.showGuides) {
      this.drawRingGlow(ring, spellIR.prepared);
    }

    if (!spellIR.valid) {
      if (options.showGuides) {
        this.drawFailedFlicker(ring, timestamp);
      }
      return;
    }

    if (spellIR.prepared) {
      if (options.showGuides) {
        this.drawPreparedGlow(ring, timestamp);
      }
      return;
    }

    const drawEffect = EFFECTS[spellIR.element];
    if (!drawEffect) {
      return;
    }

    const emission = spellEmission(spellIR, timestamp);
    if (emission <= 0 && !this.state.particles.length) {
      return;
    }

    const renderSpellIR = { ...spellIR, emission };
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    drawEffect(ctx, this.state, renderSpellIR, ring, dt, this.config);
    ctx.restore();
  }

  drawRingGlow(ring, isPrepared) {
    const alpha = isPrepared ? RING_GLOW_PREPARED_ALPHA : RING_GLOW_IDLE_ALPHA;
    this.ctx.save();
    this.ctx.strokeStyle = `rgba(255, 217, 114, ${alpha})`;
    this.ctx.lineWidth = RING_GLOW_LINE_WIDTH;
    this.ctx.beginPath();
    this.ctx.arc(ring.center.x, ring.center.y, ring.radius, 0, FULL_CIRCLE_RAD);
    this.ctx.stroke();
    this.ctx.restore();
  }

  drawPreparedGlow(ring, timestamp) {
    const pulse = 0.5 + Math.sin(timestamp / PREPARED_PULSE_PERIOD_MS) * 0.5;
    this.ctx.save();
    this.ctx.fillStyle = `rgba(88, 171, 174, ${PREPARED_GLOW_BASE_ALPHA + pulse * PREPARED_GLOW_PULSE_ALPHA})`;
    this.ctx.beginPath();
    this.ctx.arc(ring.center.x, ring.center.y, ring.radius * PREPARED_GLOW_RADIUS_SCALE, 0, FULL_CIRCLE_RAD);
    this.ctx.fill();
    this.ctx.restore();
  }

  drawFailedFlicker(ring, timestamp) {
    const pulse = Math.max(0, Math.sin(timestamp / FAILED_FLICKER_PERIOD_MS));
    this.ctx.save();
    this.ctx.strokeStyle = `rgba(184, 69, 49, ${FAILED_FLICKER_BASE_ALPHA + pulse * FAILED_FLICKER_PULSE_ALPHA})`;
    this.ctx.lineWidth = FAILED_FLICKER_LINE_WIDTH;
    this.ctx.setLineDash(FAILED_FLICKER_DASH);
    this.ctx.beginPath();
    this.ctx.arc(
      ring.center.x,
      ring.center.y,
      ring.radius * (FAILED_FLICKER_RADIUS_SCALE + pulse * FAILED_FLICKER_RADIUS_PULSE_SCALE),
      0,
      FULL_CIRCLE_RAD
    );
    this.ctx.stroke();
    this.ctx.restore();
  }
}
