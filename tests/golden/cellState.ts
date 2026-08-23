/**
 * @file What a cast baseline says now: each cell's own state, at one moment, as
 * text a reviewer can read.
 *
 * The old tier rasterized parcels, because a population of dots had no other
 * legible summary. A cell has one: it is a small scene graph whose every
 * load-bearing number is either a transform or a shader uniform, and both are
 * plain data on the CPU. So a frame serializes to the tree itself — per track,
 * per form: whether it is drawing, where it sits, how it is turned, how many
 * instances it carries, and every uniform the cell wrote into it — plus the
 * ceiling a holder publishes, which is the whole of a coupling.
 *
 * That makes a diff say _what changed about the performance_ ("the shaft is
 * 0.3 units shorter at 1600ms") rather than "these pixels moved". Pixel truth
 * moved wholly to the Playwright look tier, which has a GPU.
 *
 * Everything printed is rounded to fixed decimals, so float dust in the last
 * bits cannot rewrite a baseline.
 *
 * @example
 * const text = frameText(cast, 1600);
 */

import * as THREE from 'three';
import { beatAt, progressThrough } from '../../src/lib/cast/score/beats.js';
import { evaluateEnvelope } from '../../src/lib/cast/score/envelopes.js';
import type { HeadlessCast } from './cellHarness.js';
import type { Performer } from '../../src/lib/cast/stage/frames.js';

/** Decimals kept on every number in a baseline. */
const PLACES = 4;

/** Decimals kept on a colour channel, which is art data and never motion. */
const COLOUR_PLACES = 3;

/** One indent level. Two spaces, so a deep form still fits on a line. */
const INDENT = '  ';

function fixed(value: number, places = PLACES): string {
	if (!Number.isFinite(value)) {
		return String(value);
	}
	// `-0.00004` rounds to `-0.0000`, which would differ from `0.0000` in a byte
	// comparison while meaning the same thing.
	const rounded = Number(value.toFixed(places));
	return (rounded === 0 ? 0 : rounded).toFixed(places);
}

function triple(x: number, y: number, z: number): string {
	return `(${fixed(x)}, ${fixed(y)}, ${fixed(z)})`;
}

/** One uniform's value, whatever shape three.js keeps it in. */
function uniformText(value: unknown): string {
	if (typeof value === 'number') {
		return fixed(value);
	}
	if (typeof value === 'boolean') {
		return String(value);
	}
	if (value instanceof THREE.Color) {
		return `(${fixed(value.r, COLOUR_PLACES)}, ${fixed(value.g, COLOUR_PLACES)}, ${fixed(value.b, COLOUR_PLACES)})`;
	}
	if (value instanceof THREE.Vector2) {
		return `(${fixed(value.x)}, ${fixed(value.y)})`;
	}
	if (value instanceof THREE.Vector3) {
		return triple(value.x, value.y, value.z);
	}
	// Nothing in `cells/forms/` uses another kind yet. Name it rather than drop
	// it, so a new one shows up in a diff instead of going quietly missing.
	return `<${typeof value}>`;
}

function uniformsText(material: THREE.Material): string {
	if (!(material instanceof THREE.ShaderMaterial)) {
		return '';
	}
	return Object.keys(material.uniforms)
		.sort()
		.map((name) => `${name}=${uniformText(material.uniforms[name].value)}`)
		.join(' ');
}

/** How a form composites: the look table's `blend`, in the renderer's vocabulary. */
function blendText(material: THREE.Material): string {
	return material.blending === THREE.AdditiveBlending ? 'add' : 'normal';
}

/** Whether a triple is the identity once rounded, so float dust reads as rest. */
function atRest(x: number, y: number, z: number): boolean {
	return triple(x, y, z) === triple(0, 0, 0);
}

/**
 * Where an object sits, how it is turned and how big it is, printed only where
 * it is not at rest. Scale is load-bearing on the forms a cell sizes rather than
 * reshapes: the hold's shell is its own radius, the burst's flash its flare.
 */
function poseText(object: THREE.Object3D): string {
	const parts: string[] = [];
	const { position, rotation, scale } = object;
	if (!atRest(position.x, position.y, position.z)) {
		parts.push(`at=${triple(position.x, position.y, position.z)}`);
	}
	if (!atRest(rotation.x, rotation.y, rotation.z)) {
		parts.push(`turn=${triple(rotation.x, rotation.y, rotation.z)}`);
	}
	if (triple(scale.x, scale.y, scale.z) !== triple(1, 1, 1)) {
		parts.push(`size=${triple(scale.x, scale.y, scale.z)}`);
	}
	return parts.join(' ');
}

function meshText(mesh: THREE.Mesh): string {
	const parts = [`blend=${blendText(mesh.material as THREE.Material)}`];
	const geometry = mesh.geometry;
	if (geometry instanceof THREE.InstancedBufferGeometry) {
		parts.push(`instances=${geometry.instanceCount}`);
	}
	const pose = poseText(mesh);
	if (pose) {
		parts.push(pose);
	}
	parts.push(uniformsText(mesh.material as THREE.Material));
	return parts.filter(Boolean).join(' ');
}

/**
 * One object and everything under it. A hidden object stops the walk: whatever
 * its forms still hold, nothing of it reaches a pixel, and R-01's charge is
 * exactly that line for every cell but the medium's.
 */
function describe(object: THREE.Object3D, depth: number, lines: string[]): void {
	const label = object instanceof THREE.Mesh ? 'form' : 'group';
	const head = `${INDENT.repeat(depth)}${label} ${object.name || '(unnamed)'}`;
	if (!object.visible) {
		lines.push(`${head} hidden`);
		return;
	}
	const body = object instanceof THREE.Mesh ? meshText(object) : poseText(object);
	lines.push(body ? `${head} ${body}` : head);
	for (const child of object.children) {
		describe(child, depth + 1, lines);
	}
}

/** The ceiling this cell publishes to whatever it holds, if it holds anything. */
function ceilingText(performer: Performer): string {
	const ceiling = performer.cell.constraint?.();
	if (!ceiling) {
		return 'ceiling none';
	}
	const { at, radius, closed } = ceiling;
	return `ceiling at=${triple(at.x, at.y, at.z)} radius=${fixed(radius)} closed=${fixed(closed)}`;
}

/** One track's header: what the score asked of it at this moment. */
function trackText(cast: HeadlessCast, performer: Performer, atMs: number): string {
	const { track } = performer;
	const emission = evaluateEnvelope(track.emission, cast.score.beats, atMs);
	const drive = evaluateEnvelope(track.drive, cast.score.beats, atMs);
	const captured = track.capturedBy ? ` capturedBy=${track.capturedBy}` : '';
	return (
		`track ${track.id} kind=${track.kind} look=${track.look} population=${track.population}` +
		`${captured} emission=${fixed(emission)} drive=${fixed(drive)}`
	);
}

/**
 * The whole cast at `atMs`, assuming it has already been stepped there. Advancing
 * is the caller's job because a cast is stepped through its timestamps in order,
 * which is the cheap way to render a whole preset.
 */
export function frameText(cast: HeadlessCast, atMs: number): string {
	const beat = beatAt(cast.score.beats, atMs);
	const lines = [
		`@${String(atMs).padStart(4, '0')}ms beat=${beat} beatT=${fixed(progressThrough(cast.score.beats[beat], atMs))}`
	];
	for (const performer of cast.performers) {
		lines.push(trackText(cast, performer, atMs));
		describe(performer.cell.group, 1, lines);
		lines.push(`${INDENT}${ceilingText(performer)}`);
	}
	return lines.join('\n');
}
