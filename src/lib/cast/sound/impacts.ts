/**
 * @file Everything a cast hits with: R-01's strike, the tick of the ring
 * closing, and the small events a substance throws off while it manifests.
 *
 * They share a file because they share a physics. An impact is an edge, some
 * air moved out of the way, and then whatever the thing is made of ringing at
 * its own pitches and dying at its own rates. Unequal decays are most of what
 * separates something struck from a beep, so every mode here carries its own.
 */

import { drift, noiseSource } from './noise.js';
import {
	SOURCE_TAIL_S,
	bandpass,
	decayEnvelope,
	gainNode,
	timeAt,
	type AudioClock
} from './graph.js';
import type { GrainCue } from './grains.js';
import type { StrikeCue } from './cues.js';
import type { Mode, NoiseColour, VoiceRow } from './voice.js';

/** Trims that put an event at the same loudness as a body. */
const TRIM = { noise: 5, tone: 0.8, grain: 1.2 } as const;

/** Cast milliseconds late the seal tick may still play. Later than this and the cast was joined, not started. */
const TICK_LATE_MS = 40;

/** The edge of an impact: broad, bright, and over before anything else starts. */
const CLICK = { hz: 3000, q: 0.6, attackS: 0.0004, decayMs: 7 } as const;

/** Cents between the two copies of a long mode, so it beats the way anything real does. */
const MODE_BEAT_CENTS = 3;

/** A mode short enough that beating it would only smear it. */
const MODE_BEAT_FLOOR_MS = 300;

/** How far a bubble's pitch climbs as it collapses. Smaller bubbles climb further. */
const BUBBLE_RISE = 1.9;

/** A pebble bounces more than once, each time sooner and quieter. */
const GRIT_BOUNCES = [
	{ atMs: 0, level: 1 },
	{ atMs: 7, level: 0.5 },
	{ atMs: 12, level: 0.22 }
] as const;

/** The inharmonic partials of struck glass, and the share of the decay each keeps. */
const CHIME_MODES = [
	{ ratio: 1, level: 1, decay: 1 },
	{ ratio: 2.76, level: 0.4, decay: 0.5 },
	{ ratio: 5.4, level: 0.16, decay: 0.25 }
] as const;

/** A dry tick on paper: no pitch of its own, just the two short resonances of the board under it. */
const SEAL_TICK = {
	level: 0.3,
	hz: 4200,
	q: 0.8,
	decayMs: 9,
	modes: [
		{ hz: 1850, level: 0.1, decayMs: 28 },
		{ hz: 2960, level: 0.05, decayMs: 14 }
	]
} as const;

/** A short burst of band-passed noise: every edge, chip and crack in the file. */
function burst(
	ctx: BaseAudioContext,
	out: AudioNode,
	at: number,
	level: number,
	options: { colour?: NoiseColour; hz: number; q: number; decayS: number; attackS?: number }
): void {
	const { colour = 'white', hz, q, decayS, attackS = 0.001 } = options;
	const gain = gainNode(ctx, 0);
	decayEnvelope(gain.gain, at, level * TRIM.noise, attackS, decayS);
	noiseSource(ctx, colour, at, at + attackS + decayS + SOURCE_TAIL_S)
		.connect(bandpass(ctx, hz, q))
		.connect(gain)
		.connect(out);
}

/**
 * Modes ringing after a hit. Each is a sine at its own pitch decaying at its
 * own rate, and the long ones are doubled a few cents apart so they beat.
 */
function ringModes(
	ctx: BaseAudioContext,
	out: AudioNode,
	modes: readonly Mode[],
	at: number,
	loudness: number
): void {
	for (const mode of modes) {
		const decayS = mode.decayMs / 1000;
		const gain = gainNode(ctx, 0);
		decayEnvelope(gain.gain, at, mode.level * loudness * TRIM.tone, 0.002, decayS);
		gain.connect(out);
		const beats = mode.decayMs >= MODE_BEAT_FLOOR_MS;
		for (const side of beats ? [-0.5, 0.5] : [0]) {
			const osc = ctx.createOscillator();
			osc.frequency.value = mode.hz;
			osc.detune.value = MODE_BEAT_CENTS * side;
			osc.connect(gainNode(ctx, beats ? 0.5 : 1)).connect(gain);
			osc.start(at);
			osc.stop(at + decayS + SOURCE_TAIL_S);
		}
	}
}

/** A pitch dropping under an impact: the sound of something heavy arriving. */
function thump(
	ctx: BaseAudioContext,
	out: AudioNode,
	at: number,
	hz: number,
	decayS: number,
	level: number
): void {
	const osc = ctx.createOscillator();
	osc.frequency.setValueAtTime(hz * 2.2, at);
	osc.frequency.exponentialRampToValueAtTime(hz * 0.45, at + decayS);
	const gain = gainNode(ctx, 0);
	decayEnvelope(gain.gain, at, level, 0.005, decayS);
	osc.connect(gain).connect(out);
	osc.start(at);
	osc.stop(at + decayS + SOURCE_TAIL_S);
}

