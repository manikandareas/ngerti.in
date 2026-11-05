/** Read at most the preview limit plus one byte, then cancel the remaining transfer. */
export async function readFilePreview(response: Response, limit: number, signal: AbortSignal) {
  if (!response.body) throw new Error("File preview stream is unavailable.");
  const reader = response.body.getReader();
  const bytes = new Uint8Array(limit + 1);
  let size = 0;
  try {
    while (size <= limit) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      if (chunk.done) break;
      const count = Math.min(chunk.value.length, bytes.length - size);
      bytes.set(chunk.value.subarray(0, count), size);
      size += count;
    }
    signal.throwIfAborted();
    return { bytes: bytes.subarray(0, Math.min(size, limit)), truncated: size > limit };
  } finally {
    void reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
