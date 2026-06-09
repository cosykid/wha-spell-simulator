<!--
@component
The component that handles the sample submission flow: building the payload, submitting it, and reporting the outcome. It also previews the JSON that will be uploaded.
-->
<script lang="ts">
	import type { TransformableEntity } from '$canvas/entity.js';
	import type { Stroke } from '$lib/types.js';
	import ButtonWithShortcut from '$lib/ui/ButtonWithShortcut.svelte';
	import { formatShortcut, isApplePlatform } from '$lib/ui/keybindings.js';
	import { onMount } from 'svelte';
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

	let submitting = $state(false);
	let status = $state('');
	let formEl: HTMLFormElement;

	// Display ⌘ on macOS, Ctrl elsewhere. Detected after mount so the prerendered
	// markup (which always renders "Ctrl") hydrates without a mismatch.
	let isMac = $state(false);
	onMount(() => {
		isMac = isApplePlatform();
	});

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

		if (!selected) {
			status = 'Pick a sign label first.';
			return;
		}
		if (!symbolEntity) {
			status = 'The reference glyph is missing — pick a sign label again.';
			return;
		}
		if (strokes.length === 0) {
			status = 'Draw the sign before submitting.';
			return;
		}

		submitting = true;
		status = 'Uploading…';
		try {
			await instance.submit();
			const result = submitSample.result;
			if (result?.ok) {
				status = `✓ Uploaded (Time: ${new Date().toLocaleString()})`;
				onSuccess?.();
			} else if (result?.reason === 'duplicate') {
				status = 'Already submitted — identical strokes are on record.';
			} else if (result?.reason === 'server-error') {
				status = 'Server error — could not save the sample. Please try again.';
			} else {
				console.error('Upload failed (field issues):', submitSample.fields.allIssues());
				status = 'Upload failed. Please try again.';
			}
		} catch (error) {
			console.error('Upload failed:', error);
			status = 'Upload failed. Please try again.';
		} finally {
			submitting = false;
		}
	});

	export const submit = () => formEl.requestSubmit();

	export const reset = () => {
		status = '';
	};
</script>

<form {...submitSample} bind:this={formEl}>
	<input {...submitSample.fields.payload.as('hidden', payload)} />
	<ButtonWithShortcut
		type="submit"
		description="Submit sample"
		shortcut={formatShortcut('Ctrl+S', isMac)}
		disabled={!selected || !strokes.length || submitting}
	/>
</form>

{#if status}
	<p class="submit-status" role="status">{status}</p>
{/if}

<h2 class="panel-section-title">Sample output</h2>
<textarea
	class="sample-output"
	readonly
	value={payload}
	placeholder="Complete the form to preview the sample…"
></textarea>

<style>
	.submit-status {
		margin: 0;
		font-size: 13px;
		line-height: 1.4;
		color: rgba(36, 27, 22, 0.85);
	}

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
</style>
