/** @file A flattened metaball in the existing shared field, for broad flexible bands. */

/** How much a step along the normal costs against a step across the face. */
const NORMAL_WEIGHT = 31;

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
	// A thin deposit still spans several cells across its face, so most of its
	// box is empty. Each row walks only the chord where the flattened distance
	// can still fall inside the reach, solved as a quadratic in dx. The reach
	// is widened by far more than rounding can move a root, so the trim never
	// drops a cell the kernel would write.
	const reach2 = (strength / subtract) * (1 + 1e-9);
	const a = 1 + NORMAL_WEIGHT * nx * nx;
	for (let iz = minZ; iz < maxZ; iz++) {
		const dz = iz / size - z;
		for (let iy = minY; iy < maxY; iy++) {
			const dy = iy / size - y;
			const across = dy * ny + dz * nz;
			const b = 2 * NORMAL_WEIGHT * nx * across;
			const c = dy * dy + dz * dz + NORMAL_WEIGHT * across * across - reach2;
			const disc = b * b - 4 * a * c;
			if (disc <= 0) continue;
			const root = Math.sqrt(disc);
			const fromX = Math.max(minX, Math.ceil((x + (-b - root) / (2 * a)) * size));
			const toX = Math.min(maxX, Math.floor((x + (-b + root) / (2 * a)) * size) + 1);
			for (let ix = fromX; ix < toX; ix++) {
				const dx = ix / size - x;
				const normal = dx * nx + dy * ny + dz * nz;
				const distance = dx * dx + dy * dy + dz * dz + NORMAL_WEIGHT * normal * normal;
				const value = strength / (0.000001 + distance) - subtract;
				if (value > 0) field[(iz * size + iy) * size + ix] += value;
			}
		}
	}
}
