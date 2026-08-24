/**
 * @file The flow field as GLSL: the shader half of the law `flow.ts` writes on
 * the CPU. Same hash, same value noise, same curl, same terms, same constants.
 * **Change one and change the other.**
 *
 * One parcel is one texel. Which channel it belongs to is a lookup rather than a
 * branch: `uRow` maps the texel's row to a channel index and `uParams` holds
 * that channel's {@link import('./flow.js').FlowShape} as a row of texels, laid
 * out by `params.ts`.
 */

import { FLOW } from './tuning.js';
import { MAX_CHANNELS, PARAM_SLOT, PARAM_TEXELS } from './params.js';

function num(value: number): string {
	return Number.isInteger(value) ? `${value}.0` : String(value);
}

/** Uniforms, hash, noise, curl, the params lookup, and the boundary. */
export const FLOW_COMMON = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform sampler2D uParams;
uniform sampler2D uRow;
uniform float uDt;
uniform float uTime;
uniform float uSalt;
/**
 * The turbulence multiplier for this step, and the whole performance budget of
 * the substrate. Two curl octaves cost about two hundred hashes a parcel, which
 * is more than everything else in the field put together, so the impulse is
 * applied on one step in three at three times the gain. The time average is the
 * same and the cadence is 25ms, which nothing can see. It is uniform rather than
 * per parcel on purpose: a staggered branch diverges and saves nothing.
 */
uniform float uTurb;

varying vec2 vUv;

const float SILHOUETTE = ${num(FLOW.silhouette)};
const float NOISE_SCALE = ${num(FLOW.noiseScale)};
const float NOISE_RISE = ${num(FLOW.noiseRise)};
const float LOBE_THREE = ${num(FLOW.lobeThree)};
const float LOBE_TWO = ${num(FLOW.lobeTwo)};
const float LOBE_SHEAR = ${num(FLOW.lobeShear)};
const float PARAM_TEXELS = ${num(PARAM_TEXELS)};
const float MAX_CHANNELS = ${num(MAX_CHANNELS)};

float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

// One draw from this parcel's stream. Same uv and salt give the same number in
// both passes, which is what keeps the two spawns in agreement.
float draw(float k) {
	return hash13(vec3(vUv * 313.0, uSalt * 7.13 + k * 19.77));
}

float vnoise(vec3 p) {
	vec3 i = floor(p);
	vec3 f = fract(p);
	vec3 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
	float n000 = hash13(i);
	float n100 = hash13(i + vec3(1.0, 0.0, 0.0));
	float n010 = hash13(i + vec3(0.0, 1.0, 0.0));
	float n110 = hash13(i + vec3(1.0, 1.0, 0.0));
	float n001 = hash13(i + vec3(0.0, 0.0, 1.0));
	float n101 = hash13(i + vec3(1.0, 0.0, 1.0));
	float n011 = hash13(i + vec3(0.0, 1.0, 1.0));
	float n111 = hash13(i + vec3(1.0, 1.0, 1.0));
	float x00 = mix(n000, n100, u.x);
	float x10 = mix(n010, n110, u.x);
	float x01 = mix(n001, n101, u.x);
	float x11 = mix(n011, n111, u.x);
	return mix(mix(x00, x10, u.y), mix(x01, x11, u.y), u.z) * 2.0 - 1.0;
}

vec3 potential(vec3 p) {
	return vec3(vnoise(p), vnoise(p + 41.7), vnoise(p - 27.3));
}

// Curl of a noise potential: divergence free, so the flow folds instead of
// spraying. Forward differences, four potential samples rather than six.
vec3 curlNoise(vec3 p) {
	const float e = 0.34;
	vec3 p0 = potential(p);
	vec3 px = potential(p + vec3(e, 0.0, 0.0));
	vec3 py = potential(p + vec3(0.0, e, 0.0));
	vec3 pz = potential(p + vec3(0.0, 0.0, e));
	return vec3(
		(py.z - p0.z) - (pz.y - p0.y),
		(pz.x - p0.x) - (px.z - p0.z),
		(px.y - p0.y) - (py.x - p0.x)
	);
}

// One channel's shape, straight off the params texture. The field never asks
// which archetype it is performing: an archetype is these numbers.
struct Shape {
	vec3 origin;
	float footprint;
	vec3 axis;
	float reach;
	float speed;
	float buoyancy;
	float converge;
	float swirl;
	float sink;
	vec2 drift;
	float ceiling;
	float gather;
	float holdRadius;
	float turbulence;
	float drag;
	float narrow;
	float wander;
	float lobePhase;
	float pool;
	float life;
	float lifeSpread;
	float spawn;
	float siteCount;
	float emission;
	float punch;
	float burn;
	float row;
};

vec4 paramAt(float row, float slot) {
	return texture2D(uParams, vec2((slot + 0.5) / PARAM_TEXELS, (row + 0.5) / MAX_CHANNELS));
}

