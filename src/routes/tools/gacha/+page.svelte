<script lang="ts">
	import { base } from '$app/paths';
	import {
		gachaStore,
		GACHA_ITEMS,
		COSMETIC_ITEMS,
		type GachaItem,
		type CosmeticItem
	} from '$lib/gachaStore.svelte.js';
	import { getSymbolSvg } from '$lib/dictionary/svgStrokes.js';
	import { onMount } from 'svelte';

	// Tabs: 'portal' | 'cosmetics' | 'collection'
	let activeTab = $state<'portal' | 'cosmetics' | 'collection'>('portal');

	// --- Spell-symbol portal state ---
	let isPulling = $state(false);
	let pullType = $state<1 | 10>(1);
	let pullResults = $state<GachaItem[]>([]);
	let revealedResults = $state<boolean[]>([]);
	let showResultsModal = $state(false);
	let selectedItem = $state<GachaItem | null>(null);

	// --- Cosmetic portal state ---
	let isCosmeticPulling = $state(false);
	let cosmeticPullType = $state<1 | 10>(1);
	let cosmeticPullResults = $state<CosmeticItem[]>([]);
	let cosmeticRevealedResults = $state<boolean[]>([]);
	let showCosmeticResultsModal = $state(false);
	let selectedCosmeticItem = $state<CosmeticItem | null>(null);

	onMount(() => {
		void gachaStore.load();
	});

	// --- Derived inventory stats ---
	const unlockedCount = $derived(
		GACHA_ITEMS.filter((item) => (gachaStore.inventory[item.id] ?? 0) > 0).length
	);
	const completionRate = $derived(Math.round((unlockedCount / GACHA_ITEMS.length) * 100));

	const cosmeticUnlockedCount = $derived(
		COSMETIC_ITEMS.filter((item) => (gachaStore.cosmeticInventory[item.id] ?? 0) > 0).length
	);
	const cosmeticCompletionRate = $derived(
		Math.round((cosmeticUnlockedCount / COSMETIC_ITEMS.length) * 100)
	);

	// Owned cosmetics, split by kind, for the equip panel.
	const ownedInkColors = $derived(
		COSMETIC_ITEMS.filter(
			(c) => c.kind === 'ink-color' && (gachaStore.cosmeticInventory[c.id] ?? 0) > 0
		)
	);
	const ownedEffects = $derived(
		COSMETIC_ITEMS.filter(
			(c) => c.kind === 'effect' && (gachaStore.cosmeticInventory[c.id] ?? 0) > 0
		)
	);

	// --- Safe SVG helper: returns empty string instead of throwing ---
	function tryGetSymbolSvg(id: string): string {
		try {
			return getSymbolSvg(id);
		} catch {
			return '';
		}
	}

	// --- Spell-symbol pull actions ---
	function executePull(times: 1 | 10) {
		const cost = times === 10 ? 900 : 100;
		if (gachaStore.currency < cost) return;

		pullType = times;
		isPulling = true;
		pullResults = [];
		revealedResults = [];

		setTimeout(() => {
			try {
				const items = gachaStore.pull(times);
				pullResults = items;
				revealedResults = new Array(times).fill(false);
				isPulling = false;
				showResultsModal = true;
				items.forEach((_, index) => {
					setTimeout(
						() => {
							revealedResults[index] = true;
							revealedResults = [...revealedResults];
						},
						index * 200 + 400
					);
				});
			} catch (err) {
				console.error(err);
				isPulling = false;
			}
		}, 2200);
	}

	function executeFreePull() {
		if (gachaStore.freePullUsedToday || isPulling) return;
		// Mark via the store so it persists to the server / localStorage.
		gachaStore.markFreePullUsed();
		pullType = 1;
		isPulling = true;
		pullResults = [];
		revealedResults = [];
		setTimeout(() => {
			try {
				const roll = Math.random() * 100;
				const rarity: 3 | 4 | 5 = roll < 5 ? 5 : roll < 20 ? 4 : 3;
				const pool = GACHA_ITEMS.filter((i) => i.rarity === rarity);
				const item = pool[Math.floor(Math.random() * pool.length)];
				gachaStore.addToInventory(item.id);
				pullResults = [item];
				revealedResults = [false];
				isPulling = false;
				showResultsModal = true;
				setTimeout(() => {
					revealedResults = [true];
				}, 400);
			} catch (err) {
				console.error(err);
				isPulling = false;
			}
		}, 2200);
	}

	function closeResults() {
		showResultsModal = false;
		pullResults = [];
	}

	function selectItemDetail(item: GachaItem) {
		if ((gachaStore.inventory[item.id] ?? 0) > 0) {
			selectedItem = item;
		}
	}

	function closeDetail() {
		selectedItem = null;
	}

	// --- Cosmetic pull actions ---
	function executeCosmeticPull(times: 1 | 10) {
		const cost = times === 10 ? 900 : 100;
		if (gachaStore.currency < cost) return;

		cosmeticPullType = times;
		isCosmeticPulling = true;
		cosmeticPullResults = [];
		cosmeticRevealedResults = [];

		setTimeout(() => {
			try {
				const items = gachaStore.pullCosmetic(times);
				cosmeticPullResults = items;
				cosmeticRevealedResults = new Array(times).fill(false);
				isCosmeticPulling = false;
				showCosmeticResultsModal = true;
				items.forEach((_, index) => {
					setTimeout(
						() => {
							cosmeticRevealedResults[index] = true;
							cosmeticRevealedResults = [...cosmeticRevealedResults];
						},
						index * 200 + 400
					);
				});
			} catch (err) {
				console.error(err);
				isCosmeticPulling = false;
			}
		}, 2200);
	}

	function executeCosmeticFreePull() {
		if (gachaStore.cosmeticFreePullUsedToday || isCosmeticPulling) return;
		gachaStore.markCosmeticFreePullUsed();
		cosmeticPullType = 1;
		isCosmeticPulling = true;
		cosmeticPullResults = [];
		cosmeticRevealedResults = [];
		setTimeout(() => {
			try {
				const roll = Math.random() * 100;
				const rarity: 3 | 4 | 5 = roll < 5 ? 5 : roll < 20 ? 4 : 3;
				const pool = COSMETIC_ITEMS.filter((i) => i.rarity === rarity);
				const item = pool[Math.floor(Math.random() * pool.length)];
				gachaStore.addToCosmeticInventory(item.id);
				cosmeticPullResults = [item];
				cosmeticRevealedResults = [false];
				isCosmeticPulling = false;
				showCosmeticResultsModal = true;
				setTimeout(() => {
					cosmeticRevealedResults = [true];
				}, 400);
			} catch (err) {
				console.error(err);
				isCosmeticPulling = false;
			}
		}, 2200);
	}

	function closeCosmeticResults() {
		showCosmeticResultsModal = false;
		cosmeticPullResults = [];
	}

	function selectCosmeticDetail(item: CosmeticItem) {
		if ((gachaStore.cosmeticInventory[item.id] ?? 0) > 0) {
			selectedCosmeticItem = item;
		}
	}

	function closeCosmeticDetail() {
		selectedCosmeticItem = null;
	}

	function toggleActiveInkColor(id: string) {
		gachaStore.setActiveInkColor(gachaStore.activeInkColorId === id ? null : id);
	}

	function toggleActiveEffect(id: string) {
		gachaStore.setActiveEffect(gachaStore.activeEffectId === id ? null : id);
	}

	// Developer testing: Add 1000 Ink
	function addDemoInk() {
		gachaStore.addCurrency(1000);
	}
