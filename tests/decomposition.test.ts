import assert from 'node:assert/strict';
import test from 'node:test';

import { CONFIG } from '../src/lib/config.js';
import { classifyDrawing } from '../src/lib/parser/classifier/index.js';
import { angleDegFromCenter, degreesToRadians } from '../src/lib/utils/geometry.js';
import { readRealDictionary } from './dictionaryFixtures.js';
import type {
	Dictionary,
	Point,
	SignEntry,
	SigilEntry,
	Stroke,
	StrokeTemplate
} from '../src/lib/types.js';

interface RotationTransform {
	cos: number;
	sin: number;
}

const ringCenter = { x: 400, y: 300 };

const sparkTemplate: StrokeTemplate = {
	sourceAspectRatio: 1,
	strokes: [
		[
			{ x: 0.5, y: 0.1 },
			{ x: 0.5, y: 0.9 }
		],
		[
			{ x: 0.1, y: 0.5 },
			{ x: 0.9, y: 0.5 }
		]
	]
};

const columnTemplate: StrokeTemplate = {
	sourceAspectRatio: 1,
	strokes: [
		[
			{ x: 0.5, y: 0.12 },
			{ x: 0.5, y: 0.8 }
		],
		[
			{ x: 0.18, y: 0.8 },
			{ x: 0.82, y: 0.8 }
		]
	]
};

const spark: SigilEntry = {
	id: 'spark',
	displayName: 'Spark',
	element: 'fire',
	allowedLayers: ['center', 'middle', 'outer'],
	recognitionRotationInvariant: true,
	strokeTemplate: sparkTemplate
};

const column: SignEntry = {
	id: 'column',
	displayName: 'Column',
	allowedLayers: ['center', 'middle', 'outer'],
	semantic: {
		manifestation: 'column',
		directionMode: 'inward'
	},
	strokeTemplate: columnTemplate
};

const dictionary: Dictionary = {
	sigils: [spark],
	signs: [column]
};

const realDictionary: Dictionary = readRealDictionary();

function arcStroke(
	id: string,
	centerX: number,
	centerY: number,
	radius: number,
	startDeg: number,
	endDeg: number,
	steps: number
): Stroke {
	const points: Point[] = [];

	for (let index = 0; index <= steps; index += 1) {
		const deg = startDeg + (endDeg - startDeg) * (index / steps);
		const radians = degreesToRadians(deg);
		points.push({
			x: centerX + Math.cos(radians) * radius,
			y: centerY + Math.sin(radians) * radius
		});
	}

	return { id, points };
}

function resampledStroke(id: string, controlPoints: Point[], spacing = 8): Stroke {
	const points: Point[] = [];

	for (let index = 1; index < controlPoints.length; index += 1) {
		const previous = controlPoints[index - 1];
		const current = controlPoints[index];
		const steps = Math.max(
			2,
			Math.ceil(Math.hypot(current.x - previous.x, current.y - previous.y) / spacing)
		);
		for (let step = 0; step < steps; step += 1) {
			const local = step / steps;
			points.push({
				x: previous.x + (current.x - previous.x) * local,
				y: previous.y + (current.y - previous.y) * local
			});
		}
	}
	points.push({ ...controlPoints[controlPoints.length - 1] });

	return { id, points };
}

function ringStrokes(): Stroke[] {
	return [
		arcStroke('ring-open', ringCenter.x, ringCenter.y, 180, 25, 335, 160),
		arcStroke('ring-close', ringCenter.x, ringCenter.y, 180, 335, 385, 32)
	];
}

function preparedRingStrokes(): Stroke[] {
	return [arcStroke('prepared-ring', ringCenter.x, ringCenter.y, 180, 25, 325, 160)];
}

function rotationTransform(degrees: number): RotationTransform | null {
	if (!degrees) {
		return null;
	}
	const radians = degreesToRadians(degrees);
	return {
		cos: Math.cos(radians),
		sin: Math.sin(radians)
	};
}

function rotatePoint(point: Point, center: Point, transform: RotationTransform | null): Point {
	if (!transform) {
		return point;
	}

	const x = point.x - center.x;
	const y = point.y - center.y;
	return {
		x: center.x + x * transform.cos - y * transform.sin,
		y: center.y + x * transform.sin + y * transform.cos
	};
}

