<!--
@component
The bottom action bar, whose controls switch by phase: in `draw` it's Undo/Redo plus the primary
"Label" action; in `label` it adds "Fit" and the username trigger, with "Submit" as the primary
action. The primary button is styled as a filled teal call-to-action with a trailing chevron.
-->
<script lang="ts">
	import { getMakerSession } from '../maker-session.svelte.js';
	import FitLabelButton from './FitLabelButton.svelte';
	import LabelButton from './LabelButton.svelte';
	import RedoButton from './RedoButton.svelte';
	import SubmitButton from './SubmitButton.svelte';
	import UndoButton from './UndoButton.svelte';
	import UsernameModal from './UsernameModal.svelte';

	const session = getMakerSession();
</script>

<div class="phase-bar">
	<div class="history">
		<UndoButton />
		<RedoButton />
	</div>

	{#if session.phase === 'draw'}
		<div class="spacer"></div>
		<div class="primary">
			<LabelButton />
		</div>
	{:else}
		<FitLabelButton />
		<div class="spacer"></div>
		<UsernameModal />
		<div class="primary">
			<SubmitButton />
		</div>
	{/if}
</div>

<style>
	.phase-bar {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 10px 12px;
		flex-wrap: wrap;
	}

	.history {
		display: flex;
		align-items: center;
		gap: 2px;
	}

	.spacer {
		flex: 1 1 auto;
	}

	/* Primary call-to-action: fill the underlying button (Label / Submit) and append a chevron. */
	.primary :global(button) {
		gap: 6px;
		color: #fff;
		background: rgba(31, 111, 115, 0.95);
		border-color: rgba(22, 88, 91, 0.95);
	}

	.primary :global(button:disabled) {
		opacity: 0.55;
	}

	.primary :global(button)::after {
		content: '›';
		font-size: 16px;
		line-height: 1;
	}

	.primary :global(kbd) {
		background: rgba(255, 255, 255, 0.18);
		border-color: rgba(255, 255, 255, 0.35);
		color: #fff;
	}
</style>
