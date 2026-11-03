// Minimal WebGL renderer: lit, vertex-coloured meshes with fog.
// Self-contained so the game runs offline with no 3D library download.

export type Mat4 = Float32Array;

export const mat4 = {
  identity(): Mat4 {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  },
  perspective(fovy: number, aspect: number, near: number, far: number): Mat4 {
    const f = 1 / Math.tan(fovy / 2);
    const m = new Float32Array(16);
    m[0] = f / aspect;
    m[5] = f;
    m[10] = (far + near) / (near - far);
    m[11] = -1;
    m[14] = (2 * far * near) / (near - far);
    return m;
  },
  lookAt(eye: number[], target: number[], up = [0, 1, 0]): Mat4 {
    let zx = eye[0] - target[0], zy = eye[1] - target[1], zz = eye[2] - target[2];
    let l = Math.hypot(zx, zy, zz) || 1;
    zx /= l; zy /= l; zz /= l;
    let xx = up[1] * zz - up[2] * zy, xy = up[2] * zx - up[0] * zz, xz = up[0] * zy - up[1] * zx;
    l = Math.hypot(xx, xy, xz) || 1;
    xx /= l; xy /= l; xz /= l;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    const m = new Float32Array(16);
    m[0] = xx; m[1] = yx; m[2] = zx;
    m[4] = xy; m[5] = yy; m[6] = zy;
    m[8] = xz; m[9] = yz; m[10] = zz;
    m[12] = -(xx * eye[0] + xy * eye[1] + xz * eye[2]);
    m[13] = -(yx * eye[0] + yy * eye[1] + yz * eye[2]);
    m[14] = -(zx * eye[0] + zy * eye[1] + zz * eye[2]);
    m[15] = 1;
    return m;
  },
  multiply(a: Mat4, b: Mat4): Mat4 {
    const o = new Float32Array(16);
    for (let c = 0; c < 4; c++) {
      for (let r = 0; r < 4; r++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
        o[c * 4 + r] = s;
      }
    }
    return o;
  },
  /** Translation then rotation about Y (yaw) then roll about local X. */
  fromPose(x: number, y: number, z: number, yaw: number, roll = 0): Mat4 {
    const cy = Math.cos(yaw), sy = Math.sin(yaw), cr = Math.cos(roll), sr = Math.sin(roll);
    const m = new Float32Array(16);
    // R = Ry(yaw) * Rx(roll)
    m[0] = cy; m[1] = 0; m[2] = -sy;
    m[4] = sy * sr; m[5] = cr; m[6] = cy * sr;
    m[8] = sy * cr; m[9] = -sr; m[10] = cy * cr;
    m[12] = x; m[13] = y; m[14] = z; m[15] = 1;
    return m;
  },
  transformPoint(m: Mat4, p: number[]): number[] {
    const x = p[0], y = p[1], z = p[2];
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return [(m[0] * x + m[4] * y + m[8] * z + m[12]) / w, (m[1] * x + m[5] * y + m[9] * z + m[13]) / w, (m[2] * x + m[6] * y + m[10] * z + m[14]) / w, w];
  },
};

/** Growable geometry buffer: positions, normals, colours. */
export class Geometry {
  pos: number[] = [];
  nor: number[] = [];
  col: number[] = [];

  tri(a: number[], b: number[], c: number[], color: number[]) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const l = Math.hypot(nx, ny, nz) || 1;
    nx /= l; ny /= l; nz /= l;
    for (const p of [a, b, c]) {
      this.pos.push(p[0], p[1], p[2]);
      this.nor.push(nx, ny, nz);
      this.col.push(color[0], color[1], color[2]);
    }
  }

  quad(a: number[], b: number[], c: number[], d: number[], color: number[]) {
    this.tri(a, b, c, color);
    this.tri(a, c, d, color);
  }

  /** Box centred at (cx, cy, cz) with half sizes, rotated by yaw about Y. */
  box(cx: number, cy: number, cz: number, hx: number, hy: number, hz: number, color: number[], yaw = 0, shade = true) {
    const c = Math.cos(yaw), s = Math.sin(yaw);
    const P = (x: number, y: number, z: number) => [cx + x * c + z * s, cy + y, cz - x * s + z * c];
    const v = [
      P(-hx, -hy, -hz), P(hx, -hy, -hz), P(hx, hy, -hz), P(-hx, hy, -hz),
      P(-hx, -hy, hz), P(hx, -hy, hz), P(hx, hy, hz), P(-hx, hy, hz),
    ];
    const dim = (k: number) => (shade ? color.map((x) => x * k) : color);
    this.quad(v[4], v[5], v[6], v[7], dim(0.92)); // +z
    this.quad(v[1], v[0], v[3], v[2], dim(0.92)); // -z
    this.quad(v[5], v[1], v[2], v[6], dim(0.85)); // +x
    this.quad(v[0], v[4], v[7], v[3], dim(0.85)); // -x
    this.quad(v[3], v[7], v[6], v[2], dim(1)); // top
    this.quad(v[0], v[1], v[5], v[4], dim(0.6)); // bottom
  }
}

export interface Mesh {
  buf: WebGLBuffer;
  count: number;
}