/** R-01's strike: the edge, the air it moves, the mass landing, and what rings after. */
export function performStrike(
	ctx: BaseAudioContext,
	out: AudioNode,
	wet: AudioNode,
	cue: StrikeCue,
	voice: VoiceRow,
	clock: AudioClock
): void {
	if (cue.atMs < clock.fromMs) {
		return;
	}
	const at = timeAt(clock, cue.atMs);
	const { strike } = voice;
	const loudness = voice.level * (0.55 + 0.45 * cue.strength);
	const bus = gainNode(ctx, 1);
	bus.connect(out);
	bus.connect(gainNode(ctx, voice.space)).connect(wet);

	if (strike.click > 0) {
		burst(ctx, bus, at, strike.click * loudness, {
			hz: CLICK.hz,
			q: CLICK.q,
			decayS: CLICK.decayMs / 1000,
			attackS: CLICK.attackS
		});
	}
	burst(ctx, bus, at, strike.air.level * loudness, {
		colour: voice.body.colour,
		hz: strike.air.centerHz,
		q: strike.air.q,
		decayS: strike.air.decayMs / 1000,
		attackS: 0.004
	});
	if (strike.thumpHz > 0) {
		thump(ctx, bus, at, strike.thumpHz, strike.thumpDecayMs / 1000, 0.9 * loudness);
	}
	ringModes(ctx, bus, strike.modes, at, loudness);
}

/** The ring closing: a dry tick of the pen on paper, and the board answering it. */
export function performSealTick(ctx: BaseAudioContext, out: AudioNode, clock: AudioClock): void {
	if (clock.fromMs > TICK_LATE_MS) {
		return;
	}
	const at = timeAt(clock, 0);
	burst(ctx, out, at, SEAL_TICK.level, {
		hz: SEAL_TICK.hz,
		q: SEAL_TICK.q,
		decayS: SEAL_TICK.decayMs / 1000,
		attackS: 0.0004
	});
	ringModes(ctx, out, SEAL_TICK.modes, at, 1);
}

/** A bubble rising as it collapses: the pitch climbs, which is the whole sound of water. */
function performBubble(
	ctx: BaseAudioContext,
	out: AudioNode,
	grain: GrainCue,
	level: number,
	at: number
): void {
	const durS = grain.durMs / 1000;
	const osc = ctx.createOscillator();
	osc.frequency.setValueAtTime(grain.hz, at);
	osc.frequency.exponentialRampToValueAtTime(grain.hz * BUBBLE_RISE, at + durS * 0.7);
	const gain = gainNode(ctx, 0);
	decayEnvelope(gain.gain, at, level * TRIM.tone, 0.001, durS);
	osc.connect(gain).connect(out);
	osc.start(at);
	osc.stop(at + durS + SOURCE_TAIL_S);
	burst(ctx, out, at, level * 0.15, { hz: grain.hz * 4, q: 1, decayS: 0.004 });
}

/** One grain, as the event its kind physically is. */
export function performGrain(
	ctx: BaseAudioContext,
	out: AudioNode,
	wet: AudioNode,
	grain: GrainCue,
	voice: VoiceRow,
	clock: AudioClock
): void {
	if (!voice.grain || grain.atMs < clock.fromMs) {
		return;
	}
	const at = timeAt(clock, grain.atMs);
	const durS = grain.durMs / 1000;
	const level = grain.level * voice.level * TRIM.grain;
	const bus = gainNode(ctx, 1);
	bus.connect(out);
	bus.connect(gainNode(ctx, voice.space)).connect(wet);

	switch (voice.grain.kind) {
		case 'crackle':
			// A pop is a resonance let go of, not a hiss: sharp, narrow, and with a
			// little of the low body of whatever cracked underneath it.
			burst(ctx, bus, at, level, { hz: grain.hz, q: 8, decayS: durS, attackS: 0.0003 });
			burst(ctx, bus, at, level * 0.4, {
				colour: 'brown',
				hz: grain.hz * 0.3,
				q: 3,
				decayS: durS * 1.6,
				attackS: 0.0006
			});
			return;
		case 'bubble':
			performBubble(ctx, bus, grain, level, at);
			return;
		case 'grit':
			for (const bounce of GRIT_BOUNCES) {
				burst(ctx, bus, at + bounce.atMs / 1000, level * bounce.level, {
					colour: 'brown',
					hz: grain.hz,
					q: 4,
					decayS: durS * 0.25 * bounce.level,
					attackS: 0.0003
				});
			}
			return;
		case 'chime':
			ringModes(
				ctx,
				bus,
				CHIME_MODES.map((mode) => ({
					hz: grain.hz * mode.ratio,
					level: mode.level,
					decayMs: grain.durMs * mode.decay
				})),
				at,
				level
			);
			return;
		case 'spark': {
			// Light blooms rather than lands: a slow attack, a long fall, and a
			// breath of air around it.
			const gain = gainNode(ctx, 0);
			decayEnvelope(gain.gain, at, level * TRIM.tone, 0.012, durS);
			const osc = ctx.createOscillator();
			osc.frequency.value = grain.hz;
			drift(ctx, osc.detune, 2, 6, at, at + durS + SOURCE_TAIL_S);
			osc.connect(gain).connect(bus);
			osc.start(at);
			osc.stop(at + durS + SOURCE_TAIL_S);
			burst(ctx, bus, at, level * 0.12, { hz: grain.hz * 2.5, q: 0.8, decayS: durS * 0.3 });
			return;
		}
	}
}
