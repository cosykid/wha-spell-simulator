// The golden-frame hook reads ?preset=&frameMs= at component init, which a
// prerendered page cannot do. The lab is a client-driven dev tool anyway.
export const prerender = false;
