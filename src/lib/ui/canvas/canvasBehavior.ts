import type { Attachment } from 'svelte/attachments';

/**
 * A Behavior is a mode of interaction on the canvas (e.g. drawing, selecting).
 */
export interface CanvasBehavior {
	/** Svelte attachment used to wire pointer listeners to the canvas. Apply with `{@attach behavior.attach}` on a `<canvas>`. */
	attach: Attachment<HTMLCanvasElement>;
	/** Optional render function for drawing an overlay when this behavior is active (e.g. live preview, selection handles). */
	render?: (ctx: CanvasRenderingContext2D, timestamp: number) => void;
	/** React to a backing-store resize. */
	onResize?: (scaleX: number, scaleY: number) => void;
}
