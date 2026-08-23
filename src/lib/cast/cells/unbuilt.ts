/**
 * @file The cell every track kind that has no performer yet resolves to: an
 * empty group that draws nothing and says in its name why.
 *
 * It exists for the length of the migration and no longer. `docs/animation-cells.md`
 * builds beam, fan, vortex, hold, intake and ambient in phase 3, and when the
 * last one lands this file and its row in the registry go with it. Until then a
 * score full of unperformed tracks renders a stage instead of a stack trace.
 */

import * as THREE from 'three';
import type { Cell } from './cell.js';
import type { ScoreTrack } from '../../types.js';

/** A cell with no form. Named for the kind it is standing in for. */
export function createUnbuiltCell(track: ScoreTrack): Cell {
	const group = new THREE.Group();
	group.name = `unbuilt-${track.kind}`;
	group.visible = false;
	return {
		group,
		update() {},
		dispose() {}
	};
}
