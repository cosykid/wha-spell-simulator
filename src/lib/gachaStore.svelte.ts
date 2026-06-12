/**
 * @file Reactive Svelte 5 store for the gacha system.
 * State is persisted per Discord username via /api/gacha/:username.
 * Falls back to localStorage when no username is set (guest mode).
 */

// ---------------------------------------------------------------------------
// Spell-symbol pool (existing)
// ---------------------------------------------------------------------------

export interface GachaItem {
	id: string;
	name: string;
	rarity: 3 | 4 | 5;
	type: 'sigil' | 'sign';
	description: string;
	color: string;
}

export const GACHA_ITEMS: GachaItem[] = [
	// 5-Star
	{
		id: 'wind-underfoot',
		name: 'Wind Underfoot',
		rarity: 5,
		type: 'sigil',
		description: 'A complex, multi-stroke sigil that summons a localized updraft.',
		color: '#f39c12'
	},
	{
		id: 'wind-directs-air',
		name: 'Wind Directs Air',
		rarity: 5,
		type: 'sigil',
		description:
			'A highly complex directional air sigil that guides wind currents with surgical precision.',
		color: '#f1c40f'
	},
	{
		id: 'aeriform',
		name: 'Aeriforms',
		rarity: 5,
		type: 'sigil',
		description:
			'A rare and intricate sigil representing gas, vapor, and the shifting form of breezes.',
		color: '#e67e22'
	},
	{
		id: 'billowing',
		name: 'Billowing',
		rarity: 5,
		type: 'sign',
		description:
			'A powerful, swirling wind sign that causes elements to expand and blow in grand gusts.',
		color: '#9b59b6'
	},
	{
		id: 'cool',
		name: 'Cool',
		rarity: 5,
		type: 'sign',
		description: 'A rare frost sign. Lowers temperatures and condenses moisture into solid ice.',
		color: '#3498db'
	},
	{
		id: 'repetition',
		name: 'Repetition',
		rarity: 5,
		type: 'sign',
		description:
			'An advanced sign that duplicates the effects of surrounding symbols, doubling spell potency.',
		color: '#e74c3c'
	},
	// 4-Star
	{
		id: 'light',
		name: 'Light',
		rarity: 4,
		type: 'sigil',
		description:
			'A beautiful sigil that evokes illumination. Creates glowing orbs or blinding flashes.',
		color: '#f1c40f'
	},
	{
		id: 'convergence',
		name: 'Convergence',
		rarity: 4,
		type: 'sign',
		description:
			'A focal sign that draws all magic energies in proximity to a single concentrated point.',
		color: '#9b59b6'
	},
	{
		id: 'entwine',
		name: 'Entwine',
		rarity: 4,
		type: 'sign',
		description:
			'A binding sign that laces elements together, locking objects or spell effects in unison.',
		color: '#1abc9c'
	},
	{
		id: 'float',
		name: 'Float',
		rarity: 4,
		type: 'sign',
		description:
			'A light gravity sign that suspends items in mid-air, rendering them completely weightless.',
		color: '#3498db'
	},
	{
		id: 'levitation',
		name: 'Levitation',
		rarity: 4,
		type: 'sign',
		description:
			'A sign that lifts objects upwards. The magnitude depends on the primary sigil size.',
		color: '#2980b9'
	},
	{
		id: 'weave',
		name: 'Weave',
		rarity: 4,
		type: 'sign',
		description:
			'An intricate sign that structures magic lines into solid physical nets or barriers.',
		color: '#27ae60'
	},
	// 3-Star
	{
		id: 'earth',
		name: 'Earth',
		rarity: 3,
		type: 'sigil',
		description:
			'A fundamental sigil representing rock, clay, and soil. Extremely stable and grounding.',
		color: '#7f8c8d'
	},
	{
		id: 'fire',
		name: 'Fire',
		rarity: 3,
		type: 'sigil',
		description:
			'A common sigil that sparks heat and flame. The cornerstone of destructive and warming spells.',
		color: '#e74c3c'
	},
	{
		id: 'water',
		name: 'Water',
		rarity: 3,
		type: 'sigil',
		description:
			'A vital sigil that summons clean spring water. Useful for plant growth or extinguishing fires.',
		color: '#3498db'
	},
	{
		id: 'crystal',
		name: 'Crystal',
		rarity: 3,
		type: 'sigil',
		description:
			'A simple sigil that solidifies magic into beautiful, transparent crystal formations.',
		color: '#95a5a6'
	},
	{
		id: 'collection',
		name: 'Collection',
		rarity: 3,
		type: 'sign',
		description: 'A gathering sign that draws materials or magic particles into a storage area.',
		color: '#d35400'
	},
	{
		id: 'column',
		name: 'Column',
		rarity: 3,
		type: 'sign',
		description: 'A sign that projects magic in a straight, narrow line like a beam or a pillar.',
		color: '#95a5a6'
	},
	{
		id: 'crush',
		name: 'Crush',
		rarity: 3,
		type: 'sign',
		description: 'A pressure sign that applies compression force to the targeted region.',
		color: '#7f8c8d'
	},
	{
		id: 'dispersion',
		name: 'Dispersion',
		rarity: 3,
		type: 'sign',
		description:
			'A sign that spreads elements outwards, weakening intensity but covering a wider range.',
		color: '#27ae60'
	},
	{
		id: 'empower',
		name: 'Empower',
		rarity: 3,
		type: 'sign',
		description: 'A basic reinforcing sign that increases the magnitude and impact of the spell.',
		color: '#f39c12'
	},
	{
		id: 'focus',
		name: 'Focus',
		rarity: 3,
		type: 'sign',
		description: 'An aiming sign that aligns the spell direction and narrows its spread.',
		color: '#16a085'
	},
	{
		id: 'gather',
		name: 'Gather',
		rarity: 3,
		type: 'sign',
		description: 'A pulling sign that brings scattered objects closer to the center of the ring.',
		color: '#2980b9'
	},
	{
		id: 'orb',
		name: 'Orb',
		rarity: 3,
		type: 'sign',
		description: 'A shaping sign that molds magic output into a perfect spherical shell.',
		color: '#9b59b6'
	},
	{
		id: 'pull',
		name: 'Pull',
		rarity: 3,
		type: 'sign',
		description: 'A vector sign that attracts objects along the direction of the stamp.',
		color: '#2c3e50'
	},
	{
		id: 'region',
		name: 'Region',
		rarity: 3,
		type: 'sign',
		description: 'An area sign that applies the spell effect to the entire circular zone.',
		color: '#7f8c8d'
	}
];

