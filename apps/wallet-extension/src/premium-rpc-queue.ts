/**
 * Serialize JSON-RPC per Alchemy endpoint URL so one key is not burst in parallel on the same host path.
 */
const alchemyJsonRpcByUrl = new Map<string, Promise<unknown>>();

export function runAlchemyJsonRpcSerialized<T>(url: string, task: () => Promise<T>): Promise<T> {
  if (!/\.g\.alchemy\.com\b/i.test(url)) return task();
  const key = url.trim().split("?")[0]!.toLowerCase();
  const prev = alchemyJsonRpcByUrl.get(key) ?? Promise.resolve();
  const p = prev.then(task, task);
  alchemyJsonRpcByUrl.set(
    key,
    p.then(
      () => undefined,
      () => undefined
    )
  );
  return p;
}
