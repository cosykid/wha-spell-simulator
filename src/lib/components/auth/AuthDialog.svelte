<!--
@component
The shared sign-in and registration modal, opened through {@link AuthState}. A
native dialog mirrored from `auth.dialogOpen`, in the same pattern as the sample
maker's username modal. Accounts are username and password only.
-->
<script lang="ts">
	import { login, register, type AuthResult } from '$lib/auth/auth.remote.js';
	import { getAuthState } from '$lib/ui/auth/auth-state.svelte.js';

	const auth = getAuthState();

	let dialog = $state<HTMLDialogElement>();
	let username = $state('');
	let password = $state('');
	let error = $state<string | null>(null);
	let busy = $state(false);

	const isRegister = $derived(auth.dialogMode === 'register');
	const title = $derived(isRegister ? 'Join the atelier' : 'Welcome back');
	const submitLabel = $derived(isRegister ? 'Create account' : 'Sign in');

	$effect(() => {
		if (!dialog) return;
		if (auth.dialogOpen && !dialog.open) {
			username = '';
			password = '';
			error = null;
			dialog.showModal();
		} else if (!auth.dialogOpen && dialog.open) {
			dialog.close();
		}
	});

	function switchMode() {
		error = null;
		auth.dialogMode = isRegister ? 'login' : 'register';
	}

	function validate(): string | null {
		if (!/^[A-Za-z0-9_-]{3,24}$/.test(username)) {
			return 'Names are 3-24 characters: letters, digits, - or _.';
		}
		if (password.length < 8 || password.length > 128) {
			return 'Passwords need at least 8 characters.';
		}
		return null;
	}

	function failureMessage(reason: Extract<AuthResult, { ok: false }>['reason']): string {
		if (reason === 'username-taken') return 'That name is already taken.';
		if (reason === 'invalid-credentials') return 'Wrong name or password.';
		return 'Something went wrong. Try again in a moment.';
	}

	async function submit(event: SubmitEvent) {
		event.preventDefault();
		error = validate();
		if (error || busy) return;
		busy = true;
		try {
			const credentials = { username, password };
			const result = isRegister ? await register(credentials) : await login(credentials);
			if (result.ok) {
				auth.onAuthenticated(result.user);
			} else {
				error = failureMessage(result.reason);
			}
		} catch {
			error = 'Something went wrong. Try again in a moment.';
		} finally {
			busy = false;
		}
	}
</script>

<dialog
	bind:this={dialog}
	class="auth-dialog"
	data-testid="auth-dialog"
	onclose={() => auth.closeDialog()}
>
	<form onsubmit={submit}>
		<h2>{title}</h2>
		<p class="auth-note">
			{isRegister
				? 'A name and a password are all you need to keep your spells.'
				: 'Sign in to save spells and share them in the library.'}
		</p>
		<label>
			<span>Witch name</span>
			<input
				class="text-control"
				data-testid="auth-username"
				bind:value={username}
				autocomplete="username"
				maxlength={24}
				required
			/>
		</label>
		<label>
			<span>Password</span>
			<input
				class="text-control"
				data-testid="auth-password"
				type="password"
				bind:value={password}
				autocomplete={isRegister ? 'new-password' : 'current-password'}
				maxlength={128}
				required
			/>
		</label>
		{#if error}
			<p class="auth-error" data-testid="auth-error">{error}</p>
		{/if}
		<div class="auth-actions">
			<button type="submit" class="auth-submit" data-testid="auth-submit" disabled={busy}>
				{busy ? 'One moment…' : submitLabel}
			</button>
			<button type="button" class="auth-switch" data-testid="auth-switch-mode" onclick={switchMode}>
				{isRegister ? 'I already have an account' : 'I need an account'}
			</button>
		</div>
	</form>
</dialog>

<style>
	.auth-dialog {
		width: min(400px, 92vw);
		padding: 24px;
		border: 1px solid var(--panel-line);
		border-radius: 12px;
		color: var(--ink);
		background: var(--panel, #f2ecd6);
		box-shadow: 0 24px 60px rgba(36, 27, 22, 0.45);
	}

	.auth-dialog::backdrop {
		background: rgba(36, 27, 22, 0.5);
	}

	form {
		display: grid;
		gap: 14px;
	}

	h2 {
		margin: 0;
		font-family: 'Cinzel', serif;
		font-size: 1.3rem;
		letter-spacing: 0.04em;
	}

	.auth-note {
		margin: 0;
		font-size: 0.92rem;
		color: var(--muted-ink);
	}

	label {
		display: grid;
		gap: 6px;
		font-size: 0.9rem;
	}

	.auth-error {
		margin: 0;
		font-size: 0.9rem;
		color: var(--ember);
	}

	.auth-actions {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
	}

	.auth-submit {
		min-height: 40px;
		padding: 0 20px;
	}

	.auth-switch {
		padding: 6px 8px;
		border: none;
		background: none;
		font-size: 0.85rem;
		color: var(--teal);
		text-decoration: underline;
		cursor: pointer;
	}
</style>
