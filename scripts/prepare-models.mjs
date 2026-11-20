import { cp, mkdir } from 'node:fs/promises';

const destination = new URL('../public/models/', import.meta.url);
await mkdir(destination, { recursive: true });
await cp(
  new URL('../node_modules/@mediapipe/tasks-vision/wasm/', import.meta.url),
  new URL('wasm/', destination),
  { recursive: true },
);
