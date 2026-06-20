export interface BenchmarkResult {
  name: string;
  durationMs: number;
  throughputMBps?: number;
  category: "compute" | "memory" | "io";
}

export interface GpuCapabilities {
  webgl: boolean;
  webgl2: boolean;
  webgpu: boolean;
  maxTextureSize: number;
  vendor: string;
  renderer: string;
  extensions: string[];
}

export interface GpuComputeResult {
  name: string;
  durationMs: number;
  parallelUnits: number;
  mode: "webgpu" | "webgl2" | "webgl" | "cpu-fallback";
  outputSample: number[];
  throughputGFlops: number;
}

export interface GpuBenchmarkComparison {
  cpu: { durationMs: number; throughputGFlops: number };
  gpu: GpuComputeResult;
  speedupX: number;
}
