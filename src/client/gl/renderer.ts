import { DEG, identity, invert, lookAt, mat4, multiply, perspective, transformPoint, type Mat4 } from './math.ts';
import type { Mesh } from './mesh.ts';

const VERTEX_SRC = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPos;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColour;
layout(location = 3) in float aBone;

uniform mat4 uViewProj;
uniform mat4 uBones[14];
uniform vec3 uLightDir;
uniform float uAmbient;
uniform vec3 uCameraPos;
uniform float uFogNear;
uniform float uFogFar;
uniform float uTime;
uniform vec4 uTint;

out vec3 vColour;
out float vFog;

void main() {
  int boneIndex = int(aBone + 0.5);
  mat4 bone = uBones[boneIndex];
  vec4 world = bone * vec4(aPos, 1.0);
  vec3 n = normalize(mat3(bone) * aNormal);

  vec3 colour = aColour;
  if (boneIndex == 13) {
    float w = sin(uTime * 1.7 + world.x * 0.018) + cos(uTime * 1.3 + world.z * 0.021);
    world.y += w * 2.5;
    colour *= 0.92 + 0.10 * w;
  }

  float diffuse = max(dot(n, uLightDir), 0.0);
  float light = uAmbient + diffuse * (1.0 - uAmbient);
  colour *= light;
  colour = mix(colour, uTint.rgb, uTint.a);

  float dist = distance(world.xyz, uCameraPos);
  vFog = clamp((dist - uFogNear) / (uFogFar - uFogNear), 0.0, 1.0);
  vColour = colour;
  gl_Position = uViewProj * world;
}`;

const FRAGMENT_SRC = `#version 300 es
precision highp float;
in vec3 vColour;
in float vFog;
uniform vec3 uFogColour;
uniform float uAlpha;
out vec4 fragColour;
void main() {
  vec3 c = mix(vColour, uFogColour, vFog);
  fragColour = vec4(c, uAlpha);
}`;

export interface GpuMesh {
  vao: WebGLVertexArrayObject;
  count: number;
  buffer: WebGLBuffer;
}

export interface CameraState {
  /** Focus point in world units. */
  targetX: number;
  targetY: number;
  targetZ: number;
  yaw: number;
  pitch: number;
  distance: number;
}

export class Renderer {
  readonly gl: WebGL2RenderingContext;
  readonly canvas: HTMLCanvasElement;
  private program: WebGLProgram;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private boneData = new Float32Array(14 * 16);
  private viewProj: Mat4 = mat4();
  private view: Mat4 = mat4();
  private proj: Mat4 = mat4();
  private invViewProj: Mat4 = mat4();
  eye: [number, number, number] = [0, 0, 0];
  width = 512;
  height = 334;
  time = 0;
  fogColour: [number, number, number] = [0.53, 0.62, 0.72];
  fogNear = 3200;
  fogFar = 6400;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const gl = canvas.getContext('webgl2', { antialias: true, alpha: false, depth: true });
    if (!gl) throw new Error('WebGL2 is not supported by this browser.');
    this.gl = gl;
    this.program = this.compile();
    gl.enable(gl.DEPTH_TEST);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.BACK);
    // The mesh builder emits faces whose right-hand normal points away from
    // the outside, so clockwise winding is the front face here.
    gl.frontFace(gl.CW);
    // Identity bones by default.
    for (let i = 0; i < 14; i++) {
      const m = mat4();
      this.boneData.set(m, i * 16);
    }
  }

  private compile(): WebGLProgram {
    const gl = this.gl;
    const make = (type: number, src: string): WebGLShader => {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, src);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error(`Shader compile failed: ${gl.getShaderInfoLog(shader)}`);
      }
      return shader;
    };
    const program = gl.createProgram()!;
    gl.attachShader(program, make(gl.VERTEX_SHADER, VERTEX_SRC));
    gl.attachShader(program, make(gl.FRAGMENT_SHADER, FRAGMENT_SRC));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error(`Program link failed: ${gl.getProgramInfoLog(program)}`);
    }
    gl.useProgram(program);
    for (const name of ['uViewProj', 'uLightDir', 'uAmbient', 'uCameraPos', 'uFogNear', 'uFogFar', 'uFogColour', 'uTime', 'uTint', 'uAlpha']) {
      this.uniforms[name] = gl.getUniformLocation(program, name);
    }
    for (let i = 0; i < 14; i++) {
      this.uniforms[`uBones[${i}]`] = gl.getUniformLocation(program, `uBones[${i}]`);
    }
    return program;
  }

  upload(mesh: Mesh): GpuMesh | null {
    if (mesh.count === 0) return null;
    const gl = this.gl;
    const stride = 10;
    const data = new Float32Array(mesh.count * stride);
    for (let i = 0; i < mesh.count; i++) {
      const o = i * stride;
      data[o] = mesh.positions[i * 3];
      data[o + 1] = mesh.positions[i * 3 + 1];
      data[o + 2] = mesh.positions[i * 3 + 2];
      data[o + 3] = mesh.normals[i * 3];
      data[o + 4] = mesh.normals[i * 3 + 1];
      data[o + 5] = mesh.normals[i * 3 + 2];
      data[o + 6] = mesh.colours[i * 3];
      data[o + 7] = mesh.colours[i * 3 + 1];
      data[o + 8] = mesh.colours[i * 3 + 2];
      data[o + 9] = mesh.bones[i];
    }
    const vao = gl.createVertexArray()!;
    const buffer = gl.createBuffer()!;
    gl.bindVertexArray(vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    const bytes = stride * 4;
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 3, gl.FLOAT, false, bytes, 0);
    gl.enableVertexAttribArray(1);
    gl.vertexAttribPointer(1, 3, gl.FLOAT, false, bytes, 12);
    gl.enableVertexAttribArray(2);
    gl.vertexAttribPointer(2, 3, gl.FLOAT, false, bytes, 24);
    gl.enableVertexAttribArray(3);
    gl.vertexAttribPointer(3, 1, gl.FLOAT, false, bytes, 36);
    gl.bindVertexArray(null);
    return { vao, count: mesh.count, buffer };
  }

  dispose(mesh: GpuMesh | null): void {
    if (!mesh) return;
    this.gl.deleteVertexArray(mesh.vao);
    this.gl.deleteBuffer(mesh.buffer);
  }

  resize(width: number, height: number, dpr: number): void {
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = width;
    this.height = height;
  }

  beginFrame(camera: CameraState, time: number): void {
    const gl = this.gl;
    this.time = time;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(this.fogColour[0], this.fogColour[1], this.fogColour[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.program);

    const cp = Math.cos(camera.pitch);
    const sp = Math.sin(camera.pitch);
    const cy = Math.cos(camera.yaw);
    const sy = Math.sin(camera.yaw);
    this.eye = [
      camera.targetX - sy * cp * camera.distance,
      camera.targetY + sp * camera.distance,
      camera.targetZ - cy * cp * camera.distance,
    ];
    perspective(this.proj, 42 * DEG, this.width / this.height, 24, 8000);
    lookAt(this.view, this.eye, [camera.targetX, camera.targetY, camera.targetZ], [0, 1, 0]);
    multiply(this.viewProj, this.proj, this.view);
    invert(this.invViewProj, this.viewProj);

    gl.uniformMatrix4fv(this.uniforms.uViewProj!, false, this.viewProj);
    gl.uniform3f(this.uniforms.uLightDir!, 0.42, 0.78, -0.46);
    gl.uniform1f(this.uniforms.uAmbient!, 0.68);
    gl.uniform3fv(this.uniforms.uCameraPos!, this.eye);
    gl.uniform1f(this.uniforms.uFogNear!, this.fogNear);
    gl.uniform1f(this.uniforms.uFogFar!, this.fogFar);
    gl.uniform3fv(this.uniforms.uFogColour!, this.fogColour);
    gl.uniform1f(this.uniforms.uTime!, time);
    gl.uniform4f(this.uniforms.uTint!, 0, 0, 0, 0);
    gl.uniform1f(this.uniforms.uAlpha!, 1);
    this.resetBones();
  }

  resetBones(): void {
    const gl = this.gl;
    const id = mat4();
    for (let i = 0; i < 14; i++) gl.uniformMatrix4fv(this.uniforms[`uBones[${i}]`]!, false, id);
  }

  setBones(matrices: Float32Array[], count: number): void {
    const gl = this.gl;
    for (let i = 0; i < count; i++) {
      gl.uniformMatrix4fv(this.uniforms[`uBones[${i}]`]!, false, matrices[i]);
    }
  }

  setTint(r: number, g: number, b: number, strength: number): void {
    this.gl.uniform4f(this.uniforms.uTint!, r, g, b, strength);
  }

  setAlpha(alpha: number): void {
    this.gl.uniform1f(this.uniforms.uAlpha!, alpha);
  }

  draw(mesh: GpuMesh | null): void {
    if (!mesh) return;
    const gl = this.gl;
    gl.bindVertexArray(mesh.vao);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  /** World position -> screen pixel (in viewport space). Returns null if behind. */
  projectToScreen(x: number, y: number, z: number): [number, number, number] | null {
    const m = this.viewProj;
    const cx = m[0] * x + m[4] * y + m[8] * z + m[12];
    const cyv = m[1] * x + m[5] * y + m[9] * z + m[13];
    const cz = m[2] * x + m[6] * y + m[10] * z + m[14];
    const cw = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (cw <= 0.0001) return null;
    return [((cx / cw) * 0.5 + 0.5) * this.width, (1 - ((cyv / cw) * 0.5 + 0.5)) * this.height, cz / cw];
  }

  /** Screen pixel -> world ray. */
  screenRay(sx: number, sy: number): { origin: [number, number, number]; dir: [number, number, number] } {
    const ndcX = (sx / this.width) * 2 - 1;
    const ndcY = 1 - (sy / this.height) * 2;
    const near = transformPoint(this.invViewProj, ndcX, ndcY, -1);
    const far = transformPoint(this.invViewProj, ndcX, ndcY, 1);
    const dx = far[0] - near[0];
    const dy = far[1] - near[1];
    const dz = far[2] - near[2];
    const len = Math.hypot(dx, dy, dz) || 1;
    return { origin: near, dir: [dx / len, dy / len, dz / len] };
  }
}

export { identity, mat4, multiply };

