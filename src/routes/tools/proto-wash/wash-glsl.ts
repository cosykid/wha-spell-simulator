/**
 * @file GLSL the proxies and the post chain both need: cheap value noise in two
 * and three dimensions, and the pigment ramp the whole style is judged on.
 *
 * The ramp is the style bar's palette rule written as code rather than as taste:
 * soot, burnt umber, deep orange, vermilion, amber, and a warm near-white that is
 * gated on the heat channel so it can only ever appear at the core. There is no
 * path through this function that produces a cyan, and none that produces a
 * saturated glow line.
 */

/** Hash-based value noise. Small, seamless enough, and cheap in a vertex shader. */
export const NOISE_GLSL = /* glsl */ `
float washHash21(vec2 p) {
	p = fract(p * vec2(123.34, 456.21));
	p += dot(p, p + 45.32);
	return fract(p.x * p.y);
}

float washHash31(vec3 p) {
	p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
	p *= 17.0;
	return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}

float washNoise2(vec2 x) {
	vec2 i = floor(x);
	vec2 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	return mix(
		mix(washHash21(i), washHash21(i + vec2(1.0, 0.0)), f.x),
		mix(washHash21(i + vec2(0.0, 1.0)), washHash21(i + vec2(1.0, 1.0)), f.x),
		f.y
	);
}

float washNoise3(vec3 x) {
	vec3 i = floor(x);
	vec3 f = fract(x);
	f = f * f * (3.0 - 2.0 * f);
	float n000 = washHash31(i);
	float n100 = washHash31(i + vec3(1.0, 0.0, 0.0));
	float n010 = washHash31(i + vec3(0.0, 1.0, 0.0));
	float n110 = washHash31(i + vec3(1.0, 1.0, 0.0));
	float n001 = washHash31(i + vec3(0.0, 0.0, 1.0));
	float n101 = washHash31(i + vec3(1.0, 0.0, 1.0));
	float n011 = washHash31(i + vec3(0.0, 1.0, 1.0));
	float n111 = washHash31(i + vec3(1.0, 1.0, 1.0));
	return mix(
		mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
		mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y),
		f.z
	);
}

float washFbm2(vec2 p) {
	float sum = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 4; i++) {
		sum += amp * washNoise2(p);
		p *= 2.07;
		amp *= 0.5;
	}
	return sum;
}

float washFbm3(vec3 p) {
	float sum = 0.0;
	float amp = 0.5;
	for (int i = 0; i < 3; i++) {
		sum += amp * washNoise3(p);
		p *= 2.03;
		amp *= 0.5;
	}
	return sum;
}
`;

/**
 * Mixed pigment, not a gradient: six milled colours laid down in order of how much
 * water is in the wash. `heatGate` is the only way to the near-white, so the core
 * cannot spread into a neon rim however bright the density gets.
 */
export const PIGMENT_GLSL = /* glsl */ `
const vec3 WASH_SOOT = vec3(0.153, 0.129, 0.114);
const vec3 WASH_UMBER = vec3(0.353, 0.176, 0.086);
const vec3 WASH_DEEP = vec3(0.639, 0.239, 0.063);
const vec3 WASH_VERMILION = vec3(0.851, 0.310, 0.098);
const vec3 WASH_AMBER = vec3(0.933, 0.635, 0.180);
const vec3 WASH_CORE = vec3(0.992, 0.949, 0.839);

vec3 washPigment(float wash, float heat) {
	// Two gates, on purpose. The warm pigments open early, because a flame is
	// warm nearly everywhere; the near-white opens only where the field says the
	// core is, so it can never spread into a rim.
	float warmGate = smoothstep(0.08, 0.50, heat);
	float coreGate = smoothstep(0.56, 0.92, heat);
	vec3 pigment = mix(WASH_SOOT, WASH_UMBER, smoothstep(0.00, 0.28, wash));
	pigment = mix(pigment, WASH_DEEP, smoothstep(0.14, 0.40, wash) * mix(0.30, 1.0, warmGate));
	pigment = mix(pigment, WASH_VERMILION, smoothstep(0.32, 0.58, wash) * mix(0.20, 1.0, warmGate));
	pigment = mix(pigment, WASH_AMBER, smoothstep(0.58, 0.84, wash) * warmGate);
	pigment = mix(pigment, WASH_CORE, smoothstep(0.88, 1.0, wash) * coreGate);
	return pigment;
}
`;
