// The capture hook reads ?t= at component init, which a prerendered page cannot
// do. This is a throwaway bake-off route and only ever runs in a browser.
export const prerender = false;