// ---------------------------------------------------------------------------
// Cosmetic pool (ink colors + drawing effects)
// ---------------------------------------------------------------------------

export type CosmeticKind = 'ink-color' | 'effect';

export interface CosmeticItem {
	id: string;
	name: string;
	rarity: 3 | 4 | 5;
	kind: CosmeticKind;
	description: string;
	/** CSS color used for the swatch preview. */
	color: string;
	/** For ink-color items: the actual CSS color applied to drawn strokes. */
	inkColor?: string;
}

export const COSMETIC_ITEMS: CosmeticItem[] = [
	// 5-Star ink colors
	{
		id: 'ink-void',
		name: 'Void Black',
		rarity: 5,
		kind: 'ink-color',
		description: 'Pure obsidian ink that absorbs light. Your lines cut like shadows made solid.',
		color: '#0a0a0f',
		inkColor: '#0a0a0f'
	},
	{
		id: 'ink-starlight',
		name: 'Starlight Silver',
		rarity: 5,
		kind: 'ink-color',
		description: 'A shimmering platinum ink said to be distilled from moonbeams.',
		color: '#c8d8e8',
		inkColor: '#a8b8cc'
	},
	{
		id: 'ink-aurora',
		name: 'Aurora Teal',
		rarity: 5,
		kind: 'ink-color',
		description: 'Ink that shifts between deep teal and blue-green, like the northern lights.',
		color: '#00b4d8',
		inkColor: '#0077a8'
	},
	// 5-Star effects
	{
		id: 'effect-embers',
		name: 'Ember Trails',
		rarity: 5,
		kind: 'effect',
		description: 'Tiny embers drift from your strokes as you draw, fading into ash.',
		color: '#ff6b35'
	},
	{
		id: 'effect-starfall',
		name: 'Starfall',
		rarity: 5,
		kind: 'effect',
		description: 'Tiny stars and sparkles trail behind the pen as you inscribe each stroke.',
		color: '#f8d56b'
	},
	// 4-Star ink colors
	{
		id: 'ink-crimson',
		name: 'Crimson Seal',
		rarity: 4,
		kind: 'ink-color',
		description: 'Deep blood-red ink. Ancient witch families sealed dire contracts in this color.',
		color: '#c0392b',
		inkColor: '#9b2020'
	},
	{
		id: 'ink-forest',
		name: 'Forest Green',
		rarity: 4,
		kind: 'ink-color',
		description: 'Rich deep-green ink that smells faintly of pine and earth after drying.',
		color: '#27ae60',
		inkColor: '#1e7a44'
	},
	{
		id: 'ink-midnight',
		name: 'Midnight Indigo',
		rarity: 4,
		kind: 'ink-color',
		description: 'A saturated indigo ink, favored by night-sky cartographers and astrologers.',
		color: '#4a4a9c',
		inkColor: '#363480'
	},
	// 4-Star effects
	{
		id: 'effect-frost',
		name: 'Frost Crystals',
		rarity: 4,
		kind: 'effect',
		description: 'Tiny ice crystals form along your strokes for a moment before melting.',
		color: '#a8d8ea'
	},
	{
		id: 'effect-petals',
		name: 'Cherry Petals',
		rarity: 4,
		kind: 'effect',
		description: 'Pale pink petals scatter from your pen tip as each stroke is drawn.',
		color: '#ffb7c5'
	},
	// 3-Star ink colors
	{
		id: 'ink-sepia',
		name: 'Antique Sepia',
		rarity: 3,
		kind: 'ink-color',
		description: 'Warm brown ink that makes every glyph look like it was drawn centuries ago.',
		color: '#8b6347',
		inkColor: '#6b4226'
	},
	{
		id: 'ink-slate',
		name: 'Slate Grey',
		rarity: 3,
		kind: 'ink-color',
		description:
			'A cool grey ink. Clean and understated — the choice of disciplined practitioners.',
		color: '#7f8c8d',
		inkColor: '#5d6d7e'
	},
	{
		id: 'ink-plum',
		name: 'Plum',
		rarity: 3,
		kind: 'ink-color',
		description: 'A muted purple-brown ink reminiscent of dried berries and autumn.',
		color: '#8e44ad',
		inkColor: '#6c3483'
	},
	{
		id: 'ink-amber',
		name: 'Amber',
		rarity: 3,
		kind: 'ink-color',
		description: 'Golden amber ink that catches the candlelight beautifully on paper.',
		color: '#f39c12',
		inkColor: '#c87f0a'
	},
	// 3-Star effects
	{
		id: 'effect-bubbles',
		name: 'Ink Bubbles',
		rarity: 3,
		kind: 'effect',
		description: 'Small ink bubbles rise and pop at the tip of each completed stroke.',
		color: '#74b9ff'
	},
	{
		id: 'effect-runes',
		name: 'Rune Flicker',
		rarity: 3,
		kind: 'effect',
		description: 'Faint rune-like glyphs flicker and fade alongside your strokes.',
		color: '#a29bfe'
	},
	{
		id: 'effect-dust',
		name: 'Chalk Dust',
		rarity: 3,
		kind: 'effect',
		description: 'Fine chalk dust settles around each stroke as if drawn on a blackboard.',
		color: '#dfe6e9'
	}
];

