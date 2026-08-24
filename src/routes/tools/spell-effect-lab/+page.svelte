<script lang="ts">
	import { CONFIG } from '$lib/config.js';
	import { writeJson } from '$lib/debug/debugOverlay.js';
	import { setStatus } from '$lib/state.svelte';
	import {
		DEFAULT_SIGIL,
		EFFECT_CONTROLS,
		SIGIL_OPTIONS,
		buildSpellIR,
		defaultControlValues,
		elementForSigil,
		formatControlValue,
		readPresetSeal,
		valuesFromSpellIR
	} from '$lib/ui/spellEffectLab.js';
	import { LAB_PRESETS, presetById } from '$lib/ui/spellEffectLabPresets.js';
	import { resolvePlan } from '$lib/compiler/plan/resolvePlan.js';
	import { roundDeep } from '$lib/utils/json.js';
	import { page } from '$app/state';
	import { onMount, untrack } from 'svelte';
	import { LabPreview } from './lab-preview.js';
	import PlanPanel from './PlanPanel.svelte';
	import { readGoldenFrameRequest } from './lab-goldens.js';
	import { castReadbackRequested } from '$lib/cast/stage/readback.js';
	import {
		DEFAULT_EFFECT_STYLE,
		EFFECT_STYLES,
		EFFECT_STYLE_LABELS,
		effectStyleFrom,
		effectStyleFromSearch
	} from '$lib/structures/effectStyle.js';
	import { loadSimulatorPreferences } from '$lib/ui/simulator/preferences.js';

	const controlEntries = Object.entries(EFFECT_CONTROLS);

	// Test-only: the look golden tier asks for one preset at one timestamp.
	const goldenFrame = readGoldenFrameRequest(page.url);
	// Test-only: a spec that reads pixels back off the effect canvas needs the
	// frame to survive compositing, and so does the scripted clock's screenshot.
	const preserveFrames = goldenFrame !== null || castReadbackRequested(page.url.search);

	// Precedence, the same everywhere: query parameter, then stored preference,
	// then the default. The URL is read once at init, not tracked; the stored
	// half waits for the browser, so the server and the first client render agree
	// and the `{#key}` below swaps the canvas once the preference arrives.
	const requestedStyle = effectStyleFromSearch(page.url.search);

	let effectStyle = $state(requestedStyle ?? DEFAULT_EFFECT_STYLE);
	let sigil = $state(goldenFrame?.sigil ?? DEFAULT_SIGIL);
	const element = $derived(elementForSigil(sigil));
	let presetId = $state(goldenFrame?.presetId ?? 'none');
	const preset = $derived(presetById(presetId));
	const reading = $derived(readPresetSeal(preset.signs, sigil));
	const plan = $derived(resolvePlan(reading));
	let values = $state<Record<string, number>>(defaultControlValues());
	let irInput = $state('');
	let activatedAt = $state(0);

	// Reactive refs, because the effect canvas is keyed on the style and the
	// preview is rebuilt against whichever element is mounted.
	let glyphCanvas = $state<HTMLCanvasElement | null>(null);
	let effectCanvas = $state<HTMLCanvasElement | null>(null);
	let canvasShell = $state<HTMLDivElement | null>(null);
	let irPre = $state<HTMLPreElement | null>(null);
	let preview: LabPreview | null = null;

	const irJson = $derived(
		roundDeep(buildSpellIR({ values, element, sigil, activatedAt, config: CONFIG, reading }))
	);

	$effect(() => {
		if (irPre) {
			writeJson(irPre, irJson);
		}
	});

	function restartSpell() {
		activatedAt = performance.now();
		preview?.resetCast();
	}

	function handleSlider(key: string, event: Event & { currentTarget: HTMLInputElement }) {
		values[key] = Number(event.currentTarget.value);
		restartSpell();
	}

	function applyIR() {
		try {
			const patch = valuesFromSpellIR(JSON.parse(irInput), values);
			values = patch.values;
			if (patch.sigil) {
				sigil = patch.sigil;
			} else if (patch.element) {
				sigil = patch.element;
			}
			restartSpell();
			setStatus('IR applied', 'active');
		} catch (error) {
			setStatus(error instanceof Error ? error.message : String(error), 'invalid');
		}
	}

	async function copyIR() {
		const json = JSON.stringify(
			roundDeep(buildSpellIR({ values, element, sigil, activatedAt, config: CONFIG, reading })),
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
		if (!requestedStyle) {
			effectStyle = effectStyleFrom(loadSimulatorPreferences().effectStyle);
		}
	});

	// Not `onMount`: switching style destroys the effect canvas and mounts another,
	// and an engine has to be built against the element that is actually there.
	//
	// The body is untracked on purpose. The four elements above are the whole
	// dependency list, and the preview's state getter reads `activatedAt`, which
	// this same effect writes: tracked, the golden path's synchronous render would
	// subscribe the effect to a value it had just set and loop.
	$effect(() => {
		const glyph = glyphCanvas;
		const effect = effectCanvas;
		const shell = canvasShell;
		const style = effectStyle;
		if (!glyph || !effect || !shell) {
			return;
		}
		return untrack(() => {
			activatedAt = performance.now();
			preview = new LabPreview(
				glyph,
				effect,
				shell,
				() => ({
					values,
					element,
					sigil,
					activatedAt,
					reading,
					presetSigns: preset.signs
				}),
				{ preserveFrames, effectStyle: style }
			);
			if (goldenFrame) {
				preview.renderGoldenFrame(goldenFrame.frameMs);
				return;
			}
			return preview.start();
		});
	});
