/**
 * @file One sustaining layer as sound: the substance's own noise through its
 * resonances, the hum inside it, the floor under it, all of it wandering, bent
 * by whatever drive the row asks for, and moved where the layer's kind puts it.
 *
 * The row says what the layer is made of and the kind says how it moves, and
 * this is the only place the two are put together. Nothing here reads a clock.
 */

import { drift, noiseSource } from './noise.js';
import {
	SOURCE_TAIL_S,
	bandpass,
	gainNode,
	lowpass,
	modulate,
	saturator,
	scheduleGain,
	timeAt,
	type AudioClock
} from './graph.js';
import type { SoundLayer } from './layers.js';
import type { NoiseColour, VoiceRow } from './voice.js';

/**
 * Trims that make the sources sit at one loudness. A formant stack keeps a
 * sliver of the noise's power, an oscillator keeps all of its own, and a
 * layer's loudness curve is written on the far side of both.
 */
const TRIM = { noise: 4.6, tone: 0.9, rumble: 1.1 } as const;

/** The frequency a formant's gain is referenced to, so a body's centre does not set its loudness. */
const FORMANT_REF_HZ = 1000;

/** Cents the wander drags a resonance for each unit of a row's `bandDepth`. */
const DRIFT_CENTS = 1200;

/** Cents the wander drags the hum. A held pitch that never moves is not a held pitch. */
const TONE_DRIFT_CENTS = 9;

/** Amplitude tremolo depth for a layer that breathes, as a fraction of its loudness. */
const TREMOLO_DEPTH = 0.18;

/** How far a circling layer swings in the stereo field. */
const SPIN_WIDTH = 0.8;

/**
 * What one formant has to be turned up by to keep the level its row asked for.
 * A band-pass passes power in proportion to its width, and coloured noise has
 * less of it the higher the band sits, so without this a row's `level` would
 * mean something different at every frequency and every Q.
 */
function formantGain(colour: NoiseColour, hz: number, q: number): number {
	const tilt =
		colour === 'white' ? FORMANT_REF_HZ / hz : colour === 'brown' ? hz / FORMANT_REF_HZ : 1;
	return Math.sqrt(q * tilt);
}

/** The band's sweep on the audio clock, joined mid-way when the cast was. */
function scheduleSweep(
	param: AudioParam,
	centerHz: number,
	layer: SoundLayer,
	clock: AudioClock
): void {
	const { from, to, overMs } = layer.motion.sweep;
	const startAt = timeAt(clock, layer.startMs);
	const elapsedMs = Math.max(0, clock.fromMs - layer.startMs);
	if (overMs <= 0 || elapsedMs >= overMs) {
		param.setValueAtTime(centerHz * to, startAt);
		return;
	}
	// Geometric interpolation, because pitch is heard on a log scale.
	const joined = from * Math.pow(to / from, elapsedMs / overMs);
	param.setValueAtTime(centerHz * joined, startAt);
	param.exponentialRampToValueAtTime(centerHz * to, startAt + (overMs - elapsedMs) / 1000);
}

/**
 * The substance's noise through every resonance the row names, each swept by
 * the layer's kind and dragged by the row's own wander. Levels are shared out
 * between the formants, so a body with four resonances is no louder than one
 * with two.
 */
function noiseBody(
	ctx: BaseAudioContext,
	out: AudioNode,
	layer: SoundLayer,
	voice: VoiceRow,
	clock: AudioClock,
	startAt: number,
	stopAt: number
): void {
	const { body, flutter } = voice;
	const total = body.formants.reduce((sum, formant) => sum + formant.level, 0) || 1;
	const source = noiseSource(ctx, body.colour, startAt, stopAt);
	for (const formant of body.formants) {
		const base = body.centerHz * formant.ratio;
		const filter = bandpass(ctx, base, formant.q);
		scheduleSweep(filter.frequency, base, layer, clock);
		drift(ctx, filter.detune, flutter.rateHz, flutter.bandDepth * DRIFT_CENTS, startAt, stopAt);
		const share = (formant.level / total) * formantGain(body.colour, base, formant.q);
		source.connect(filter).connect(gainNode(ctx, share)).connect(out);
	}
}

