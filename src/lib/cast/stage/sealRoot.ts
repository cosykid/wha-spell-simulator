/**
 * @file The seal-space root: the one `Group` every cell hangs under, and the one
 * place seal space becomes three.js world space.
 *
 * Seal space (spec R-03) is origin at the ring center, one unit = the ring
 * radius, x right, y screen-down, z out of the paper. World space lays that seal
 * flat with +Y up, so `(x, y, z)` in seal is `(X, Z, Y)` in world, exactly as
 * `portal/portal.ts`'s {@link sealToWorld} states it. The root carries that swap
 * as its matrix, so a cell only ever writes seal numbers.
 *
 * @example
 * const sealRoot = createSealRoot();
 * scene.add(sealRoot);
 * sealRoot.add(cell.group); // cell.group.position.set(x, y, z) is seal space
 */

import * as THREE from 'three';

/**
 * A `Group` whose children think in seal units.
 *
 * Seal space is left-handed (x right, y down, z toward the viewer), so this
 * matrix has determinant -1 and every triangle under it winds the other way.
 * A cell that relies on face culling would show its inside; cells therefore
 * declare `side: THREE.DoubleSide` rather than reversing their own indices.
 */
export function createSealRoot(): THREE.Group {
	const root = new THREE.Group();
	root.name = 'seal-root';
	// prettier-ignore
	root.matrix.set(
		1, 0, 0, 0,
		0, 0, 1, 0,
		0, 1, 0, 0,
		0, 0, 0, 1
	);
	// The swap is fixed for the life of the stage, so let it stand rather than
	// letting three recompose it from position/quaternion/scale every frame.
	root.matrixAutoUpdate = false;
	root.updateMatrixWorld(true);
	return root;
}
