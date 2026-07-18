/**
 * @file Client-side auth state: who is signed in, and the shared sign-in dialog.
 *
 * The app ships as a prerendered shell, so the account is fetched from
 * `/api/me` after mount. Until that resolves, `loading` is true and auth-gated
 * UI should render neutrally instead of flashing a sign-in prompt.
 */
import { createContext } from 'svelte';

export interface SessionUser {
	id: string;
	username: string;
}

export type AuthDialogMode = 'login' | 'register';

export class AuthState {
	user = $state<SessionUser | null>(null);
	loading = $state(true);
	dialogOpen = $state(false);
	dialogMode = $state<AuthDialogMode>('login');

	/** Action to resume once the sign-in the user was prompted for succeeds. */
	#pending: (() => void) | null = null;

	/** Hydrates the account from the session cookie. Called once after mount. */
	async refresh(): Promise<void> {
		try {
			const response = await fetch('/api/me');
			this.user = response.ok ? ((await response.json()).user ?? null) : null;
		} catch {
			this.user = null;
		} finally {
			this.loading = false;
		}
	}

	openDialog(mode: AuthDialogMode = 'login'): void {
		this.dialogMode = mode;
		this.dialogOpen = true;
	}

	closeDialog(): void {
		this.dialogOpen = false;
		this.#pending = null;
	}

	/**
	 * Runs the action right away when signed in. Otherwise opens the sign-in
	 * dialog and defers the action until it succeeds.
	 *
	 * @returns Whether the user was already signed in.
	 */
	requireUser(onReady?: () => void): boolean {
		if (this.user) {
			onReady?.();
			return true;
		}
		this.#pending = onReady ?? null;
		this.openDialog('login');
		return false;
	}

	/** Called by the auth dialog after a successful login or registration. */
	onAuthenticated(user: SessionUser): void {
		this.user = user;
		this.dialogOpen = false;
		const pending = this.#pending;
		this.#pending = null;
		pending?.();
	}

	onSignedOut(): void {
		this.user = null;
	}
}

export const [getAuthState, setAuthState] = createContext<AuthState>();