function strokesFromTemplate(
	template: StrokeTemplate,
	idPrefix: string,
	centerX: number,
	centerY: number,
	scale: number,
	rotationDeg = 0
): Stroke[] {
	const center = { x: centerX, y: centerY };
	const rotate = rotationTransform(rotationDeg);
	return template.strokes.map((templateStroke, index) => ({
		id: `${idPrefix}-${index + 1}`,
		points: templateStroke.map((point) =>
			rotatePoint(
				{
					x: centerX + (point.x - 0.5) * scale,
					y: centerY + (point.y - 0.5) * scale
				},
				center,
				rotate
			)
		)
	}));
}

function signStrokesAt(
	idPrefix: string,
	centerX: number,
	centerY: number,
	scale: number
): Stroke[] {
	const angleDeg = angleDegFromCenter({ x: centerX, y: centerY }, ringCenter);
	return strokesFromTemplate(columnTemplate, idPrefix, centerX, centerY, scale, 270 - angleDeg);
}

function classify(strokes: Stroke[]) {
	return classifyDrawing({
		strokes: [...ringStrokes(), ...strokes],
		previousRing: null,
		dictionary,
		config: CONFIG
	});
}

function roughTriangleSigilStrokes(): Stroke[] {
	return [
		resampledStroke('rough-triangle', [
			{ x: ringCenter.x - 60, y: ringCenter.y + 30 },
			{ x: ringCenter.x, y: ringCenter.y - 60 },
			{ x: ringCenter.x + 65, y: ringCenter.y + 30 },
			{ x: ringCenter.x - 60, y: ringCenter.y + 30 }
		]),
		resampledStroke('rough-tail', [
			{ x: ringCenter.x, y: ringCenter.y + 30 },
			{ x: ringCenter.x, y: ringCenter.y + 75 }
		]),
		resampledStroke('rough-inner', [
			{ x: ringCenter.x + 10, y: ringCenter.y - 60 },
			{ x: ringCenter.x + 35, y: ringCenter.y + 20 }
		])
	];
}

function roughTouchingSignStrokes(): Stroke[] {
	const joint = { x: ringCenter.x + 105, y: ringCenter.y - 70 };
	return [
		resampledStroke('rough-sign-stem', [{ x: ringCenter.x + 135, y: ringCenter.y - 105 }, joint]),
		resampledStroke('rough-sign-bar', [joint, { x: ringCenter.x + 155, y: ringCenter.y - 70 }]),
		resampledStroke('rough-sign-arm', [joint, { x: ringCenter.x + 150, y: ringCenter.y - 105 }])
	];
}

/** A stroke through points given relative to the ring center. */
function centeredStroke(id: string, points: Array<[number, number]>, spacing?: number): Stroke {
	return resampledStroke(
		id,
		points.map(([x, y]) => ({ x: ringCenter.x + x, y: ringCenter.y + y })),
		spacing
	);
}

/** The sigils drawn as an S with detached marks around it. Rough marks read as either. */
const satelliteSigils = new Set(['wind-directs-air', 'aeroform']);

/** A hand-drawn S, the body that wind-directs-air and aeroform share. */
function bodyStroke(): Stroke {
	return centeredStroke('body', [
		[0, -61],
		[-16, -52],
		[-20, -34],
		[-8, -19],
		[16, -4],
		[32, 14],
		[16, 28],
		[-12, 28],
		[-20, 46],
		[-4, 61],
		[28, 55],
		[32, 40]
	]);
}

/** Three short ticks per side, each a little way off the body: wind-directs-air. */
function sideTickStrokes(): Stroke[] {
	return [
		centeredStroke('left-upper', [
			[-34, -48],
			[-46, -58]
		]),
		centeredStroke('left-bar', [
			[-36, -26],
			[-58, -26]
		]),
		centeredStroke('left-lower', [
			[-34, 40],
			[-46, 52]
		]),
		centeredStroke('right-upper', [
			[44, 2],
			[56, -10]
		]),
		centeredStroke('right-bar', [
			[46, 27],
			[68, 27]
		]),
		centeredStroke('right-lower', [
			[44, 58],
			[56, 70]
		])
	];
}

