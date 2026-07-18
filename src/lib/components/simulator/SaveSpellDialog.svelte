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
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
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
				name: trimmed,
				data,
				previewIr: spellIR ?? null,
				element: spellIR?.element ?? null
			});
			if (result.ok) {
				grimoire.saveDialogOpen = false;
				toast.push(`“${trimmed}” inscribed in your grimoire.`);
			} else if (result.reason === 'auth-required') {
				error = 'Sign in first to save spells.';
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
		{#if error}
			<p class="save-error" data-testid="save-spell-error">{error}</p>
		{/if}
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
	.save-dialog {
		width: min(380px, 92vw);
		padding: 24px;
		border: 1px solid var(--panel-line);
		border-radius: 12px;
		color: var(--ink);
		background: var(--panel, #f2ecd6);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
	}

	.save-dialog::backdrop {
		background: rgba(36, 27, 22, 0.5);
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
