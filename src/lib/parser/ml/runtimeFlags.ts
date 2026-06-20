/** Batched ONNX inference over multiple candidates in one session.run. Enabled for the
 * dynamic-batch export; the prediction path falls back to single-candidate runs on error. */
export const BATCH_INFERENCE_PROBE_ENABLED = true;