// ---------------------------------------------------------------------------
// Server-backed store
// ---------------------------------------------------------------------------

export interface GachaProfileData {
	currency: number;
	inventory: Record<string, number>;
	cosmeticInventory: Record<string, number>;
	freePullDate: string | null;
	cosmeticFreePullDate: string | null;
	activeInkColorId: string | null;
	activeEffectId: string | null;
}

function todayString(): string {
	return new Date().toISOString().slice(0, 10);
}

class GachaStore {
	// Profile data — shared between both portals
	#currency = $state(0);
	#inventory = $state<Record<string, number>>({});
	#cosmeticInventory = $state<Record<string, number>>({});
	#freePullDate = $state<string | null>(null);
	#cosmeticFreePullDate = $state<string | null>(null);

	#username = $state<string | null>(null);
	#initialized = $state(false);
	#syncing = $state(false);
	#activeInkColorId = $state<string | null>(null);
	#activeEffectId = $state<string | null>(null);

	// ---- Accessors ----

	get currency() {
		return this.#currency;
	}
	get inventory() {
		return this.#inventory;
	}
	get cosmeticInventory() {
		return this.#cosmeticInventory;
	}
	get username() {
		return this.#username;
	}
	get initialized() {
		return this.#initialized;
	}
	get syncing() {
		return this.#syncing;
	}
	get freePullUsedToday() {
		return this.#freePullDate === todayString();
	}
	get cosmeticFreePullUsedToday() {
		return this.#cosmeticFreePullDate === todayString();
	}
	get activeInkColorId() {
		return this.#activeInkColorId;
	}
	get activeEffectId() {
		return this.#activeEffectId;
	}

