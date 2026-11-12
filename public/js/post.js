// Post-processing: bloom, film grain, vignette, sickly grade, and a "fear" distortion near the ghost.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const Grade = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, fear: { value: 0 }, dark: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, fear, dark; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5; float r = length(c);
      vec2 uv = vUv + c * r * r * (0.04 + fear * 0.10 * (0.6 + 0.4 * sin(time * 9.0)));
      float ab = 0.0012 + fear * 0.007;
      vec3 col = vec3(texture2D(tDiffuse, uv + c * ab).r, texture2D(tDiffuse, uv).g, texture2D(tDiffuse, uv - c * ab).b);
      float l = dot(col, vec3(0.3, 0.59, 0.11));
      col = mix(vec3(l), col, 0.72 - fear * 0.3);
      col *= vec3(0.94, 1.02, 0.95);
      col += (hash(vUv * vec2(1920.0, 1080.0) + fract(time) * 100.0) - 0.5) * (0.035 + fear * 0.05) * (0.4 + l);
      col *= smoothstep(0.95, 0.25 - fear * 0.08, r) * 0.85 + 0.15;
      col *= 1.0 - dark;
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export function makePost(renderer, scene, camera, quality) {
  if (quality === 'low') return { render: () => renderer.render(scene, camera), setSize() {}, setPixelRatio() {}, u: { fear: { value: 0 }, dark: { value: 0 }, time: { value: 0 } } };
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType });
  const comp = new EffectComposer(renderer, rt);
  comp.addPass(new RenderPass(scene, camera));
  if (quality === 'high') comp.addPass(new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.4, 0.6, 0.92));
  const grade = new ShaderPass(Grade); comp.addPass(grade);
  comp.addPass(new OutputPass());
  return { render: () => comp.render(), setSize: (w, h) => comp.setSize(w, h), setPixelRatio: (r) => comp.setPixelRatio(r), dispose: () => comp.dispose(), u: grade.uniforms };
}
