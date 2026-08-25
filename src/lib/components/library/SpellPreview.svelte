<!--
@component
Replays a saved spell's effect on a small stacked-canvas stage, driven by
{@link SpellPreviewDriver}. Clicking the stage replays the effect. Rendered
only while its card's preview is toggled on.
-->
<script lang="ts">
	import { SpellPreviewDriver } from '$lib/ui/library/spell-preview.js';
	import { reviveSpellIr } from '$lib/ui/library/reviveSpell.js';
	import { effectStyleFrom } from '$lib/structures/effectStyle.js';
	import { loadSimulatorPreferences } from '$lib/ui/simulator/preferences.js';
	import type { SpellPresetData } from '$lib/structures/spellPreset.js';
	import type { SpellIR } from '$lib/types.js';

	interface Props {
		data: SpellPresetData;
		previewIr: SpellIR;
		onEnded?: () => void;
	}

	let { data, previewIr, onEnded }: Props = $props();

	// The caster's own choice, read from the same key the simulator writes. This
	// route has no control of its own: one setting per user, not two.
	const effectStyle = effectStyleFrom(loadSimulatorPreferences().effectStyle);

	let shell = $state<HTMLButtonElement>();
	let glyphCanvas = $state<HTMLCanvasElement>();
	let effectCanvas = $state<HTMLCanvasElement>();
	let driver: SpellPreviewDriver | null = null;

	// Read at call time, not at construction, so a parent re-render handing down a
	// fresh arrow cannot restart the replay.
	const handleEnded = () => onEnded?.();

	// Not `onMount`: the effect canvas is keyed on the style, so the driver is
	// rebuilt against whichever element is currently mounted. A canvas that has
	// handed out a `2d` context can never host WebGL, and the reverse holds too.
	// The stage engine performs the plan, which a legacy row does not carry, so
	// the stored drawing is revived first; classic reads the stored row as-is.
	$effect(() => {
		if (!shell || !glyphCanvas || !effectCanvas) {
			return;
		}
		const stage = { shell, glyphCanvas, effectCanvas };
		let cancelled = false;
		let teardown: (() => void) | null = null;
		const ready =
			effectStyle === 'classic' ? Promise.resolve(previewIr) : reviveSpellIr(data, previewIr);
		void ready.then((ir) => {
			if (cancelled) {
				return;
			}
			driver = new SpellPreviewDriver({
				...stage,
				data,
				previewIr: ir,
				effectStyle,
				onEnded: handleEnded
			});
			teardown = driver.start();
		});
		return () => {
			cancelled = true;
			teardown?.();
			driver = null;
		};
	});
</script>

<button
	type="button"
	class="preview-stage"
	data-testid="spell-preview-stage"
	title="Replay"
	bind:this={shell}
	onclick={() => driver?.restart()}
>
	<canvas class="glyph" bind:this={glyphCanvas}></canvas>
	{#key effectStyle}
		<canvas class="effect" data-effect-style={effectStyle} bind:this={effectCanvas}></canvas>
	{/key}
</button>

<style>
	/* The preview always plays an active spell, so the stage sits in the portal
	   state permanently: dark void behind a lit paper that tilts into depth. The
	   tilt reads the same portal variables `.canvas-shell.portal-active` does, so
	   the stage cannot drift from the simulator or from the projected effect. */
	.preview-stage {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 1;
		padding: 0;
		overflow: hidden;
		border: 1px solid var(--ink-sepia-20);
		border-radius: 6px;
		background: #3a332b;
		box-shadow: none;
		cursor: pointer;
	}

	canvas {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
	}

	/* Paper tilts and shrinks into a receding trapezium. perspective() lives on the
	   canvas itself, not a wrapper, so the 3D tilt is not flattened. */
	.glyph {
		z-index: 1;
		transform-origin: 50% calc(50% + var(--portal-origin-shift));
		transform: perspective(var(--portal-perspective)) translateY(var(--portal-lift))
			rotateX(var(--portal-tilt)) scale(var(--portal-shrink));
		transform-style: preserve-3d;
		box-shadow:
			0 1px 0 rgba(255, 251, 233, 0.52) inset,
			0 28px 38px rgba(36, 27, 22, 0.3);
		filter: drop-shadow(0 30px 24px rgba(36, 27, 22, 0.34));
	}

	/* The effect is drawn flat in canvas space, already anchored to the tilted
	   portal by the renderer, so this layer stays untransformed above the paper. */
	.effect {
		z-index: 2;
	}
</style>
