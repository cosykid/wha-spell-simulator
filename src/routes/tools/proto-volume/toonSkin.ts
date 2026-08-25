/**
 * @file Style A's dress: PR #74's cel-banded toon materials recolored to the
 * pigment palette, one warm key light, and water's glint — rippled normals
 * driving a hard specular plus a fresnel rim, so "wet" is two moving
 * highlights rather than a base color. Ported from elementVolume.ts.
 */

import * as THREE from 'three';
import { TOON, type ProtoElement } from './elements.js';

/** The one key light's direction, shared with the glint shader. */
const KEY_POS = new THREE.Vector3(2.5, 4.0, 1.5);

/** Warm paper-world lighting: cream sky, table-brown ground, one warm key. */
export function stageLights(): THREE.Group {
	const group = new THREE.Group();
	group.name = 'proto-lights';
	group.add(new THREE.HemisphereLight(0xfdf3d7, 0x6b5138, 0.22));
	const key = new THREE.DirectionalLight(0xfff2dc, 1.35);
	key.position.copy(KEY_POS);
	group.add(key);
	return group;
}

/** 4-step cel ramp shared by every element material. */
function makeGradientMap(): THREE.DataTexture {
	const steps = [30, 105, 190, 255];
	const data = new Uint8Array(steps.length * 4);
	steps.forEach((v, i) => data.set([v, v, v, 255], i * 4));
	const tex = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
	tex.minFilter = THREE.NearestFilter;
	tex.magFilter = THREE.NearestFilter;
	tex.needsUpdate = true;
	return tex;
}

/**
 * The style A material for one element. `uTime` is cast seconds, advanced by
 * the stage, so a seeked frame ripples identically to a played one.
 */
export function toonSkinMaterial(
	element: ProtoElement,
	uTime: { value: number }
): THREE.MeshToonMaterial {
	const row = TOON[element];
	const mat = new THREE.MeshToonMaterial({
		color: row.color,
		emissive: row.emissive,
		emissiveIntensity: row.intensity,
		gradientMap: makeGradientMap(),
		transparent: row.opacity < 1,
		opacity: row.opacity,
		depthWrite: row.opacity >= 0.5,
		premultipliedAlpha: true,
		side: THREE.DoubleSide
	});
	if (element === 'water') {
		injectGlint(mat, uTime);
	}
	return mat;
}

/**
 * Water only: ripple-wobbled normals drive a hard specular glint and a
 * fresnel rim. The ripple runs on world position and cast time, so the two
 * highlights shimmer as the surface moves.
 */
function injectGlint(mat: THREE.MeshToonMaterial, uTime: { value: number }): void {
	mat.onBeforeCompile = (shader) => {
		shader.uniforms.uTime = uTime;
		shader.uniforms.uKeyDir = { value: KEY_POS.clone().normalize() };
		shader.vertexShader = shader.vertexShader
			.replace('void main() {', 'varying vec3 vWPos;\nvoid main() {')
			.replace(
				'#include <project_vertex>',
				'#include <project_vertex>\n  vWPos = ( modelMatrix * vec4( transformed, 1.0 ) ).xyz;'
			);
		shader.fragmentShader = shader.fragmentShader
			.replace(
				'void main() {',
				'uniform float uTime;\nuniform vec3 uKeyDir;\nvarying vec3 vWPos;\nvoid main() {'
			)
			.replace(
				'#include <opaque_fragment>',
				/* glsl */ `
  vec3 nView = normalize( normal );
  vec3 vDir = normalize( vViewPosition );
  vec3 nRip = nView;
  nRip.xy += 0.22 * vec2(
    sin( vWPos.x * 7.0 + uTime * 2.6 + vWPos.y * 3.0 ),
    sin( vWPos.z * 7.0 - uTime * 2.2 + vWPos.y * 4.0 ) );
  nRip = normalize( nRip );
  vec3 lDir = normalize( ( viewMatrix * vec4( uKeyDir, 0.0 ) ).xyz );
  float glint = smoothstep( 0.95, 0.97, dot( nRip, normalize( lDir + vDir ) ) );
  float fres = pow( 1.0 - saturate( dot( nView, vDir ) ), 3.0 );
  outgoingLight += vec3( 0.90, 0.97, 1.0 ) * glint * 0.85;
  outgoingLight += vec3( 0.55, 0.85, 1.0 ) * fres * 0.6;
  diffuseColor.a = min( 1.0, diffuseColor.a + fres * 0.18 + glint * 0.3 );
#include <opaque_fragment>`
			);
	};
}
