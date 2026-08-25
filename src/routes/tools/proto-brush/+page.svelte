<script lang="ts">
	/**
	 * Bake-off prototype: painterly brush-stroke VFX. Throwaway.
	 *
	 * The paper is a CSS-tilted 2D canvas carrying the portal's own numbers, and
	 * the effect canvas above it is WebGL aimed by the shipped portal camera, so
	 * the pigment is judged in the perspective it would ship in.
	 *
	 * `?frameMs=<n>` renders one scripted frame and stops, for capture.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { portalCssVariables } from '$lib/portal/portal.js';
	import { BrushStage } from './brushStage.js';
	import { drawPaperPlate, RING_CENTER_Y } from './paperPlate.js';
	import { RING_RADIUS_NORM, type BrushSpell } from './brushSpell.js';
	import type { Beat, RingInfo } from '$lib/types.js';

	// `Number(null)` is zero, so the parameter's presence is what decides, never
	// its parsed value: an absent frameMs must leave the interactive loop running.
	const frameParam = page.url.searchParams.get('frameMs');
	const requestedFrame = frameParam === null ? Number.NaN : Number(frameParam);
	const scriptedFrameMs =
		Number.isFinite(requestedFrame) && requestedFrame >= 0 ? requestedFrame : null;

	let shell: HTMLDivElement;
	let paperCanvas: HTMLCanvasElement;
	let effectCanvas: HTMLCanvasElement;
	let stage: BrushStage | null = null;
	let spell = $state<BrushSpell | null>(null);
	let clockMs = $state(0);
	let activatedAt = 0;

	function ringFor(canvas: HTMLCanvasElement): RingInfo {
		return {
			found: true,
			complete: true,
			center: { x: canvas.width / 2, y: canvas.height * RING_CENTER_Y },
			radius: Math.min(canvas.width, canvas.height) * RING_RADIUS_NORM,
			strokeIds: ['proto-ring']
		};
	}

	function resize(): boolean {
		const rect = shell.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(rect.height));
		if (paperCanvas.width === width && paperCanvas.height === height) {
			return false;
		}
		paperCanvas.width = width;
		paperCanvas.height = height;
		effectCanvas.width = width;
		effectCanvas.height = height;
		drawPaperPlate(paperCanvas, RING_RADIUS_NORM);
		return true;
	}

	function replay() {
		activatedAt = performance.now();
		stage?.reset();
	}

	onMount(() => {
		resize();
		stage = new BrushStage(effectCanvas, { preserveDrawingBuffer: scriptedFrameMs !== null });
		spell = stage.spell;
		activatedAt = performance.now();

		if (scriptedFrameMs !== null) {
			clockMs = scriptedFrameMs;
			stage.render(ringFor(effectCanvas), scriptedFrameMs);
			effectCanvas.setAttribute('data-proto-frame', String(scriptedFrameMs));
			return;
		}

		let raf = 0;
		const frame = (timestamp: number) => {
			if (resize()) {
				stage?.reset();
				activatedAt = timestamp;
			}
			let elapsed = timestamp - activatedAt;
			// The cast is a one-shot; loop it with a beat of dead air so the arc can
			// be watched over and over without reaching for the button.
			if (stage && elapsed > stage.spell.totalMs + 900) {
				activatedAt = timestamp;
				stage.reset();
				elapsed = 0;
			}
			clockMs = elapsed;
			stage?.render(ringFor(effectCanvas), elapsed);
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		return () => {
			cancelAnimationFrame(raf);
			stage?.dispose();
			stage = null;
		};
	});

	const BEATS: Beat[] = ['charge', 'strike', 'body', 'release', 'afterglow'];
	const beatName = $derived.by(() => {
		if (!spell) return '';
		return BEATS.find((name) => clockMs < spell!.beats[name].endMs) ?? 'past';
	});
</script>

<svelte:head>
	<title>Proto: Brush</title>
</svelte:head>

<main class="proto" style={portalCssVariables()}>
	<div class="stage" bind:this={shell} data-testid="proto-brush-stage">
		<canvas class="paper" bind:this={paperCanvas}></canvas>
		<canvas class="effect" bind:this={effectCanvas} data-testid="proto-brush-canvas"></canvas>
	</div>
	<div class="hud">
		<span><strong>column-balanced</strong> · fire · painterly brush-stroke prototype</span>
		<span class="clock">{beatName} · {Math.round(clockMs)}ms</span>
		<button type="button" onclick={replay}>Replay</button>
	</div>
</main>

<style>
	.proto {
		display: grid;
		gap: 12px;
		justify-items: center;
		padding: 16px;
	}

	.stage {
		position: relative;
		width: min(100%, 1120px);
		aspect-ratio: 11 / 8;
		overflow: hidden;
		background: #33291f;
		border-radius: 3px;
	}

	.stage canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.paper {
		z-index: 1;
		transform-origin: 50% calc(50% + var(--portal-origin-shift));
		transform: perspective(var(--portal-perspective)) translateY(var(--portal-lift))
			rotateX(var(--portal-tilt)) scale(var(--portal-shrink));
		box-shadow:
			0 1px 0 rgba(255, 251, 233, 0.52) inset,
			0 28px 38px rgba(36, 27, 22, 0.3);
		filter: drop-shadow(0 30px 24px rgba(36, 27, 22, 0.34));
	}

	.effect {
		z-index: 2;
		pointer-events: none;
	}

	.hud {
		display: flex;
		gap: 14px;
		align-items: center;
		color: var(--muted-ink);
		font-size: 13px;
	}

	.clock {
		min-width: 150px;
		font-variant-numeric: tabular-nums;
	}
</style>
