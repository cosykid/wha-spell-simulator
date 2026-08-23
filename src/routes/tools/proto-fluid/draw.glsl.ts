/**
 * @file The parcel program: one instanced quad per texel of the simulation,
 * billboarded in view space and stretched along its own screen velocity.
 *
 * Blending is premultiplied `ONE / ONE_MINUS_SRC_ALPHA`, and the fragment
 * program chooses where on that scale each parcel sits. A cooled parcel writes
 * full alpha and composites *over* what is behind it, which is what keeps the
 * body reading as pigment. Only the hottest sliver drops its alpha to zero,
 * which turns the same blend into a pure add for the core and nothing else.
 */

export const PARCEL_VERTEX = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uSize;
uniform float uGrowth;
uniform float uStretch;

attribute vec2 aParcel;

varying float vAge;
varying float vMote;
varying vec2 vQuad;
varying float vSeed;

void main() {
	vec4 p = texture2D(uPos, aParcel);
	vec4 v = texture2D(uVel, aParcel);
	float life = abs(v.w);
	float age = clamp(p.w / max(life, 1e-4), 0.0, 1.0);
	float alive = step(p.w, life) * step(1e-4, life);

	vAge = age;
	vMote = step(v.w, -1e-4);
	vSeed = fract(dot(aParcel, vec2(97.31, 41.17)));
	vQuad = position.xy;

	vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
	vec3 mvVel = (modelViewMatrix * vec4(v.xyz, 0.0)).xyz;
	float speed = length(mvVel.xy);
	vec2 along = speed > 1e-4 ? mvVel.xy / speed : vec2(0.0, 1.0);
	vec2 across = vec2(-along.y, along.x);

	// Born small, swelling as it cools, and fading in over the first sliver of
	// life so nothing pops into the frame.
	float grow = mix(0.55, uGrowth, smoothstep(0.0, 0.85, age));
	float size = uSize * mix(grow, 1.7, vMote) * alive;
	// Stretch belongs to the wisps, not the nozzle: a young fast parcel drawn as a
	// streak is a countable shard, an old one is a lick.
	float stretch = 1.0 + uStretch * min(speed, 3.2) * (0.25 + 1.15 * age);

	mv.xy += along * (position.y * size * stretch) + across * (position.x * size);
	gl_Position = projectionMatrix * mv;
}
`;

export const PARCEL_FRAGMENT = /* glsl */ `
uniform sampler2D uSprite;
uniform float uOpacity;
uniform float uCoreAge;
uniform vec3 uCore;
uniform vec3 uAmber;
uniform vec3 uOrange;
uniform vec3 uVermilion;
uniform vec3 uEmber;
uniform vec3 uSoot;
uniform vec3 uMote;

varying float vAge;
varying float vMote;
varying vec2 vQuad;
varying float vSeed;

// The pigment ramp: warm near-white only at the very core, then amber, deep
// orange, vermilion, and out through ember to soot.
vec3 pigment(float age) {
	vec3 c = mix(uCore, uAmber, smoothstep(0.0, 0.13, age));
	c = mix(c, uOrange, smoothstep(0.24, 0.56, age));
	c = mix(c, uVermilion, smoothstep(0.54, 0.8, age));
	c = mix(c, uEmber, smoothstep(0.76, 0.92, age));
	return mix(c, uSoot, smoothstep(0.88, 1.0, age));
}

void main() {
	// Four torn stamps in one atlas, picked and spun per parcel, so no two
	// neighbours share a silhouette.
	float spin = vSeed * 6.2831853;
	float cs = cos(spin);
	float sn = sin(spin);
	vec2 local = mat2(cs, -sn, sn, cs) * vQuad;
	if (max(abs(local.x), abs(local.y)) > 0.5) {
		discard;
	}
	vec2 tile = vec2(floor(fract(vSeed * 3.77) * 2.0), floor(fract(vSeed * 8.13) * 2.0));
	vec4 stamp = texture2D(uSprite, (local + 0.5) * 0.5 + tile * 0.5);

	float fadeIn = smoothstep(0.0, 0.06, vAge);
	float fadeOut = 1.0 - smoothstep(0.56, 0.98, vAge);
	float alpha =
		stamp.a * uOpacity * fadeIn * fadeOut * (0.6 + 0.65 * stamp.b) * mix(1.0, 0.075, vMote);
	if (alpha < 0.0015) {
		discard;
	}

	// Neighbouring parcels sit at slightly different places on the ramp, which is
	// what keeps a flat wash from forming across the body.
	float shadeSeed = fract(vSeed * 61.7);
	float shade = clamp(vAge * (0.65 + 0.72 * shadeSeed) + (shadeSeed - 0.5) * 0.06, 0.0, 1.0);
	float hot = (1.0 - smoothstep(0.0, uCoreAge, shade)) * stamp.g * (1.0 - vMote);
	vec3 colour = mix(pigment(shade), uMote, vMote);
	// Premultiplied. Hot parcels give up their alpha, so the same blend adds them.
	gl_FragColor = vec4(colour * alpha * (1.0 + 1.05 * hot), alpha * (1.0 - 0.86 * hot));
}
`;
