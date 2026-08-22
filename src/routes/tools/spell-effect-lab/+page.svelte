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
	import { FIELD_PRESETS, presetById } from '$lib/ui/spellEffectLabPresets.js';
	import { buildSpellField } from '$lib/field/buildSpellField.js';
	import { resolvePlan } from '$lib/compiler/plan/resolvePlan.js';
	import { roundDeep } from '$lib/utils/json.js';
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import { LabPreview } from './lab-preview.js';
	import PlanPanel from './PlanPanel.svelte';
	import { DEFAULT_LAB_ENGINE, type LabEngine } from './lab-engines.js';
	import { readGoldenFrameRequest } from './lab-goldens.js';

	const controlEntries = Object.entries(EFFECT_CONTROLS);

	// Test-only: the look golden tier asks for one preset at one timestamp.
	const goldenFrame = readGoldenFrameRequest(page.url);

	let engine = $state<LabEngine>(goldenFrame?.engine ?? DEFAULT_LAB_ENGINE);
	let sigil = $state(DEFAULT_SIGIL);
	const element = $derived(elementForSigil(sigil));
	let presetId = $state(goldenFrame?.presetId ?? 'none');
	const preset = $derived(presetById(presetId));
	const field = $derived(buildSpellField(preset.signs));
	const reading = $derived(readPresetSeal(preset.signs, sigil));
	const plan = $derived(resolvePlan(reading));
	let values = $state<Record<string, number>>(defaultControlValues());
	let irInput = $state('');
	let activatedAt = $state(0);

	let glyphCanvas: HTMLCanvasElement;
	let effectCanvas: HTMLCanvasElement;
	let canvasShell: HTMLDivElement;
	let irPre = $state<HTMLPreElement | null>(null);
	let preview: LabPreview | null = null;

	const irJson = $derived(
		roundDeep(buildSpellIR({ values, element, sigil, activatedAt, config: CONFIG, field, reading }))
	);

	$effect(() => {
		if (irPre) {
			writeJson(irPre, irJson);
		}
	});

	function restartSpell() {
		activatedAt = performance.now();
		preview?.resetParticles();
	}

	function selectEngine(next: LabEngine) {
		engine = next;
		restartSpell();
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
			roundDeep(
				buildSpellIR({ values, element, sigil, activatedAt, config: CONFIG, field, reading })
			),
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
		activatedAt = performance.now();
		preview = new LabPreview(glyphCanvas, effectCanvas, canvasShell, () => ({
			values,
			element,
			sigil,
			activatedAt,
			engine,
			field,
			reading,
			presetSigns: preset.signs
		}));
		if (goldenFrame) {
			preview.renderGoldenFrame(goldenFrame.frameMs);
			return;
		}
		return preview.start();
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
				data-testid="field-preset-select"
			>
				{#each FIELD_PRESETS as option (option.id)}
					<option value={option.id}>{option.label}</option>
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
			<canvas
				bind:this={effectCanvas}
				id="labEffectCanvas"
				width="900"
				height="700"
				data-testid="lab-effect-canvas"
			></canvas>
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

		<PlanPanel {plan} {engine} onEngine={selectEngine} />

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
