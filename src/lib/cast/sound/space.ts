/**
 * @file The room the cast happens in, as a seeded impulse response.
 *
 * A dry sound is the loudest tell that nothing really made it: everything heard
 * anywhere reaches the ear twice, once straight and once off the walls. The
 * response here is built rather than sampled, so the app still ships no audio:
 * a few early reflections off near surfaces, then a diffuse tail that decays
 * and darkens the way air absorbs the top of anything travelling through it.
 *
 * How wet a substance is comes from its row's `space`, which is a statement
 * about distance: crystal and light ring off the walls, wind is right against
 * the ear.
 */

import { hashSeed, mulberry32 } from '../rng.js';

/** Seconds of response. Past this the tail is under the noise floor of anything else playing. */
const TAIL_SECONDS = 1.4;

/** Seconds before the first reflection arrives, which is what says how big the room is. */
const PRE_DELAY_S = 0.008;

/** Reflections off near surfaces, before the tail turns into a wash. */
const EARLY_COUNT = 7;
const EARLY_WINDOW_S = 0.06;

/** How fast the tail falls. Larger is a smaller, deader room. */
const DECAY = 5.5;

/** The one-pole damping coefficient at the head of the tail and at its end. */
const DAMPING = { open: 0.55, closed: 0.04 } as const;

const responses = new WeakMap<BaseAudioContext, AudioBuffer>();

/**
 * Two channels of decorrelated noise under one decay, plus the early
 * reflections in front of it. The channels share the envelope and not the
 * noise, which is what gives the tail its width.
 */
function buildResponse(ctx: BaseAudioContext): AudioBuffer {
	const rate = ctx.sampleRate;
	const length = Math.round(TAIL_SECONDS * rate);
	const buffer = ctx.createBuffer(2, length, rate);
	const rng = mulberry32(hashSeed('cast-sound-room'));
	for (let channel = 0; channel < 2; channel += 1) {
		const samples = buffer.getChannelData(channel);
		let low = 0;
		for (let index = 0; index < length; index += 1) {
			const t = index / length;
			const damping = DAMPING.open + (DAMPING.closed - DAMPING.open) * t;
			low += damping * ((rng() * 2 - 1) * Math.exp(-DECAY * t) - low);
			samples[index] = low;
		}
	}
	const early = Math.round(PRE_DELAY_S * rate);
	for (let reflection = 0; reflection < EARLY_COUNT; reflection += 1) {
		const at = early + Math.round(rng() * EARLY_WINDOW_S * rate);
		const level = (1 - reflection / EARLY_COUNT) * 0.5;
		for (let channel = 0; channel < 2; channel += 1) {
			buffer.getChannelData(channel)[at] += level * (rng() < 0.5 ? -1 : 1);
		}
	}
	// Silence before the pre-delay, so the room never arrives before the source.
	for (let channel = 0; channel < 2; channel += 1) {
		buffer.getChannelData(channel).fill(0, 0, early);
	}
	return buffer;
}

/** One response per context, since building it walks a couple of hundred thousand samples. */
export function roomResponse(ctx: BaseAudioContext): AudioBuffer {
	let response = responses.get(ctx);
	if (!response) {
		response = buildResponse(ctx);
		responses.set(ctx, response);
	}
	return response;
}

/**
 * The send everything wet goes into. Built per performance rather than per
 * context so a cast that is cut takes its own room away with it.
 */
export function createRoom(ctx: BaseAudioContext, out: AudioNode): GainNode {
	const send = ctx.createGain();
	const convolver = ctx.createConvolver();
	convolver.buffer = roomResponse(ctx);
	send.connect(convolver).connect(out);
	return send;
}