/** A fan of three strokes per side and a dot near each corner: aeroform. */
function fanAndDotStrokes(): Stroke[] {
	const dot = (id: string, x: number, y: number) =>
		centeredStroke(
			id,
			[
				[x, y],
				[x + 4, y - 4],
				[x, y - 6]
			],
			2
		);
	return [
		centeredStroke('left-fan-1', [
			[-26, -6],
			[-50, -18]
		]),
		centeredStroke('left-fan-2', [
			[-26, -2],
			[-54, -2]
		]),
		centeredStroke('left-fan-3', [
			[-26, 2],
			[-50, 14]
		]),
		centeredStroke('right-fan-1', [
			[40, 4],
			[64, -8]
		]),
		centeredStroke('right-fan-2', [
			[40, 8],
			[68, 8]
		]),
		centeredStroke('right-fan-3', [
			[40, 12],
			[64, 24]
		]),
		dot('dot-top-left', -30, -58),
		dot('dot-top-right', 18, -68),
		dot('dot-bottom-left', -22, 64),
		dot('dot-bottom-right', 36, 62)
	];
}

test('decomposition keeps one sigil and one sign as two candidates', () => {
	const result = classify([
		...strokesFromTemplate(sparkTemplate, 'spark', ringCenter.x, ringCenter.y, 70),
		...signStrokesAt('column', ringCenter.x, 420, 74)
	]);
	const ids = result.recognitions
		.filter((recognition) => recognition.recognized)
		.map((item) => item.id);

	assert.equal(result.ring.complete, true);
	assert.equal(result.candidates.length, 2);
	assert.deepEqual(new Set(ids), new Set(['spark', 'column']));
});

test('decomposition does not merge nearby but separate signs', () => {
	const result = classify([
		...signStrokesAt('left-column', 365, 420, 52),
		...signStrokesAt('right-column', 435, 420, 52)
	]);
	const columns = result.recognitions.filter(
		(recognition) => recognition.recognized && recognition.id === 'column'
	);

	assert.equal(columns.length, 2);
	assert.equal(result.candidates.length, 2);
	assert.ok(result.candidates.every((candidate) => candidate.strokeIds.length === 2));
});

test('decomposition keeps a multi-stroke sign grouped', () => {
	const result = classify(signStrokesAt('column', ringCenter.x, 420, 74));

	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].strokeIds.length, 2);
	assert.equal(result.recognitions[0].id, 'column');
});

test('decomposition leaves extra noise as an unknown or contaminated candidate', () => {
	const result = classify([
		...signStrokesAt('column', ringCenter.x, 420, 74),
		{
			id: 'noise',
			points: [
				{ x: 280, y: 350 },
				{ x: 310, y: 375 },
				{ x: 295, y: 405 }
			]
		}
	]);
	const noiseRecognition = result.recognitions.find((recognition) =>
		recognition.strokeIds.includes('noise')
	);

	assert.ok(noiseRecognition);
	assert.equal(noiseRecognition.recognized, false);
	assert.ok(['unknown', 'contaminated', 'ambiguous'].includes(noiseRecognition.recognitionStatus));
});

test('decomposition never recognizes ring strokes as symbols', () => {
	const result = classify(signStrokesAt('column', ringCenter.x, 420, 74));

	assert.ok(
		result.candidates.every(
			(candidate) =>
				!candidate.strokeIds.includes('ring-open') && !candidate.strokeIds.includes('ring-close')
		)
	);
});

test('decomposition keeps real dictionary sigils whole after stroke cleaning', () => {
	for (const sigil of realDictionary.sigils) {
		const result = classifyDrawing({
			strokes: [
				...ringStrokes(),
				...strokesFromTemplate(sigil.strokeTemplate!, sigil.id, ringCenter.x, ringCenter.y, 110)
			],
			previousRing: null,
			dictionary: realDictionary,
			config: CONFIG
		});

		assert.equal(result.candidates.length, 1, sigil.id);
		assert.equal(result.recognitions[0].id, sigil.id, sigil.id);
		assert.equal(result.recognitions[0].recognized, true, sigil.id);
	}
});

