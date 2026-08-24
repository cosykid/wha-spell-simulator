/**
 * @file The screen chain: an accumulation buffer that fades, a small bloom, and
 * one composite that keeps the result premultiplied so the effect canvas still
 * lets the paper through.
 *
 * Everything here works on premultiplied colour. The parcels write premultiplied,
 * the fade multiplies both colour and alpha by the same number, and the composite
 * puts the bloom back into alpha as well as colour so a glow reads over cream
 * paper rather than over black.
 */

/** Re-samples the previous accumulation slightly blurred and drifting upward. */
export const TRAIL_FADE = /* glsl */ `
uniform sampler2D uTrail;
uniform float uFade;
uniform float uDrift;
uniform float uBlur;
uniform vec3 uCool;
uniform float uFloor;

varying vec2 vUv;

void main() {
	vec2 at = vUv + vec2(0.0, uDrift);
	vec4 sum = texture2D(uTrail, at) * 0.36;
	sum += texture2D(uTrail, at + vec2(uBlur, 0.0)) * 0.16;
	sum += texture2D(uTrail, at - vec2(uBlur, 0.0)) * 0.16;
	sum += texture2D(uTrail, at + vec2(0.0, uBlur)) * 0.16;
	sum += texture2D(uTrail, at - vec2(0.0, uBlur)) * 0.16;
	// An afterimage cools as it thins, so the trail leaves soot rather than light.
	sum.rgb *= uCool;
	// Alpha lets go a little faster than colour, so a thinning trail keeps its
	// pigment instead of settling into a neutral grey veil over the paper.
	float alpha = sum.a * uFade * 0.99;
	// And below a floor it lets go entirely. Without this the last thousandth of
	// a wash lingers as a sepia ring where the strike stood, which is the dust
	// the prototype review named.
	if (alpha < uFloor) {
		gl_FragColor = vec4(0.0);
		return;
	}
	gl_FragColor = vec4(sum.rgb * uFade, alpha);
}
`;

/** Soft-knee bright pass, run at quarter resolution. */
export const BLOOM_BRIGHT = /* glsl */ `
uniform sampler2D uSource;
uniform float uThreshold;
uniform float uKnee;

varying vec2 vUv;

void main() {
	vec3 c = texture2D(uSource, vUv).rgb;
	float luma = dot(c, vec3(0.32, 0.52, 0.16));
	float soft = clamp(luma - uThreshold + uKnee, 0.0, 2.0 * uKnee);
	soft = soft * soft / (4.0 * uKnee + 1e-4);
	float weight = max(soft, luma - uThreshold) / max(luma, 1e-4);
	gl_FragColor = vec4(c * weight, 1.0);
}
`;

/** Nine-tap separable gaussian. `uStep` carries both the axis and the radius. */
export const BLOOM_BLUR = /* glsl */ `
uniform sampler2D uSource;
uniform vec2 uStep;

varying vec2 vUv;

void main() {
	vec3 sum = texture2D(uSource, vUv).rgb * 0.2270270;
	sum += texture2D(uSource, vUv + uStep * 1.3846153).rgb * 0.3162162;
	sum += texture2D(uSource, vUv - uStep * 1.3846153).rgb * 0.3162162;
	sum += texture2D(uSource, vUv + uStep * 3.2307692).rgb * 0.0702702;
	sum += texture2D(uSource, vUv - uStep * 3.2307692).rgb * 0.0702702;
	gl_FragColor = vec4(sum, 1.0);
}
`;

/** Accumulation plus bloom, out to the canvas, still premultiplied. */
export const COMPOSITE = /* glsl */ `
uniform sampler2D uTrail;
uniform sampler2D uBloom;
uniform float uStrength;
uniform float uBloomAlpha;

varying vec2 vUv;

void main() {
	vec4 base = texture2D(uTrail, vUv);
	vec3 glow = texture2D(uBloom, vUv).rgb * uStrength;
	float glowAlpha = dot(glow, vec3(0.34, 0.5, 0.16)) * uBloomAlpha;
	vec3 lit = base.rgb + glow;
	// Soft shoulder rather than a hard clip: a stack of hot parcels keeps its
	// hue instead of flattening into a white disc.
	lit = lit / (1.0 + 0.55 * max(lit - 0.82, vec3(0.0)));
	gl_FragColor = vec4(lit, clamp(base.a + glowAlpha, 0.0, 1.0));
}
`;
