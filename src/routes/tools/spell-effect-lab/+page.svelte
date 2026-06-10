<script lang="ts">
	import { CONFIG } from '$lib/config.js';
	import { writeJson } from '$lib/debug/debugOverlay.js';
	import { activePortalPlane, convergenceFlow } from '$lib/renderer/effects/effectUtils.js';
	import { drawGlowingStrokes } from '$lib/renderer/glyphOverlayRenderer.js';
	import { drawGuides, drawPaper } from '$lib/renderer/paperRenderer.js';
	import { SpellEffectRenderer } from '$lib/renderer/spellEffectRenderer.js';
	import { setStatus } from '$lib/state.svelte';
	import type { RingInfo } from '$lib/types.js';
	import {
		DEFAULT_ELEMENT,
		EFFECT_CONTROLS,
		buildSpellIR,
		defaultControlValues,
		formatControlValue,
		valuesFromSpellIR
	} from '$lib/ui/spellEffectLab.js';
	import { roundDeep } from '$lib/utils/json.js';
	import { onMount } from 'svelte';

	const ELEMENTS = ['fire', 'water', 'wind', 'earth', 'light'];
	const controlEntries = Object.entries(EFFECT_CONTROLS);

	let element = $state(DEFAULT_ELEMENT);
	let values = $state<Record<string, number>>(defaultControlValues());
	let irInput = $state('');
	let activatedAt = $state(0);

	let glyphCanvas: HTMLCanvasElement;
	let effectCanvas: HTMLCanvasElement;
	let canvasShell: HTMLDivElement;
	let irPre = $state<HTMLPreElement | null>(null);
	let effectRenderer: SpellEffectRenderer | null = null;

	const irJson = $derived(
		roundDeep(buildSpellIR({ values, element, activatedAt, config: CONFIG }))
	);

	$effect(() => {
		if (irPre) {
			writeJson(irPre, irJson);
		}
	});

	function resetParticles() {
		effectRenderer?.resetEffects();
	}

	function restartSpell() {
		activatedAt = performance.now();
		resetParticles();
	}

	function handleSlider(key: string, event: Event & { currentTarget: HTMLInputElement }) {
		values[key] = Number(event.currentTarget.value);
		restartSpell();
	}

	function applyIR() {
		try {
			const patch = valuesFromSpellIR(JSON.parse(irInput), values);
			values = patch.values;
			if (patch.element) {
				element = patch.element;
			}
			restartSpell();
			setStatus('IR applied', 'active');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error), 'invalid');
		}
	}

	async function copyIR() {
		const json = JSON.stringify(
			roundDeep(buildSpellIR({ values, element, activatedAt, config: CONFIG })),
			null,
			2
		);
		irInput = json;
		try {
			await navigator.clipboard?.writeText(json);
			setStatus('IR copied', 'active');
		} catch {
			setStatus('IR copied to input', 'prepared');
		}
	}

	onMount(() => {
		const glyphCtx = glyphCanvas.getContext('2d')!;
		const effectCtx = effectCanvas.getContext('2d')!;
		effectRenderer = new SpellEffectRenderer(effectCanvas, CONFIG);
		activatedAt = performance.now();
		let rafId: number | null = null;

		function buildRing() {
			const width = glyphCanvas.width;
			const height = glyphCanvas.height;
			return {
				found: true,
				complete: true,
				center: { x: width / 2, y: height * 0.56 },
				radius: Math.min(width, height) * values.ringRadius,
				strokeIds: ['lab-ring']
			};
		}

		function buildRingStroke(ring: RingInfo) {
			const points = [];
			for (let index = 0; index <= 96; index += 1) {
				const angle = (index / 96) * Math.PI * 2;
				points.push({
					x: ring.center.x + Math.cos(angle) * ring.radius,
					y: ring.center.y + Math.sin(angle) * ring.radius
				});
			}
			return { id: 'lab-ring', points };
		}

		function buildSigilStroke(ring: RingInfo) {
			const radius = ring.radius * (0.16 + values.effectScale * 0.035);
			const points = [];
			// pentagram example
			for (let index = 0; index < 6; index += 1) {
				const angle = -Math.PI / 2 + index * ((Math.PI * 2) / 5);
				points.push({
					x: ring.center.x + Math.cos(angle) * radius,
					y: ring.center.y + Math.sin(angle) * radius
				});
			}
			return { id: 'lab-sigil', points };
		}

		function drawSyntheticGlyph(ring: RingInfo, timestamp: number) {
			const width = glyphCanvas.width;
			const height = glyphCanvas.height;
			const ringStroke = buildRingStroke(ring);
			const sigilStroke = buildSigilStroke(ring);

			drawPaper(glyphCtx, width, height);
			drawGuides(glyphCtx, ring, width, height, CONFIG);

			glyphCtx.save();
			glyphCtx.lineCap = 'round';
			glyphCtx.lineJoin = 'round';
			glyphCtx.strokeStyle = CONFIG.renderer.inkColor;
			glyphCtx.lineWidth = 4.4;
			glyphCtx.beginPath();
			glyphCtx.moveTo(ringStroke.points[0].x, ringStroke.points[0].y);
			for (const point of ringStroke.points.slice(1)) {
				glyphCtx.lineTo(point.x, point.y);
			}
			glyphCtx.stroke();

			glyphCtx.beginPath();
			glyphCtx.moveTo(sigilStroke.points[0].x, sigilStroke.points[0].y);
			for (const point of sigilStroke.points.slice(1)) {
				glyphCtx.lineTo(point.x, point.y);
			}
			glyphCtx.stroke();
			glyphCtx.restore();

			drawGlowingStrokes(
				glyphCtx,
				activatedAt,
				new Set(['lab-ring', 'lab-sigil']),
				[ringStroke, sigilStroke],
				values.duration * 1000,
				timestamp
			);
		}

		function drawConvergencePathGuide(spellIR: ReturnType<typeof buildSpellIR>, ring: RingInfo) {
			const convergence = spellIR.manifestations?.convergence;
			if (!convergence?.strength) {
				return;
			}

			const portal = activePortalPlane(effectCanvas, ring);
			const flow = convergenceFlow(spellIR, portal, 0);
			const guideLength = ring.radius * (0.72 + spellIR.force * 0.46 + spellIR.range * 0.22);
			const end = {
				x: flow.origin.x + flow.direction.x * guideLength,
				y: flow.origin.y + flow.direction.y * guideLength
			};
			const radiusX = Math.max(5, flow.radiusX);
			const radiusY = Math.max(4, flow.radiusY);

			effectCtx.save();
			effectCtx.globalCompositeOperation = 'source-over';
			effectCtx.strokeStyle = 'rgba(19, 118, 166, 0.78)';
			effectCtx.lineWidth = 1.4;
			effectCtx.setLineDash([4, 5]);
			effectCtx.beginPath();
			effectCtx.moveTo(flow.origin.x, flow.origin.y);
			effectCtx.lineTo(end.x, end.y);
			effectCtx.stroke();
			effectCtx.beginPath();
			effectCtx.ellipse(end.x, end.y, radiusX, radiusY, 0, 0, Math.PI * 2);
			effectCtx.stroke();
			effectCtx.setLineDash([]);
			effectCtx.beginPath();
			effectCtx.moveTo(end.x - 7, end.y);
			effectCtx.lineTo(end.x + 7, end.y);
			effectCtx.moveTo(end.x, end.y - 7);
			effectCtx.lineTo(end.x, end.y + 7);
			effectCtx.stroke();
			effectCtx.restore();
		}

		function resizeCanvases() {
			const rect = canvasShell.getBoundingClientRect();
			const width = Math.max(1, Math.round(rect.width));
			const height = Math.max(1, Math.round(rect.height));
			if (glyphCanvas.width === width && glyphCanvas.height === height) {
				return;
			}

			glyphCanvas.width = width;
			glyphCanvas.height = height;
			effectCanvas.width = width;
			effectCanvas.height = height;
			resetParticles();
		}

		function animationFrame(timestamp: number) {
			resizeCanvases();
			const ring = buildRing();
			const spellIR = buildSpellIR({ values, element, activatedAt, config: CONFIG });
			drawSyntheticGlyph(ring, timestamp);
			effectRenderer!.render(spellIR, ring, timestamp, { showGuides: false });
			drawConvergencePathGuide(spellIR, ring);
			rafId = requestAnimationFrame(animationFrame);
		}

		rafId = requestAnimationFrame(animationFrame);

		return () => {
			if (rafId) {
				cancelAnimationFrame(rafId);
			}
		};
	});
