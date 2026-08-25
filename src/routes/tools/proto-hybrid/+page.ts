// The bake-off route reads `?frameMs=` at component init to script its clock,
// which a prerendered page cannot do.
export const prerender = false;
