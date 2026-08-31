<!--
@component
Names and saves the current drawing as a spell preset. Serializes the canvas
through {@link serializeSpellPreset}, which stores the ring unsealed, and keeps
the compiled IR alongside for library previews. Requires a signed-in user, the
save button gates on that before opening this dialog.
-->
<script lang="ts">
	import { toast } from '@zerodevx/svelte-toast';
	import { serializeSpellPreset } from '$lib/structures/spellPreset.js';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	const auth = getAuthState();
	let grimoire = $derived(simulator.grimoire);

	let dialog = $state<HTMLDialogElement>();
	let name = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	$effect(() => {
		if (!dialog) return;
		if (grimoire.saveDialogOpen && !dialog.open) {
			name = defaultName();
			error = null;
			dialog.showModal();
		} else if (!grimoire.saveDialogOpen && dialog.open) {
			dialog.close();
		}
	});

	function defaultName(): string {
		const element = simulator.recognition.spellIR?.element;
		return element ? `${element[0].toUpperCase()}${element.slice(1)} spell` : 'Unnamed spell';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		if (busy) return;
		const trimmed = name.trim();
		if (!trimmed) {
			error = 'Give the spell a name.';
			return;
		}
		await inscribe(trimmed);
	}

	/** Saves the drawing under `spellName`. Separate from the submit handler so a
	 * lapsed sign-in can resume the very same save once a fresh one lands. */
	async function inscribe(spellName: string): Promise<void> {
		busy = true;
		error = null;
		try {
			const { drawing, recognition, ui } = simulator;
			const data = serializeSpellPreset(
				{ strokes: drawing.store.getStrokes(), placements: drawing.placements.getPlacements() },
				ui.glyphCanvas.width,
				recognition.ring ?? null
			);
			const spellIR = recognition.spellIR;
			const result = await grimoire.save({
				name: spellName,
				data,
				previewIr: spellIR ?? null,
				element: spellIR?.element ?? null
			});
			if (result.ok) {
				grimoire.saveDialogOpen = false;
				toast.push(`“${spellName}” saved to your spells.`);
			} else if (result.reason === 'auth-required') {
				// The session lapsed while the dialog was open. Drop the stale
				// account and let the sign-in it prompts for finish this save.
				error = 'Your sign-in has lapsed. Sign in again to finish saving.';
				auth.onSignedOut();
				void auth.requireUser(() => void inscribe(spellName));
			} else {
				error = 'The spell could not be saved. Try again in a moment.';
			}
		} catch {
			error = 'The spell could not be saved. Try again in a moment.';
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="save-dialog"
	data-testid="save-spell-dialog"
	onclose={() => (grimoire.saveDialogOpen = false)}
>
	<form onsubmit={submit}>
		<h2>Inscribe this spell</h2>
		<p class="save-note">
			The diagram is stored with its ring open, so it will not activate when recalled.
		</p>
		<label>
			<span>Spell name</span>
			<input
				class="text-control"
				data-testid="save-spell-name"
				bind:value={name}
				maxlength={60}
				required
			/>
		</label>
		<!-- The slot is always laid out so an error does not shove the buttons
		     down under the reader's cursor. -->
		<div class="save-error-slot" aria-live="polite">
			{#if error}
				<p class="save-error" data-testid="save-spell-error">{error}</p>
			{/if}
		</div>
		<div class="save-actions">
			<button type="button" class="save-cancel" onclick={() => (grimoire.saveDialogOpen = false)}>
				Cancel
			</button>
			<button type="submit" class="save-confirm" data-testid="save-spell-confirm" disabled={busy}>
				{busy ? 'Inscribing…' : 'Save spell'}
			</button>
		</div>
	</form>
</dialog>

<style>
	/* The dialog rises the way the drawers slide, on the same easing, so a modal
	   does not pop into a room where everything else moves. `display` and
	   `overlay` transition discretely, which is what lets the closing frame play
	   before the browser takes the dialog out of the top layer. */
	.save-dialog {
		width: min(380px, 92vw);
		padding: 24px;
		border: 1px solid var(--panel-line);
		border-radius: 12px;
		color: var(--ink);
		background: var(--panel, #f2ecd6);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
		opacity: 1;
		scale: 1;
		transition:
			opacity 220ms ease,
			scale 220ms cubic-bezier(0.22, 1, 0.36, 1),
			overlay 220ms allow-discrete,
			display 220ms allow-discrete;
	}

	.save-dialog:not([open]) {
		opacity: 0;
		scale: 0.97;
	}

	@starting-style {
		.save-dialog[open] {
			opacity: 0;
			scale: 0.97;
		}
	}

	.save-dialog::backdrop {
		background: rgba(36, 27, 22, 0.5);
		transition:
			background 220ms ease,
			overlay 220ms allow-discrete,
			display 220ms allow-discrete;
	}

	.save-dialog:not([open])::backdrop {
		background: rgba(36, 27, 22, 0);
	}

	@starting-style {
		.save-dialog[open]::backdrop {
			background: rgba(36, 27, 22, 0);
		}
	}

	form {
		display: grid;
		gap: 14px;
	}

	h2 {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 1.25rem;
		letter-spacing: 0.04em;
	}

	.save-note {
		margin: 0;
		font-size: 0.9rem;
		color: var(--muted-ink);
	}

	label {
		display: grid;
		gap: 6px;
		font-size: 0.9rem;
	}

	/* One line of room, held whether or not there is anything to say. */
	.save-error-slot {
		min-height: 1.2rem;
	}

	.save-error {
		margin: 0;
		font-size: 0.9rem;
		color: var(--ember);
	}

	.save-actions {
		display: flex;
		justify-content: flex-end;
		gap: 10px;
	}

	.save-confirm,
	.save-cancel {
		min-height: 38px;
		padding: 0 18px;
	}
</style>
