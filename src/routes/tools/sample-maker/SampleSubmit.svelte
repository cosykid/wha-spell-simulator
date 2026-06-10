<!--
@component
Handles the sample submission flow: building the payload, submitting it, and reporting the
outcome (uploading / success / error) through global toast notifications.
-->
<script lang="ts">
	import type { TransformableEntity } from '$canvas/entity.js';
	import type { Stroke } from '$lib/types.js';
	import ButtonWithShortcut from '$lib/ui/ButtonWithShortcut.svelte';
	import { toast } from '@zerodevx/svelte-toast';
	import Phase from './Phase.svelte';
	import { buildSampleSubmission } from './buildSample.js';
	import { submitSample } from './samples.remote.js';
	import type { SampleSymbol } from './symbols.js';

	interface Props {
		/** The reference glyph entity, or `null` when none is stamped on the canvas. */
		symbolEntity: TransformableEntity | null;
		/** The drawn strokes to include in the sample. */
		strokes: Stroke[];
		/** The picked sign label, or `null` when none is selected. */
		selected: SampleSymbol | null;
		/** Canvas context, used to read the pixel dimensions baked into the sample. */
		ctx: CanvasRenderingContext2D | null;
		/** Callback invoked after a successful submission. */
		onSuccess?: () => void;
	}

	let { symbolEntity, strokes, selected, ctx, onSuccess }: Props = $props();

	// Guards the button + prevents a double submit; user-facing messages go to the toast host.
	let submitting = $state(false);
	let formEl: HTMLFormElement;

	// Toast palettes matching the Dataset Builder's teal accent and a warm-red error.
	const SUCCESS_THEME = {
		'--toastBackground': '#1f6f73',
		'--toastColor': '#fff',
		'--toastBarBackground': '#16585b'
	};
	const ERROR_THEME = {
		'--toastBackground': '#9a3b2f',
		'--toastColor': '#fff',
		'--toastBarBackground': '#7a2e24'
	};

	const error = (msg: string): void => {
		toast.push(msg, { theme: ERROR_THEME });
	};

	const submission = $derived.by(() => {
		if (!selected || !symbolEntity || strokes.length === 0) return null;
		const canvas = ctx?.canvas;
		return buildSampleSubmission({
			strokes,
			symbol: selected,
			transform: symbolEntity.placement.transform,
			canvasWidth: canvas?.width ?? 0,
			canvasHeight: canvas?.height ?? 0,
			devicePixelRatio: typeof window !== 'undefined' ? window.devicePixelRatio : 1
		});
	});

	const payload = $derived(submission ? JSON.stringify(submission, null, 2) : '');

	// Use enhance so only one submission path exists — spreading {...submitSample} on the form
	// already adds its own submit listener, so a separate onsubmit handler would cause two fetches.
	submitSample.enhance(async (instance) => {
		if (submitting) return;

		if (!selected) return error('Pick a sign label first.');
		if (!symbolEntity) return error('The reference glyph is missing — label the sign again.');
		if (strokes.length === 0) return error('Draw the sign before submitting.');

		submitting = true;
		// Persistent "uploading" toast (initial: 0 disables the countdown); popped once we resolve.
		const loadingId = toast.push('Uploading your sample…', { initial: 0, dismissable: false });
		try {
			await instance.submit();
			const result = submitSample.result;
			if (result?.ok) {
				onSuccess?.();
				toast.push('Thanks! Your sample was added to the dataset — draw another?', {
					theme: SUCCESS_THEME
				});
			} else if (result?.reason === 'duplicate') {
				error('Looks like this drawing is already on record. Try drawing it again.');
			} else if (result?.reason === 'server-error') {
				error("Server error — your sample wasn't saved. Please try again.");
			} else {
				console.error('Upload failed (field issues):', submitSample.fields.allIssues());
				error('Upload failed. Please try again.');
			}
		} catch (err) {
			console.error('Upload failed:', err);
			error('Upload failed. Please try again.');
		} finally {
			toast.pop(loadingId);
			submitting = false;
		}
	});

	export const submit = () => formEl.requestSubmit();
</script>

<Phase step={3} title="Submit your sample">
	{#snippet intro()}
		Happy with how the reference glyph lines up with your strokes? Send the labelled sample to the
		dataset.
	{/snippet}
	<form class="submit-form" {...submitSample} bind:this={formEl}>
		<input {...submitSample.fields.payload.as('hidden', payload)} />
		<ButtonWithShortcut
			type="submit"
			description="Submit sample"
			shortcut="Ctrl+S"
			disabled={!selected || !strokes.length || submitting}
		/>
	</form>
</Phase>

<!-- Dev tool: raw JSON preview of the sample payload. Commented out for the contributor UI.
<h2 class="panel-section-title">Sample output</h2>
<textarea
	class="sample-output"
	readonly
	value={payload}
	placeholder="Complete the form to preview the sample…"
></textarea>
-->

<style>
	.submit-form {
		display: flex;
		justify-content: center;
	}

	/* Styles for the commented-out dev "Sample output" textarea above.
	.sample-output {
		flex: 1 1 auto;
		min-height: 220px;
		resize: vertical;
		font-family: 'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;
		font-size: 12px;
		line-height: 1.45;
		white-space: pre;
		border: 1px solid rgba(36, 27, 22, 0.2);
		border-radius: 6px;
		padding: 10px;
		background: rgba(255, 255, 255, 0.55);
	}
	*/
</style>
