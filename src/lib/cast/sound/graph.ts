/**
 * @file The Web Audio building blocks every cue is made of: where the cast
 * clock sits on the audio clock, the loudness curve written along it, the short
 * envelopes an event decays through, and the two ways a signal is bent.
 *
 * Everything here takes a `BaseAudioContext`, so the same graph renders live
 * through an `AudioContext` and offline through an `OfflineAudioContext`. The
 * cast clock is mapped onto the audio clock once, by {@link AudioClock}, and
 * every schedule goes through it.
 */

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

/** The smallest gain a ramp may target, since an exponential ramp cannot reach zero. */
export const SILENT = 0.0001;

/** Seconds a source outlives the last thing it plays, so no tail is cut. */
export const SOURCE_TAIL_S = 0.05;

/** Samples in a saturation curve. Enough that the bend is smooth at any drive. */
const SHAPER_SAMPLES = 1024;

export function gainNode(ctx: BaseAudioContext, value: number): GainNode {
	const node = ctx.createGain();
	node.gain.value = value;
	return node;
}

export function bandpass(ctx: BaseAudioContext, centerHz: number, q: number): BiquadFilterNode {
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = centerHz;
	filter.Q.value = q;
	return filter;
}

export function lowpass(ctx: BaseAudioContext, hz: number): BiquadFilterNode {
	const filter = ctx.createBiquadFilter();
	filter.type = 'lowpass';
	filter.frequency.value = hz;
	return filter;
}

/**
 * A soft saturation, the harmonics anything loud enough picks up on its way out
 * of whatever is making it. A tanh, so it rounds rather than clips, and a
 * `drive` of zero returns null because a wave shaper that does nothing is still
 * a node in the path.
 *
 * The curve is divided back down by its own slope at the origin, so drive
 * squashes the peaks and leaves everything quiet where it was. A shaper that
 * changed the level would be a volume knob wearing a timbre's name, and the
 * rows would then be tuned against each other rather than described.
 */
export function saturator(ctx: BaseAudioContext, drive: number): WaveShaperNode | null {
	if (drive <= 0) {
		return null;
	}
	const shaper = ctx.createWaveShaper();
	const curve = new Float32Array(SHAPER_SAMPLES);
	const amount = 1 + drive * 8;
	// The lift saturation really does give, and no more: everything above it is
	// the peaks being folded down.
	const makeup = (1 + drive) / amount;
	for (let index = 0; index < SHAPER_SAMPLES; index += 1) {
		const x = (index / (SHAPER_SAMPLES - 1)) * 2 - 1;
		curve[index] = Math.tanh(x * amount) * makeup;
	}
	shaper.curve = curve;
	shaper.oversample = '2x';
	return shaper;
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
 * centre and the oscillator adds `depth` either side of it. Only for motion
 * that really is periodic, like a held mass bobbing or a vortex turning. What a
 * material does on its own wanders instead, through `noise.ts`.
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
