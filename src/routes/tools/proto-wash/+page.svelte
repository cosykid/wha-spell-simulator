<script lang="ts">
	/**
	 * Style bake-off route: screen-space watercolour/ink stylization of a fire
	 * column. Throwaway. The page is a spread of paper with the portal's own
	 * tilted sheet on it, so the effect is judged as pigment on a page rather than
	 * as light in a void.
	 *
	 * `?t=<ms>` paints one scripted frame and stops, for capture.
	 */
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { portalCssVariables } from '$lib/portal/portal.js';
	import { WashStage, washRing } from './wash-stage.js';
	import { WASH_POST_DEFAULTS, type WashPostSettings } from './wash-post.js';
	import { WASH_PRESET_ID, WASH_SIGIL, type WashCue } from './wash-spell.js';

	const POST_SLIDERS: Array<{
		key: keyof WashPostSettings;
		label: string;
		min: number;
		max: number;
		step: number;
	}> = [
		{ key: 'ink', label: 'Ink load', min: 0.6, max: 4, step: 0.05 },
		{ key: 'bleed', label: 'Wet bleed', min: 0, max: 0.04, step: 0.001 },
		{ key: 'smooth', label: 'Fuse', min: 0.5, max: 6, step: 0.1 },
		{ key: 'paintRadius', label: 'Brush', min: 1, max: 8, step: 0.2 },
		{ key: 'aniso', label: 'Stroke follow', min: 0, max: 4, step: 0.1 },
		{ key: 'levels', label: 'Pigment steps', min: 3, max: 12, step: 1 },
		{ key: 'dither', label: 'Step wobble', min: 0, max: 2.5, step: 0.05 },
		{ key: 'edge', label: 'Edge pooling', min: 0, max: 2, step: 0.05 },
		{ key: 'grain', label: 'Paper tooth', min: 0, max: 1.4, step: 0.02 }
	];

	function settingsFromUrl(url: URL): WashPostSettings {
		const next = { ...WASH_POST_DEFAULTS };
		for (const { key } of POST_SLIDERS) {
			const raw = Number(url.searchParams.get(key));
			if (Number.isFinite(raw) && url.searchParams.has(key)) {
				next[key] = raw;
			}
		}
		return next;
	}

	const scriptedMs = Number(page.url.searchParams.get('t'));
	const scripted = Number.isFinite(scriptedMs) && page.url.searchParams.has('t');

	let settings = $state<WashPostSettings>(settingsFromUrl(page.url));
	let readout = $state('charge 0ms');
	let panelOpen = $state(!scripted);

	let shell: HTMLDivElement;
	let paper: HTMLDivElement;
	let canvas: HTMLCanvasElement;
	let stage: WashStage | null = null;

	const ringStyle = $state({ left: '50%', top: '56%', size: '0px' });

	function sizeToShell() {
		const rect = shell.getBoundingClientRect();
		const width = Math.max(1, Math.round(rect.width));
		const height = Math.max(1, Math.round(rect.height));
		if (canvas.width !== width || canvas.height !== height) {
			canvas.width = width;
			canvas.height = height;
		}
		const ring = washRing(width, height);
		ringStyle.left = `${ring.center.x}px`;
		ringStyle.top = `${ring.center.y}px`;
		ringStyle.size = `${ring.radius * 2}px`;
	}

	$effect(() => {
		stage?.setPost({ ...settings });
	});

	onMount(() => {
		sizeToShell();
		stage = new WashStage(canvas);
		stage.setPost({ ...settings });

		const show = (cue: WashCue) => {
			const heat = Math.max(cue.charge, cue.strike * 0.6);
			paper.style.setProperty('--wash-ink-heat', heat.toFixed(3));
			paper.style.setProperty('--wash-scorch', cue.scorch.toFixed(3));
			readout = `${cue.beat} · ${Math.round(cue.tMs)}ms / ${Math.round(stage!.cast.totalMs)}ms`;
		};

		if (scripted) {
			sizeToShell();
			show(stage.renderScripted(scriptedMs));
			canvas.setAttribute('data-wash-frame', String(scriptedMs));
			return () => stage?.dispose();
		}

		let raf = 0;
		let startedAt = performance.now();
		const frame = (now: number) => {
			sizeToShell();
			const tMs = now - startedAt;
			if (tMs > stage!.cast.totalMs + 700) {
				startedAt = now;
				stage!.reset();
			}
			show(stage!.render(Math.min(tMs, stage!.cast.totalMs)));
			raf = requestAnimationFrame(frame);
		};
		raf = requestAnimationFrame(frame);

		const onResize = () => sizeToShell();
		window.addEventListener('resize', onResize);
		return () => {
			cancelAnimationFrame(raf);
			window.removeEventListener('resize', onResize);
			stage?.dispose();
		};
	});
</script>

<svelte:head>
	<title>Proto: Wash</title>
</svelte:head>