	/** Returns the active ink CSS color, or null if the default should be used. */
	get activeInkColor(): string | null {
		if (!this.#activeInkColorId) return null;
		const item = COSMETIC_ITEMS.find(
			(c) => c.id === this.#activeInkColorId && c.kind === 'ink-color'
		);
		return item?.inkColor ?? null;
	}

	/** Returns the active drawing effect item, or null if none is selected. */
	get activeEffect(): CosmeticItem | null {
		if (!this.#activeEffectId) return null;
		return COSMETIC_ITEMS.find((c) => c.id === this.#activeEffectId && c.kind === 'effect') ?? null;
	}

	// ---- Username / login ----

	/** Set (or clear) the active Discord username and load their profile. */
	async setUsername(username: string | null): Promise<void> {
		const normalized = username?.trim().toLowerCase() ?? null;
		if (normalized === this.#username) return;
		this.#username = normalized;
		if (normalized) {
			try {
				localStorage.setItem('gacha:username', normalized);
			} catch {
				/* best-effort */
			}
			await this.#loadFromServer(normalized);
		} else {
			try {
				localStorage.removeItem('gacha:username');
			} catch {
				/* best-effort */
			}
			this.#loadFromLocalStorage();
		}
	}

	// ---- Initialisation ----

	/** Called from onMount — restores username from localStorage then loads profile. */
	async load(): Promise<void> {
		if (typeof window === 'undefined') return;
		let savedUsername: string | null = null;
		try {
			savedUsername = localStorage.getItem('gacha:username');
		} catch {
			/* best-effort */
		}

		if (savedUsername) {
			this.#username = savedUsername;
			await this.#loadFromServer(savedUsername);
		} else {
			this.#loadFromLocalStorage();
		}
	}

	#loadFromLocalStorage(): void {
		try {
			const savedCurrency = localStorage.getItem('gacha:currency');
			this.#currency = savedCurrency !== null ? parseInt(savedCurrency, 10) : 200;
			const savedInventory = localStorage.getItem('gacha:inventory');
			this.#inventory =
				savedInventory !== null ? JSON.parse(savedInventory) : { earth: 1, fire: 1, water: 1 };
			const savedCosmetic = localStorage.getItem('gacha:cosmetic-inventory');
			this.#cosmeticInventory = savedCosmetic !== null ? JSON.parse(savedCosmetic) : {};
			this.#freePullDate = localStorage.getItem('gacha:free-pull-date');
			this.#cosmeticFreePullDate = localStorage.getItem('gacha:cosmetic-free-pull-date');
			this.#activeInkColorId = localStorage.getItem('gacha:active-ink-color');
			this.#activeEffectId = localStorage.getItem('gacha:active-effect');
		} catch (e) {
			console.error('Failed to load gacha state from localStorage:', e);
		}
		this.#initialized = true;
	}

	async #loadFromServer(username: string): Promise<void> {
		this.#syncing = true;
		try {
			const res = await fetch(`/api/gacha/${encodeURIComponent(username)}`);
			if (!res.ok) throw new Error(`HTTP ${res.status}`);
			const { profile } = (await res.json()) as { profile: GachaProfileData };
			this.#applyProfile(profile);
		} catch (e) {
			console.error('Failed to load gacha profile from server:', e);
			// Fall back to localStorage so the UI isn't broken
			this.#loadFromLocalStorage();
		} finally {
			this.#syncing = false;
			this.#initialized = true;
		}
	}

	#applyProfile(profile: GachaProfileData): void {
		this.#currency = profile.currency;
		this.#inventory = profile.inventory ?? {};
		this.#cosmeticInventory = profile.cosmeticInventory ?? {};
		this.#freePullDate = profile.freePullDate;
		this.#cosmeticFreePullDate = profile.cosmeticFreePullDate;
		this.#activeInkColorId = profile.activeInkColorId ?? null;
		this.#activeEffectId = profile.activeEffectId ?? null;
	}

	// ---- Persistence ----

	async #saveToServer(patch: Partial<GachaProfileData>): Promise<void> {
		if (!this.#username) return;
		try {
			await fetch(`/api/gacha/${encodeURIComponent(this.#username)}`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(patch)
			});
		} catch (e) {
			console.error('Failed to save gacha profile to server:', e);
		}
	}

