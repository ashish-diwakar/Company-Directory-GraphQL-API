// Forward cancellation immediately, including while next() waits for an event.
// Wrapping this in an async generator would queue return() behind the pending next().
export function filteredEvents<T>(source: AsyncIterableIterator<T>, visible: (event: T) => Promise<boolean>): AsyncIterableIterator<T> {
  return {
    async next() {
      try {
        while (true) {
          const result = await source.next();
          if (result.done || await visible(result.value)) return result;
        }
      } catch (error) { await source.return?.(); throw error; }
    },
    return: () => source.return ? source.return() : Promise.resolve({ done: true, value: undefined }),
    [Symbol.asyncIterator]() { return this; },
  };
}
