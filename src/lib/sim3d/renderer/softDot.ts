/**
 * @file Soft radial-gradient disc texture shared by every point cloud, so
 * tracers and motes render as round glows instead of hard square points.
 */
import * as THREE from 'three';

let cached: THREE.Texture | null = null;

export function softDotTexture(): THREE.Texture {
	if (cached) return cached;
	const size = 64;
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = size;
	const ctx = canvas.getContext('2d')!;
	const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
	g.addColorStop(0, 'rgba(255,255,255,1)');
	g.addColorStop(0.35, 'rgba(255,255,255,0.75)');
	g.addColorStop(1, 'rgba(255,255,255,0)');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, size, size);
	cached = new THREE.CanvasTexture(canvas);
	return cached;
}
