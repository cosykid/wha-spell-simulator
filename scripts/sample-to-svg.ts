#!/usr/bin/env node
/**
 * Render a labelled handwriting sample to a standalone .svg, to verify that the
 * stored strokes + label can be reconstructed correctly.
 *
 * It draws the raw strokes in the canvas backing-store frame (`meta.canvasWidth/Height`)
 * and, unless `--no-label` is passed, overlays the reference glyph exactly where the
 * label places it. If the label is correct, the overlay sits on top of the ink — the
 * same picture the contributor saw in the Sample Maker.
 *
 * The overlay reuses the *original* SVG asset (`src/lib/dictionary/svg/<signId>.svg`)
 * and applies one transform composing the same math as `svgStrokes.ts` (viewBox →
 * unit box) and `shapeBaker.ts` (`bakePlacementToStrokes`: scale → rotate → translate):
 *
 *   translate(cx, cy) rotate(deg) scale(scaleX/span, scaleY/span) translate(-w/2, -h/2)
 *
 * where span = max(viewBoxW, viewBoxH), scaleX = scale_x * referenceSize, cx = translate_x,
 * and deg = angle (radians) in degrees. This matches the canvas placement exactly without
 * re-sampling the path, so the reconstruction is faithful by construction.
 *
 * Usage:
 *   node --import tsx scripts/sample-to-svg.ts <sample.json> [options]
 *
 * Options:
 *   -o, --out <file>   Write to <file>. Use "-" for stdout. Default: <input>.svg
 *   --no-label         Draw only the strokes, omit the reference glyph overlay.
 *   --svg-dir <dir>    Override the reference-SVG directory.
 *   -h, --help         Show this help.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import type { LabelledSample, SampleSubmission } from '../src/lib/structures/labelledSample.ts';

type Sample = SampleSubmission | LabelledSample;

interface Cli {
	input: string;
	out: string | null; // null → derive from input; "-" → stdout
	label: boolean;
	svgDir: string;
}

const DEFAULT_SVG_DIR = fileURLToPath(new URL('../src/lib/dictionary/svg/', import.meta.url));

// Ink styling for the rendered output.
const STROKE_COLOR = '#241b16';
const STROKE_WIDTH = 6;
const LABEL_COLOR = '#d068f0'; // matches the Sample Maker overlay
const LABEL_WIDTH = 4;

function parseArgs(argv: string[]): Cli {
	const cli: Cli = { input: '', out: null, label: true, svgDir: DEFAULT_SVG_DIR };
	for (let i = 0; i < argv.length; i += 1) {
		const arg = argv[i]!;
		switch (arg) {
			case '-h':
			case '--help':
				printHelpAndExit(0);
				break;
			case '-o':
			case '--out':
				cli.out = argv[++i] ?? null;
				break;
			case '--no-label':
				cli.label = false;
				break;
			case '--svg-dir':
				cli.svgDir = argv[++i] ?? cli.svgDir;
				break;
			default:
				if (arg.startsWith('-')) {
					fail(`Unknown option: ${arg}`);
				}
				if (cli.input) {
					fail(`Unexpected extra argument: ${arg}`);
				}
				cli.input = arg;
		}
	}
	if (!cli.input) {
		fail('Missing required <sample.json> argument.');
	}
	return cli;
}

function printHelpAndExit(code: number): never {
	// The leading doc comment is the help text; print a trimmed version.
	process.stdout.write(
		'Usage: node --import tsx scripts/sample-to-svg.ts <sample.json> [-o <file>] [--no-label] [--svg-dir <dir>]\n'
	);
	process.exit(code);
}

function fail(message: string): never {
	process.stderr.write(`sample-to-svg: ${message}\n`);
	process.exit(1);
}

/** Round to a few decimals to keep the SVG readable. */
function n(value: number): string {
	return Number(value.toFixed(3)).toString();
}

