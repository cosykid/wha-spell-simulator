/**
 * @file Style B's GPU simulation: two fragment programs over a parcel texture,
 * copied in shape from proto-hybrid's sim and re-forced per element. One texel
 * is one parcel: uPos holds xyz seal position + age, uVel holds xyz velocity +
 * lifespan (negative marks a charge-beat mote). The element branch in the
 * velocity pass IS the behavior matrix: fire is buoyant and pinched, water is
 * ballistic and pools on the floor, wind is launched hard and bent by gusts.
 */

/** Hash, value noise, curl and the shared spawn. Prepended to both passes. */
export const B_COMMON = /* glsl */ `
uniform sampler2D uPos;
uniform sampler2D uVel;
uniform float uDt;
uniform float uTime;
uniform float uSalt;
uniform float uBurn;
uniform float uEmission;
uniform float uMotes;
uniform float uPunch;
uniform float uDrain;
uniform float uSpeed;
uniform float uFootprint;
uniform float uReach;
uniform float uElement;
uniform float uMouth;
uniform vec2 uRise;
uniform vec2 uRadial;
uniform float uJets;
uniform float uJetSpin;
uniform float uBuoyancy;
uniform float uGravity;
uniform float uDrag;
uniform float uTurb;
uniform float uTurbScale;
uniform float uGust;
uniform float uSwirl;
uniform float uPinch;
uniform vec2 uLife;
uniform float uHeightCap;
uniform float uTearFrom;
uniform float uTearRate;
uniform vec4 uPool; // floorZ, bounce, spread, dragXY
uniform vec2 uPoolAge; // ageRate, drainAgeRate

varying vec2 vUv;

float hash13(vec3 p3) {
	p3 = fract(p3 * 0.1031);
	p3 += dot(p3, p3.zyx + 31.32);
	return fract((p3.x + p3.y) * p3.z);
}

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

struct Spawn {
	vec3 pos;
	vec3 vel;
	float life;
};

// Where a parcel is born. The mote branch is the charge beat's inward drift;
// everything else launches from the element's own mouth on the seal.
Spawn spawnParcel(bool mote) {
	Spawn s;
	float a = draw(1.0) * 6.2831853;
	float r0 = draw(2.0);
	float r1 = draw(3.0);
	float r2 = draw(4.0);
	vec2 dir = vec2(cos(a), sin(a));

	if (mote) {
		float radius = 0.95 + 0.55 * r0;
		s.pos = vec3(dir * radius, 0.02 + 0.42 * r1 * r1);
		s.vel = vec3(-dir * (0.28 + 0.34 * r2), 0.06 * r1);
		s.life = -(0.34 + 0.4 * r1);
		return s;
	}

	vec2 lean = dir;
	if (uJets > 0.5) {
		// Water: a few slowly precessing sub-jets, so the launch braids into
		// distinct arcs rather than one cone.
		float jet = floor(min(draw(6.0) * uJets, uJets - 1.0));
		float angle = (jet / uJets) * 6.2831853 + uTime * uJetSpin + (draw(7.0) - 0.5) * 0.5;
		lean = vec2(cos(angle), sin(angle));
	}
	float mouth = uMouth * uFootprint * sqrt(r0) * (1.0 + 0.9 * uPunch);
	float surge = 1.0 + 1.5 * uPunch * draw(9.0);
	s.pos = vec3(dir * mouth, 0.008 + 0.05 * r1);
	float rise = uSpeed * mix(uRise.x, uRise.y, draw(10.0)) * surge;
	float radial = uSpeed * mix(uRadial.x, uRadial.y, r2) * surge;
	s.vel = vec3(lean * radial, rise);
	s.life = uLife.x + uLife.y * r1;
	return s;
}

float rank() {
	return hash13(vec3(vUv * 191.0, 3.7));
}

bool rollAlive(float gate) {
	return gate < uEmission;
}

bool rollMote(float gate) {
	return gate >= 1.0 - uMotes;
}

// Water's pool test, shared by both passes and mirrored in the draw program:
// low and slow means pooled.
float pooledness(vec3 pos, vec3 vel) {
	if (uElement < 0.5 || uElement > 1.5) return 0.0;
	return (1.0 - smoothstep(uPool.x, uPool.x * 4.0, pos.z)) *
		(1.0 - smoothstep(0.06, 0.3, abs(vel.z)));
}
`;

export const B_QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
	vUv = uv;
	gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

