/// <reference lib="webworker" />
import { handleRpc, IndexEngine, type RpcRequest } from "../lib/core/engine";

const engine = new IndexEngine();
const ctx = self as unknown as {
  postMessage(m: unknown): void;
  onmessage: ((e: MessageEvent<RpcRequest>) => void) | null;
};
ctx.onmessage = (e) => ctx.postMessage(handleRpc(engine, e.data));
