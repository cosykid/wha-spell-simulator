/**
 * @file The noise a substance is made of, and the wander that keeps it from
 * standing still. Both are seeded buffers built once per context, so an offline
 * render of a cast is the same file every time.
 *
 * Colour is the first thing that tells a real source from a synthesizer. Flat
 * white noise is a hiss and nothing in the world is one: moving air and water
 * fall about 3dB an octave, and anything with the mass to roar falls about 6.
 * Every body picks its colour, and the formant stack in `bodies.ts` carves the
 * rest.
 */

import { hashSeed, mulberry32, type Rng } from '../rng.js';
import type { NoiseColour } from './voice.js';

/** Seconds of noise per buffer. Long enough that the loop never reads as a pulse. */
const NOISE_SECONDS = 3;

/** Seconds in the wander buffer. Its slowest partial turns around once across it. */
const DRIFT_SECONDS = 4;

/** Partials in the wander. Each is a whole number of cycles, so the buffer loops without a seam. */
const DRIFT_PARTIALS = 16;

/** Loudness every colour is normalized to, so a row's level means the same whichever it picks. */
const TARGET_RMS = 0.3;

const buffers = new WeakMap<BaseAudioContext, Map<string, AudioBuffer>>();

function cached(ctx: BaseAudioContext, key: string, build: () => AudioBuffer): AudioBuffer {
	let byKey = buffers.get(ctx);
	if (!byKey) {
		byKey = new Map();
		buffers.set(ctx, byKey);
	}
	let buffer = byKey.get(key);
	if (!buffer) {
		buffer = build();
		byKey.set(key, buffer);
	}
	return buffer;
}

/**
 * Pink noise by Paul Kellet's filter bank: six one-pole sections summed, which
 * tracks a 3dB an octave fall closely enough that no ear finds the seam.
 */
function pinkFilter(): (white: number) => number {
	let b0 = 0;
	let b1 = 0;
	let b2 = 0;
	let b3 = 0;
	let b4 = 0;
	let b5 = 0;
	let b6 = 0;
	return (white) => {
		b0 = 0.99886 * b0 + white * 0.0555179;
		b1 = 0.99332 * b1 + white * 0.0750759;
		b2 = 0.969 * b2 + white * 0.153852;
		b3 = 0.8665 * b3 + white * 0.3104856;
		b4 = 0.55 * b4 + white * 0.5329522;
		b5 = -0.7616 * b5 - white * 0.016898;
		const pink = b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362;
		b6 = white * 0.115926;
		return pink;
	};
}

/** Brown noise: white integrated, with a slow leak so it never walks off centre. */
function brownFilter(): (white: number) => number {
	let last = 0;
	return (white) => {
		last = (last + 0.02 * white) / 1.02;
		return last;
	};
}

function colourFilter(colour: NoiseColour): (white: number) => number {
	if (colour === 'pink') {
		return pinkFilter();
	}
	if (colour === 'brown') {
		return brownFilter();
	}
	return (white) => white;
}

/**
 * Levels the samples to {@link TARGET_RMS} and rounds the peaks off with a
 * tanh, because brown noise's excursions are several times its own average and
 * a hard clip on them would buzz.
 */
function normalize(samples: Float32Array): void {
	let sum = 0;
	for (const sample of samples) {
		sum += sample * sample;
	}
	const rms = Math.sqrt(sum / samples.length);
	if (rms <= 0) {
		return;
	}
	const gain = TARGET_RMS / rms;
	for (let index = 0; index < samples.length; index += 1) {
		samples[index] = Math.tanh(samples[index] * gain);
	}
}

/** One buffer of each colour per context, seeded rather than drawn from `Math.random`. */
export function noiseBuffer(ctx: BaseAudioContext, colour: NoiseColour): AudioBuffer {
	return cached(ctx, `noise:${colour}`, () => {
		const buffer = ctx.createBuffer(1, Math.round(NOISE_SECONDS * ctx.sampleRate), ctx.sampleRate);
		const samples = buffer.getChannelData(0);
		const rng = mulberry32(hashSeed(`cast-sound-noise:${colour}`));
		const filter = colourFilter(colour);
		for (let index = 0; index < samples.length; index += 1) {
			samples[index] = filter(rng() * 2 - 1);
		}
		normalize(samples);
		return buffer;
	});
}

/**
 * The wander: a slow, seamless, non-repeating-sounding curve in `[-1, 1]`, used
 * wherever a substance has to move without a rate the ear can count. A sine
 * tremolo is the loudest tell in synthesized sound, and this is what replaces
 * it. Playing it back at `rateHz` puts about that many turns in a second.
 */
export function driftBuffer(ctx: BaseAudioContext): AudioBuffer {
	return cached(ctx, 'drift', () => {
		const length = Math.round(DRIFT_SECONDS * ctx.sampleRate);
		const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
		const samples = buffer.getChannelData(0);
		const rng: Rng = mulberry32(hashSeed('cast-sound-drift'));
		const phases = Array.from({ length: DRIFT_PARTIALS }, () => rng() * Math.PI * 2);
		let peak = 0;
		for (let index = 0; index < length; index += 1) {
			const turn = (index / length) * Math.PI * 2;
			let value = 0;
			for (let partial = 1; partial <= DRIFT_PARTIALS; partial += 1) {
				value += Math.sin(turn * partial + phases[partial - 1]) / partial;
			}
			samples[index] = value;
			peak = Math.max(peak, Math.abs(value));
		}
		for (let index = 0; index < length; index += 1) {
			samples[index] /= peak;
		}
		return buffer;
	});
}

/** A looping noise source of one colour, started at `startAt` and stopped at `stopAt`. */
export function noiseSource(
	ctx: BaseAudioContext,
	colour: NoiseColour,
	startAt: number,
	stopAt: number
): AudioBufferSourceNode {
	const source = ctx.createBufferSource();
	source.buffer = noiseBuffer(ctx, colour);
	source.loop = true;
	source.start(startAt);
	source.stop(stopAt);
	return source;
}

/**
 * Wires the wander into a param: the param's own value stays the centre and the
 * drift adds `depth` either side of it, `rateHz` turns a second.
 */
export function drift(
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
	const source = ctx.createBufferSource();
	source.buffer = driftBuffer(ctx);
	source.loop = true;
	source.playbackRate.value = rateHz;
	const amount = ctx.createGain();
	amount.gain.value = depth;
	source.connect(amount);
	amount.connect(target);
	source.start(startAt);
	source.stop(stopAt);
}