test('prepared open ring keeps sigil and sign separate on the fast grouping path', () => {
	const fire = realDictionary.sigils.find((sigil) => sigil.id === 'fire');
	const column = realDictionary.signs.find((sign) => sign.id === 'column');
	assert.ok(fire?.strokeTemplate);
	assert.ok(column?.strokeTemplate);

	const signCenter = { x: ringCenter.x, y: ringCenter.y - 120 };
	const signRotation = 270 - angleDegFromCenter(signCenter, ringCenter);
	const result = classifyDrawing({
		strokes: [
			...preparedRingStrokes(),
			...strokesFromTemplate(fire.strokeTemplate, 'fire', ringCenter.x, ringCenter.y, 96),
			...strokesFromTemplate(
				column.strokeTemplate,
				'column',
				signCenter.x,
				signCenter.y,
				74,
				signRotation
			)
		],
		previousRing: null,
		dictionary: realDictionary,
		config: CONFIG
	});
	const ids = result.recognitions
		.filter((recognition) => recognition.recognized)
		.map((recognition) => recognition.id);

	assert.equal(result.ring.found, true);
	assert.equal(result.ring.complete, false);
	assert.equal(result.candidates.length, 2);
	assert.ok(ids.includes('fire'));
	assert.ok(ids.includes('column'));
});

test('decomposition keeps rough center strokes together instead of accepting sign fragments', () => {
	const result = classify(roughTriangleSigilStrokes());
	const [candidate] = result.candidates;

	assert.equal(result.candidates.length, 1);
	assert.deepEqual(
		new Set(candidate.strokeIds),
		new Set(['rough-triangle', 'rough-tail', 'rough-inner'])
	);
	assert.equal(
		result.recognitions.some(
			(recognition) => recognition.recognized && recognition.kind === 'sign'
		),
		false
	);
});

test('decomposition keeps touching sign fragments together', () => {
	const result = classify(roughTouchingSignStrokes());
	const [candidate] = result.candidates;

	assert.equal(result.candidates.length, 1);
	assert.deepEqual(
		new Set(candidate.strokeIds),
		new Set(['rough-sign-stem', 'rough-sign-bar', 'rough-sign-arm'])
	);
	assert.equal(
		result.recognitions.some((recognition) => recognition.strokeIds.length === 1),
		false
	);
});

test('no-ring guide preview separates rough center and sign clusters', () => {
	const result = classifyDrawing({
		strokes: [...roughTriangleSigilStrokes(), ...roughTouchingSignStrokes()],
		previousRing: null,
		canvasWidth: ringCenter.x * 2,
		canvasHeight: ringCenter.y * 2,
		dictionary: realDictionary,
		config: CONFIG
	});
	const strokeSets = result.candidates.map((candidate) => new Set(candidate.strokeIds));

	assert.equal(result.ring.found, false);
	assert.equal(result.candidates.length, 2);
	assert.ok(
		strokeSets.some(
			(ids) =>
				ids.has('rough-triangle') &&
				ids.has('rough-tail') &&
				ids.has('rough-inner') &&
				ids.size === 3
		)
	);
	assert.ok(
		strokeSets.some(
			(ids) =>
				ids.has('rough-sign-stem') &&
				ids.has('rough-sign-bar') &&
				ids.has('rough-sign-arm') &&
				ids.size === 3
		)
	);
});

test('no-ring guide preview uses visible guide size for cover-square canvas size normalization', () => {
	const fire = realDictionary.sigils.find((sigil) => sigil.id === 'fire');
	assert.ok(fire?.strokeTemplate);
	const strokes = strokesFromTemplate(fire.strokeTemplate, 'fire', 600, 600, 110);

	const fullCanvas = classifyDrawing({
		strokes,
		previousRing: null,
		canvasWidth: 1200,
		canvasHeight: 1200,
		dictionary: realDictionary,
		config: CONFIG
	});
	const visibleGuide = classifyDrawing({
		strokes,
		previousRing: null,
		canvasWidth: 1200,
		canvasHeight: 1200,
		guideReferenceSize: 400,
		dictionary: realDictionary,
		config: CONFIG
	});

	assert.equal(fullCanvas.ring.found, false);
	assert.equal(visibleGuide.ring.found, false);
	assert.equal(visibleGuide.recognitions[0]?.id, 'fire');
	assert.ok(
		visibleGuide.candidates[0].sizeNorm > fullCanvas.candidates[0].sizeNorm * 2.9,
		`expected visible guide sizing to raise sizeNorm, got ${fullCanvas.candidates[0].sizeNorm} -> ${visibleGuide.candidates[0].sizeNorm}`
	);
});

