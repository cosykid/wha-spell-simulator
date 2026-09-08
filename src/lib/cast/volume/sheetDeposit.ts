/** @file A flattened metaball in the existing shared field, for broad flexible bands. */

/** Flatten along a unit normal while keeping the two surface directions rounded. */
export function depositSheet(
	field: Float32Array,
	size: number,
	x: number,
	y: number,
	z: number,
	nx: number,
	ny: number,
	nz: number,
	strength: number,
	subtract: number
): void {
	const radius = size * Math.sqrt(strength / subtract);
	const minX = Math.max(1, Math.floor(x * size - radius));
	const maxX = Math.min(size - 1, Math.ceil(x * size + radius));
	const minY = Math.max(1, Math.floor(y * size - radius));
	const maxY = Math.min(size - 1, Math.ceil(y * size + radius));
	const minZ = Math.max(1, Math.floor(z * size - radius));
	const maxZ = Math.min(size - 1, Math.ceil(z * size + radius));
	// A thin deposit still spans several cells across its face.
	const normalWeight = 31;
	for (let iz = minZ; iz < maxZ; iz++) {
		const dz = iz / size - z;
		for (let iy = minY; iy < maxY; iy++) {
			const dy = iy / size - y;
			for (let ix = minX; ix < maxX; ix++) {
				const dx = ix / size - x;
				const normal = dx * nx + dy * ny + dz * nz;
				const distance = dx * dx + dy * dy + dz * dz + normalWeight * normal * normal;
				const value = strength / (0.000001 + distance) - subtract;
				if (value > 0) field[(iz * size + iy) * size + ix] += value;
			}
		}
	}
}