/** Two detuned copies of every partial, so the tone beats slowly instead of standing still. */
function toneBody(
	ctx: BaseAudioContext,
	out: AudioNode,
	voice: VoiceRow,
	startAt: number,
	stopAt: number
): void {
	const { tone, flutter } = voice;
	for (const [ratio, level] of tone.partials) {
		for (const side of [-0.5, 0.5]) {
			const osc = ctx.createOscillator();
			osc.type = tone.wave;
			osc.frequency.value = tone.baseHz * ratio;
			osc.detune.value = tone.detuneCents * side;
			drift(ctx, osc.detune, flutter.rateHz * 0.5, TONE_DRIFT_CENTS, startAt, stopAt);
			osc.connect(gainNode(ctx, level / 2)).connect(out);
			osc.start(startAt);
			osc.stop(stopAt);
		}
	}
}

/**
 * One layer, from the source out: the body and the floor into the kind's own
 * movement, then the row's wander on the loudness, then where the layer sits
 * and how loud the score says it is. `wet` takes the share of it that reaches
 * the ear off the room instead of straight.
 */
export function performLayer(
	ctx: BaseAudioContext,
	out: AudioNode,
	wet: AudioNode,
	layer: SoundLayer,
	voice: VoiceRow,
	clock: AudioClock
): void {
	if (layer.endMs <= clock.fromMs) {
		return;
	}
	const startAt = timeAt(clock, layer.startMs);
	const stopAt = timeAt(clock, layer.endMs) + SOURCE_TAIL_S;
	const level = gainNode(ctx, 0);
	if (scheduleGain(level.gain, layer.gain, layer.startMs, clock, voice.level) === null) {
		return;
	}
	const toneMix = layer.motion.toneMix ?? voice.toneMix;

	const panner = ctx.createStereoPanner();
	panner.pan.value = layer.motion.pan;
	modulate(ctx, panner.pan, Math.abs(layer.motion.spinHz), SPIN_WIDTH, startAt, stopAt);

	// The material's unsteadiness sits under the kind's own breathing, so a held
	// mass bobs at its rate and still gutters at the substance's.
	const flutter = gainNode(ctx, 1 - voice.flutter.depth / 2);
	drift(ctx, flutter.gain, voice.flutter.rateHz, voice.flutter.depth / 2, startAt, stopAt);
	const tremolo = gainNode(ctx, layer.motion.tremoloHz > 0 ? 1 - TREMOLO_DEPTH : 1);
	modulate(ctx, tremolo.gain, layer.motion.tremoloHz, TREMOLO_DEPTH, startAt, stopAt);
	tremolo.connect(flutter).connect(panner).connect(level);
	level.connect(out);
	level.connect(gainNode(ctx, voice.space)).connect(wet);

	const tilt = lowpass(ctx, voice.body.tiltHz);
	const shaper = saturator(ctx, voice.drive);
	if (shaper) {
		tilt.connect(shaper).connect(tremolo);
	} else {
		tilt.connect(tremolo);
	}

	if (toneMix < 1) {
		const mix = gainNode(ctx, (1 - toneMix) * TRIM.noise);
		mix.connect(tilt);
		noiseBody(ctx, mix, layer, voice, clock, startAt, stopAt);
	}
	if (toneMix > 0) {
		const mix = gainNode(ctx, toneMix * TRIM.tone);
		mix.connect(tilt);
		toneBody(ctx, mix, voice, startAt, stopAt);
	}
	if (voice.rumble.level > 0) {
		noiseSource(ctx, 'brown', startAt, stopAt)
			.connect(lowpass(ctx, voice.rumble.hz))
			.connect(gainNode(ctx, voice.rumble.level * TRIM.rumble))
			.connect(tremolo);
	}
}
