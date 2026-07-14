import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDateWindow, calculateStreaks } from './dashboard.js';

test('buildDateWindow returns the requested inclusive history', () => {
  const dates = buildDateWindow(3, new Date(2026, 6, 14, 12));
  assert.deepEqual(dates, ['2026-07-12', '2026-07-13', '2026-07-14']);
});

test('calculateStreaks reports current and longest runs', () => {
  assert.deepEqual(calculateStreaks([
    { views: 1 }, { views: 1 }, { views: 0 }, { views: 2 }, { views: 1 }, { views: 3 },
  ]), { currentStreak: 3, longestStreak: 3 });
});