</script>

<svelte:head>
	<title>Star Portal Gacha - Witch Hat Atelier Spell Simulator</title>
</svelte:head>

<main class="gacha-workspace">
	<!-- Tab Navigation & Header Info -->
	<header class="gacha-header-bar">
		<div class="gacha-tabs">
			<button
				type="button"
				class="gacha-tab-btn"
				class:active={activeTab === 'portal'}
				onclick={() => (activeTab = 'portal')}
			>
				✨ Star Portal
			</button>
			<button
				type="button"
				class="gacha-tab-btn"
				class:active={activeTab === 'cosmetics'}
				onclick={() => (activeTab = 'cosmetics')}
			>
				🎨 Ink & Effects
			</button>
			<button
				type="button"
				class="gacha-tab-btn"
				class:active={activeTab === 'collection'}
				onclick={() => (activeTab = 'collection')}
			>
				🎒 Collection ({completionRate}%)
			</button>
		</div>

		<div class="currency-panel-gacha">
			<div class="ink-balance" title="Draw currency earned from the Sample Maker">
				<span class="ink-icon">🖋️</span>
				<span class="ink-label">Star Ink:</span>
				<span class="ink-value">{gachaStore.currency}</span>
			</div>
			<a href="{base}/tools/sample-maker" class="earn-btn-gacha"> ✏️ Earn Ink </a>
			<!-- Secret Tester Button -->
			<button
				type="button"
				class="tester-btn"
				onclick={addDemoInk}
				title="Add 1000 Ink for testing"
			>
				+1K
			</button>
		</div>
	</header>

	{#if activeTab === 'portal'}
		<!-- Spell Symbol Portal Tab -->
		<section class="portal-section">
			<div class="portal-container" class:active={isPulling}>
				<div class="magic-circle circle-outer"></div>
				<div class="magic-circle circle-middle"></div>
				<div class="magic-circle circle-inner"></div>
				<div class="portal-core">
					{#if isPulling}
						<div class="summon-light"></div>
					{:else}
						<svg class="portal-sigil-svg" viewBox="0 0 100 100">
							<path
								d="M50 5 L63 38 L95 50 L63 62 L50 95 L37 62 L5 50 L37 38 Z"
								fill="none"
								stroke="currentColor"
								stroke-width="2"
							/>
							<circle cx="50" cy="50" r="15" fill="none" stroke="currentColor" stroke-width="1.5" />
							<circle cx="50" cy="50" r="2" fill="currentColor" />
						</svg>
					{/if}
				</div>
			</div>

			<div class="portal-cta">
				<h2>Summoning Circle</h2>
				<p>Spend Star Ink to summon spell sigils and signs to use in your diagrams.</p>
				<p class="guarantee-text">✨ 10-Summon guarantees at least one 4★ or 5★ symbol! ✨</p>
			</div>

			<div class="portal-actions">
				<button
					type="button"
					class="summon-btn free"
					disabled={gachaStore.freePullUsedToday || isPulling}
					onclick={executeFreePull}
				>
					<span class="btn-title">✨ Free Daily Summon</span>
					<span class="btn-cost"
						>{gachaStore.freePullUsedToday ? 'Come back tomorrow' : 'Free!'}</span
					>
				</button>
				<button
					type="button"
					class="summon-btn single"
					disabled={gachaStore.currency < 100 || isPulling}
					onclick={() => executePull(1)}
				>
					<span class="btn-title">Summon 1 Seal</span>
					<span class="btn-cost">100 Ink</span>
				</button>
				<button
					type="button"
					class="summon-btn multi"
					disabled={gachaStore.currency < 900 || isPulling}
					onclick={() => executePull(10)}
				>
					<span class="btn-title">Summon 10 Seals</span>
					<span class="btn-cost">900 Ink <span class="discount-badge">Save 10%</span></span>
				</button>
			</div>

			{#if gachaStore.currency < 100 && !isPulling}
				<div class="out-of-ink-warning">
					<p>
						⚠️ You don't have enough Star Ink! Go to the <a href="{base}/tools/sample-maker"
							>Sample Maker</a
						> and submit drawings to earn more.
					</p>
				</div>
			{/if}
		</section>
	{:else if activeTab === 'cosmetics'}
		<!-- Cosmetic Portal Tab -->
		<section class="portal-section">
			<div class="portal-container" class:active={isCosmeticPulling}>
				<div class="magic-circle circle-outer cosmetic-outer"></div>
				<div class="magic-circle circle-middle cosmetic-middle"></div>
				<div class="magic-circle circle-inner cosmetic-inner"></div>
				<div class="portal-core cosmetic-core">
					{#if isCosmeticPulling}
						<div class="summon-light cosmetic-light"></div>
					{:else}
						<svg class="portal-sigil-svg" viewBox="0 0 100 100">
							<circle cx="50" cy="50" r="30" fill="none" stroke="currentColor" stroke-width="1.5" />
							<circle cx="50" cy="50" r="18" fill="none" stroke="currentColor" stroke-width="1.2" />
							<circle cx="50" cy="20" r="4" fill="currentColor" />
							<circle cx="50" cy="80" r="4" fill="currentColor" />
							<circle cx="20" cy="50" r="4" fill="currentColor" />
							<circle cx="80" cy="50" r="4" fill="currentColor" />
						</svg>
					{/if}
				</div>
			</div>

			<div class="portal-cta">
				<h2>Ink &amp; Effects Atelier</h2>
				<p>Collect custom ink colors and drawing effects to personalize how you draw spells.</p>
				<p class="guarantee-text">🎨 10-Summon guarantees at least one 4★ or 5★ cosmetic! 🎨</p>
			</div>

			<div class="portal-actions">
				<button
					type="button"
					class="summon-btn free"
					disabled={gachaStore.cosmeticFreePullUsedToday || isCosmeticPulling}
					onclick={executeCosmeticFreePull}
				>
					<span class="btn-title">🎨 Free Daily Draw</span>
					<span class="btn-cost"
						>{gachaStore.cosmeticFreePullUsedToday ? 'Come back tomorrow' : 'Free!'}</span
					>
				</button>
				<button
					type="button"
					class="summon-btn single"
					disabled={gachaStore.currency < 100 || isCosmeticPulling}
					onclick={() => executeCosmeticPull(1)}
				>
					<span class="btn-title">Draw 1 Cosmetic</span>
					<span class="btn-cost">100 Ink</span>
				</button>
				<button
					type="button"
					class="summon-btn multi"
					disabled={gachaStore.currency < 900 || isCosmeticPulling}
					onclick={() => executeCosmeticPull(10)}
				>
					<span class="btn-title">Draw 10 Cosmetics</span>
					<span class="btn-cost">900 Ink <span class="discount-badge">Save 10%</span></span>
				</button>
			</div>

			{#if gachaStore.currency < 100 && !isCosmeticPulling}
				<div class="out-of-ink-warning">
					<p>
						⚠️ You don't have enough Star Ink! Go to the <a href="{base}/tools/sample-maker"
							>Sample Maker</a
						> and submit drawings to earn more.
					</p>
				</div>
			{/if}

			<!-- Owned cosmetics: equip panel -->
			{#if ownedInkColors.length > 0 || ownedEffects.length > 0}
				<div class="cosmetic-equip-panel">
					{#if ownedInkColors.length > 0}
						<div class="cosmetic-equip-group">
							<h3 class="cosmetic-equip-title">Ink Color</h3>
							<div class="cosmetic-swatch-row">
								<button
									type="button"
									class="cosmetic-swatch default-swatch"
									class:swatch-active={gachaStore.activeInkColorId === null}
									onclick={() => gachaStore.setActiveInkColor(null)}
									title="Default ink"
								>
									<span class="swatch-label">Default</span>
								</button>
								{#each ownedInkColors as item (item.id)}
									<button
										type="button"
										class="cosmetic-swatch"
										class:swatch-active={gachaStore.activeInkColorId === item.id}
										style="--swatch-color: {item.color}"
										onclick={() => toggleActiveInkColor(item.id)}
										title={item.name}
									>
										<span class="swatch-dot" style="background: {item.color}"></span>
										<span class="swatch-label">{item.name}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}

					{#if ownedEffects.length > 0}
						<div class="cosmetic-equip-group">
							<h3 class="cosmetic-equip-title">Drawing Effect</h3>
							<div class="cosmetic-swatch-row">
								<button
									type="button"
									class="cosmetic-swatch default-swatch"
									class:swatch-active={gachaStore.activeEffectId === null}
									onclick={() => gachaStore.setActiveEffect(null)}
									title="No effect"
								>
									<span class="swatch-label">None</span>
								</button>
								{#each ownedEffects as item (item.id)}
									<button
										type="button"
										class="cosmetic-swatch"
										class:swatch-active={gachaStore.activeEffectId === item.id}
										onclick={() => toggleActiveEffect(item.id)}
										title={item.name}
									>
										<span class="swatch-dot" style="background: {item.color}"></span>
										<span class="swatch-label">{item.name}</span>
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Full cosmetic collection -->
			<div class="collection-grid cosmetic-grid">
				{#each COSMETIC_ITEMS as item (item.id)}
					{@const owned = (gachaStore.cosmeticInventory[item.id] ?? 0) > 0}
					{@const count = gachaStore.cosmeticInventory[item.id] ?? 0}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<article
						class="collection-card rarity-{item.rarity}"
						class:locked={!owned}
						onclick={() => owned && selectCosmeticDetail(item)}
					>
						{#if owned}
							<div class="card-count">x{count}</div>
						{/if}
						<div class="card-icon-wrapper" style="--accent-color: {item.color}">
							{#if owned}
								<span class="cosmetic-swatch-preview" style="background: {item.color}"></span>
							{:else}
								<span class="locked-question">?</span>
							{/if}
						</div>
						<div class="card-info">
							<span class="item-type"
								>{owned ? item.kind.replace('-', ' ').toUpperCase() : 'UNKNOWN'}</span
							>
							<h4 class="item-name">{owned ? item.name : '???'}</h4>
							<div class="rarity-stars">
								{#each Array(item.rarity) as _}
									<span class="star">★</span>
								{/each}
							</div>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{:else}
		<!-- Collection Tab -->
		<section class="collection-section">
			<div class="collection-summary-stats">
				<div class="stat-card">
					<h3>Unlocked Symbols</h3>
					<p class="stat-number">{unlockedCount} / {GACHA_ITEMS.length}</p>
				</div>
				<div class="stat-card">
					<h3>Legendaries (5★)</h3>
					<p class="stat-number">
						{GACHA_ITEMS.filter((i) => i.rarity === 5 && (gachaStore.inventory[i.id] ?? 0) > 0)
							.length} / {GACHA_ITEMS.filter((i) => i.rarity === 5).length}
					</p>
				</div>
				<div class="stat-card">
					<h3>Completeness</h3>
					<div class="progress-bar-container">
						<div class="progress-bar" style="width: {completionRate}%"></div>
					</div>
					<p class="progress-text">{completionRate}% collected</p>
				</div>
			</div>

			<div class="collection-grid">
				{#each GACHA_ITEMS as item (item.id)}
					{@const owned = (gachaStore.inventory[item.id] ?? 0) > 0}
					{@const count = gachaStore.inventory[item.id] ?? 0}
					{@const svgId = item.id === 'aeriform' ? 'aeriforms' : item.id}
					{@const svg = owned ? tryGetSymbolSvg(svgId) : ''}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<article
						class="collection-card rarity-{item.rarity}"
						class:locked={!owned}
						onclick={() => selectItemDetail(item)}
					>
						{#if owned}
							<div class="card-count">x{count}</div>
						{/if}

						<div class="card-icon-wrapper" style="--accent-color: {item.color}">
							{#if owned && svg}
								<!-- eslint-disable-next-line svelte/no-at-html-tags -->
								<span class="symbol-svg-wrapper">{@html svg}</span>
							{:else if owned}
								<span class="item-type" style="font-size:11px">{item.type}</span>
							{:else}
								<span class="locked-question">?</span>
							{/if}
						</div>

						<div class="card-info">
							<span class="item-type">{owned ? item.type.toUpperCase() : 'UNKNOWN'}</span>
							<h4 class="item-name">{owned ? item.name : '???'}</h4>
							<div class="rarity-stars">
								{#each Array(item.rarity) as _}
									<span class="star">★</span>
								{/each}
							</div>
						</div>
					</article>
				{/each}
			</div>
		</section>
	{/if}
</main>

<!-- SPELL-SYMBOL RESULTS MODAL -->
{#if showResultsModal}
	<div class="modal-overlay reveal-screen">
		<div class="reveal-content-container">
			<h2>Portal Summon Results</h2>

			<div class="cards-grid" class:single-card={pullType === 1}>
				{#each pullResults as item, index (index)}
					{@const revealed = revealedResults[index]}
					{@const svgId = item.id === 'aeriform' ? 'aeriforms' : item.id}
					{@const svg = tryGetSymbolSvg(svgId)}
					<div class="card-flipper-container" class:flipped={revealed}>
						<div class="card-inner">
							<div class="card-back">
								<div class="card-back-pattern">
									<div class="back-logo">✨</div>
								</div>
							</div>
							<div class="card-front rarity-{item.rarity}" style="--item-color: {item.color}">
								<div class="card-glow-layer"></div>
								<div class="rarity-badge">
									{#each Array(item.rarity) as _}★{/each}
								</div>
								<div class="card-avatar" style="color: {item.color}">
									{#if svg}
										<!-- eslint-disable-next-line svelte/no-at-html-tags -->
										<span class="symbol-svg-wrapper">{@html svg}</span>
									{:else}
										<span style="font-size:11px;opacity:0.6">{item.type}</span>
									{/if}
								</div>
								<div class="card-details">
									<span class="card-type-label">{item.type}</span>
									<h3>{item.name}</h3>
									<p>{item.description}</p>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<button type="button" class="close-results-btn" onclick={closeResults}>
				Back to Portal
			</button>
		</div>
	</div>
{/if}

<!-- COSMETIC RESULTS MODAL -->
{#if showCosmeticResultsModal}
	<div class="modal-overlay reveal-screen">
		<div class="reveal-content-container">
			<h2>Ink &amp; Effects Draw Results</h2>

			<div class="cards-grid" class:single-card={cosmeticPullType === 1}>
				{#each cosmeticPullResults as item, index (index)}
					{@const revealed = cosmeticRevealedResults[index]}
					<div class="card-flipper-container" class:flipped={revealed}>
						<div class="card-inner">
							<div class="card-back">
								<div class="card-back-pattern">
									<div class="back-logo">🎨</div>
								</div>
							</div>
							<div class="card-front rarity-{item.rarity}" style="--item-color: {item.color}">
								<div class="card-glow-layer"></div>
								<div class="rarity-badge">
									{#each Array(item.rarity) as _}★{/each}
								</div>
								<div class="card-avatar" style="color: {item.color}">
									<span class="cosmetic-swatch-preview large" style="background: {item.color}"
									></span>
								</div>
								<div class="card-details">
									<span class="card-type-label">{item.kind.replace('-', ' ')}</span>
									<h3>{item.name}</h3>
									<p>{item.description}</p>
								</div>
							</div>
						</div>
					</div>
				{/each}
			</div>

			<button type="button" class="close-results-btn" onclick={closeCosmeticResults}>
				Back to Atelier
			</button>
		</div>
	</div>
{/if}

<!-- SPELL-SYMBOL DETAIL MODAL -->
{#if selectedItem}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeDetail} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="detail-card-view rarity-{selectedItem.rarity}"
			onclick={(e) => e.stopPropagation()}
			style="--item-color: {selectedItem.color}"
		>
			<button type="button" class="close-detail-btn" onclick={closeDetail}>×</button>
			<div class="detail-stars">
				{#each Array(selectedItem.rarity) as _}★{/each}
			</div>
			{#if true}
				{@const detailSvgId = selectedItem.id === 'aeriform' ? 'aeriforms' : selectedItem.id}
				{@const detailSvg = tryGetSymbolSvg(detailSvgId)}
				<div class="detail-icon-container" style="color: {selectedItem.color}">
					{#if detailSvg}
						<!-- eslint-disable-next-line svelte/no-at-html-tags -->
						<span class="symbol-svg-wrapper detail">{@html detailSvg}</span>
					{/if}
				</div>
			{/if}
			<div class="detail-info">
				<span class="detail-type">{selectedItem.type.toUpperCase()}</span>
				<h2>{selectedItem.name}</h2>
				<p class="detail-desc">{selectedItem.description}</p>
				<div class="detail-owned-status">
					Status: Unlocked (x{gachaStore.inventory[selectedItem.id] ?? 0} owned)
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- COSMETIC DETAIL MODAL -->
{#if selectedCosmeticItem}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="modal-overlay" onclick={closeCosmeticDetail} role="presentation">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="detail-card-view rarity-{selectedCosmeticItem.rarity}"
			onclick={(e) => e.stopPropagation()}
			style="--item-color: {selectedCosmeticItem.color}"
		>
			<button type="button" class="close-detail-btn" onclick={closeCosmeticDetail}>×</button>
			<div class="detail-stars">
				{#each Array(selectedCosmeticItem.rarity) as _}★{/each}
			</div>
			<div class="detail-icon-container">
				<span class="cosmetic-swatch-preview large" style="background: {selectedCosmeticItem.color}"
				></span>
			</div>
			<div class="detail-info">
				<span class="detail-type">{selectedCosmeticItem.kind.replace('-', ' ').toUpperCase()}</span>
				<h2>{selectedCosmeticItem.name}</h2>
				<p class="detail-desc">{selectedCosmeticItem.description}</p>
				<div class="detail-owned-status">
					Status: Unlocked (x{gachaStore.cosmeticInventory[selectedCosmeticItem.id] ?? 0} owned)
				</div>
				{#if selectedCosmeticItem.kind === 'ink-color'}
					<button
						type="button"
						class="equip-btn"
						onclick={() => {
							toggleActiveInkColor(selectedCosmeticItem!.id);
							closeCosmeticDetail();
						}}
					>
						{gachaStore.activeInkColorId === selectedCosmeticItem.id ? 'Unequip' : 'Equip Ink'}
					</button>
				{:else if selectedCosmeticItem.kind === 'effect'}
					<button
						type="button"
						class="equip-btn"
						onclick={() => {
							toggleActiveEffect(selectedCosmeticItem!.id);
							closeCosmeticDetail();
						}}
					>
						{gachaStore.activeEffectId === selectedCosmeticItem.id ? 'Unequip' : 'Equip Effect'}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<style>
	/* Workspace Setup */
	.gacha-workspace {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		width: min(960px, 100%);
		margin: 0 auto;
		padding: 0 clamp(1rem, 3vw, 2.5rem) clamp(2rem, 5vw, 4rem);
		color: var(--ink, #241b16);
	}

	/* Top Header Bar */
	.gacha-header-bar {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 1rem;
		padding-bottom: 0.75rem;
		border-bottom: 1px solid rgba(36, 27, 22, 0.1);
	}

	.gacha-tabs {
		display: flex;
		gap: 0.5rem;
		background: rgba(36, 27, 22, 0.05);
		padding: 4px;
		border-radius: 10px;
	}

	.gacha-tab-btn {
		background: transparent;
		border: 1px solid transparent;
		color: var(--ink-soft, #6c5b4d);
		font-weight: 600;
		padding: 8px 16px;
		border-radius: 8px;
		cursor: pointer;
		font-size: 14px;
		transition: all 0.2s ease;
	}

	.gacha-tab-btn.active {
		background: #f4ebcd;
		color: var(--ink);
		border-color: rgba(32, 48, 47, 0.26);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
	}

	.gacha-tab-btn:hover:not(.active) {
		background: rgba(36, 27, 22, 0.05);
	}

	.currency-panel-gacha {
		display: flex;
		align-items: center;
		gap: 0.75rem;
	}

	.ink-balance {
		display: flex;
		align-items: center;
		gap: 6px;
		background: rgba(31, 111, 115, 0.08);
		border: 1px solid rgba(31, 111, 115, 0.2);
		padding: 6px 12px;
		border-radius: 20px;
		font-size: 14px;
	}

	.ink-icon {
		font-size: 16px;
	}
	.ink-label {
		color: var(--ink-soft, #6c5b4d);
		font-weight: 500;
	}
	.ink-value {
		font-weight: 800;
		color: rgba(31, 111, 115, 0.95);
	}

	.earn-btn-gacha {
		background: #f4ebcd;
		border: 1px solid rgba(32, 48, 47, 0.26);
		color: var(--ink);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
		text-decoration: none;
		font-size: 13px;
		font-weight: 600;
		padding: 7px 14px;
		border-radius: 20px;
		transition: all 0.2s ease;
	}

	.earn-btn-gacha:hover {
		background: #ecdfb6;
		transform: translateY(-1px);
	}

	.tester-btn {
		background: rgba(230, 81, 0, 0.1);
		color: #e65100;
		border: 1px solid rgba(230, 81, 0, 0.2);
		border-radius: 8px;
		font-weight: bold;
		padding: 4px 8px;
		cursor: pointer;
		font-size: 11px;
	}

	.tester-btn:hover {
		background: rgba(230, 81, 0, 0.2);
	}

	/* Portal Section */
	.portal-section {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 2rem;
		padding: 3rem 1.5rem;
		background:
			radial-gradient(ellipse at 50% 0%, rgba(31, 111, 115, 0.18) 0%, transparent 65%),
			radial-gradient(ellipse at 50% 100%, rgba(155, 89, 182, 0.1) 0%, transparent 60%),
			linear-gradient(160deg, rgba(244, 235, 205, 0.55) 0%, rgba(255, 250, 240, 0.85) 100%);
		border: 1px solid rgba(31, 111, 115, 0.18);
		border-radius: 20px;
		margin-top: 1rem;
		position: relative;
		overflow: hidden;
	}

	.portal-container {
		width: 260px;
		height: 260px;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.magic-circle {
		position: absolute;
		border: 1.5px solid rgba(31, 111, 115, 0.25);
		border-radius: 50%;
		transition: all 0.3s ease;
	}

	.circle-outer {
		width: 260px;
		height: 260px;
		border-style: double;
		border-width: 4px;
		animation: rotate-clockwise 25s infinite linear;
	}
	.circle-middle {
		width: 210px;
		height: 210px;
		border-style: dashed;
		animation: rotate-counter-clockwise 18s infinite linear;
	}
	.circle-inner {
		width: 160px;
		height: 160px;
		border-style: solid;
		animation: rotate-clockwise 12s infinite linear;
	}

	/* Cosmetic portal variant colors */
	.cosmetic-outer {
		border-color: rgba(155, 89, 182, 0.3);
	}
	.cosmetic-middle {
		border-color: rgba(243, 156, 18, 0.25);
	}
	.cosmetic-inner {
		border-color: rgba(52, 152, 219, 0.3);
	}

	.portal-core {
		width: 110px;
		height: 110px;
		background: radial-gradient(circle, #fff 10%, rgba(31, 111, 115, 0.15) 80%);
		border: 2px solid rgba(31, 111, 115, 0.6);
		border-radius: 50%;
		display: flex;
		align-items: center;
		justify-content: center;
		color: rgba(31, 111, 115, 0.75);
		z-index: 2;
		box-shadow: 0 0 15px rgba(31, 111, 115, 0.1);
	}

	.cosmetic-core {
		background: radial-gradient(circle, #fff 10%, rgba(155, 89, 182, 0.15) 80%);
		border-color: rgba(155, 89, 182, 0.6);
		color: rgba(155, 89, 182, 0.75);
		box-shadow: 0 0 15px rgba(155, 89, 182, 0.1);
	}

	.portal-sigil-svg {
		width: 65px;
		height: 65px;
		opacity: 0.8;
	}

	.portal-container.active .circle-outer {
		animation-duration: 3s;
		border-color: rgba(243, 156, 18, 0.7);
		box-shadow: 0 0 25px rgba(243, 156, 18, 0.2);
	}
	.portal-container.active .circle-middle {
		animation-duration: 2s;
		border-color: rgba(31, 111, 115, 0.8);
		box-shadow: 0 0 20px rgba(31, 111, 115, 0.3);
	}
	.portal-container.active .circle-inner {
		animation-duration: 1.2s;
		border-color: rgba(155, 89, 182, 0.8);
		box-shadow: 0 0 30px rgba(155, 89, 182, 0.4);
	}
	.portal-container.active .portal-core {
		animation: pulse-core 0.5s infinite alternate ease-in-out;
		background: #fff;
		border-color: #f39c12;
		box-shadow: 0 0 40px rgba(243, 156, 18, 0.6);
	}

	.summon-light {
		width: 80px;
		height: 80px;
		background: radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(243, 156, 18, 0) 80%);
		border-radius: 50%;
		animation: core-flare 0.5s infinite alternate ease-in-out;
	}
	.cosmetic-light {
		background: radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(155, 89, 182, 0) 80%);
	}

	@keyframes rotate-clockwise {
		from {
			transform: rotate(0deg);
		}
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes rotate-counter-clockwise {
		from {
			transform: rotate(360deg);
		}
		to {
			transform: rotate(0deg);
		}
	}
	@keyframes pulse-core {
		from {
			transform: scale(0.95);
			box-shadow: 0 0 20px rgba(243, 156, 18, 0.3);
		}
		to {
			transform: scale(1.05);
			box-shadow: 0 0 45px rgba(243, 156, 18, 0.8);
		}
	}
	@keyframes core-flare {
		from {
			transform: scale(0.6);
			opacity: 0.6;
		}
		to {
			transform: scale(1.4);
			opacity: 1;
		}
	}

	.portal-cta {
		text-align: center;
		max-width: 480px;
	}
	.portal-cta h2 {
		margin: 0 0 0.5rem;
		font-size: 1.8rem;
		font-weight: 700;
	}
	.portal-cta p {
		margin: 0;
		color: var(--ink-soft, #6c5b4d);
		line-height: 1.5;
	}
	.guarantee-text {
		color: #e65100 !important;
		font-weight: 600;
		font-size: 0.9rem;
		margin-top: 0.5rem !important;
	}

	.portal-actions {
		display: flex;
		flex-wrap: wrap;
		gap: 1rem;
		width: 100%;
		max-width: 680px;
		margin-top: 0.5rem;
		justify-content: center;
	}

	.summon-btn {
		flex: 1 1 160px;
		min-width: 140px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		gap: 4px;
		padding: 14px 20px;
		border-radius: 14px;
		cursor: pointer;
		font-family: inherit;
		transition: all 0.2s ease;
		background: #f4ebcd;
		border: 1px solid rgba(32, 48, 47, 0.26);
		color: var(--ink);
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
	}
	.summon-btn:disabled {
		opacity: 0.48;
		cursor: not-allowed;
		filter: grayscale(1);
	}
	.summon-btn:not(:disabled):hover {
		background: #ecdfb6;
		transform: translateY(-2px);
		box-shadow: 0 4px 12px rgba(36, 27, 22, 0.12);
	}
	.summon-btn.free {
		border-color: rgba(31, 111, 115, 0.45);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.4) inset,
			0 0 0 1px rgba(31, 111, 115, 0.12);
	}
	.summon-btn.free:not(:disabled):hover {
		box-shadow: 0 6px 16px rgba(31, 111, 115, 0.2);
	}
	.summon-btn.multi {
		border-color: rgba(230, 81, 0, 0.5);
		box-shadow:
			0 1px 0 rgba(255, 255, 255, 0.4) inset,
			0 0 0 1px rgba(230, 81, 0, 0.1);
	}
	.summon-btn.multi:not(:disabled):hover {
		box-shadow: 0 6px 16px rgba(230, 81, 0, 0.25);
	}
	.btn-title {
		font-weight: 700;
		font-size: 15px;
	}
	.btn-cost {
		font-size: 13px;
		opacity: 0.9;
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.discount-badge {
		background: #e65100;
		color: #fff;
		padding: 1px 5px;
		border-radius: 4px;
		font-size: 9px;
		font-weight: 800;
		text-transform: uppercase;
	}

	.out-of-ink-warning {
		background: rgba(230, 81, 0, 0.08);
		border: 1px solid rgba(230, 81, 0, 0.2);
		padding: 12px 18px;
		border-radius: 10px;
		max-width: 460px;
		text-align: center;
		font-size: 13px;
	}
	.out-of-ink-warning a {
		color: #e65100;
		font-weight: 700;
		text-decoration: underline;
	}

	/* Cosmetic equip panel */
	.cosmetic-equip-panel {
		width: 100%;
		max-width: 680px;
		background: rgba(255, 250, 240, 0.7);
		border: 1px solid rgba(36, 27, 22, 0.12);
		border-radius: 14px;
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.cosmetic-equip-group {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.cosmetic-equip-title {
		margin: 0;
		font-size: 12px;
		text-transform: uppercase;
		letter-spacing: 0.5px;
		color: var(--ink-soft, #6c5b4d);
		font-weight: 700;
	}

	.cosmetic-swatch-row {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}

	.cosmetic-swatch {
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 5px 10px;
		border-radius: 20px;
		font-size: 12px;
		cursor: pointer;
		border: 1px solid rgba(36, 27, 22, 0.18);
		background: rgba(255, 251, 233, 0.8);
		color: var(--ink);
		box-shadow: none;
		min-height: 0;
		font-weight: 600;
		transition: all 0.15s ease;
	}
	.cosmetic-swatch:hover {
		background: rgba(255, 242, 197, 0.9);
	}
	.cosmetic-swatch.swatch-active {
		border-color: var(--teal, #1f6f7a);
		box-shadow: 0 0 0 1px var(--teal, #1f6f7a);
		background: rgba(31, 111, 115, 0.06);
	}
	.default-swatch {
		font-style: italic;
		color: var(--ink-soft, #6c5b4d);
	}

	.swatch-dot {
		width: 14px;
		height: 14px;
		border-radius: 50%;
		flex: 0 0 auto;
		border: 1px solid rgba(36, 27, 22, 0.1);
	}
	.swatch-label {
		line-height: 1;
	}

	/* Cosmetic swatch preview in cards */
	.cosmetic-swatch-preview {
		display: block;
		width: 44px;
		height: 44px;
		border-radius: 50%;
		border: 2px solid rgba(255, 255, 255, 0.6);
		box-shadow: 0 2px 8px rgba(36, 27, 22, 0.15);
	}
	.cosmetic-swatch-preview.large {
		width: 70px;
		height: 70px;
	}

	/* Collection Section */
	.collection-summary-stats {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
		gap: 1.25rem;
		margin-bottom: 2rem;
	}

	.stat-card {
		background: rgba(255, 250, 240, 0.7);
		border: 1px solid rgba(36, 27, 22, 0.12);
		border-radius: 14px;
		padding: 1.2rem;
		display: flex;
		flex-direction: column;
		justify-content: center;
	}
	.stat-card h3 {
		margin: 0 0 6px;
		font-size: 12px;
		color: var(--ink-soft, #6c5b4d);
		text-transform: uppercase;
		letter-spacing: 0.5px;
		font-weight: 600;
	}
	.stat-number {
		margin: 0;
		font-size: 24px;
		font-weight: 800;
		color: rgba(31, 111, 115, 0.95);
	}
	.progress-bar-container {
		width: 100%;
		height: 8px;
		background: rgba(36, 27, 22, 0.08);
		border-radius: 4px;
		overflow: hidden;
		margin-top: 6px;
		margin-bottom: 6px;
	}
	.progress-bar {
		height: 100%;
		background: rgba(31, 111, 115, 0.95);
		border-radius: 4px;
	}
	.progress-text {
		margin: 0;
		font-size: 11px;
		color: var(--ink-soft, #6c5b4d);
		font-weight: 500;
	}

	.collection-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
		gap: 1.2rem;
	}

	.cosmetic-grid {
		grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
	}

	.collection-card {
		background: #fff;
		border: 1px solid rgba(36, 27, 22, 0.14);
		border-radius: 14px;
		padding: 14px;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		position: relative;
		cursor: pointer;
		transition: all 0.25s cubic-bezier(0.25, 0.8, 0.25, 1);
		min-height: 200px;
	}
	.collection-card:hover:not(.locked) {
		transform: translateY(-4px) scale(1.02);
		box-shadow: 0 10px 20px rgba(36, 27, 22, 0.15);
		border-color: rgba(31, 111, 115, 0.45);
	}
	.collection-card.locked {
		cursor: not-allowed;
		opacity: 0.55;
		background: rgba(36, 27, 22, 0.02);
		border-color: rgba(36, 27, 22, 0.08);
	}

	.card-count {
		position: absolute;
		top: 8px;
		right: 8px;
		background: rgba(36, 27, 22, 0.08);
		color: var(--ink, #241b16);
		padding: 2px 7px;
		border-radius: 10px;
		font-size: 11px;
		font-weight: 700;
	}

	.card-icon-wrapper {
		width: 70px;
		height: 70px;
		border-radius: 50%;
		background: radial-gradient(circle, rgba(255, 255, 255, 1) 0%, rgba(255, 255, 255, 0) 90%);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 12px;
		color: var(--accent-color, rgba(31, 111, 115, 0.8));
		box-shadow: 0 4px 12px rgba(36, 27, 22, 0.06);
		border: 1px solid rgba(36, 27, 22, 0.04);
	}
	.collection-card.locked .card-icon-wrapper {
		color: var(--ink-soft, #6c5b4d);
		background: transparent;
		box-shadow: none;
		border: 1px dashed rgba(36, 27, 22, 0.15);
	}

	.symbol-svg-wrapper {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 100%;
		height: 100%;
		padding: 6px;
	}
	.symbol-svg-wrapper :global(svg) {
		width: 100%;
		height: 100%;
		max-width: 44px;
		max-height: 44px;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.2;
		overflow: visible;
	}

	.locked-question {
		font-size: 24px;
		font-weight: 700;
		opacity: 0.4;
	}

	.card-info {
		display: flex;
		flex-direction: column;
		width: 100%;
		margin-top: auto;
	}
	.item-type {
		font-size: 9px;
		letter-spacing: 0.5px;
		font-weight: 700;
		color: var(--ink-soft, #6c5b4d);
		margin-bottom: 2px;
	}
	.item-name {
		margin: 0 0 6px;
		font-size: 13px;
		font-weight: 700;
		line-height: 1.3;
	}
	.rarity-stars {
		display: flex;
		justify-content: center;
		gap: 2px;
		font-size: 10px;
		line-height: 1;
	}
	.rarity-stars .star {
		color: #f39c12;
	}
	.collection-card.locked .rarity-stars .star {
		color: rgba(36, 27, 22, 0.15);
	}

	.rarity-5 {
		border-color: rgba(243, 156, 18, 0.25);
		box-shadow: 0 4px 12px rgba(243, 156, 18, 0.06);
	}
	.rarity-5:not(.locked):hover {
		border-color: rgba(243, 156, 18, 0.65);
		box-shadow: 0 10px 24px rgba(243, 156, 18, 0.2);
	}
	.rarity-4 {
		border-color: rgba(155, 89, 182, 0.2);
		box-shadow: 0 4px 12px rgba(155, 89, 182, 0.05);
	}
	.rarity-4:not(.locked):hover {
		border-color: rgba(155, 89, 182, 0.55);
		box-shadow: 0 10px 24px rgba(155, 89, 182, 0.18);
	}

	/* Modals */
	.modal-overlay {
		position: fixed;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
		background: rgba(18, 14, 11, 0.8);
		backdrop-filter: blur(10px);
		z-index: 1000;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.reveal-content-container {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 1.5rem;
		max-width: 1000px;
		width: 100%;
		max-height: 90vh;
		overflow-y: auto;
		padding: 10px;
	}
	.reveal-content-container h2 {
		color: #fff;
		margin: 0;
		font-size: 1.8rem;
		font-weight: 700;
		text-shadow: 0 0 10px rgba(255, 255, 255, 0.2);
	}

	.cards-grid {
		display: grid;
		grid-template-columns: repeat(5, 170px);
		gap: 1.25rem;
		justify-content: center;
		width: 100%;
	}
	.cards-grid.single-card {
		grid-template-columns: 200px;
	}

	@media (max-width: 960px) {
		.cards-grid {
			grid-template-columns: repeat(2, 170px);
			max-height: 55vh;
			overflow-y: auto;
			padding: 10px;
		}
		.cards-grid.single-card {
			grid-template-columns: 200px;
		}
	}

	.card-flipper-container {
		perspective: 1000px;
		height: 270px;
		width: 100%;
	}
	.cards-grid.single-card .card-flipper-container {
		height: 310px;
	}

	.card-inner {
		position: relative;
		width: 100%;
		height: 100%;
		text-align: center;
		transition: transform 0.8s cubic-bezier(0.175, 0.885, 0.32, 1.275);
		transform-style: preserve-3d;
	}
	.card-flipper-container.flipped .card-inner {
		transform: rotateY(180deg);
	}

	.card-back,
	.card-front {
		position: absolute;
		width: 100%;
		height: 100%;
		backface-visibility: hidden;
		border-radius: 16px;
		overflow: hidden;
	}

	.card-back {
		background: #241b16;
		border: 2px solid rgba(255, 250, 240, 0.15);
		color: #fffae6;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.card-back-pattern {
		width: 90%;
		height: 90%;
		border: 1.5px solid rgba(255, 250, 240, 0.2);
		border-radius: 12px;
		display: flex;
		align-items: center;
		justify-content: center;
		background-image: radial-gradient(rgba(255, 250, 240, 0.05) 1.5px, transparent 1.5px);
		background-size: 12px 12px;
	}
	.back-logo {
		font-size: 32px;
		animation: pulse-back-logo 2s infinite ease-in-out;
	}
	@keyframes pulse-back-logo {
		0%,
		100% {
			transform: scale(0.9);
			opacity: 0.6;
		}
		50% {
			transform: scale(1.1);
			opacity: 1;
		}
	}

	.card-front {
		background: #fff;
		transform: rotateY(180deg);
		border: 2px solid rgba(36, 27, 22, 0.12);
		padding: 12px;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: space-between;
		position: relative;
	}
	.card-glow-layer {
		position: absolute;
		top: 0;
		left: 0;
		width: 100%;
		height: 100%;
		pointer-events: none;
		z-index: 0;
		opacity: 0.12;
		background: radial-gradient(circle at top, var(--item-color, #3498db) 0%, transparent 70%);
	}
	.card-front.rarity-5 {
		border-color: #f39c12;
		box-shadow: 0 0 20px rgba(243, 156, 18, 0.35);
		background: linear-gradient(to bottom, #fff 70%, rgba(243, 156, 18, 0.05) 100%);
	}
	.card-front.rarity-5 .card-glow-layer {
		opacity: 0.25;
		background: radial-gradient(circle at top, #f39c12 0%, transparent 80%);
		animation: rotate-glow 8s infinite linear;
	}
	.card-front.rarity-4 {
		border-color: #9b59b6;
		box-shadow: 0 0 15px rgba(155, 89, 182, 0.25);
		background: linear-gradient(to bottom, #fff 75%, rgba(155, 89, 182, 0.04) 100%);
	}
	@keyframes rotate-glow {
		from {
			filter: hue-rotate(0deg);
		}
		to {
			filter: hue-rotate(360deg);
		}
	}

	.rarity-badge {
		font-size: 9px;
		color: #f39c12;
		font-weight: 700;
		z-index: 1;
	}

	.card-avatar {
		width: 65px;
		height: 65px;
		border-radius: 50%;
		background: rgba(36, 27, 22, 0.03);
		display: flex;
		align-items: center;
		justify-content: center;
		margin: 6px 0;
		z-index: 1;
		border: 1px solid rgba(36, 27, 22, 0.04);
		padding: 4px;
	}
	.card-avatar :global(svg) {
		max-width: 38px;
		max-height: 38px;
	}
	.cards-grid.single-card .card-avatar {
		width: 85px;
		height: 85px;
		padding: 8px;
	}
	.cards-grid.single-card .card-avatar :global(svg) {
		max-width: 52px;
		max-height: 52px;
	}

	.card-details {
		z-index: 1;
		width: 100%;
	}
	.card-type-label {
		font-size: 8px;
		font-weight: 800;
		letter-spacing: 0.5px;
		text-transform: uppercase;
		color: var(--ink-soft, #6c5b4d);
		margin-bottom: 2px;
		display: block;
	}
	.card-details h3 {
		margin: 0 0 6px;
		font-size: 12px;
		font-weight: 800;
		line-height: 1.3;
	}
	.cards-grid.single-card .card-details h3 {
		font-size: 15px;
	}
	.card-details p {
		margin: 0;
		font-size: 10px;
		line-height: 1.4;
		color: var(--ink-soft, #6c5b4d);
		display: -webkit-box;
		-webkit-line-clamp: 3;
		line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}
	.cards-grid.single-card .card-details p {
		font-size: 11px;
		-webkit-line-clamp: 5;
		line-clamp: 5;
	}

	.close-results-btn {
		background: #f4ebcd;
		color: var(--ink, #241b16);
		border: 1px solid rgba(32, 48, 47, 0.26);
		padding: 10px 24px;
		font-size: 14px;
		font-weight: 700;
		border-radius: 20px;
		cursor: pointer;
		margin-top: 1rem;
		transition: all 0.2s ease;
		box-shadow: 0 1px 0 rgba(255, 255, 255, 0.4) inset;
	}
	.close-results-btn:hover {
		background: #ecdfb6;
		transform: translateY(-1px);
	}

	/* Detail modals */
	.detail-card-view {
		background: #fff;
		border: 2.5px solid rgba(36, 27, 22, 0.16);
		border-radius: 24px;
		width: 100%;
		max-width: 440px;
		padding: 2.5rem 2rem 2rem;
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		text-align: center;
		box-shadow: 0 20px 40px rgba(0, 0, 0, 0.4);
		animation: scale-up 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.15);
	}
	.detail-card-view.rarity-5 {
		border-color: #f39c12;
		box-shadow:
			0 0 30px rgba(243, 156, 18, 0.3),
			0 20px 45px rgba(0, 0, 0, 0.4);
	}
	.detail-card-view.rarity-4 {
		border-color: #9b59b6;
		box-shadow:
			0 0 25px rgba(155, 89, 182, 0.25),
			0 20px 45px rgba(0, 0, 0, 0.4);
	}
	@keyframes scale-up {
		from {
			transform: scale(0.9);
			opacity: 0;
		}
		to {
			transform: scale(1);
			opacity: 1;
		}
	}

	.close-detail-btn {
		position: absolute;
		top: 14px;
		right: 18px;
		background: transparent;
		border: none;
		font-size: 24px;
		color: var(--ink-soft, #6c5b4d);
		cursor: pointer;
		line-height: 1;
	}
	.close-detail-btn:hover {
		color: var(--ink, #241b16);
	}

	.detail-stars {
		color: #f39c12;
		font-size: 14px;
		font-weight: 700;
		margin-bottom: 0.5rem;
		letter-spacing: 2px;
	}

	.detail-icon-container {
		width: 110px;
		height: 110px;
		border-radius: 50%;
		background: rgba(36, 27, 22, 0.03);
		display: flex;
		align-items: center;
		justify-content: center;
		margin-bottom: 1.5rem;
		border: 1px solid rgba(36, 27, 22, 0.05);
		padding: 8px;
	}
	.symbol-svg-wrapper.detail :global(svg) {
		max-width: 70px;
		max-height: 70px;
	}

	.detail-info {
		width: 100%;
	}
	.detail-type {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0.8px;
		color: var(--ink-soft, #6c5b4d);
		margin-bottom: 4px;
		display: block;
	}
	.detail-info h2 {
		margin: 0 0 1rem;
		font-size: 1.6rem;
		font-weight: 800;
		line-height: 1.25;
	}
	.detail-desc {
		margin: 0 0 1.5rem;
		font-size: 13px;
		line-height: 1.6;
		color: var(--ink-soft, #6c5b4d);
		padding: 0 10px;
	}
	.detail-owned-status {
		font-size: 12px;
		background: rgba(36, 27, 22, 0.04);
		border-radius: 20px;
		padding: 6px 14px;
		display: inline-block;
		font-weight: 600;
		color: var(--ink, #241b16);
	}

	.equip-btn {
		margin-top: 12px;
		padding: 8px 22px;
		border-radius: 20px;
		background: var(--teal, #1f6f7a);
		color: #fffbe9;
		border: none;
		font-weight: 700;
		font-size: 14px;
		cursor: pointer;
		transition: background 0.15s ease;
	}
	.equip-btn:hover {
		background: #1a606a;
	}
</style>