	#saveToLocalStorage(): void {
		if (typeof window === 'undefined') return;
		try {
			localStorage.setItem('gacha:currency', this.#currency.toString());
			localStorage.setItem('gacha:inventory', JSON.stringify(this.#inventory));
			localStorage.setItem('gacha:cosmetic-inventory', JSON.stringify(this.#cosmeticInventory));
			if (this.#freePullDate) localStorage.setItem('gacha:free-pull-date', this.#freePullDate);
			if (this.#cosmeticFreePullDate)
				localStorage.setItem('gacha:cosmetic-free-pull-date', this.#cosmeticFreePullDate);
			if (this.#activeInkColorId)
				localStorage.setItem('gacha:active-ink-color', this.#activeInkColorId);
			else localStorage.removeItem('gacha:active-ink-color');
			if (this.#activeEffectId) localStorage.setItem('gacha:active-effect', this.#activeEffectId);
			else localStorage.removeItem('gacha:active-effect');
		} catch (e) {
			console.error('Failed to save gacha state to localStorage:', e);
		}
	}

	#save(patch: Partial<GachaProfileData>): void {
		if (this.#username) {
			void this.#saveToServer(patch);
		} else {
			this.#saveToLocalStorage();
		}
	}

	// ---- Currency ----

	addCurrency(amount: number): void {
		this.#currency += amount;
		this.#save({ currency: this.#currency });
	}

	spendCurrency(amount: number): boolean {
		if (this.#currency < amount) return false;
		this.#currency -= amount;
		this.#save({ currency: this.#currency });
		return true;
	}

	// ---- Inventory helpers ----

	getOwnedCount(symbolId: string): number {
		const id = symbolId === 'aeriforms' ? 'aeriform' : symbolId.toLowerCase();
		return this.#inventory[id] ?? 0;
	}

	addToInventory(id: string): void {
		this.#inventory[id] = (this.#inventory[id] ?? 0) + 1;
		this.#save({ inventory: this.#inventory });
	}

	getCosmeticOwnedCount(cosmeticId: string): number {
		return this.#cosmeticInventory[cosmeticId] ?? 0;
	}

	addToCosmeticInventory(id: string): void {
		this.#cosmeticInventory[id] = (this.#cosmeticInventory[id] ?? 0) + 1;
		this.#save({ cosmeticInventory: this.#cosmeticInventory });
	}

	// ---- Pull logic (spell symbols) ----

	pull(times: 1 | 10): GachaItem[] {
		const cost = times === 10 ? 900 : 100;
		if (this.#currency < cost) throw new Error('Insufficient Star Ink');
		this.#currency -= cost;

		const results: GachaItem[] = [];
		for (let i = 0; i < times; i++) {
			const roll = Math.random() * 100;
			let rarity: 3 | 4 | 5 = roll < 5 ? 5 : roll < 20 ? 4 : 3;
			if (times === 10 && i === 9 && !results.some((item) => item.rarity >= 4)) {
				rarity = Math.random() < 0.25 ? 5 : 4;
			}
			const pool = GACHA_ITEMS.filter((item) => item.rarity === rarity);
			const item = pool[Math.floor(Math.random() * pool.length)];
			results.push(item);
			this.#inventory[item.id] = (this.#inventory[item.id] ?? 0) + 1;
		}
		this.#save({ currency: this.#currency, inventory: this.#inventory });
		return results;
	}

	markFreePullUsed(): void {
		this.#freePullDate = todayString();
		this.#save({ freePullDate: this.#freePullDate });
	}

	// ---- Pull logic (cosmetics) ----

	pullCosmetic(times: 1 | 10): CosmeticItem[] {
		const cost = times === 10 ? 900 : 100;
		if (this.#currency < cost) throw new Error('Insufficient Star Ink');
		this.#currency -= cost;

		const results: CosmeticItem[] = [];
		for (let i = 0; i < times; i++) {
			const roll = Math.random() * 100;
			let rarity: 3 | 4 | 5 = roll < 5 ? 5 : roll < 20 ? 4 : 3;
			if (times === 10 && i === 9 && !results.some((item) => item.rarity >= 4)) {
				rarity = Math.random() < 0.25 ? 5 : 4;
			}
			const pool = COSMETIC_ITEMS.filter((item) => item.rarity === rarity);
			const item = pool[Math.floor(Math.random() * pool.length)];
			results.push(item);
			this.#cosmeticInventory[item.id] = (this.#cosmeticInventory[item.id] ?? 0) + 1;
		}
		this.#save({ currency: this.#currency, cosmeticInventory: this.#cosmeticInventory });
		return results;
	}

	markCosmeticFreePullUsed(): void {
		this.#cosmeticFreePullDate = todayString();
		this.#save({ cosmeticFreePullDate: this.#cosmeticFreePullDate });
	}

	// ---- Active cosmetic selections ----

	setActiveInkColor(id: string | null): void {
		if (id !== null && this.getCosmeticOwnedCount(id) === 0) return;
		this.#activeInkColorId = id;
		this.#save({ activeInkColorId: id });
	}

	setActiveEffect(id: string | null): void {
		if (id !== null && this.getCosmeticOwnedCount(id) === 0) return;
		this.#activeEffectId = id;
		this.#save({ activeEffectId: id });
	}
}

export const gachaStore = new GachaStore();
