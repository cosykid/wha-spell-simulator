/**
 * @file The look table, read as three.js material settings. The one place a
 * `Look`'s art data becomes a GPU number, so a cell never reinterprets a tint.
 *
 * Looks stay data (`looks/CLAUDE.md`): this module reads them and never writes
 * one, and it holds no art of its own.
 */

import * as THREE from 'three';
import type { Look, Rgb } from '../looks/look.js';

/**
 * A look's tint channel as a three.js color. The table's tuples are sRGB bytes
 * the 2D painter blitted straight, so they are converted into the renderer's
 * linear working space rather than dropped in raw.
 */
export function inkColor(rgb: Rgb): THREE.Color {
	return new THREE.Color().setRGB(rgb[0] / 255, rgb[1] / 255, rgb[2] / 255, THREE.SRGBColorSpace);
}

/** The look's compositing, in the renderer's vocabulary. `lighter` is additive light. */
export function inkBlending(look: Look): THREE.Blending {
	return look.blend === 'lighter' ? THREE.AdditiveBlending : THREE.NormalBlending;
}
