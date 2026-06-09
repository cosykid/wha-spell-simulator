import { clamp } from '../utils/geometry.js';
import type { Vector } from '../types.js';

/**
 * A rasterized ink bitmap: a size x size gird of 0/1 pixels with the drawing
 * and comparison ops shared b the templated and point-cloud matchers.
 */
export class InkMask {
	readonly size: number;
	readonly data: Uint8Array;

	constructor(size: number) {
		this.size = size;
		this.data = new Uint8Array(size * size);
	}

	markPoint(x: number, y: number, radius = 1): void {
		const size = this.size;
		const centerX = Math.round(clamp(x, 0, 1) * (size - 1));
		const centerY = Math.round(clamp(y, 0, 1) * (size - 1));
		const radiusSq = radius * radius;

		for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
			for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
				if (offsetX * offsetX + offsetY * offsetY > radiusSq) continue;
				const px = centerX + offsetX;
				const py = centerY + offsetY;
				if (px < 0 || px >= size || py < 0 || py >= size) continue;
				this.data[py * size + px] = 1;
			}
		}
	}

	drawSegment(start: Vector, end: Vector, radius = 1): void {
		const dx = end.x - start.x;
		const dy = end.y - start.y;

		const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) * this.size * 2));
		for (let index = 0; index <= steps; index += 1) {
			const t = index / steps;
			this.markPoint(start.x + dx * t, start.y + dy * t, radius);
		}
	}

	count(): number {
		let ink = 0;
		for (const pixel of this.data) ink += pixel;
		return ink;
	}

	overlap(other: InkMask): number {
		let overlap = 0;
		for (let index = 0; index < this.data.length; index += 1) {
			if (this.data[index] && other.data[index]) {
				overlap += 1;
			}
		}
		return overlap;
	}

	dice(other: InkMask, thisInk = this.count(), otherInk = other.count()): number {
		if (!thisInk || !otherInk) {
			return 0;
		}
		return clamp((this.overlap(other) * 2) / (thisInk + otherInk));
	}
}
