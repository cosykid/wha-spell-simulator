/**
 * @file Main list of tools and their descriptions.
 */

import type { RouteId } from '$app/types';

interface Tool {
	/** The path to the tool's page */
	path: RouteId;
	eyebrow: string;
	title: string;
	description: string;
	/** Set to true if the tool needs to show a status indicator in the header */
	showStatus?: boolean;
}

export const tools = [
	{
		path: '/tools/stroke-template-maker',
		eyebrow: 'Template Tool',
		title: 'Stroke Template Maker',
		description:
			'Draw a sigil or sign and export a normalized strokeTemplate to paste into the dictionary.',
		showStatus: true
	},
	{
		path: '/tools/stroke-template-viewer',
		eyebrow: 'Template Tool',
		title: 'Stroke Template Viewer',
		description:
			'Paste a strokeTemplate or dictionary entry to preview its strokes and inspect its metrics.',
		showStatus: true
	},
	{
		path: '/tools/sigil-sign-detector-lab',
		eyebrow: 'Detector Tool',
		title: 'Sigil/Sign Detector Lab',
		description:
			'Draw one symbol and watch the recognizer score it against the dictionary in real time.',
		showStatus: true
	},
	{
		path: '/tools/spell-effect-lab',
		eyebrow: 'Effect Tool',
		title: 'Spell Effect Lab',
		description:
			'Tune a synthetic SpellIR with sliders to preview and refine the animated element effects.',
		showStatus: false
	},
	{
		path: '/tools/sample-maker',
		eyebrow: 'Dataset Tool',
		title: 'Sample Maker',
		description: 'Create a labelled sample for benchmarking sign/sigil recognition.',
		showStatus: false
	},
	{
		path: '/tools/sample-reviewer',
		eyebrow: 'Dataset Tool',
		title: 'Sample Reviewer',
		description:
			'Browse stored labelled samples and check each drawing against its reference-glyph label.',
		showStatus: false
	},
	{
		path: '/tools/leaderboard',
		eyebrow: 'Dataset Tool',
		title: 'Leaderboard',
		description:
			'Rank drawing contributions by Discord handle, by total and approved sample counts.',
		showStatus: false
	}
] satisfies Tool[];