Shape shapeHere() {
	Shape s;
	s.row = floor(texture2D(uRow, vec2(0.5, vUv.y)).r * MAX_CHANNELS + 0.5);
	vec4 a = paramAt(s.row, ${num(PARAM_SLOT.origin)});
	vec4 b = paramAt(s.row, ${num(PARAM_SLOT.axis)});
	vec4 c = paramAt(s.row, ${num(PARAM_SLOT.drive)});
	vec4 d = paramAt(s.row, ${num(PARAM_SLOT.field)});
	vec4 e = paramAt(s.row, ${num(PARAM_SLOT.hold)});
	vec4 f = paramAt(s.row, ${num(PARAM_SLOT.shape)});
	vec4 g = paramAt(s.row, ${num(PARAM_SLOT.life)});
	vec4 h = paramAt(s.row, ${num(PARAM_SLOT.arc)});
	s.origin = a.xyz;
	s.footprint = a.w;
	s.axis = b.xyz;
	s.reach = max(b.w, 0.001);
	s.speed = c.x;
	s.buoyancy = c.y;
	s.converge = c.z;
	s.swirl = c.w;
	s.sink = d.x;
	s.drift = d.yz;
	s.ceiling = d.w;
	s.gather = e.x;
	s.holdRadius = e.y;
	s.turbulence = e.z;
	s.drag = e.w;
	s.narrow = f.x;
	s.wander = f.y;
	s.lobePhase = f.z;
	s.pool = f.w;
	s.life = g.x;
	s.lifeSpread = g.y;
	s.spawn = g.z;
	s.siteCount = g.w;
	s.emission = h.x;
	s.punch = h.z;
	s.burn = h.w;
	return s;
}

vec4 siteAt(Shape s, float index) {
	return paramAt(s.row, ${num(PARAM_SLOT.sites)} + index);
}

// Height along the axis, distance off it, and the ray back onto it.
void axisFrame(Shape s, vec3 p, out float along, out float radius, out vec3 inward, out float angle) {
	vec3 d = p - s.origin;
	along = dot(d, s.axis);
	vec3 off = d - s.axis * along;
	radius = length(off);
	inward = radius > 1e-5 ? -off / radius : vec3(0.0);
	// Measured in the seal plane: the lobes must stand still on screen, so a
	// leaning axis may not spin them.
	angle = atan(d.y, d.x);
}

// The radius the mass is pinched to here. Two standing lobes shear with height
// so the silhouette never settles into a nameable cone.
float boundaryRadius(Shape s, float angle, float along) {
	float hn = clamp(along / s.reach, 0.0, 1.6);
	float base = s.footprint * (1.0 - s.narrow * smoothstep(0.0, 0.95, hn)) + 0.04;
	float lobes = 1.0
		+ LOBE_THREE * sin(angle * 3.0 + s.lobePhase)
		+ LOBE_TWO * sin(angle * 2.0 - s.lobePhase * 1.7 + along * LOBE_SHEAR);
	vec2 at = vec2(cos(angle), sin(angle)) * base;
	return base * lobes * (1.0 + s.wander * vnoise(vec3(at * 1.5, uTime * 0.6 + along * 1.3)));
}
`;

/** The force block. Mirrored digit for digit by `flowAccel` in `flow.ts`. */
export const FLOW_FORCE = /* glsl */ `
vec3 flowAccel(Shape s, vec3 p, float age01) {
	float along;
	float radius;
	vec3 inward;
	float angle;
	axisFrame(s, p, along, radius, inward, angle);
	float hn = clamp(along / s.reach, 0.0, 1.6);
	float heat = 1.0 - age01;

	// Drive along the shape's own axis, strongest while hot and low.
	vec3 acc = s.axis * (s.buoyancy * pow(heat, 1.15) * (1.0 - 0.22 * smoothstep(0.7, 1.3, hn)));

	// The pinch, toward the wandering, lobed boundary.
	float target = boundaryRadius(s, angle, along);
	acc += inward * (s.converge * 9.0 * max(radius - target, 0.0) + s.converge * 0.7 * heat);

	// Swirl about the axis.
	acc += cross(s.axis, inward) * (s.swirl * radius);

	// The signed sink, in the seal plane: one term for a pull and its inversion.
	// A ring attractor at the pool radius rather than a sink at the origin: matter
	// gathers at a radius and is gently pushed back out of the exact centre, so
	// nothing piles into a singularity there.
	vec2 planar = p.xy - s.origin.xy;
	float planarLen = length(planar);
	if (planarLen > 1e-5) {
		float pool = max(s.pool, 0.001);
		float past = planarLen - pool;
		acc.xy += (-planar / planarLen) * (s.sink * past / (abs(past) + pool));
	}

	acc.xy += s.drift;

	// Containment: outside its shell the mass is drawn back onto the locus.
	if (s.gather > 0.0) {
		vec3 toward = s.origin - p;
		float distance = length(toward);
		float past = distance - s.holdRadius;
		if (distance > 1e-5 && past > 0.0) {
			acc += toward * (s.gather * past / distance);
		}
	}

	// The lid: a plane-hugging flow is one that is pushed back down above it.
	if (s.ceiling > 0.0 && p.z > s.ceiling) {
		acc.z -= (p.z - s.ceiling) * 6.0;
	}

	if (uTurb > 0.0) {
		vec3 q = vec3(p.xy * NOISE_SCALE, p.z * NOISE_SCALE - uTime * NOISE_RISE);
		float gain = s.turbulence * uTurb
			* (0.48 + 1.4 * smoothstep(0.0, 0.55, hn) + 0.55 * s.punch)
			* (0.5 + 0.7 * age01);
		acc += curlNoise(q) * gain + curlNoise(q * 2.9 + 13.7) * (gain * 0.52);
	}
	return acc;
}
`;
