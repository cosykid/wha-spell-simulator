<!--
@component
Icon-only button primitive for simulator controls.

This component centralizes the repeated simulator button wiring: labels, tooltips,
pressed/active state, disabled state, test ids, and icon content. The parent still
chooses the visual button class so action buttons, tool buttons, and zoom buttons
can share behavior without sharing layout assumptions.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';

	interface Props {
		id?: string;
		testId?: string;
		label: string;
		tooltip?: string;
		buttonClass?: string;
		active?: boolean;
		pressed?: boolean;
		disabled?: boolean;
		onclick: () => void;
		children: Snippet;
	}

	let {
		id,
		testId,
		label,
		tooltip = label,
		buttonClass = '',
		active = false,
		pressed,
		disabled = false,
		onclick,
		children
	}: Props = $props();
</script>

<button
	type="button"
	{id}
	data-testid={testId}
	class={buttonClass}
	class:active
	aria-pressed={pressed}
	aria-label={label}
	title={label}
	data-tooltip={tooltip}
	{disabled}
	{onclick}
>
	{@render children()}
</button>