test("decomposition keeps a sigil's detached ticks with its body", () => {
	const result = classifyDrawing({
		strokes: [...ringStrokes(), bodyStroke(), ...sideTickStrokes()],
		previousRing: null,
		dictionary: realDictionary,
		config: CONFIG
	});

	assert.equal(result.ring.complete, true);
	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].strokeIds.length, 7);
	assert.ok(satelliteSigils.has(result.recognitions[0].diagnostics?.bestGuess?.id ?? ''));
});

test("decomposition keeps a sigil's fans and dots with its body", () => {
	const result = classifyDrawing({
		strokes: [...ringStrokes(), bodyStroke(), ...fanAndDotStrokes()],
		previousRing: null,
		dictionary: realDictionary,
		config: CONFIG
	});

	assert.equal(result.ring.complete, true);
	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].strokeIds.length, 11);
	assert.ok(satelliteSigils.has(result.recognitions[0].diagnostics?.bestGuess?.id ?? ''));
});

test('no-ring guide preview keeps detached ticks with the center body', () => {
	const result = classifyDrawing({
		strokes: [bodyStroke(), ...sideTickStrokes()],
		previousRing: null,
		canvasWidth: ringCenter.x * 2,
		canvasHeight: ringCenter.y * 2,
		dictionary: realDictionary,
		config: CONFIG
	});

	assert.equal(result.ring.found, false);
	assert.equal(result.candidates.length, 1);
	assert.equal(result.candidates[0].strokeIds.length, 7);
});

test('decomposition separates a center sigil from an adjacent sign', () => {
	const fire = realDictionary.sigils.find((sigil) => sigil.id === 'fire');
	const column = realDictionary.signs.find((sign) => sign.id === 'column');
	assert.ok(fire?.strokeTemplate);
	assert.ok(column?.strokeTemplate);

	// A center sigil with a sign drawn close beside it. Affinity alone fuses them
	// into one component; the partition search must split them back into two.
	const signCenter = { x: ringCenter.x, y: 388 };
	const signRotation = 270 - angleDegFromCenter(signCenter, ringCenter);
	const result = classifyDrawing({
		strokes: [
			...ringStrokes(),
			...strokesFromTemplate(fire.strokeTemplate, 'fire', ringCenter.x, ringCenter.y, 90),
			...strokesFromTemplate(
				column.strokeTemplate,
				'sign',
				signCenter.x,
				signCenter.y,
				66,
				signRotation
			)
		],
		previousRing: null,
		dictionary: realDictionary,
		config: CONFIG
	});

	assert.equal(result.candidates.length, 2);
	const recognizedIds = result.recognitions
		.filter((recognition) => recognition.recognized)
		.map((recognition) => recognition.id);
	assert.ok(recognizedIds.includes('fire'));
	assert.ok(recognizedIds.includes('column'));
});

test('diagnostics preview a standalone sigil before a ring is drawn', () => {
	const fire = realDictionary.sigils.find((sigil) => sigil.id === 'fire');
	assert.ok(fire);

	const result = classifyDrawing({
		strokes: strokesFromTemplate(fire.strokeTemplate!, 'fire', ringCenter.x, ringCenter.y, 110),
		previousRing: null,
		dictionary: realDictionary,
		config: CONFIG
	});

	assert.equal(result.ring.found, false);
	assert.equal(result.glyphAST.primarySigil, null);
	assert.equal(result.candidates[0].candidateId, 'preview-symbol');
	assert.equal(result.recognitions[0].id, 'fire');
	assert.equal(result.recognitions[0].recognized, true);
});
