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
 * Three things here answer known faults. Down at the paper the sprite swells and
 * its opacity falls, so the base is a stack of overlapping washes rather than a
 * carpet of countable specks. The warm near-white is gated to a sliver near the
 * axis and off the plate, so brightness is a place inside the mass and not a
 * property of being young. And a spent punch parcel lying on the plate is erased
 * on its own age, which is the sepia dust ring the prototype review named.
 */

/**
 * A vertex fetch is the substrate's most expensive instruction: there are four
 * of them for every one of twenty thousand parcels, every paint. So the draw
 * program reads **one** texel — the row map, whose spare channels carry this
 * channel's heat, veil and grain — and nothing else about the channel. The core
 * gate is measured in seal space rather than in the channel's own frame for the
 * same reason, which is what the prototype did.
 */
export const PARCEL_VERTEX = /* glsl */ `
uniform sampler2D uRow;
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
uniform float uMaterialSize;

attribute vec2 aParcel;

varying float vAge;
varying vec2 vQuad;
varying float vSeed;
varying float vLow;
varying float vCore;
varying float vPunch;
varying float vHeat;
varying float vVeil;

void main() {
	vec4 channel = texture2D(uRow, vec2(0.5, aParcel.y));

	vec4 p = texture2D(uPos, aParcel);
	vec4 v = texture2D(uVel, aParcel);
	float life = v.w;
	float age = clamp(p.w / max(life, 1e-4), 0.0, 1.0);
	float alive = step(p.w, life) * step(1e-4, life);

	vAge = age;
	vHeat = channel.g;
	vVeil = channel.b;
	vSeed = fract(dot(aParcel, vec2(97.31, 41.17)));
	vQuad = position.xy;

	// How close to the plate this parcel sits. It is the whole base fix: a mark
	// here is wide and thin, so the foot is built out of overlap.
	vLow = 1.0 - smoothstep(0.0, uBaseWashZ, p.z);
	// The core is a place inside the mass: a sliver near the seal axis, lifted off
	// the paper and spent well below the crown. Nowhere else reaches the white band.
	vCore =
		smoothstep(0.0, uCoreFloorZ, p.z) *
		(1.0 - smoothstep(uCoreTopZ * 0.45, uCoreTopZ, p.z)) *
		(1.0 - smoothstep(uCoreRadius * 0.45, uCoreRadius, length(p.xy)));
	vPunch = step(life, uPunchMax) * alive;

	vec4 mv = modelViewMatrix * vec4(p.xyz, 1.0);
	vec3 mvVel = (modelViewMatrix * vec4(v.xyz, 0.0)).xyz;
	float speed = length(mvVel.xy);
	vec2 heading = speed > 1e-4 ? mvVel.xy / speed : vec2(0.0, 1.0);
	vec2 across = vec2(-heading.y, heading.x);

	// Born small, swelling as it cools, so nothing pops into the frame.
	float grow = mix(0.55, uGrowth, smoothstep(0.0, 0.85, age));
	float size = uSize * uMaterialSize * channel.a * grow
		* (1.0 + uBaseSwell * vLow) * (1.0 + uPunchSwell * vPunch) * alive;
	// Stretch belongs to the wisps and to the blast, not to the plate: a small
	// fast mark drawn as a streak down there is exactly the countable shard.
	float stretch = 1.0 + uStretch * min(speed, 3.4)
		* (0.25 + 1.15 * age) * (1.0 - 0.78 * vLow) * (1.0 + 0.3 * vPunch);

	mv.xy += heading * (position.y * size * stretch) + across * (position.x * size);
	gl_Position = projectionMatrix * mv;
}
`;

export const PARCEL_FRAGMENT = /* glsl */ `
uniform sampler2D uSprite;
uniform sampler2D uRamp;
uniform float uOpacity;
uniform float uCoreAge;
uniform float uBaseOpacity;
uniform float uCeiling;
uniform float uCoreLift;
uniform float uPunchPlateKill;

varying float vAge;
varying vec2 vQuad;
varying float vSeed;
varying float vLow;
varying float vCore;
varying float vPunch;
varying float vHeat;
varying float vVeil;

vec3 pigment(float heat) {
	return texture2D(uRamp, vec2(clamp(heat, 0.0, 1.0), 0.5)).rgb;
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

	float fadeIn = smoothstep(0.0, 0.11, vAge);
	// A punch parcel lying on the plate is cut on its own age rather than left to
	// the body's long tail, so the strike leaves no dust ring behind it.
	float plateKill = 1.0 - uPunchPlateKill * vPunch * vLow * smoothstep(0.28, 0.62, vAge);
	float fadeOut = (1.0 - smoothstep(0.46, 0.86, vAge)) * plateKill;
	float alpha = stamp.a * uOpacity * vVeil * fadeIn * fadeOut
		* (0.6 + 0.65 * stamp.b) * mix(1.0, uBaseOpacity, vLow);
	if (alpha < 0.0015) {
		discard;
	}

	// Neighbouring parcels sit at slightly different places on the ramp, which is
	// what keeps a flat wash from forming across the body.
	float shadeSeed = fract(vSeed * 61.7);
	// The punch burns out rather than cooling down, and at the plate every parcel
	// is young, so age alone would paint the whole foot one flat tone. The extra
	// spread there is what makes the wash a wash.
	float shade = clamp(
		vAge * (0.65 + 0.72 * shadeSeed) + (shadeSeed - 0.5) * 0.06 + vLow * shadeSeed * 0.3,
		0.0,
		1.0
	) * mix(1.0, 0.84, vPunch);
	float core = (1.0 - smoothstep(0.0, uCoreAge, shade)) * stamp.g * vCore;
	// Everything but the core sliver is held below the white band, the way a
	// painter keeps one highlight and paints the rest in pigment. The floor is the
	// other half of that discipline: the mass never reaches true soot, so the
	// brush's own marks own the smoke.
	float floorHeat = mix(0.2, 0.4, vLow);
	float heat = min(mix(floorHeat, 1.0, 1.0 - shade), mix(uCeiling, 1.0, core)) * vHeat;
	vec3 colour = pigment(heat);
	// Premultiplied. Hot parcels give up their alpha, so the same blend adds them.
	// How hard the core adds is the row's own emission: a flame has a white heart
	// and a wave of water does not, and letting every row add alike is what turns
	// pigment into neon.
	gl_FragColor = vec4(colour * alpha * (1.0 + uCoreLift * core), alpha * (1.0 - 0.86 * core));
}
`;