const VS = `
attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uViewProj; uniform mat4 uModel;
varying vec3 vCol; varying vec3 vNor; varying vec3 vWorld;
void main() {
  vec4 w = uModel * vec4(aPos, 1.0);
  vWorld = w.xyz;
  vNor = mat3(uModel) * aNor;
  vCol = aCol;
  gl_Position = uViewProj * w;
}`;

const FS = `
precision mediump float;
varying vec3 vCol; varying vec3 vNor; varying vec3 vWorld;
uniform vec3 uTint; uniform vec3 uSun; uniform vec3 uCam; uniform vec3 uFog; uniform vec2 uFogRange;
void main() {
  vec3 n = normalize(vNor);
  if (dot(n, uCam - vWorld) < 0.0) n = -n; // two-sided lighting
  float diff = max(dot(n, uSun), 0.0);
  float sky = 0.5 + 0.5 * n.y;
  vec3 c = vCol * uTint * (0.38 + 0.22 * sky + 0.55 * diff);
  float dist = length(vWorld - uCam);
  float f = clamp((dist - uFogRange.x) / (uFogRange.y - uFogRange.x), 0.0, 1.0);
  gl_FragColor = vec4(mix(c, uFog, f), 1.0);
}`;

export class Renderer {
  gl: WebGLRenderingContext;
  private prog: WebGLProgram;
  private loc: Record<string, WebGLUniformLocation | number>;
  viewProj: Mat4 = mat4.identity();
  camPos = [0, 0, 0];
  width = 1;
  height = 1;

  constructor(public canvas: HTMLCanvasElement) {
    const gl = canvas.getContext("webgl", { antialias: true, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL is not available in this browser.");
    this.gl = gl;
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) ?? "shader error");
      return s;
    };
    const p = gl.createProgram()!;
    gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, FS));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) ?? "link error");
    this.prog = p;
    gl.useProgram(p);
    this.loc = {
      aPos: gl.getAttribLocation(p, "aPos"),
      aNor: gl.getAttribLocation(p, "aNor"),
      aCol: gl.getAttribLocation(p, "aCol"),
    };
    for (const u of ["uViewProj", "uModel", "uTint", "uSun", "uCam", "uFog", "uFogRange"]) this.loc[u] = gl.getUniformLocation(p, u)!;
    gl.enable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    const sun = [0.45, 0.8, 0.35];
    const l = Math.hypot(...sun);
    gl.uniform3f(this.loc.uSun as WebGLUniformLocation, sun[0] / l, sun[1] / l, sun[2] / l);
  }

  upload(g: Geometry): Mesh {
    const gl = this.gl;
    const n = g.pos.length / 3;
    const data = new Float32Array(n * 9);
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 3; k++) {
        data[i * 9 + k] = g.pos[i * 3 + k];
        data[i * 9 + 3 + k] = g.nor[i * 3 + k];
        data[i * 9 + 6 + k] = g.col[i * 3 + k];
      }
    }
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return { buf, count: n };
  }

  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(this.canvas.clientWidth * dpr);
    const h = Math.floor(this.canvas.clientHeight * dpr);
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.width = this.canvas.clientWidth;
    this.height = this.canvas.clientHeight;
    this.gl.viewport(0, 0, w, h);
  }

  begin(eye: number[], target: number[], sky: number[], fog: [number, number], fov = 0.95, near = 0.6) {
    const gl = this.gl;
    const aspect = this.width / Math.max(1, this.height);
    const proj = mat4.perspective(fov, aspect, near, 4000);
    this.viewProj = mat4.multiply(proj, mat4.lookAt(eye, target));
    this.camPos = eye;
    gl.clearColor(sky[0], sky[1], sky[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.useProgram(this.prog);
    gl.uniformMatrix4fv(this.loc.uViewProj as WebGLUniformLocation, false, this.viewProj);
    gl.uniform3f(this.loc.uCam as WebGLUniformLocation, eye[0], eye[1], eye[2]);
    gl.uniform3f(this.loc.uFog as WebGLUniformLocation, sky[0], sky[1], sky[2]);
    gl.uniform2f(this.loc.uFogRange as WebGLUniformLocation, fog[0], fog[1]);
  }

  draw(mesh: Mesh, model: Mat4 = mat4.identity(), tint: number[] = [1, 1, 1]) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    const stride = 36;
    for (const [name, off] of [["aPos", 0], ["aNor", 12], ["aCol", 24]] as const) {
      const l = this.loc[name] as number;
      gl.enableVertexAttribArray(l);
      gl.vertexAttribPointer(l, 3, gl.FLOAT, false, stride, off);
    }
    gl.uniformMatrix4fv(this.loc.uModel as WebGLUniformLocation, false, model);
    gl.uniform3f(this.loc.uTint as WebGLUniformLocation, tint[0], tint[1], tint[2]);
    gl.drawArrays(gl.TRIANGLES, 0, mesh.count);
  }

  /** World point to CSS pixel coordinates; null when behind the camera. */
  project(p: number[]): { x: number; y: number; depth: number } | null {
    const v = mat4.transformPoint(this.viewProj, p);
    if (v[3] <= 0 || v[2] > 1) return null;
    return { x: ((v[0] + 1) / 2) * this.width, y: ((1 - v[1]) / 2) * this.height, depth: v[3] };
  }
}

export function hexToRgb(hex: string): number[] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}
