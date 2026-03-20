import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWithConcurrency, normalizePositiveInt } from '../src/async-utils.js';

test('normalizePositiveInt accepts positive integers and falls back otherwise', () => {
  assert.equal(normalizePositiveInt(3, 1), 3);
  assert.equal(normalizePositiveInt('4', 1), 4);
  assert.equal(normalizePositiveInt('0', 2), 2);
  assert.equal(normalizePositiveInt(-1, 2), 2);
  assert.equal(normalizePositiveInt('abc', 2), 2);
});

test('mapWithConcurrency preserves order while honoring the concurrency limit', async () => {
  let activeTasks = 0;
  let maxActiveTasks = 0;

  const result = await mapWithConcurrency(
    [30, 5, 15],
    2,
    async (delayMs, index) => {
      activeTasks += 1;
      maxActiveTasks = Math.max(maxActiveTasks, activeTasks);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      activeTasks -= 1;
      return `task-${index}`;
    },
  );

  assert.deepEqual(result, ['task-0', 'task-1', 'task-2']);
  assert.equal(maxActiveTasks, 2);
});
