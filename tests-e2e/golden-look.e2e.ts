/**
 * Look golden tier: the Spell Effect Lab's effect canvas at fixed timestamps,
 * under both effect styles.
 *
 * Two lists, because the styles do not share a clock or a tolerance. The
 * **stage** list is every lab preset on R-01's beat clock, plus two cases
 * pinning the sigil look rows. The **classic** list is a deliberate subset on
 * the wall clock: classic is restored behavior rather than a place canon
 * develops, so per-preset coverage buys less there than it does for the stage.
 *
 * Generate with `npm run test:golden:look:update`; a case whose baseline is
 * missing skips with a hint rather than failing.
 *
 * The cast tier (`npm run test:golden`) is the primary gate, and it is
 * stage-only: it serializes a cell scene graph, and classic has no cells, no
 * tracks and no uniforms to serialize. This tier only catches what pixels can
 * say and motion cannot: colour, sprite, compositing.
 */

import { existsSync, readFileSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { LAB_PRESETS } from '../src/lib/ui/spellEffectLabPresets.js';
import { EFFECT_STYLE_PARAM, type EffectStyle } from '../src/lib/structures/effectStyle.js';

/**
 * Read off the beat clock rather than the wall. Charge ends at 980ms, the strike
 * runs to 1300ms, and the body of a 5s cast runs to 3820ms. 700ms is therefore
 * charge *content* — R-01's ambient medium drawing inward with the spell's own
 * manifestation still to come — then one frame inside the strike and one
 * mid-body.
 */
const FRAME_MS = [700, 1150, 2200] as const;

/**
 * Classic frames, on the wall clock it actually runs on. Its `spellEmission`
 * holds everything back until the 980ms portal tilt has finished, so 300ms is
 * mid-tilt and empty *by contract*, 1400ms is just after emission opens, and
 * 2600ms is the effect developed. A 700ms classic frame would be blank for a
 * different reason than the stage's is quiet, which is why the lists differ.
 */
const CLASSIC_FRAME_MS = [300, 1400, 2600] as const;

/** The two sigil rows keyed above their element (crystal over earth, aeroform over wind). */
const SIGIL_ROWS = ['crystal', 'aeroform'] as const;

/** The preset the sigil cases run, so their only difference from `column-balanced` is the row. */
const SIGIL_CASE_PRESET = 'column-balanced';

/**
 * Classic picks a renderer per seal: any seal with force sources runs its field
 * effect, and only a seal without them reaches the five per-element renderers
 * and their three sigil variants. So the subset is split — presets for the field
 * path, sigils over the sign-free `none` preset for the element path. Running
 * `aeroform` over a column preset would only repaint the wind palette.
 */
const CLASSIC_FIELD_PRESETS = ['column-balanced', 'pull-vortex', 'region-sector'] as const;

/** Every renderer the element path can reach: five elements, three sigil variants. */
const CLASSIC_SIGILS = [
	'fire',
	'water',
	'wind-directs-air',
	'earth',
	'light',
	'crystal',
	'aeroform',
	'wind-underfoot'
] as const;

/**
 * The stage is seeded end to end and reads no clock, so its baselines are held
 * tight and the tolerance only absorbs Chromium's gradient dithering. Classic
 * jitters particles with `Math.random` — seeded per page below, but its
 * gradients still dither a hair differently across machines — so a classic
 * baseline pins the composition rather than every pixel.
 */
const MAX_DIFF_PIXEL_RATIO: Record<EffectStyle, number> = { stage: 0.005, classic: 0.02 };

const UPDATE_HINT = 'run `npm run test:golden:look:update`';

/** One preset, one style and one look row, at a list of timestamps. */
interface LookCase {
	/** Baseline file stem, distinct per case. */
	id: string;
	presetId: string;
	style: EffectStyle;
	/** Omitted for the lab's default sigil. */
	sigil?: string;
	frames: readonly number[];
}

const LOOK_CASES: LookCase[] = [
	...LAB_PRESETS.map((preset) => ({
		id: `cast-${preset.id}`,
		presetId: preset.id,
		style: 'stage' as const,
		frames: FRAME_MS
	})),
	...SIGIL_ROWS.map((sigil) => ({
		id: `cast-${SIGIL_CASE_PRESET}-${sigil}`,
		presetId: SIGIL_CASE_PRESET,
		style: 'stage' as const,
		sigil,
		frames: FRAME_MS
	})),
	...CLASSIC_FIELD_PRESETS.map((presetId) => ({
		id: `classic-${presetId}`,
		presetId,
		style: 'classic' as const,
		frames: CLASSIC_FRAME_MS
	})),
	...CLASSIC_SIGILS.map((sigil) => ({
		id: `classic-none-${sigil}`,
		presetId: 'none',
		style: 'classic' as const,
		sigil,
		frames: CLASSIC_FRAME_MS
	}))
];

/**
 * Classic spawns and jitters every particle with `Math.random`, so an unseeded
 * page paints a different frame each run. Seeding it in the page is the test's
 * job; the app keeps its real randomness. Installed only for classic cases —
 * the stage draws from its own seeded `Rng` and must not have its baselines
 * moved by something the app never does.
 */
function installSeededRandom(): void {
	let state = 0x9e3779b9;
	Math.random = () => {
		state = (state + 0x6d2b79f5) | 0;
		let t = Math.imul(state ^ (state >>> 15), 1 | state);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

function baselineName(caseId: string, atMs: number): string {
	return `${caseId}-${String(atMs).padStart(4, '0')}ms.png`;
}

// The route's scripted-clock hook: load this preset under this style and step
// the preview to this timestamp, then stop. See lab-goldens.ts. The style is
// always named, so a stored preference can never decide what a baseline shows.
function labUrl(lookCase: LookCase, atMs: number): string {
	const params = new URLSearchParams({
		preset: lookCase.presetId,
		frameMs: String(atMs),
		[EFFECT_STYLE_PARAM]: lookCase.style
	});
	if (lookCase.sigil) {
		params.set('sigil', lookCase.sigil);
	}
	return `/tools/spell-effect-lab?${params}`;
}

for (const lookCase of LOOK_CASES) {
	for (const atMs of lookCase.frames) {
		test(`look: ${lookCase.id} at ${atMs}ms`, async ({ page }, testInfo) => {
			const name = baselineName(lookCase.id, atMs);
			const updating = ['all', 'changed'].includes(testInfo.config.updateSnapshots);
			test.skip(
				!updating && !existsSync(testInfo.snapshotPath(name)),
				`no look baseline for ${name} yet: ${UPDATE_HINT}`
			);

			if (lookCase.style === 'classic') {
				await page.addInitScript(installSeededRandom);
			}
			await page.goto(labUrl(lookCase, atMs));
			const effectCanvas = page.getByTestId('lab-effect-canvas');
			await expect(effectCanvas).toHaveAttribute('data-effect-style', lookCase.style);
			await expect(effectCanvas).toHaveAttribute('data-golden-frame', String(atMs));

			await expect(effectCanvas).toHaveScreenshot(name, {
				animations: 'disabled',
				maxDiffPixelRatio: MAX_DIFF_PIXEL_RATIO[lookCase.style]
			});
		});
	}
}

/** The mid-body frame every preset owes, and the one the floor below is measured at. */
const DISCRIMINATION_FRAME_MS = 2200;

/** A channel this far apart is different art rather than the renderer's dithering. */
const CHANNEL_DELTA = 16;

/**
 * The seals whose plan has nothing to steer, which R-11 makes a look rather than
 * an empty canvas: `none` carries no signs, `swirl-pushes` resolves
 * `region-unruled`, `column-cancelled` an `inert-quadrupole`, and
 * `levitation-inverted` folds its levitation away to the same nothing. All four
 * land on a plan with zero aim and zero circulation (`tests/golden/plans/`) and
 * compile to the identical quiet-plume score, so they are *meant* to render the
 * same designed default, and the floor is not asked of a pair drawn from inside
 * this set. (Until the strike's splash residue learned to dry, seed noise in
 * that residue kept `levitation-inverted` accidentally clear of the floor.)
 * Every pair with a manifesting seal on either side still owes it, this set
 * included.
 */
const INERT_PRESETS = new Set(['none', 'swirl-pushes', 'column-cancelled', 'levitation-inverted']);

/**
 * The share of the frame two presets must differ over. Today's closest
 * manifesting pair is `none` and `pull-inverted` at 0.0096 of the frame, so the
 * floor sits at under a third of that. It fails long before two seals converge,
 * and no ordinary tuning pass walks into it.
 */
const MIN_PRESET_DISTANCE = 0.003;

/** One pair of baselines and how far apart they render. */
interface PresetDistance {
	left: string;
	right: string;
	/** Share of the frame whose pixels differ, 0..1. */
	distance: number;
}

/**
 * The floor the per-baseline cases cannot supply. Phase 5's goldens all passed
 * while five spells rendered identically: matching your own baseline says nothing
 * about whether the seal was read at all. So the baselines are also compared to
 * *each other* at one matched mid-body frame, and the closest pair has to stand
 * clear of {@link MIN_PRESET_DISTANCE}.
 *
 * Only preset-versus-preset, and only on the stage: the two sigil cases are the
 * same seal under another look row, and how close a look row may sit to its
 * neighbour is a different question from whether a spell was performed. Comparing
 * across styles would be meaningless, so this floor stays scoped to `cast-*`.
 */
test('distinct presets render distinctly at mid-body', async ({ page }, testInfo) => {
	const baselines = LAB_PRESETS.map((preset) => ({
		id: preset.id,
		path: testInfo.snapshotPath(baselineName(`cast-${preset.id}`, DISCRIMINATION_FRAME_MS))
	}));
	test.skip(
		baselines.some(({ path }) => !existsSync(path)),
		`not every preset has a ${DISCRIMINATION_FRAME_MS}ms baseline yet: ${UPDATE_HINT}`
	);

	// Decoded in the page, because the only PNG decoder this suite has is the
	// browser it already drives.
	await page.goto('about:blank');
	const distances = await page.evaluate(
		async ({
			images,
			channelDelta
		}: {
			images: Array<{ id: string; base64: string }>;
			channelDelta: number;
		}): Promise<PresetDistance[]> => {
			const decode = async (base64: string) => {
				const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0));
				const bitmap = await createImageBitmap(new Blob([bytes], { type: 'image/png' }));
				const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
				const context = canvas.getContext('2d')!;
				context.drawImage(bitmap, 0, 0);
				return context.getImageData(0, 0, bitmap.width, bitmap.height).data;
			};

			const frames = [];
			for (const image of images) {
				frames.push({ id: image.id, pixels: await decode(image.base64) });
			}

			const pairs: PresetDistance[] = [];
			for (let left = 0; left < frames.length; left += 1) {
				for (let right = left + 1; right < frames.length; right += 1) {
					const one = frames[left].pixels;
					const other = frames[right].pixels;
					if (one.length !== other.length) {
						throw new Error(`${frames[left].id} and ${frames[right].id} are different sizes`);
					}
					let differing = 0;
					for (let index = 0; index < one.length; index += 4) {
						const apart =
							Math.abs(one[index] - other[index]) > channelDelta ||
							Math.abs(one[index + 1] - other[index + 1]) > channelDelta ||
							Math.abs(one[index + 2] - other[index + 2]) > channelDelta ||
							Math.abs(one[index + 3] - other[index + 3]) > channelDelta;
						if (apart) differing += 1;
					}
					pairs.push({
						left: frames[left].id,
						right: frames[right].id,
						distance: differing / (one.length / 4)
					});
				}
			}
			return pairs.sort((one, other) => one.distance - other.distance);
		},
		{
			images: baselines.map(({ id, path }) => ({
				id,
				base64: readFileSync(path).toString('base64')
			})),
			channelDelta: CHANNEL_DELTA
		}
	);

	const ranked = distances.filter(
		(pair) => !(INERT_PRESETS.has(pair.left) && INERT_PRESETS.has(pair.right))
	);
	const closest = ranked[0];
	const nearest = ranked
		.slice(0, 5)
		.map((pair) => `${pair.left}/${pair.right} ${pair.distance.toFixed(4)}`)
		.join(', ');
	testInfo.annotations.push({ type: 'closest presets', description: nearest });
	expect(
		closest.distance,
		`${closest.left} and ${closest.right} are the closest of the ${ranked.length} pairs; nearest five: ${nearest}`
	).toBeGreaterThan(MIN_PRESET_DISTANCE);
});
