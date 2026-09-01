<!--
@component
The lower half of the left column: the history commands, then, past a rule of
its own, saving the drawing as a spell.

Undo, redo and clear act on the drawing. Save keeps it, which is a different
kind of act, so the rule above it is what sets it apart rather than any
difference in the button itself.
-->
<script lang="ts">
	import Bookmark from 'lucide-svelte/icons/bookmark';
	import BrushCleaning from 'lucide-svelte/icons/brush-cleaning';
	import RotateCcw from 'lucide-svelte/icons/rotate-ccw';
	import RotateCw from 'lucide-svelte/icons/rotate-cw';
	import { toast } from '@zerodevx/svelte-toast';
	import ChromeButton from './ChromeButton.svelte';
	import ChromeRule from './ChromeRule.svelte';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';
	import { formatShortcut, getPlatform } from '$lib/ui/keybindings.js';
	import type { SimulatorSession } from '$lib/ui/simulator/simulator-session.svelte.js';

	interface Props {
		simulator: SimulatorSession;
	}

	let { simulator }: Props = $props();
	const auth = getAuthState();
	// The chords keyboard.ts listens for, spelled the way this platform writes them.
	const platform = getPlatform();
	let undoKeys = $derived(formatShortcut('Ctrl+Z', platform.isMac));
	let redoKeys = $derived(formatShortcut('Ctrl+Shift+Z', platform.isMac));
	let actions = $derived(simulator.actions);
	let summary = $derived(simulator.recognition.summary);

	function saveSpell() {
		const { drawing } = simulator;
		if (drawing.store.count() + drawing.placements.count() === 0) {
			toast.push('Draw a spell before inscribing it.');
			return;
		}
		auth.requireUser(() => (simulator.grimoire.saveDialogOpen = true));
	}
</script>

<div class="action-bar" aria-label="Canvas actions">
	<ChromeButton
		role="command"
		id="undoButton"
		testId="undo-button"
		label="Undo"
		icon={RotateCcw}
		shortcut={undoKeys}
		chipAlign="left"
		disabled={summary.undoDisabled}
		onclick={actions.undo}
	/>
	<ChromeButton
		role="command"
		id="redoButton"
		testId="redo-button"
		label="Redo"
		icon={RotateCw}
		shortcut={redoKeys}
		chipAlign="left"
		disabled={summary.redoDisabled}
		onclick={actions.redo}
	/>
	<ChromeButton
		role="command"
		id="clearButton"
		testId="clear-button"
		label="Clear"
		icon={BrushCleaning}
		chipAlign="left"
		onclick={actions.clear}
	/>

	<ChromeRule />

	<ChromeButton
		role="command"
		id="saveSpellButton"
		testId="save-spell-button"
		label="Save spell"
		icon={Bookmark}
		chipAlign="left"
		onclick={saveSpell}
	/>
</div>

<style>
	.action-bar {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: var(--chrome-run-gap);
	}
</style>
