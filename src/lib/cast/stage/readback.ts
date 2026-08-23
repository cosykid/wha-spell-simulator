/**
 * @file The test-only readback signal, and the one place its name is written.
 *
 * WebGL throws a frame away the moment it is composited unless the context asked
 * to keep it, and keeping it costs a full-buffer copy per frame, so the shipped
 * stage never asks. A Playwright spec that reads the effect canvas back — the
 * beat coverage in `tests-e2e/helpers/castProbe.ts`, and the look tier's
 * screenshots of the scripted clock — needs the opposite.
 *
 * So a host turns it on for that one page, from `?castReadback=1` on its own
 * URL. Nothing in the app links here and the parameter is absent in production,
 * where this reads `false` and the stage behaves exactly as it always did.
 *
 * @example
 * new CastStage(canvas, { preserveDrawingBuffer: castReadbackRequested(location.search) });
 */

/** The query parameter a spec sets on the page it is about to read pixels off. */
export const CAST_READBACK_PARAM = 'castReadback';

/** Whether this page asked the stage to keep its frames readable. */
export function castReadbackRequested(search: string): boolean {
	return new URLSearchParams(search).get(CAST_READBACK_PARAM) === '1';
}