</script>

<svelte:head>
	<title>Spell Effect Lab</title>
</svelte:head>

<main class="workspace maker-workspace effect-lab-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar effect-lab-toolbar">
			<select class="select-control" bind:value={element} onchange={restartSpell}>
				{#each ELEMENTS as option (option)}
					<option value={option}>{option[0].toUpperCase() + option.slice(1)}</option>
				{/each}
			</select>
			<button
				type="button"
				onclick={() => {
					restartSpell();
					setStatus('Particles reset', 'prepared');
				}}
			>
				Reset Particles
			</button>
		</div>
		<div class="canvas-shell effect-lab-canvas-shell portal-active" bind:this={canvasShell}>
			<canvas bind:this={glyphCanvas} width="900" height="700"></canvas>
			<canvas bind:this={effectCanvas} width="900" height="700"></canvas>
		</div>
	</section>

	<aside class="side-panel effect-lab-side-panel">
		<section class="diagnostic-block effect-lab-controls">
			<h2>SpellIR Controls</h2>
			{#each controlEntries as [key, control] (key)}
				<label class="effect-lab-slider">
					<span>{control.label}</span>
					<strong>{formatControlValue(key, values[key])}</strong>
					<small>{control.description}</small>
					<input
						type="range"
						min={control.min}
						max={control.max}
						step={control.step}
						value={values[key]}
						oninput={(event) => handleSlider(key, event)}
					/>
				</label>
			{/each}
		</section>

		<section class="diagnostic-block">
			<h2>Paste IR</h2>
			<p class="effect-lab-help">
				Apply IR loads values from pasted JSON. Copy Current IR writes the sliders back into JSON
				for testing.
			</p>
			<textarea class="template-output effect-lab-ir-input" spellcheck="false" bind:value={irInput}
			></textarea>
			<div class="effect-lab-button-row">
				<button type="button" onclick={applyIR}>Apply IR</button>
				<button type="button" onclick={copyIR}>Copy Current IR</button>
			</div>
		</section>

		<section class="diagnostic-block">
			<h2>Current IR</h2>
			<pre bind:this={irPre} class="diagnostic-output effect-lab-ir-output"></pre>
		</section>
	</aside>
</main>
