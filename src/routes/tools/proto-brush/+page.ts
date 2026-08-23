// The capture hook reads `?frameMs=` at component init, which a prerendered
// page cannot do. Throwaway bake-off prototype: client-driven only.
export const prerender = false;
