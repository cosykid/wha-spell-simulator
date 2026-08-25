<!--
	@component Bake-off prototype: the spell as a dense GPU particle fluid.

	Throwaway. One spell (`column-balanced` + the fire sigil), one look, no
	determinism contract and no goldens. The paper under the canvas is a CSS
	stand-in built from the portal's own numbers, so a frame can be judged in
	context without pulling in the simulator's canvas engine.

	`?frameMs=<n>` renders straight to one cast time and stops, for capture.
-->
<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { PORTAL } from '$lib/portal/portal.js';
	import { FluidStage, RING } from './fluidStage.js';

	const frameParam = page.url.searchParams.get('frameMs');
	const scriptedMs = Number(frameParam);
	const scripted = frameParam !== null && Number.isFinite(scriptedMs) && scriptedMs >= 0;

	let shell: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let stage: FluidStage | null = null;
	let elapsedMs = $state(0);
	let parcels = $state(0);
	let failure = $state('');

	const paperStyle = [
		`--tilt: ${PORTAL.tiltDeg}deg`,
		`--shrink: ${PORTAL.shrink}`,
		`--perspective: ${PORTAL.perspectivePx}px`,
		`--origin-shift: ${PORTAL.originShiftPct}%`,
		`--lift: ${PORTAL.liftPct}%`,
		`--ring-x: ${RING.centerX * 100}%`,
		`--ring-y: ${RING.centerY * 100}%`,
		`--ring-d: ${RING.radius * 200}%`
	].join('; ');

	function fit() {
		if (!stage || !shell) {
			return;
		}
		const box = shell.getBoundingClientRect();
		stage.resize(Math.round(box.width), Math.round(box.height), Math.min(devicePixelRatio, 2));
	}

	let castStartedAt = 0;

	function restart(now = performance.now()) {
		stage?.reset();
		castStartedAt = now;
		elapsedMs = 0;
	}

	onMount(() => {
		try {
			stage = new FluidStage(canvas);
		} catch (error) {
			failure = error instanceof Error ? error.message : String(error);
			return;
		}
		parcels = stage.parcelCount;
		fit();

		if (scripted) {
			stage.seekTo(scriptedMs);
			elapsedMs = stage.elapsedMs;
			canvas.setAttribute('data-proto-frame', String(scriptedMs));
			return;
		}

		let raf = 0;
		castStartedAt = performance.now();
		// The step is fixed, so the loop chases wall clock rather than assuming one
		// step per frame. Otherwise a 120Hz display plays the cast at double speed.
		const loop = (now: number) => {
			if (stage) {
				if (now - castStartedAt > stage.spell.totalMs + 500) {
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
</script>

<svelte:head>
	<title>Proto: fluid</title>
</svelte:head>

<main class="proto">
	<div class="stage-shell" bind:this={shell} style={paperStyle}>
		<div class="paper">
			<div class="ink-ring"></div>
			<div class="ink-ring inner"></div>
		</div>
		<canvas bind:this={canvas} data-testid="proto-fluid-canvas"></canvas>
	</div>
	<footer class="readout">
		<span>dense GPU particle fluid &mdash; column-balanced &times; fire</span>
		<span>{parcels.toLocaleString()} parcels</span>
		<span>{Math.round(elapsedMs)} ms</span>
		{#if !scripted}
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

	.stage-shell {
		position: relative;
		justify-self: center;
		align-self: center;
		width: min(100%, 1200px);
		aspect-ratio: 4 / 3;
		max-height: 100%;
		overflow: hidden;
		background: #3a332b;
	}

	/* The paper stand-in. Every number is the portal's own, so a captured frame
	   sits in the same perspective the app's paper would give it. */
	.paper {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(120% 90% at 50% 30%, #fbf3dd 0%, #f0e4c6 62%, #e2d3ae 100%), #f4ecd6;
		transform-origin: 50% calc(50% + var(--origin-shift));
		transform: perspective(var(--perspective)) translateY(var(--lift)) rotateX(var(--tilt))
			scale(var(--shrink));
		box-shadow:
			0 1px 0 rgba(255, 251, 233, 0.52) inset,
			0 28px 38px rgba(36, 27, 22, 0.34);
	}

	.ink-ring {
		position: absolute;
		top: var(--ring-y);
		left: var(--ring-x);
		height: var(--ring-d);
		aspect-ratio: 1;
		transform: translate(-50%, -50%);
		border: 4px solid #241a12;
		border-radius: 50%;
	}

	.ink-ring.inner {
		height: calc(var(--ring-d) * 0.2);
		border-width: 3px;
		border-color: rgba(36, 26, 18, 0.72);
	}

	canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
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
