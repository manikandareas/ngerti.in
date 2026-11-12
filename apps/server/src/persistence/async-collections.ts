/** Sequential callbacks preserve transaction/savepoint order and short-circuit semantics. */
export async function asyncMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number, items: readonly T[]) => R | Promise<R>,
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i++) results.push(await fn(items[i], i, items));
  return results;
}
export async function asyncFilter<T>(
  items: readonly T[],
  fn: (item: T, index: number) => unknown | Promise<unknown>,
): Promise<T[]> {
  const results: T[] = [];
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) results.push(items[i]);
  return results;
}
export async function asyncFind<T>(
  items: readonly T[],
  fn: (item: T, index: number) => unknown | Promise<unknown>,
): Promise<T | undefined> {
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return items[i];
}
export async function asyncFindIndex<T>(
  items: readonly T[],
  fn: (item: T, index: number) => unknown | Promise<unknown>,
): Promise<number> {
  for (let i = 0; i < items.length; i++) if (await fn(items[i], i)) return i;
  return -1;
}
export async function asyncSome<T>(
  items: readonly T[],
  fn: (item: T, index: number) => unknown | Promise<unknown>,
): Promise<boolean> {
  return (await asyncFindIndex(items, fn)) !== -1;
}
export async function asyncEvery<T>(
  items: readonly T[],
  fn: (item: T, index: number) => unknown | Promise<unknown>,
): Promise<boolean> {
  for (let i = 0; i < items.length; i++) if (!(await fn(items[i], i))) return false;
  return true;
}
export async function asyncForEach<T>(
  items: readonly T[],
  fn: (item: T, index: number) => unknown | Promise<unknown>,
): Promise<void> {
  for (let i = 0; i < items.length; i++) await fn(items[i], i);
}
export async function asyncFlatMap<T, R>(
  items: readonly T[],
  fn: (item: T, index: number) => R[] | Promise<R[]>,
): Promise<R[]> {
  return (await asyncMap(items, fn)).flat();
}
