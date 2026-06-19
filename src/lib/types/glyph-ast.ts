// GlyphAST — the parser's structured output for a whole drawn glyph.

import type { Stroke } from './geometry.js';
import type { RingInfo } from './rings.js';
import type { Recognition, SymbolCandidate } from './recognition.js';

export interface GlobalMetrics {
	neatness: number;
	radialSymmetry: number;
	instability: number;
}

export interface GlyphAST {
	type: 'GlyphAST';
	version?: string;
	ring: RingInfo;
	candidates?: unknown[];
	primarySigil: Recognition | null;
	unsupportedMultipleSigils?: unknown[];
	signs: Recognition[];
	unknowns: unknown[];
	globalMetrics: GlobalMetrics;
	warnings: string[];
}

export interface ClassifiedDrawing {
	cleanedStrokes: Stroke[];
	ring: RingInfo;
	classifications: unknown[];
	candidates: SymbolCandidate[];
	recognitions: Recognition[];
	glyphAST: GlyphAST;
}
