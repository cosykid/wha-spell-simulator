// The bake-off route reads `?style=&element=&frameMs=` at component init to
// script its clock, which a prerendered page cannot do.
export const prerender = false;
