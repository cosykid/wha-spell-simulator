<!--
@component
Contributor attribution in the label phase: a compact trigger showing the saved Discord handle (or
a prompt to add one), which opens a small modal wrapping the {@link DiscordUsernameField}. The
handle is persisted, so it's typed once and remembered across samples.
-->
<script lang="ts">
	import { Pencil } from 'lucide-svelte';
	import { getMakerSession } from '../maker-session.svelte.js';
	import DiscordUsernameField from './DiscordUsernameField.svelte';

	const session = getMakerSession();

	let dialog = $state<HTMLDialogElement>();

	$effect(() => {
		if (!dialog) return;
		if (session.usernameModalOpen && !dialog.open) dialog.showModal();
		else if (!session.usernameModalOpen && dialog.open) dialog.close();
	});
</script>

<button type="button" class="username-trigger" onclick={() => (session.usernameModalOpen = true)}>
	<Pencil size={14} />
	<span class="trigger-text">{session.discordUsername.value || 'Add your name'}</span>
</button>

<dialog
	bind:this={dialog}
	class="username-modal"
	onclose={() => (session.usernameModalOpen = false)}
>
	<DiscordUsernameField />
	<button type="button" class="username-done" onclick={() => dialog?.close()}>Done</button>
</dialog>

<style>
	.username-trigger {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		min-width: 0;
		max-width: 160px;
		padding: 8px 12px;
	}

	.trigger-text {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.username-modal {
		width: min(420px, 92vw);
		padding: 20px;
		border: 1px solid rgba(31, 111, 115, 0.4);
		border-radius: 12px;
		color: var(--ink);
		background: var(--paper, #f2eccd);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
	}

	.username-modal::backdrop {
		background: rgba(36, 27, 22, 0.5);
	}

	.username-done {
		min-height: 40px;
		padding: 0 20px;
	}
</style>
