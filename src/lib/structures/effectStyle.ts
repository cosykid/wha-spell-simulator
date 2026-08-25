/**
 * @file `EffectStyle` — which engine performs a cast. One user choice, read by
 * every host, and the only thing allowed to decide between them.
 *
 * The choice is made once, at the canvas: `stage` is the three.js cell stage,
 * `classic` the Canvas2D engine restored from before the animation redesign. No
 * spell, element or frame may pick an engine, so this is a display preference
 * and lives beside the other cross-boundary shapes rather than in the compiler.
 *
 * @example
 * const style = effectStyleFromSearch(location.search) ?? effectStyleFrom(stored.effectStyle);
 */

/** Which engine performs a cast. */
export type EffectStyle = 'classic' | 'stage';

export const EFFECT_STYLES: readonly EffectStyle[] = ['stage', 'classic'];

/** The default, and what an unrecognized style falls back to. */
export const DEFAULT_EFFECT_STYLE: EffectStyle = 'stage';

/** The query parameter a page uses to ask for a style, the golden rig included. */
export const EFFECT_STYLE_PARAM = 'engine';

/**
 * Narrows an arbitrary string, so neither stored preferences nor a URL can
 * select a style that does not exist. Preference loading does no schema
 * validation of its own, so for a union this narrowing is the validation.
 */
export function effectStyleFrom(value: string | null | undefined): EffectStyle {
	return EFFECT_STYLES.includes(value as EffectStyle)
		? (value as EffectStyle)
		: DEFAULT_EFFECT_STYLE;
}

/** The style this page asked for, or null when it did not ask. */
export function effectStyleFromSearch(search: string): EffectStyle | null {
	const value = new URLSearchParams(search).get(EFFECT_STYLE_PARAM);
	return EFFECT_STYLES.includes(value as EffectStyle) ? (value as EffectStyle) : null;
}

/** How the style reads in the UI. */
export const EFFECT_STYLE_LABELS: Record<EffectStyle, string> = {
	stage: 'Modern effects',
	classic: 'Classic effects'
};
