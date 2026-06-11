<!--
@component
Optional contributor attribution. The handle is remembered across draws and visits (persisted in
the session), so a contributor types it once rather than on every sample.
-->
<script lang="ts">
	import { getMakerSession } from '../maker-session.svelte.js';

	const session = getMakerSession();
</script>

<label class="username-field">
	<span class="username-label">
		Discord username <span class="username-optional">(optional)</span>
	</span>
	<input
		class="username-input"
		type="text"
		bind:value={session.discordUsername.value}
		placeholder="e.g. mage_apprentice"
		maxlength="64"
		autocomplete="off"
		autocapitalize="off"
		spellcheck="false"
	/>
	<span class="username-hint">So we can credit who drew it. Remembered for next time.</span>
</label>

<style>
	.username-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		margin-bottom: 12px;
	}

	.username-label {
		font-size: 13px;
		font-weight: 600;
		color: var(--ink);
	}

	.username-optional {
		font-weight: 400;
		color: var(--muted-ink);
	}

	.username-input {
		padding: 7px 9px;
		font-size: 13px;
		color: var(--ink);
		border: 1px solid rgba(36, 27, 22, 0.25);
		border-radius: 6px;
		background: rgba(255, 255, 255, 0.6);
	}

	.username-input:focus-visible {
		outline: none;
		border-color: rgba(31, 111, 115, 0.7);
		box-shadow: 0 0 0 2px rgba(31, 111, 115, 0.2);
	}

	.username-hint {
		font-size: 12px;
		line-height: 1.4;
		color: var(--muted-ink);
	}
</style>