<div class="wash-page" style={portalCssVariables()} data-testid="wash-page">
	<div class="wash-shell" bind:this={shell} data-testid="wash-shell">
		<div class="wash-paper" bind:this={paper}>
			<div
				class="wash-ring"
				style="left:{ringStyle.left}; top:{ringStyle.top}; width:{ringStyle.size}; height:{ringStyle.size};"
			>
				<div class="wash-ring-bloom"></div>
				<div class="wash-scorch"></div>
				<div class="wash-ring-inner"></div>
				{#each [90, 210, 330] as bearing (bearing)}
					<div class="wash-sign" style="--bearing:{bearing}deg"></div>
				{/each}
			</div>
		</div>
		<canvas class="wash-canvas" bind:this={canvas} data-testid="wash-canvas"></canvas>
	</div>

	{#if panelOpen}
		<aside class="wash-panel">
			<header>
				<strong>wash</strong>
				<span>{WASH_PRESET_ID} · {WASH_SIGIL}</span>
				<button type="button" onclick={() => (panelOpen = false)}>hide</button>
			</header>
			<p class="wash-readout">{readout}</p>
			{#each POST_SLIDERS as slider (slider.key)}
				<label>
					<span>{slider.label}</span>
					<strong>{settings[slider.key]}</strong>
					<input
						type="range"
						min={slider.min}
						max={slider.max}
						step={slider.step}
						value={settings[slider.key]}
						oninput={(event) => (settings[slider.key] = Number(event.currentTarget.value))}
					/>
				</label>
			{/each}
			<button type="button" onclick={() => (settings = { ...WASH_POST_DEFAULTS })}>reset</button>
		</aside>
	{/if}
</div>

<style>
	.wash-page {
		position: fixed;
		inset: 0;
		z-index: 40;
		display: grid;
		place-items: center;
		/* The spread the seal's sheet lies on. Everything is paper, so soot reads. */
		background:
			radial-gradient(120% 90% at 50% 26%, rgba(255, 250, 233, 0.55), rgba(0, 0, 0, 0) 62%),
			radial-gradient(140% 120% at 50% 110%, rgba(84, 62, 38, 0.32), rgba(0, 0, 0, 0) 58%), #ddd0b3;
		overflow: hidden;
	}

	.wash-shell {
		position: relative;
		width: min(100vw, calc(100vh * 1.22));
		height: min(100vh, calc(100vw / 1.22));
	}

	.wash-paper {
		position: absolute;
		inset: 0;
		background:
			radial-gradient(80% 60% at 42% 34%, rgba(255, 253, 244, 0.9), rgba(0, 0, 0, 0) 70%),
			radial-gradient(90% 70% at 66% 74%, rgba(226, 210, 176, 0.55), rgba(0, 0, 0, 0) 66%), #f3ead4;
		transform-origin: 50% calc(50% + var(--portal-origin-shift));
		transform: perspective(var(--portal-perspective)) translateY(var(--portal-lift))
			rotateX(var(--portal-tilt)) scale(var(--portal-shrink));
		box-shadow:
			0 1px 0 rgba(255, 253, 240, 0.8) inset,
			0 26px 40px rgba(58, 42, 26, 0.34);
		filter: drop-shadow(0 26px 22px rgba(58, 42, 26, 0.26));
	}

	.wash-ring {
		position: absolute;
		transform: translate(-50%, -50%);
		border: 5px solid color-mix(in srgb, #33291f, #c04a12 calc(var(--wash-ink-heat, 0) * 78%));
		border-radius: 50%;
		box-shadow: 0 0 calc(var(--wash-ink-heat, 0) * 26px) rgba(196, 78, 20, 0.55);
	}

	/* R-01's charge, on the paper: the ink warms and the seal stains before it fires. */
	.wash-ring-bloom {
		position: absolute;
		inset: -18%;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgba(176, 66, 18, 0.5) 0%,
			rgba(140, 58, 20, 0.22) 46%,
			rgba(0, 0, 0, 0) 72%
		);
		opacity: var(--wash-ink-heat, 0);
	}

	/* Pigment the cast leaves behind. A page that burned does not come back clean. */
	.wash-scorch {
		position: absolute;
		inset: 4%;
		border-radius: 50%;
		background: radial-gradient(
			circle,
			rgba(88, 47, 24, 0.62) 0%,
			rgba(104, 60, 30, 0.34) 38%,
			rgba(126, 84, 46, 0.14) 62%,
			rgba(0, 0, 0, 0) 78%
		);
		mix-blend-mode: multiply;
		opacity: calc(var(--wash-scorch, 0) * 0.85);
	}

	.wash-ring-inner {
		position: absolute;
		inset: 22%;
		border: 3px solid color-mix(in srgb, #3a2f24, #c04a12 calc(var(--wash-ink-heat, 0) * 62%));
		border-radius: 50%;
	}

	/* One tick per drawn column sign, at the bearings the preset places them. */
	.wash-sign {
		position: absolute;
		left: 50%;
		top: 50%;
		width: 3px;
		height: 13%;
		margin-left: -1.5px;
		background: color-mix(in srgb, #33291f, #c04a12 calc(var(--wash-ink-heat, 0) * 70%));
		transform-origin: 50% 0;
		transform: rotate(calc(var(--bearing) * -1 + 90deg)) translateY(62%);
	}

	.wash-canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
		pointer-events: none;
	}

	.wash-panel {
		position: absolute;
		right: 14px;
		top: 14px;
		width: 232px;
		padding: 10px 12px 12px;
		border: 1px solid rgba(44, 34, 24, 0.28);
		border-radius: 8px;
		background: rgba(247, 241, 226, 0.92);
		color: #3a2e22;
		font-family: ui-monospace, monospace;
		font-size: 11px;
	}

	.wash-panel header {
		display: flex;
		gap: 6px;
		align-items: baseline;
		justify-content: space-between;
		margin-bottom: 6px;
	}

	.wash-panel header span {
		flex: 1 1 auto;
		overflow: hidden;
		color: #6b5a45;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.wash-readout {
		margin: 0 0 8px;
		color: #7a3d13;
	}

	.wash-panel label {
		display: grid;
		grid-template-columns: 1fr auto;
		gap: 2px 8px;
		margin-bottom: 4px;
	}

	.wash-panel label input {
		grid-column: 1 / -1;
		width: 100%;
	}

	.wash-panel button {
		padding: 2px 6px;
		border: 1px solid rgba(44, 34, 24, 0.35);
		border-radius: 4px;
		background: rgba(255, 252, 242, 0.8);
		color: inherit;
		font: inherit;
		cursor: pointer;
	}
</style>
