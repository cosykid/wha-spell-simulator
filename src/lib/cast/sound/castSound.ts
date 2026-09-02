/**
 * @file `CastSound`: the cast heard. A host that holds a `CastEngine` holds
 * one of these beside it and hands it the same `(spellIR, ring, timestamp)`
 * every frame, and the cast's sound follows the same clock its pixels do.
 *
 * It is style-independent on purpose. Both engines gate on `isCasting` and
 * count from `activatedAt`, and the score's beats are the ruled timeline
 * (R-01), so the sound is compiled from the score and neither engine knows it
 * exists.
 *
 * A browser only lets audio run after the caster has touched the page, so the
 * context is created and resumed on the first gesture, and a cast that arrives
 * before the context is running waits a frame and joins where it is.
 *
 * @example
 * const sound = new CastSound({ enabled: () => ui.soundEnabled });
 * const stop = sound.mount();
 * sound.render(spellIR, ring, timestamp); // every frame, beside engine.render
 */

import { compileScore } from '../score/compileScore.js';
import { isCasting } from '../engine.js';
import { compileSoundScore } from './cues.js';
import { performSoundScore, type Performance } from './perform.js';
import type { RingInfo, SpellIR } from '../../types.js';

export interface CastSoundOptions {
	/** Whether the caster wants to hear anything. Read on every frame, so a toggle lands mid-cast. */
	enabled: () => boolean;
}

/** The loudest the mix is ever allowed out at, before the compressor. */
const MASTER_LEVEL = 0.8;

/** Seconds a mute or a cut cast takes to go quiet. Short, but never a click. */
const FADE_S = 0.06;

/** Cast milliseconds ahead of the frame a schedule is written at, so its first event is never in the past. */
const LEAD_MS = 30;

/** The gestures a browser accepts as permission to make sound. */
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchend'] as const;

/** A catch on the peaks only. Leveling the beats would cost the strike its edge over the charge. */
const COMPRESSOR = { threshold: -14, knee: 8, ratio: 4, attack: 0.003, release: 0.2 } as const;

/** The cast being heard, and the key that tells it from the next. */
interface RunningCast {
	key: string;
	totalMs: number;
	performance: Performance;
}

export class CastSound {
	readonly #options: CastSoundOptions;
	#ctx: AudioContext | null = null;
	#master: GainNode | null = null;
	#enabledApplied: boolean | null = null;
	#cast: RunningCast | null = null;
	/** A cast the clock has already run out on. Its spell stays active, so it is asked about every frame. */
	#spentKey: string | null = null;

	constructor(options: CastSoundOptions) {
		this.#options = options;
	}

	/** Starts listening for the gesture that unlocks audio. Returns the teardown. */
	mount(): () => void {
		if (typeof window === 'undefined') {
			return () => {};
		}
		const unlock = () => this.#resume();
		for (const type of UNLOCK_EVENTS) {
			window.addEventListener(type, unlock, { capture: true, passive: true });
		}
		return () => {
			for (const type of UNLOCK_EVENTS) {
				window.removeEventListener(type, unlock, { capture: true });
			}
			this.dispose();
		};
	}

	/**
	 * The cast at `timestamp`. Starts the sound of a new performance, lets a
	 * running one play, and silences one whose spell is gone.
	 */
	render(
		spellIR: SpellIR | null | undefined,
		ring: RingInfo | null | undefined,
		timestamp: number
	): void {
		this.#applyEnabled();
		if (!ring?.found || !isCasting(spellIR)) {
			this.reset();
			return;
		}
		const key = `${spellIR.signature}|${spellIR.activatedAt}`;
		const tMs = timestamp - (spellIR.activatedAt ?? 0);
		if (this.#cast && this.#cast.key !== key) {
			this.reset();
		}
		if (this.#cast) {
			if (tMs > this.#cast.totalMs) {
				this.#spentKey = key;
				this.reset();
			}
			return;
		}
		if (tMs < 0 || key === this.#spentKey) {
			return;
		}
		const ctx = this.#context();
		if (!ctx) {
			return;
		}
		if (ctx.state !== 'running') {
			// Chrome lets a resume through on any earlier gesture. Until it lands,
			// the cast keeps its clock and joins where it is on a later frame.
			this.#resume();
			return;
		}
		const score = compileScore(spellIR.plan, spellIR);
		if (tMs > score.totalMs) {
			this.#spentKey = key;
			return;
		}
		const performance = performSoundScore(ctx, this.#master!, compileSoundScore(score), {
			activatedAt: ctx.currentTime - tMs / 1000,
			fromMs: tMs + LEAD_MS
		});
		this.#cast = { key, totalMs: score.totalMs, performance };
	}

	/** Fade the running cast out and forget it. The next frame may start another. */
	reset(): void {
		const cast = this.#cast;
		if (!cast) {
			return;
		}
		this.#cast = null;
		const ctx = this.#ctx;
		if (!ctx) {
			return;
		}
		cast.performance.fadeOut(ctx.currentTime, FADE_S);
		setTimeout(() => cast.performance.disconnect(), FADE_S * 1000 * 4);
	}

	/** Give the audio context back. The object is unusable after this. */
	dispose(): void {
		this.reset();
		const ctx = this.#ctx;
		this.#ctx = null;
		this.#master = null;
		this.#enabledApplied = null;
		if (ctx && ctx.state !== 'closed') {
			void ctx.close().catch(() => {});
		}
	}

	/**
	 * The context and the master chain behind it, built on first use. Null where
	 * the browser has no Web Audio at all, and then every call here is a no-op.
	 */
	#context(): AudioContext | null {
		if (this.#ctx) {
			return this.#ctx;
		}
		if (typeof AudioContext === 'undefined') {
			return null;
		}
		const ctx = new AudioContext();
		const enabled = this.#options.enabled();
		const master = ctx.createGain();
		master.gain.value = enabled ? MASTER_LEVEL : 0;
		const compressor = ctx.createDynamicsCompressor();
		compressor.threshold.value = COMPRESSOR.threshold;
		compressor.knee.value = COMPRESSOR.knee;
		compressor.ratio.value = COMPRESSOR.ratio;
		compressor.attack.value = COMPRESSOR.attack;
		compressor.release.value = COMPRESSOR.release;
		master.connect(compressor).connect(ctx.destination);
		this.#ctx = ctx;
		this.#master = master;
		this.#enabledApplied = enabled;
		return ctx;
	}

	/** Ask a suspended context to run. Safe to call from anywhere, and harmless when it already does. */
	#resume(): void {
		const ctx = this.#context();
		if (ctx && ctx.state === 'suspended') {
			void ctx.resume().catch(() => {});
		}
	}

	/** Ramp the master to the caster's choice, but only when the choice changed. */
	#applyEnabled(): void {
		const enabled = this.#options.enabled();
		if (enabled === this.#enabledApplied || !this.#ctx || !this.#master) {
			return;
		}
		this.#enabledApplied = enabled;
		const now = this.#ctx.currentTime;
		this.#master.gain.cancelScheduledValues(now);
		this.#master.gain.setTargetAtTime(enabled ? MASTER_LEVEL : 0, now, FADE_S / 3);
	}
}
