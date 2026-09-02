/**
 * @file `performSoundScore`: a sound score played through a Web Audio graph.
 * Every layer, the strike, the seal tick and every grain is scheduled on the
 * audio clock in one pass, so the cast runs to its end on its own: a stalled
 * frame loop, a hidden tab, nothing after this call can make it late.
 *
 * The graph is the same for a live `AudioContext` and an `OfflineAudioContext`,
 * which is how a cast is rendered to a file and measured.
 *
 * @example
 * const performance = performSoundScore(ctx, bus, sound, { activatedAt, fromMs });
 * performance.fadeOut(ctx.currentTime, 0.06);
 */

import { SILENT, decayEnvelope, modulate, noiseSource, scheduleGain, timeAt } from './graph.js';
import type { AudioClock } from './graph.js';
import type { GrainCue, SoundLayer, SoundScore, StrikeCue } from './cues.js';
import type { NoiseBand, Strike, ToneVoice, VoiceRow } from './voice.js';

/** A cast being performed. Let it run out, or fade it and give the graph back. */
export interface Performance {
	/** Ramp the whole cast to silence from `atTime` over `seconds`. */
	fadeOut(atTime: number, seconds: number): void;
	/** Detach the cast's graph. Call once it has faded. */
	disconnect(): void;
}

/**
 * Trims that make the two sources sit at one loudness. A band-pass keeps a
 * sliver of white noise's power, a sine keeps all of its own, and a layer's
 * loudness curve is written on the far side of both.
 */
const TRIM = {
	noise: 2.4,
	tone: 0.24,
	rumble: 1.6,
	strike: 1.35,
	grain: 1.2
} as const;

/** Amplitude tremolo depth for a layer that breathes, as a fraction of its loudness. */
const TREMOLO_DEPTH = 0.18;

/** How far a circling layer swings in the stereo field. */
const SPIN_WIDTH = 0.8;

/** Seconds a source outlives the last thing it plays, so no tail is cut. */
const SOURCE_TAIL_S = 0.05;

/** Cast milliseconds late the seal tick may still play. Later than this and the cast was joined, not started. */
const TICK_LATE_MS = 40;

const SEAL_TICK = { hz: 2500, level: 0.28, pingHz: 1400, pingLevel: 0.1, decayS: 0.035 } as const;

function bandpass(
	ctx: BaseAudioContext,
	band: NoiseBand,
	centerHz = band.centerHz
): BiquadFilterNode {
	const filter = ctx.createBiquadFilter();
	filter.type = 'bandpass';
	filter.frequency.value = centerHz;
	filter.Q.value = band.q;
	return filter;
}

