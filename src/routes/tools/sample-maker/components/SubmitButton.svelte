<!--
@component
Owns the sample submission: the form, the `submitSample` enhance flow, and the success/error
toasts. Reads the payload and ready-state from the shared session, and on success hands back to
`session.clearAndSuggestNext()` to start the next sample. The Ctrl+S shortcut is registered
directly (rather than via ShortcutButton) so the chord triggers the native form submit once.
-->
<script lang="ts">
	import ButtonWithShortcut from '$lib/ui/ButtonWithShortcut.svelte';
	import { getShortcutRegistry } from '$lib/ui/shortcutRegistry.svelte.js';
	import { toast } from '@zerodevx/svelte-toast';
	import { getMakerSession } from '../maker-session.svelte.js';
	import { submitSample } from '../samples.remote.js';

	const session = getMakerSession();
	const registry = getShortcutRegistry();

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

	// Use enhance so only one submission path exists — spreading {...submitSample} on the form
	// already adds its own submit listener, so a separate onsubmit handler would cause two fetches.
	submitSample.enhance(async (instance) => {
		if (session.submitting) return;

		if (!session.selected) return error('Pick a sign label first.');
		if (!session.symbolEntity)
			return error('The reference glyph is missing — label the sign again.');
		if (session.strokes.length === 0) return error('Draw the sign before submitting.');

		session.submitting = true;
		// Persistent "uploading" toast (initial: 0 disables the countdown); popped once we resolve.
		const loadingId = toast.push('Uploading your sample…', { initial: 0, dismissable: false });
		try {
			await instance.submit();
			const result = submitSample.result;
			if (result?.ok) {
				session.clearAndSuggestNext();
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
			session.submitting = false;
		}
	});

	// Mirror the visible submit button on Ctrl+S; requestSubmit() runs the same enhance path.
	$effect(() =>
		registry.register({
			shortcut: 'Ctrl+S',
			description: 'Submit sample',
			disabled: () => !session.canSubmit,
			action: () => formEl.requestSubmit()
		})
	);
</script>

<form class="submit-form" {...submitSample} bind:this={formEl}>
	<input {...submitSample.fields.payload.as('hidden', session.payload)} />
	<ButtonWithShortcut
		type="submit"
		description="Submit"
		shortcut="Ctrl+S"
		disabled={!session.canSubmit}
	/>
</form>

<style>
	.submit-form {
		display: flex;
		justify-content: center;
	}
</style>
