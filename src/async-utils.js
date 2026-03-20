export function normalizePositiveInt(value, fallback = 1) {
  if (typeof value === 'number' && Number.isInteger(value) && value > 0) {
    return value;
  }

  if (typeof value === 'string' && /^\d+$/.test(value.trim())) {
    const parsed = Number.parseInt(value.trim(), 10);
    if (parsed > 0) {
      return parsed;
    }
  }

  return fallback;
}

export async function mapWithConcurrency(items, concurrency, mapper) {
  const list = Array.isArray(items) ? items : Array.from(items || []);
  if (!list.length) {
    return [];
  }

  const workerCount = Math.min(normalizePositiveInt(concurrency, 1), list.length);
  const results = new Array(list.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < list.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(list[currentIndex], currentIndex);
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}
