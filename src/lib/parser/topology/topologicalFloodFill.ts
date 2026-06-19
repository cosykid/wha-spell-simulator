import type { AppConfig, Stroke } from '../../types.js';
import { MIN_ENCLOSED_AREA_PX, MIN_ENCLOSED_AREA_RATIO, MIN_PERFECTION } from './constants.js';
import { scoreCircle } from './circleScore.js';
import { collectOutsideEdge, findDryComponents, floodExterior } from './floodFill.js';
import { countCells, createRaster, rasterizeStrokes } from './raster.js';
import type { TopologyResult } from './types.js';

/**
 * Tests whether strokes enclose a ring-like dry area.
 *
 * Closure is a topology test first, then a circle-quality test: rasterize ink,
 * flood-fill exterior empty space, find unreachable dry cells, and verify that
 * their outside ink edge is circular enough to be the spell boundary.
 */
export function analyzeTopologicalClosure(strokes: Stroke[], config: AppConfig): TopologyResult {
	if (!strokes.length) {
		return {
			closed: false,
			enclosedAreaPx: 0,
			componentCount: 0,
			edgePixelCount: 0,
			strokeIds: []
		};
	}

	const raster = createRaster(strokes);
	rasterizeStrokes(strokes, raster);
	floodExterior(raster);

	const dry = findDryComponents(raster);
	const enclosedAreaPx = dry.largest.length * raster.cellSize * raster.cellSize;
	const boundsAreaPx = raster.width * raster.height * raster.cellSize * raster.cellSize;
	const minAreaPx = Math.max(MIN_ENCLOSED_AREA_PX, boundsAreaPx * MIN_ENCLOSED_AREA_RATIO);
	const edge = collectOutsideEdge(raster);
	const circle = scoreCircle(edge.edgePixels);
	const closed =
		enclosedAreaPx >= minAreaPx &&
		circle.radius >= config.ring.minRadius &&
		circle.perfection >= MIN_PERFECTION;

	return {
		closed,
		enclosedAreaPx,
		minEnclosedAreaPx: minAreaPx,
		componentCount: dry.componentCount,
		center: circle.center,
		radius: circle.radius,
		rmse: circle.rmse,
		normalizedRmse: circle.normalizedRmse,
		perfection: circle.perfection,
		edgePixelCount: edge.edgePixels.length,
		edgePixels: edge.edgePixels,
		strokeIds: edge.strokeIds,
		raster: {
			width: raster.width,
			height: raster.height,
			cellSize: raster.cellSize,
			offsetX: raster.offsetX,
			offsetY: raster.offsetY,
			blockedPixelCount: countCells(raster.blocked),
			waterPixelCount: countCells(raster.water),
			dryPixelCount: dry.largest.length
		}
	};
}
