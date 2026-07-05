/**
 * Renders the manifestation region (mask × proximity) as a translucent red
 * overlay on the seal plane — the direct analogue of the wiki demo's red areas.
 */
import * as THREE from 'three';
import { spawnWeight, type Nozzle } from './../nozzle';
import { v2 } from './../math2';

const N = 160;
const EXTENT = 1.45; // world half-size covered by the overlay

export function buildMaskOverlay(nozzle: Nozzle): THREE.Mesh {
	const canvas = document.createElement('canvas');
	canvas.width = N;
	canvas.height = N;
	const ctx = canvas.getContext('2d')!;
	const img = ctx.createImageData(N, N);
	for (let j = 0; j < N; j++) {
		for (let i = 0; i < N; i++) {
			const x = (i / (N - 1)) * 2 * EXTENT - EXTENT;
			// canvas row j = texture v top; after rotateX(-π/2) that edge lies at +z…
			// empirically verified with the flame-shot corridor (z ≥ -0.3)
			const z = (j / (N - 1)) * 2 * EXTENT - EXTENT;
			const w = spawnWeight(nozzle, v2(x, z));
			const o = (j * N + i) * 4;
			img.data[o] = 255;
			img.data[o + 1] = 70;
			img.data[o + 2] = 70;
			img.data[o + 3] = Math.round(150 * w);
		}
	}
	ctx.putImageData(img, 0, 0);

	const tex = new THREE.CanvasTexture(canvas);
	tex.colorSpace = THREE.SRGBColorSpace;
	const mesh = new THREE.Mesh(
		new THREE.PlaneGeometry(2 * EXTENT, 2 * EXTENT),
		new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false })
	);
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = 0.004;
	return mesh;
}
