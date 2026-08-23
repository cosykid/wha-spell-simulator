<!--
	@component Bake-off prototype: the fluid's mass wearing the brush's licks.

	Throwaway. One spell (`column-balanced` + the fire sigil), one look, no
	determinism contract and no goldens. The paper is a CSS-tilted 2D canvas
	carrying the portal's own numbers, and the effect canvas above it is WebGL
	aimed by the shipped portal camera, so the pigment is judged in the
	perspective it would ship in.

	`?frameMs=<n>` renders straight to one cast time and stops, for capture.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { portalCssVariables } from '$lib/portal/portal.js';
	import { drawPaperPlate } from './paperPlate.js';
	import { HybridStage, RING } from './hybridStage.js';
	import type { HybridSpell } from './hybridSpell.js';
	import type { Beat } from '$lib/types.js';

	// `Number(null)` is zero, so the parameter's presence is what decides, never
	// its parsed value: an absent frameMs must leave the interactive loop running.
	const frameParam = page.url.searchParams.get('frameMs');
	const requestedFrame = frameParam === null ? Number.NaN : Number(frameParam);
	const scriptedMs = Number.isFinite(requestedFrame) && requestedFrame >= 0 ? requestedFrame : null;

	let shell: HTMLDivElement;
	let paperCanvas: HTMLCanvasElement;
	let effectCanvas: HTMLCanvasElement;
	let stage: HybridStage | null = null;
	let spell = $state<HybridSpell | null>(null);
	let elapsedMs = $state(0);
	let parcels = $state(0);
	let marks = $state(0);
	let failure = $state('');

	function fit() {
		if (!stage || !shell) {
			return;
		}
		const box = shell.getBoundingClientRect();
		const width = Math.max(1, Math.round(box.width));
		const height = Math.max(1, Math.round(box.height));
		if (paperCanvas.width !== width || paperCanvas.height !== height) {
			paperCanvas.width = width;
			paperCanvas.height = height;
			drawPaperPlate(paperCanvas, RING);
		}
		stage.resize(width, height, Math.min(devicePixelRatio, 2));
	}

	let castStartedAt = 0;

	function restart(now = performance.now()) {
		stage?.reset();
		castStartedAt = now;
		elapsedMs = 0;
	}

	onMount(() => {
		try {
			stage = new HybridStage(effectCanvas);
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			return;
		}
		spell = stage.spell;
		parcels = stage.parcelCount;
		marks = stage.markCount;
		fit();

		if (scriptedMs !== null) {
			stage.seekTo(scriptedMs);
			elapsedMs = stage.elapsedMs;
			effectCanvas.setAttribute('data-proto-frame', String(scriptedMs));
			return;
		}

		let raf = 0;
		castStartedAt = performance.now();
		// The step is fixed, so the loop chases wall clock rather than assuming one
		// step per frame. Otherwise a 120Hz display plays the cast at double speed.
		const loop = (now: number) => {
			if (stage) {
				if (now - castStartedAt > stage.spell.totalMs + 700) {
					restart(now);
				}
				let taken = 0;
				while (stage.elapsedMs < now - castStartedAt && taken < 4) {
					stage.advance();
					taken += 1;
				}
				elapsedMs = stage.elapsedMs;
			}
			raf = requestAnimationFrame(loop);
		};
		raf = requestAnimationFrame(loop);
		const observer = new ResizeObserver(fit);
		observer.observe(shell);
		return () => {
			cancelAnimationFrame(raf);
			observer.disconnect();
			stage?.dispose();
			stage = null;
		};
	});

	const BEATS: Beat[] = ['charge', 'strike', 'body', 'release', 'afterglow'];
	const beatName = $derived.by(() => {
		if (!spell) return '';
		return BEATS.find((name) => elapsedMs < spell!.beats[name].endMs) ?? 'past';
	});
</script>

<svelte:head>
	<title>Proto: hybrid</title>
</svelte:head>

<main class="proto" style={portalCssVariables()}>
	<div class="stage" bind:this={shell} data-testid="proto-hybrid-stage">
		<canvas class="paper" bind:this={paperCanvas}></canvas>
		<canvas class="effect" bind:this={effectCanvas} data-testid="proto-hybrid-canvas"></canvas>
	</div>
	<footer class="readout">
		<span><strong>column-balanced</strong> &middot; fire &middot; fluid mass, brush silhouette</span
		>
		<span>{parcels.toLocaleString()} parcels &middot; {marks} marks</span>
		<span class="clock">{beatName} &middot; {Math.round(elapsedMs)} ms</span>
		{#if scriptedMs === null}
			<button type="button" onclick={() => restart()}>Recast</button>
		{/if}
		{#if failure}
			<span class="failure">{failure}</span>
		{/if}
	</footer>
</main>

<style>
	.proto {
		display: grid;
		grid-template-rows: minmax(0, 1fr) auto;
		gap: 10px;
		height: 100%;
		min-height: 0;
		padding: 12px 16px 16px;
		background: #241d18;
	}

	.stage {
		position: relative;
		justify-self: center;
		align-self: center;
		width: min(100%, 1200px);
		aspect-ratio: 11 / 8;
		max-height: 100%;
		overflow: hidden;
		background: #33291f;
	}

	.stage canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	/* The paper stand-in. Every number is the portal's own, so a captured frame
	   sits in the same perspective the app's paper would give it. */
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

	.readout {
		display: flex;
		gap: 16px;
		align-items: center;
		justify-content: center;
		color: #cbbba4;
		font-size: 13px;
		font-variant-numeric: tabular-nums;
	}

	.clock {
		min-width: 150px;
	}

	.readout button {
		border: 1px solid #6a5a48;
		border-radius: 4px;
		background: #33291f;
		color: #e6d8c0;
		padding: 4px 12px;
		cursor: pointer;
	}

	.failure {
		color: #e08a6a;
	}
</style>
