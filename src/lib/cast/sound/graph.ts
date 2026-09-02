/**
 * @file The Web Audio building blocks every cue is made of: the one noise
 * buffer, the loudness curve on the cast clock, and the short envelopes an
 * event decays along.
 *
 * Everything here takes a `BaseAudioContext`, so the same graph renders live
 * through an `AudioContext` and offline through an `OfflineAudioContext`. The
 * cast clock is mapped onto the audio clock once, by {@link AudioClock}, and
 * every schedule goes through it.
 */

import { hashSeed, mulberry32 } from '../rng.js';
import { SAMPLE_MS } from './layers.js';

/**
 * Where the cast clock sits on the audio clock. `activatedAt` is the audio time
 * of the cast's zero, and `fromMs` is the earliest cast millisecond anything may
 * still be scheduled at, because the audio clock never takes an event in its
 * past: a cast joined late starts from where it is.
 */
export interface AudioClock {
	activatedAt: number;
	fromMs: number;
}

/** Audio time of a cast millisecond, never earlier than the clock's `fromMs`. */
export function timeAt(clock: AudioClock, tMs: number): number {
	return clock.activatedAt + Math.max(tMs, clock.fromMs) / 1000;
}

/** Seconds of looping white noise. Long enough that the loop never reads as a pulse. */
const NOISE_SECONDS = 2;

/** The smallest gain a ramp may target, since an exponential ramp cannot reach zero. */
export const SILENT = 0.0001;

const noiseBuffers = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * One buffer of white noise per context, seeded rather than drawn from
 * `Math.random`, so an offline render of a cast is the same file every time.
 */
export function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
	let buffer = noiseBuffers.get(ctx);
	if (!buffer) {
		buffer = ctx.createBuffer(1, Math.round(NOISE_SECONDS * ctx.sampleRate), ctx.sampleRate);
		const samples = buffer.getChannelData(0);
		const rng = mulberry32(hashSeed('cast-sound-noise'));
		for (let index = 0; index < samples.length; index += 1) {
			samples[index] = rng() * 2 - 1;
		}
		noiseBuffers.set(ctx, buffer);
	}
	return buffer;
}

/** A looping noise source, started at `startAt` and stopped at `stopAt`. */
export function noiseSource(
	ctx: BaseAudioContext,
	startAt: number,
	stopAt: number
): AudioBufferSourceNode {
	const source = ctx.createBufferSource();
	source.buffer = noiseBuffer(ctx);
	source.loop = true;
	source.start(startAt);
	source.stop(stopAt);
	return source;
}

/**
 * Writes a layer's sampled loudness onto a gain param from the clock's `fromMs`
 * on, so a cast joined late picks up its curve mid-way instead of replaying
 * the start. Returns the audio time the curve ends, or null when the whole
 * curve is already in the past.
 */
export function scheduleGain(
	param: AudioParam,
	gain: readonly number[],
	startMs: number,
	clock: AudioClock,
	scale: number
): number | null {
	const first = Math.max(0, Math.ceil((clock.fromMs - startMs) / SAMPLE_MS));
	if (first >= gain.length) {
		return null;
	}
	const startAt = clock.activatedAt + (startMs + first * SAMPLE_MS) / 1000;
	const values = Float32Array.from(gain.slice(first), (value) => value * scale);
	if (values.length < 2) {
		param.setValueAtTime(values[0], startAt);
		return startAt;
	}
	const duration = ((values.length - 1) * SAMPLE_MS) / 1000;
	param.setValueCurveAtTime(values, startAt, duration);
	return startAt + duration;
}

/**
 * A one-shot envelope: up to `peak` over `attackS`, then an exponential fall to
 * silence over `decayS`. The shape every strike, tick and grain decays along.
 */
export function decayEnvelope(
	param: AudioParam,
	at: number,
	peak: number,
	attackS: number,
	decayS: number
): void {
	param.setValueAtTime(SILENT, at);
	param.linearRampToValueAtTime(Math.max(peak, SILENT), at + attackS);
	param.exponentialRampToValueAtTime(SILENT, at + attackS + decayS);
}

/**
 * A low-frequency oscillator wired into a param: the param's own value is the
 * centre and the oscillator adds `depth` either side of it.
 */
export function modulate(
	ctx: BaseAudioContext,
	target: AudioParam,
	rateHz: number,
	depth: number,
	startAt: number,
	stopAt: number
): void {
	if (rateHz <= 0 || depth <= 0) {
		return;
	}
	const lfo = ctx.createOscillator();
	lfo.frequency.value = rateHz;
	const amount = ctx.createGain();
	amount.gain.value = depth;
	lfo.connect(amount);
	amount.connect(target);
	lfo.start(startAt);
	lfo.stop(stopAt);
}
