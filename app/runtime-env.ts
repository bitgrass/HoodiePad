export type HoodiePadRuntimeEnv = {
  ARTWORK: R2Bucket;
};

declare global {
  var __HOODIEPAD_RUNTIME_ENV__: HoodiePadRuntimeEnv | undefined;
}

export function getRuntimeEnv() {
  const runtimeEnv = globalThis.__HOODIEPAD_RUNTIME_ENV__;
  if (!runtimeEnv?.ARTWORK) throw new Error("HoodiePad artwork storage is unavailable");
  return runtimeEnv;
}
