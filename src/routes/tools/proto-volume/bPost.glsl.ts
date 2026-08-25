/**
 * @file Style B's screen programs. The accumulation fades and drifts like
 * proto-hybrid's, but the composite is new: the coverage field is blurred and
 * re-thresholded through a soft smoothstep (the 2D metaball trick), so the
 * silhouette reads as merged rounded blobs, and the coverage gradient draws a
 * darker pigment rim as an ink line. Everything premultiplied.
 */

/** Re-samples the previous accumulation slightly blurred, drifting, cooling. */
export const B_TRAIL_FADE = /* glsl */ `
uniform sampler2D uTrail;
uniform float uFade;
uniform float uDrift;
uniform float uBlur;
uniform vec3 uCool;

varying vec2 vUv;

void main() {
	vec2 at = vUv + vec2(0.0, uDrift);
	vec4 sum = texture2D(uTrail, at) * 0.36;
	sum += texture2D(uTrail, at + vec2(uBlur, 0.0)) * 0.16;
	sum += texture2D(uTrail, at - vec2(uBlur, 0.0)) * 0.16;
	sum += texture2D(uTrail, at + vec2(0.0, uBlur)) * 0.16;
	sum += texture2D(uTrail, at - vec2(0.0, uBlur)) * 0.16;
	sum.rgb *= uCool;
	gl_FragColor = vec4(sum.rgb * uFade, sum.a * uFade * 0.99);
}
`;

/** Nine-tap separable gaussian. uStep carries both the axis and the radius. */
export const B_BLUR = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uStep;

varying vec2 vUv;

void main() {
	vec4 sum = texture2D(uSource, vUv) * 0.2270270;
	sum += texture2D(uSource, vUv + uStep * 1.3846153) * 0.3162162;
	sum += texture2D(uSource, vUv - uStep * 1.3846153) * 0.3162162;
	sum += texture2D(uSource, vUv + uStep * 3.2307692) * 0.0702702;
	sum += texture2D(uSource, vUv - uStep * 3.2307692) * 0.0702702;
	gl_FragColor = sum;
}
`;

/**
 * The metaball composite: soft-threshold the blurred coverage into a merged
 * body, ink the contour from the coverage gradient, granulate, glint (water).
 */
export const B_COMPOSITE = /* glsl */ `
uniform sampler2D uTrail;
uniform sampler2D uSoft;
uniform vec2 uTexel;
uniform float uThreshLo;
uniform float uThreshHi;
uniform float uRim;
uniform float uGlint;
uniform float uBodyAlpha;
uniform float uSub;
uniform float uSharpMix;
uniform float uSharpBody;
uniform float uTime;
uniform vec3 uInk;

varying vec2 vUv;

void main() {
	vec4 soft = texture2D(uSoft, vUv);
	vec4 sharp = texture2D(uTrail, vUv);
	float c = soft.a;

	// The 2D metaball: blur already merged neighbouring dabs; the soft
	// threshold turns that merged coverage into one rounded silhouette.
	float body = smoothstep(uThreshLo, uThreshHi, c);

	// Coverage gradient, for the rim and the glint.
	float cxp = texture2D(uSoft, vUv + vec2(uTexel.x, 0.0)).a;
	float cxm = texture2D(uSoft, vUv - vec2(uTexel.x, 0.0)).a;
	float cyp = texture2D(uSoft, vUv + vec2(0.0, uTexel.y)).a;
	float cym = texture2D(uSoft, vUv - vec2(0.0, uTexel.y)).a;
	vec2 grad = vec2(cxp - cxm, cyp - cym);
	float gmag = length(grad);

	// Pigment: the blurred mean gives rounded washes, the sharp accumulation
	// keeps hand-laid structure inside (wind is mostly the sharp streaks).
	vec3 meanSoft = soft.rgb / max(soft.a, 1e-4);
	vec3 meanSharp = sharp.rgb / max(sharp.a, 1e-4);
	vec3 col = mix(meanSoft, meanSharp, uSharpMix * smoothstep(0.02, 0.25, sharp.a));

	float alpha = body * uBodyAlpha;
	// Wind lives here: the unblurred streaks re-thresholded, so individual
	// ribbons stay legible inside the soft body instead of fogging out. Gated
	// by the soft envelope, so a stray tip fades rather than spiking.
	alpha = max(alpha, smoothstep(0.12, 0.5, sharp.a) * uSharpBody * smoothstep(0.02, 0.12, c));
	// Sub-threshold haze: the thin outer bleed and the charge beat's motes,
	// capped hard so it can never read as a glow envelope.
	alpha = max(alpha, min(c * uSub, 0.1));

	// The ink line: just inside the contour, where the field still climbs.
	float rim = body * (1.0 - smoothstep(uThreshHi, uThreshHi + 0.45, c))
		* smoothstep(0.0025, 0.014, gmag) * uRim;
	col = mix(col, uInk, rim);
	alpha = min(1.0, alpha + rim * 0.18);

	// Paper granulation, faint and irregular so it never reads as a lattice.
	float grain = 0.5
		+ 0.25 * sin(vUv.x * 263.0 + sin(vUv.y * 89.0) * 3.0) * sin(vUv.y * 241.0)
		+ 0.25 * sin(vUv.x * 151.0 - vUv.y * 173.0);
	alpha *= 0.96 + 0.04 * grain;
	col *= 0.985 + 0.02 * grain;

	// Water's wet glint: the contour normal catching a fixed key, rippling.
	if (uGlint > 0.0) {
		vec2 n2 = grad / max(gmag, 1e-5);
		vec2 keyDir = normalize(vec2(-0.4, 0.85));
		float ripple = 0.5 + 0.5 * sin(vUv.x * 90.0 + uTime * 2.4) * sin(vUv.y * 70.0 - uTime * 1.9);
		float glint = pow(max(dot(-n2, keyDir), 0.0), 6.0) * smoothstep(0.006, 0.03, gmag);
		col += vec3(0.9, 0.97, 1.0) * glint * ripple * uGlint * 0.8 * body;
	}

	gl_FragColor = vec4(col * alpha, alpha);
}
`;
