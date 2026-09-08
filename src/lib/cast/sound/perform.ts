/**
 * @file `performSoundScore`: a sound score played through a Web Audio graph.
 * Every layer, the strike, the seal tick and every grain is scheduled on the
 * audio clock in one pass, so the cast runs to its end on its own: a stalled
 * frame loop, a hidden tab, nothing after this call can make it late.
 *
 * This file is the wiring and nothing else. What a layer is made of lives in
 * `bodies.ts`, what a hit is made of in `impacts.ts`, and the room both are
 * heard in is `space.ts`. The graph is the same for a live `AudioContext` and
 * an `OfflineAudioContext`, which is how a cast is rendered to a file and
 * measured.
 *
 * @example
 * const performance = performSoundScore(ctx, bus, sound, { activatedAt, fromMs });
 * performance.fadeOut(ctx.currentTime, 0.06);
 */

import { SILENT, gainNode } from './graph.js';
import { createRoom } from './space.js';
import { performLayer } from './bodies.js';
import { performGrain, performSealTick, performStrike } from './impacts.js';
import type { AudioClock } from './graph.js';
import type { SoundScore } from './cues.js';

/** A cast being performed. Let it run out, or fade it and give the graph back. */
export interface Performance {
	/** Ramp the whole cast to silence from `atTime` over `seconds`. */
	fadeOut(atTime: number, seconds: number): void;
	/** Detach the cast's graph. Call once it has faded. */
	disconnect(): void;
}

/**
 * Plays a whole sound score into `out`, from the clock's `fromMs` on. Every
 * source is given its own stop time, so a cast that is left alone ends itself
 * and a cast cut short is faded through the bus and detached.
 */
export function performSoundScore(
	ctx: BaseAudioContext,
	out: AudioNode,
	sound: SoundScore,
	clock: AudioClock
): Performance {
	const bus = gainNode(ctx, 1);
	bus.connect(out);
	const wet = createRoom(ctx, bus);
	const { voice } = sound;
	performSealTick(ctx, bus, clock);
	for (const layer of sound.layers) {
		performLayer(ctx, bus, wet, layer, voice, clock);
	}
	performStrike(ctx, bus, wet, sound.strike, voice, clock);
	for (const grain of sound.strike.scatter) {
		performGrain(ctx, bus, wet, grain, voice, clock);
	}
	for (const grain of sound.grains) {
		performGrain(ctx, bus, wet, grain, voice, clock);
	}
	return {
		fadeOut(atTime, seconds) {
			bus.gain.cancelScheduledValues(atTime);
			bus.gain.setValueAtTime(bus.gain.value, atTime);
			bus.gain.exponentialRampToValueAtTime(SILENT, atTime + seconds);
		},
		disconnect() {
			bus.disconnect();
		}
	};
}
