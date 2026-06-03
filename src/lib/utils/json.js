/**
 * Recursively rounds every finite number in a JSON-serializable value to a
 * fixed precision. Used by the diagnostic tools to keep pasted/exported JSON
 * readable. Non-numbers, arrays, and nested objects are preserved.
 */
export function roundDeep(value, factor = 1000) {
  if (Array.isArray(value)) {
    return value.map((item) => roundDeep(item, factor));
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, roundDeep(item, factor)])
    );
  }
  return typeof value === "number" ? Math.round(value * factor) / factor : value;
}