</script>

<svelte:head>
	<title>Spell Effect Lab</title>
</svelte:head>

<main class="workspace maker-workspace effect-lab-workspace">
	<section class="canvas-panel maker-canvas-panel">
		<div class="toolbar effect-lab-toolbar">
			<select class="select-control" bind:value={sigil} onchange={restartSpell}>
				{#each SIGIL_OPTIONS as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
			<select
				class="select-control"
				bind:value={presetId}
				onchange={restartSpell}
				title={preset.description}
				data-testid="lab-preset-select"
			>
				{#each LAB_PRESETS as option (option.id)}
					<option value={option.id}>{option.label}</option>
				{/each}
			</select>
			<select
				class="select-control"
				bind:value={effectStyle}
				title="Which engine performs the cast"
				data-testid="lab-engine-select"
			>
				{#each EFFECT_STYLES as option (option)}
					<option value={option}>{EFFECT_STYLE_LABELS[option]}</option>
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
			<canvas
				bind:this={glyphCanvas}
				id="labGlyphCanvas"
				width="900"
				height="700"
				data-testid="lab-glyph-canvas"
			></canvas>
			<!-- Keyed on the style: a canvas that has handed out a `2d` context can
			     never host WebGL, so a switch mounts a fresh element rather than
			     re-using this one. -->
			{#key effectStyle}
				<canvas
					bind:this={effectCanvas}
					id="labEffectCanvas"
					width="900"
					height="700"
					data-effect-style={effectStyle}
					data-testid="lab-effect-canvas"
				></canvas>
			{/key}
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

		<PlanPanel {plan} />

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

<style>
	.effect-lab-workspace {
		grid-template-columns: minmax(560px, 1fr) minmax(360px, 0.48fr);
	}

	.effect-lab-toolbar {
		flex-wrap: wrap;
	}

	.effect-lab-canvas-shell {
		position: relative;
		width: min(100%, 920px);
		max-height: calc(100vh - 178px);
		aspect-ratio: 9 / 7;
		touch-action: none;
	}

	.effect-lab-canvas-shell canvas {
		position: absolute;
		inset: 0;
		display: block;
		width: 100%;
		height: 100%;
	}

	.effect-lab-side-panel {
		display: grid;
		gap: 14px;
		align-content: start;
		overflow: auto;
	}

	.effect-lab-controls {
		display: grid;
		gap: 10px;
	}

	.effect-lab-help {
		margin: 0;
		color: color-mix(in srgb, var(--muted-ink) 84%, white);
		font-size: 12px;
		line-height: 1.4;
	}

	.effect-lab-slider {
		display: grid;
		grid-template-columns: minmax(0, 1fr) auto;
		gap: 7px 12px;
		align-items: center;
		color: var(--muted-ink);
		font-size: 13px;
	}

	.effect-lab-slider strong {
		min-width: 52px;
		color: var(--teal);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.effect-lab-slider small {
		grid-column: 1 / -1;
		color: color-mix(in srgb, var(--muted-ink) 82%, white);
		line-height: 1.35;
	}

	.effect-lab-slider input {
		grid-column: 1 / -1;
		width: 100%;
	}

	.effect-lab-ir-input {
		min-height: 150px;
	}

	.effect-lab-ir-output {
		max-height: 260px;
	}

	.effect-lab-button-row {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 8px;
		margin-top: 8px;
	}
</style>