/** Forces: the element branch. */
export const B_VELOCITY = /* glsl */ `
void main() {
	vec4 p = texture2D(uPos, vUv);
	vec4 v = texture2D(uVel, vUv);
	float life = abs(v.w);
	bool dead = p.w >= life || life < 1e-4;

	if (dead) {
		float gate = rank();
		if (rollAlive(gate)) {
			Spawn s = spawnParcel(false);
			gl_FragColor = vec4(s.vel, s.life);
			return;
		}
		if (rollMote(gate)) {
			Spawn s = spawnParcel(true);
			gl_FragColor = vec4(s.vel, s.life);
			return;
		}
		gl_FragColor = vec4(0.0, 0.0, 0.0, v.w);
		return;
	}

	vec3 pos = p.xyz;
	vec3 vel = v.xyz;
	float t01 = clamp(p.w / life, 0.0, 1.0);
	float heat = 1.0 - t01;
	float hn = clamp(pos.z / uReach, 0.0, 1.6);
	float radius = length(pos.xy);
	vec2 inward = radius > 1e-4 ? -pos.xy / radius : vec2(0.0);

	if (v.w < 0.0) {
		// A charge-beat mote: drifts in and settles.
		vec3 swirlV = vec3(-inward.y, inward.x, 0.0) * 0.22;
		vel += (swirlV + vec3(inward * 0.55, -0.05)) * uDt;
		vel += curlNoise(pos * 0.8 + vec3(0.0, 0.0, uTime * 0.2)) * 0.35 * uDt;
		vel *= exp(-1.4 * uDt);
		gl_FragColor = vec4(vel, v.w);
		return;
	}

	float pooled = pooledness(pos, vel);
	if (pooled > 0.5) {
		// The puddle: momentum bleeding out plus a gentle spread.
		vel.xy += -inward * uPool.z * uDt;
		vel.xy *= exp(-uPool.w * uDt);
		vel.z = 0.0;
		gl_FragColor = vec4(vel, v.w);
		return;
	}

	// Buoyancy is fire's identity, gravity is water's; wind gets a token lift.
	vel.z += uBuoyancy * pow(heat, 1.15) * uDt;
	vel.z -= uGravity * uDt;

	// Water lands, splashes a little, and the pool test above takes it next step.
	if (uGravity > 0.0 && pos.z < uPool.x + 0.02 && vel.z < 0.0) {
		vel.z *= -uPool.y;
	}

	// Fire keeps a column: pull toward a wandering boundary. Others do not.
	if (uPinch > 0.0) {
		float wob = 1.0 + 0.5 * vnoise(vec3(pos.xy * 1.5, uTime * 0.6 + pos.z * 1.3));
		float target = (uFootprint * (1.0 - 0.62 * smoothstep(0.0, 0.95, hn)) + 0.04) * max(0.4, wob);
		vel.xy += inward * uPinch * max(radius - target, 0.0) * uDt;
	}

	vec3 q = pos * uTurbScale + vec3(0.0, 0.0, -uTime * 0.7);
	vec3 turb = curlNoise(q) + curlNoise(q * 2.9 + 13.7) * 0.52;
	float gain = uTurb * (0.48 + 1.4 * smoothstep(0.0, 0.55, hn) + 0.55 * uPunch) * (0.5 + 0.7 * t01);
	vel += turb * gain * uDt;

	// Wind's identity: coherent gusts that bend the whole body sideways.
	if (uGust > 0.0) {
		vel.x += uGust * sin(uTime * 1.35 + pos.z * 1.1 + vUv.x * 4.0) * uDt;
		vel.y += uGust * 0.55 * cos(uTime * 0.9 + pos.z * 0.8 + vUv.y * 4.0) * uDt;
	}

	vel.xy += vec2(-inward.y, inward.x) * uSwirl * radius * uDt;
	vel *= exp(-uDrag * uDt);
	gl_FragColor = vec4(vel, v.w);
}
`;

/** Integration, the floor, and ageing. */
export const B_POSITION = /* glsl */ `
void main() {
	vec4 p = texture2D(uPos, vUv);
	vec4 v = texture2D(uVel, vUv);
	float life = abs(v.w);
	bool dead = p.w >= life || life < 1e-4;

	if (dead) {
		float gate = rank();
		if (rollAlive(gate)) {
			gl_FragColor = vec4(spawnParcel(false).pos, 0.0);
			return;
		}
		if (rollMote(gate)) {
			gl_FragColor = vec4(spawnParcel(true).pos, 0.0);
			return;
		}
		gl_FragColor = vec4(p.xyz, life + 1.0);
		return;
	}

	vec3 pos = p.xyz + v.xyz * uDt;
	pos.z = max(pos.z, uElement > 0.5 && uElement < 1.5 ? uPool.x : 0.004);

	float ageRate = 1.0;
	float pooled = pooledness(pos, v.xyz);
	if (pooled > 0.5) {
		// The pool persists through the cast and drains in the afterglow.
		ageRate = uPoolAge.x + uPoolAge.y * uDrain;
	} else if (pos.z / uReach > uTearFrom) {
		ageRate = uTearRate;
	}
	float age = p.w + uDt * uBurn * ageRate;
	if (pos.z > uReach * uHeightCap || length(pos.xy) > 1.9) {
		age = life;
	}
	gl_FragColor = vec4(pos, age);
}
`;
