/**
 * Safari (including current iPadOS) can lack ReadableStream async iteration.
 * That surfaces as: TypeError: undefined is not a function (near '...e of t...').
 */
export function polyfillReadableStreamAsyncIterator(): void {
  if (typeof ReadableStream === "undefined") {
    return;
  }
  const proto = ReadableStream.prototype as unknown as {
    [Symbol.asyncIterator]?: () => AsyncIterableIterator<unknown>;
  };
  if (typeof proto[Symbol.asyncIterator] === "function") {
    return;
  }
  Object.defineProperty(ReadableStream.prototype, Symbol.asyncIterator, {
    configurable: true,
    writable: true,
    value: async function* readableStreamAsyncIterator(
      this: ReadableStream,
    ): AsyncGenerator<unknown, void, unknown> {
      const reader = this.getReader();
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) {
            return;
          }
          yield value;
        }
      } finally {
        reader.releaseLock();
      }
    },
  });
}