/** Pull viewBox size and the single path `d` from a normalized glyph SVG. */
function parseReferenceSvg(svgText: string): { width: number; height: number; d: string } {
	const viewBox = svgText.match(/viewBox\s*=\s*"([^"]+)"/);
	if (!viewBox) fail('Reference SVG has no viewBox.');
	const [, , width, height] = viewBox![1]!
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (!Number.isFinite(width) || !Number.isFinite(height)) {
		fail('Reference SVG has an unusable viewBox.');
	}
	const d = svgText.match(/<path[^>]*\sd\s*=\s*"([^"]+)"/);
	if (!d) fail('Reference SVG has no <path d="...">.');
	return { width: width!, height: height!, d: d![1]! };
}

/** Build the `<g>` that overlays the reference glyph where the label places it. */
function labelOverlay(sample: Sample, svgDir: string): string {
	const { label, meta } = sample;
	const svgPath = new URL(`${label.signId}.svg`, `file://${svgDir.replace(/\/?$/, '/')}`);
	let svgText: string;
	try {
		svgText = readFileSync(svgPath, 'utf8');
	} catch {
		fail(`Could not read reference SVG for signId "${label.signId}" at ${fileURLToPath(svgPath)}`);
	}
	const { width, height, d } = parseReferenceSvg(svgText);
	const span = Math.max(width, height) || 1;

	const scaleX = label.scale_x * meta.referenceSize;
	const scaleY = label.scale_y * meta.referenceSize;
	const cx = label.translate_x ?? meta.canvasWidth / 2;
	const cy = label.translate_y ?? meta.canvasHeight / 2;
	const deg = label.angle == null ? 0 : (label.angle * 180) / Math.PI;

	// Right-to-left: center the viewBox, scale to the placement size, rotate, translate.
	const transform =
		`translate(${n(cx)} ${n(cy)}) rotate(${n(deg)}) ` +
		`scale(${n(scaleX / span)} ${n(scaleY / span)}) translate(${n(-width / 2)} ${n(-height / 2)})`;

	// non-scaling-stroke keeps the line width constant despite the large scale factor.
	return (
		`  <g transform="${transform}">\n` +
		`    <path d="${d}" fill="none" stroke="${LABEL_COLOR}" stroke-width="${LABEL_WIDTH}" ` +
		`stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" ` +
		`opacity="0.85" />\n` +
		`  </g>`
	);
}

/** Render the contributor's strokes as polyline paths. */
function strokesMarkup(sample: Sample): string {
	return sample.data
		.map((stroke) => {
			const d = stroke.map((p, i) => `${i === 0 ? 'M' : 'L'}${n(p.x)} ${n(p.y)}`).join(' ');
			return (
				`  <path d="${d}" fill="none" stroke="${STROKE_COLOR}" stroke-width="${STROKE_WIDTH}" ` +
				`stroke-linecap="round" stroke-linejoin="round" />`
			);
		})
		.join('\n');
}

function renderSvg(sample: Sample, includeLabel: boolean, svgDir: string): string {
	const { canvasWidth: w, canvasHeight: h } = sample.meta;
	const parts = [
		`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(w)} ${n(h)}" width="${n(w)}" height="${n(h)}">`,
		`  <rect x="0" y="0" width="${n(w)}" height="${n(h)}" fill="#ffffff" stroke="#e0d9d2" />`,
		strokesMarkup(sample)
	];
	if (includeLabel) {
		parts.push(labelOverlay(sample, svgDir));
	}
	parts.push('</svg>\n');
	return parts.join('\n');
}

function main(): void {
	const cli = parseArgs(process.argv.slice(2));

	let sample: Sample;
	try {
		sample = JSON.parse(readFileSync(cli.input, 'utf8')) as Sample;
	} catch (error) {
		fail(`Could not read/parse ${cli.input}: ${(error as Error).message}`);
	}
	if (!sample!.data || !sample!.label || !sample!.meta) {
		fail('Input is not a labelled sample (expected data/label/meta).');
	}

	const svg = renderSvg(sample!, cli.label, cli.svgDir);

	const outPath = cli.out ?? cli.input.replace(/(\.json)?$/i, '.svg');
	if (outPath === '-') {
		process.stdout.write(svg);
	} else {
		writeFileSync(outPath, svg);
		process.stderr.write(`Wrote ${outPath}\n`);
	}
}

main();
