import type { GpuCapabilities, GpuComputeResult, GpuBenchmarkComparison } from "./types";

const VERT_SRC = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAG_SRC = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 fragColor;
uniform float u_n;
uniform float u_offset;

float computeKernel(float idx) {
  float x = (idx + u_offset) * 0.001;
  float acc = 0.0;
  for (float i = 0.0; i < 8.0; i++) {
    acc += sin(x * (i + 1.0)) * cos(x * (i + 1.0) * 0.7);
    acc += sqrt(abs(x * i + 1.0));
    acc += mod(x * i * 3.14159, 1.0);
  }
  return acc;
}

void main() {
  float idx = floor(v_uv.x * u_n) + floor(v_uv.y * u_n) * u_n;
  float result = computeKernel(idx);
  result = fract(abs(result));
  fragColor = vec4(result, result * 0.5, result * 0.25, 1.0);
}`;

/**
 * GpuBridge — runs parallel compute kernels on GPU via WebGL2.
 * Falls back to CPU if WebGL2 is unavailable.
 *
 * NOTE (Future Developer):
 * - WebGL2 Fragment Shaders are used as GPGPU emulation.
 * - Algorithms are designed for future migration to WebGPU Compute Shaders
 *   or Vulkan Compute via FFI bridge without rewriting compute logic.
 */
export class GpuBridge {
  private _caps: GpuCapabilities | null = null;
  private _canvas: HTMLCanvasElement | null = null;
  private _gl: WebGL2RenderingContext | null = null;

  getCapabilities(): GpuCapabilities {
    if (this._caps) return this._caps;
    const canvas = document.createElement("canvas");
    canvas.width = 1; canvas.height = 1;
    const gl2 = canvas.getContext("webgl2");
    const gl1 = canvas.getContext("webgl");
    const gl = gl2 ?? gl1;
    const dbgInfo = gl ? gl.getExtension("WEBGL_debug_renderer_info") : null;
    this._caps = {
      webgl:        !!gl1,
      webgl2:       !!gl2,
      webgpu:       "gpu" in navigator,
      maxTextureSize: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 0,
      vendor:   dbgInfo && gl ? gl.getParameter(dbgInfo.UNMASKED_VENDOR_WEBGL)   : "unknown",
      renderer: dbgInfo && gl ? gl.getParameter(dbgInfo.UNMASKED_RENDERER_WEBGL) : "unknown",
      extensions: gl ? (gl.getSupportedExtensions() ?? []) : [],
    };
    return this._caps;
  }

  private _initGL(n: number): WebGL2RenderingContext | null {
    try {
      if (!this._canvas) this._canvas = document.createElement("canvas");
      this._canvas.width = n; this._canvas.height = n;
      if (!this._gl) this._gl = this._canvas.getContext("webgl2");
      return this._gl;
    } catch { return null; }
  }

  private _compileShader(gl: WebGL2RenderingContext, type: number, src: string): WebGLShader | null {
    const s = gl.createShader(type);
    if (!s) return null;
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { gl.deleteShader(s); return null; }
    return s;
  }

  private _runCpuKernel(n: number, offset = 0): number {
    let total = 0;
    const count = n * n;
    for (let i = 0; i < count; i++) {
      const x = (i + offset) * 0.001;
      let acc = 0;
      for (let k = 0; k < 8; k++) {
        acc += Math.sin(x * (k + 1)) * Math.cos(x * (k + 1) * 0.7);
        acc += Math.sqrt(Math.abs(x * k + 1));
        acc += ((x * k * 3.14159) % 1 + 1) % 1;
      }
      total += acc;
    }
    return total;
  }

  async runParallelKernel(options: { n?: number; offset?: number } = {}): Promise<GpuComputeResult> {
    const n = options.n ?? 256;
    const offset = options.offset ?? 0;
    const caps = this.getCapabilities();

    if (!caps.webgl2) {
      const start = performance.now();
      const total = this._runCpuKernel(n, offset);
      const ms = performance.now() - start;
      return {
        name: `Parallel Kernel N=${n}x${n}`,
        durationMs: ms, parallelUnits: 1, mode: "cpu-fallback",
        outputSample: [total],
        throughputGFlops: ((n * n * 8 * 3) / 1e9) / (ms / 1000),
      };
    }

    const gl = this._initGL(n);
    if (!gl) {
      const start = performance.now();
      const total = this._runCpuKernel(n, offset);
      const ms = performance.now() - start;
      return {
        name: `Parallel Kernel N=${n}x${n}`,
        durationMs: ms, parallelUnits: 1, mode: "cpu-fallback",
        outputSample: [total],
        throughputGFlops: ((n * n * 8 * 3) / 1e9) / (ms / 1000),
      };
    }

    const vert = this._compileShader(gl, gl.VERTEX_SHADER, VERT_SRC);
    const frag = this._compileShader(gl, gl.FRAGMENT_SHADER, FRAG_SRC);
    if (!vert || !frag) {
      return { name: "Compile Error", durationMs: 0, parallelUnits: 0, mode: "cpu-fallback", outputSample: [], throughputGFlops: 0 };
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vert); gl.attachShader(prog, frag);
    gl.linkProgram(prog); gl.useProgram(prog);

    const quad = new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
    const posLoc = gl.getAttribLocation(prog, "a_pos");
    gl.enableVertexAttribArray(posLoc);
    gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

    gl.uniform1f(gl.getUniformLocation(prog, "u_n"), n);
    gl.uniform1f(gl.getUniformLocation(prog, "u_offset"), offset);
    gl.viewport(0, 0, n, n);

    const start = performance.now();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.finish();
    const durationMs = performance.now() - start;

    const pixels = new Uint8Array(n * n * 4);
    gl.readPixels(0, 0, n, n, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    const sample = Array.from(pixels.slice(0, 16)).map(v => v / 255);
    const ops = n * n * 8 * 3;
    const throughputGFlops = (ops / 1e9) / (durationMs / 1000);

    gl.deleteProgram(prog);
    gl.deleteShader(vert);
    gl.deleteShader(frag);

    return {
      name: `Parallel Kernel N=${n}×${n} (${n * n} thread)`,
      durationMs, parallelUnits: n * n, mode: "webgl2",
      outputSample: sample, throughputGFlops,
    };
  }

  async compareCpuVsGpu(n = 256): Promise<GpuBenchmarkComparison> {
    const cpuStart = performance.now();
    this._runCpuKernel(n);
    const cpuMs = performance.now() - cpuStart;
    const ops = n * n * 8 * 3;
    const cpuGFlops = (ops / 1e9) / (cpuMs / 1000);
    const gpuResult = await this.runParallelKernel({ n });
    return {
      cpu: { durationMs: cpuMs, throughputGFlops: cpuGFlops },
      gpu: gpuResult,
      speedupX: cpuMs / gpuResult.durationMs,
    };
  }

  dispose() {
    if (this._canvas) {
      this._canvas.width = 0; this._canvas.height = 0;
      this._canvas = null; this._gl = null;
    }
  }
}
