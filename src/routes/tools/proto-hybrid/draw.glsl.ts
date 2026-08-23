/**
 * @file The parcel program: one instanced quad per texel of the simulation,
 * billboarded in view space and stretched along its own screen velocity.
 *
 * Blending is premultiplied `ONE / ONE_MINUS_SRC_ALPHA`, and the fragment
 * program chooses where on that scale each parcel sits. A cooled parcel writes
 * full alpha and composites *over* what is behind it, which is what keeps the
 * body reading as pigment. Only the hottest sliver drops its alpha to zero,
 * which turns the same blend into a pure add for the core and nothing else.
 *
 * Two things here answer the fluid parent's known faults. Down at the paper the
 * sprite swells and its opacity falls, so the base is a stack of overlapping
 * washes rather than a carpet of countable specks; and the warm near-white is
 * gated to a sliver near the axis and off the plate, so brightness is a place
 * inside the mass and not a property of being young.
 */

import { PIGMENT_GLSL } from './palette.js';

export const PARCEL_VERTEX = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uSize;
uniform float uGrowth;
uniform float uStretch;
uniform float uBaseWashZ;
uniform float uBaseSwell;
uniform float uCoreRadius;
uniform float uCoreFloorZ;
uniform float uCoreTopZ;
uniform float uPunchMax;
uniform float uPunchSwell;

attribute vec2 aParcel;

varying float vAge;
varying float vMote;
varying vec2 vQuad;
varying float vSeed;
varying float vLow;
varying float vCore;
varying float vPunch;

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

	float radius = length(p.xy);
	// How close to the plate this parcel sits. It is the whole base fix: a mark
	// here is wide and thin, so the foot is built out of overlap.
	vLow = (1.0 - smoothstep(0.0, uBaseWashZ, p.z)) * (1.0 - vMote);
	// The core is a place inside the mass: a sliver near the axis, lifted off the
	// paper and spent well below the crown. Nowhere else may reach the white band.
	vCore =
		smoothstep(0.0, uCoreFloorZ, p.z) *
		(1.0 - smoothstep(uCoreTopZ * 0.45, uCoreTopZ, p.z)) *
		(1.0 - smoothstep(uCoreRadius * 0.45, uCoreRadius, radius));
	vPunch = step(life, uPunchMax) * (1.0 - vMote) * alive;
	float punch = vPunch;

	vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
	vec3 mvVel = (modelViewMatrix * vec4(v.xyz, 0.0)).xyz;
	float speed = length(mvVel.xy);
	vec2 along = speed > 1e-4 ? mvVel.xy / speed : vec2(0.0, 1.0);
	vec2 across = vec2(-along.y, along.x);

	// Born small, swelling as it cools, and fading in over the first sliver of
	// life so nothing pops into the frame.
	float grow = mix(0.55, uGrowth, smoothstep(0.0, 0.85, age));
	float size =
		uSize * mix(grow, 1.3, vMote) * (1.0 + uBaseSwell * vLow) * (1.0 + uPunchSwell * punch) * alive;
	// Stretch belongs to the wisps and to the blast, not to the plate: a small
	// fast mark drawn as a streak down there is exactly the countable shard.
	float stretch =
		1.0 +
		uStretch * min(speed, 3.4) * (0.25 + 1.15 * age) * (1.0 - 0.78 * vLow) * (1.0 + 0.3 * punch);

	mv.xy += along * (position.y * size * stretch) + across * (position.x * size);
	gl_Position = projectionMatrix * mv;
}
`;

export const PARCEL_FRAGMENT = /* glsl */ `
uniform sampler2D uSprite;
uniform float uOpacity;
uniform float uCoreAge;
uniform float uBaseOpacity;
uniform vec3 uMoteInk;

varying float vAge;
varying float vMote;
varying vec2 vQuad;
varying float vSeed;
varying float vLow;
varying float vCore;
varying float vPunch;

${PIGMENT_GLSL}

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

	float fadeIn = smoothstep(0.0, 0.11, vAge);
	float fadeOut = 1.0 - smoothstep(0.46, 0.86, vAge);
	float alpha =
		stamp.a *
		uOpacity *
		fadeIn *
		fadeOut *
		(0.6 + 0.65 * stamp.b) *
		mix(1.0, 0.035, vMote) *
		mix(1.0, uBaseOpacity, vLow);
	if (alpha < 0.0015) {
		discard;
	}

	// Neighbouring parcels sit at slightly different places on the ramp, which is
	// what keeps a flat wash from forming across the body.
	float shadeSeed = fract(vSeed * 61.7);
	// The punch burns out rather than cooling down: it keeps its heat for the whole
	// of its short life, so the flash across the seal is fire and not ash.
	// Down at the plate every parcel is young, so age alone would paint the whole
	// foot one flat amber. The extra spread there is what makes the wash a wash.
	float shade =
		clamp(
			vAge * (0.65 + 0.72 * shadeSeed) + (shadeSeed - 0.5) * 0.06 + vLow * shadeSeed * 0.3,
			0.0,
			1.0
		) *
		mix(1.0, 0.84, vPunch);
	float core = (1.0 - smoothstep(0.0, uCoreAge, shade)) * stamp.g * (1.0 - vMote) * vCore;
	// Everything but the core sliver is held below the white band, the way a
	// painter keeps one highlight and paints the rest in pigment. The floor is the
	// other half of that discipline: the fluid never reaches true soot, so the
	// mass stays pigment and the brush's smudges own the smoke. At the plate the
	// floor is higher still, because a spent parcel there is what used to lay a
	// grey scorch ring on the cream.
	float floorHeat = mix(0.2, 0.4, vLow);
	float heat = min(mix(floorHeat, 1.0, 1.0 - shade), mix(MASS_CEILING, 1.0, core));
	vec3 colour = mix(pigment(heat), uMoteInk, vMote);
	// Premultiplied. Hot parcels give up their alpha, so the same blend adds them.
	gl_FragColor = vec4(colour * alpha * (1.0 + 1.05 * core), alpha * (1.0 - 0.86 * core));
}
`;