function gainNode(ctx: BaseAudioContext, value: number): GainNode {
	const node = ctx.createGain();
	node.gain.value = value;
	return node;
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

/** Two detuned copies of every partial, so the tone beats slowly instead of standing still. */
function toneSources(
	ctx: BaseAudioContext,
	tone: ToneVoice,
	out: AudioNode,
	startAt: number,
	stopAt: number
): void {
	for (const [ratio, level] of tone.partials) {
		for (const side of [-0.5, 0.5]) {
			const osc = ctx.createOscillator();
			osc.type = tone.wave;
			osc.frequency.value = tone.baseHz * ratio;
			osc.detune.value = tone.detuneCents * side;
			osc.connect(gainNode(ctx, level / 2)).connect(out);
			osc.start(startAt);
			osc.stop(stopAt);
		}
	}
}

/**
 * One layer: its noise band and its tone mixed by the kind, a rumble floor
 * under them, the row's wobble on the band, the kind's sweep, spin and
 * tremolo, and the sampled loudness written onto the layer's own gain.
 */
function performLayer(
	ctx: BaseAudioContext,
	out: AudioNode,
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

	const tremolo = gainNode(ctx, layer.motion.tremoloHz > 0 ? 1 - TREMOLO_DEPTH : 1);
	modulate(ctx, tremolo.gain, layer.motion.tremoloHz, TREMOLO_DEPTH, startAt, stopAt);

	const band = bandpass(ctx, voice.body);
	scheduleSweep(band.frequency, voice.body.centerHz, layer, clock);
	modulate(
		ctx,
		band.frequency,
		voice.wobble.rateHz,
		voice.wobble.depth * voice.body.centerHz,
		startAt,
		stopAt
	);
	noiseSource(ctx, startAt, stopAt)
		.connect(band)
		.connect(gainNode(ctx, (1 - toneMix) * TRIM.noise))
		.connect(tremolo);

	if (toneMix > 0) {
		toneSources(
			ctx,
			voice.tone,
			gainNode(ctx, toneMix * TRIM.tone).connect(tremolo),
			startAt,
			stopAt
		);
	}

	if (voice.rumble.level > 0) {
		const floor = ctx.createBiquadFilter();
		floor.type = 'lowpass';
		floor.frequency.value = voice.rumble.hz;
		noiseSource(ctx, startAt, stopAt)
			.connect(floor)
			.connect(gainNode(ctx, voice.rumble.level * TRIM.rumble))
			.connect(tremolo);
	}

	tremolo.connect(panner).connect(level).connect(out);
}

/** R-01's strike: the thump, the crack, and the ring the row gives it. */
function performStrike(
	ctx: BaseAudioContext,
	out: AudioNode,
	cue: StrikeCue,
	strike: Strike,
	voice: VoiceRow,
	clock: AudioClock
): void {
	if (cue.atMs < clock.fromMs) {
		return;
	}
	const at = timeAt(clock, cue.atMs);
	const decayS = strike.decayMs / 1000;
	const loudness = voice.level * (0.55 + 0.45 * cue.strength) * TRIM.strike;

	if (strike.thumpHz > 0) {
		const thump = ctx.createOscillator();
		thump.frequency.setValueAtTime(strike.thumpHz * 2.2, at);
		thump.frequency.exponentialRampToValueAtTime(strike.thumpHz * 0.45, at + decayS);
		const level = gainNode(ctx, 0);
		decayEnvelope(level.gain, at, 0.9 * loudness, 0.006, decayS);
		thump.connect(level).connect(out);
		thump.start(at);
		thump.stop(at + decayS + SOURCE_TAIL_S);
	}

	const crackS = decayS * 0.6;
	const crack = gainNode(ctx, 0);
	decayEnvelope(crack.gain, at, 0.8 * loudness * TRIM.noise, 0.003, crackS);
	noiseSource(ctx, at, at + crackS + SOURCE_TAIL_S)
		.connect(bandpass(ctx, strike.noise))
		.connect(crack)
		.connect(out);

	if (strike.toneHz !== null) {
		const ringS = decayS * 1.6;
		const ring = gainNode(ctx, 0);
		decayEnvelope(ring.gain, at, 0.35 * loudness, 0.004, ringS);
		for (const ratio of [1, 2.01]) {
			const osc = ctx.createOscillator();
			osc.frequency.value = strike.toneHz * ratio;
			osc.connect(gainNode(ctx, ratio === 1 ? 1 : 0.3)).connect(ring);
			osc.start(at);
			osc.stop(at + ringS + SOURCE_TAIL_S);
		}
		ring.connect(out);
	}
}

/** The ring closing: a dry tick on the paper at the cast's zero. */
function performSealTick(ctx: BaseAudioContext, out: AudioNode, clock: AudioClock): void {
	if (clock.fromMs > TICK_LATE_MS) {
		return;
	}
	const at = timeAt(clock, 0);
	const tick = ctx.createBiquadFilter();
	tick.type = 'highpass';
	tick.frequency.value = SEAL_TICK.hz;
	const level = gainNode(ctx, 0);
	decayEnvelope(level.gain, at, SEAL_TICK.level * TRIM.noise, 0.002, SEAL_TICK.decayS);
	noiseSource(ctx, at, at + SEAL_TICK.decayS + SOURCE_TAIL_S)
		.connect(tick)
		.connect(level)
		.connect(out);

	const ping = ctx.createOscillator();
	ping.frequency.value = SEAL_TICK.pingHz;
	const pingLevel = gainNode(ctx, 0);
	decayEnvelope(pingLevel.gain, at, SEAL_TICK.pingLevel, 0.002, SEAL_TICK.decayS * 2);
	ping.connect(pingLevel).connect(out);
	ping.start(at);
	ping.stop(at + SEAL_TICK.decayS * 2 + SOURCE_TAIL_S);
}

/** One grain: a burst of noise around its pitch, or a short tone sliding from it. */
function performGrain(
	ctx: BaseAudioContext,
	out: AudioNode,
	grain: GrainCue,
	voice: VoiceRow,
	clock: AudioClock
): void {
	if (!voice.grain || grain.atMs < clock.fromMs) {
		return;
	}
	const at = timeAt(clock, grain.atMs);
	const durS = grain.durMs / 1000;
	const level = gainNode(ctx, 0);
	if (voice.grain.kind === 'crackle') {
		decayEnvelope(level.gain, at, grain.level * voice.level * TRIM.grain * TRIM.noise, 0.002, durS);
		noiseSource(ctx, at, at + durS + SOURCE_TAIL_S)
			.connect(bandpass(ctx, { centerHz: grain.hz, q: 2 }))
			.connect(level)
			.connect(out);
		return;
	}
	decayEnvelope(level.gain, at, grain.level * voice.level * TRIM.grain * TRIM.tone, 0.004, durS);
	const osc = ctx.createOscillator();
	osc.frequency.setValueAtTime(grain.hz, at);
	osc.frequency.exponentialRampToValueAtTime(grain.hz * voice.grain.sweep, at + durS);
	osc.connect(level).connect(out);
	osc.start(at);
	osc.stop(at + durS + SOURCE_TAIL_S);
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
	const { voice } = sound;
	performSealTick(ctx, bus, clock);
	for (const layer of sound.layers) {
		performLayer(ctx, bus, layer, voice, clock);
	}
	performStrike(ctx, bus, sound.strike, voice.strike, voice, clock);
	for (const grain of sound.grains) {
		performGrain(ctx, bus, grain, voice, clock);
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
