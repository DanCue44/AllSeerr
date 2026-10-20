import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  SETTLE_MAX_MS,
  SETTLE_MIN_MS,
  relativeSlot,
  releaseVelocity,
  settleDuration,
  snapDirection,
  wrapIndex,
} from './swipe';

describe('wrapIndex', () => {
  it('wraps past either end', () => {
    assert.equal(wrapIndex(6, 6), 0);
    assert.equal(wrapIndex(-1, 6), 5);
    assert.equal(wrapIndex(-7, 6), 5);
    assert.equal(wrapIndex(13, 6), 1);
    assert.equal(wrapIndex(3, 6), 3);
  });

  it('is 0 without slides', () => {
    assert.equal(wrapIndex(4, 0), 0);
  });
});

describe('relativeSlot', () => {
  it('puts neighbours either side, wrapping round', () => {
    assert.equal(relativeSlot(0, 0, 6), 0);
    assert.equal(relativeSlot(1, 0, 6), 1);
    assert.equal(relativeSlot(5, 0, 6), -1);
    assert.equal(relativeSlot(0, 5, 6), 1);
    assert.equal(relativeSlot(4, 5, 6), -1);
  });

  it('keeps the far slides out of the neighbour slots', () => {
    assert.equal(relativeSlot(3, 0, 6), -3);
    assert.equal(relativeSlot(2, 0, 6), 2);
    assert.equal(relativeSlot(4, 0, 6), -2);
  });

  it('handles two and three slides', () => {
    assert.equal(relativeSlot(1, 0, 2), -1);
    assert.equal(relativeSlot(0, 1, 2), -1);
    assert.equal(relativeSlot(1, 0, 3), 1);
    assert.equal(relativeSlot(2, 0, 3), -1);
  });
});

describe('snapDirection', () => {
  const width = 400;

  it('snaps back from a short slow drag', () => {
    assert.equal(snapDirection(-50, -0.1, width), 0);
    assert.equal(snapDirection(60, 0.05, width), 0);
  });

  it('moves on past a quarter of the width', () => {
    assert.equal(snapDirection(-100, 0, width), 1);
    assert.equal(snapDirection(100, 0, width), -1);
  });

  it('moves on from a short flick', () => {
    assert.equal(snapDirection(-30, -0.5, width), 1);
    assert.equal(snapDirection(30, 0.31, width), -1);
  });

  it('ignores a flick that barely moved', () => {
    assert.equal(snapDirection(-4, -1, width), 0);
  });

  it('snaps back when flicked back towards the start', () => {
    assert.equal(snapDirection(-250, 0.6, width), 0);
    assert.equal(snapDirection(250, -0.6, width), 0);
  });
});

describe('settleDuration', () => {
  const width = 400;

  it('stays within bounds', () => {
    assert.equal(settleDuration(0, 0, width), SETTLE_MIN_MS);
    assert.equal(settleDuration(400, 0, width), SETTLE_MAX_MS);
    assert.equal(settleDuration(5000, 0, width), SETTLE_MAX_MS);
  });

  it('takes longer for a longer way to go', () => {
    assert.ok(settleDuration(300, 0, width) > settleDuration(100, 0, width));
  });

  it('is quicker after a fast release', () => {
    assert.ok(settleDuration(300, 3, width) < settleDuration(300, 0, width));
  });
});

describe('releaseVelocity', () => {
  it('is 0 without enough samples', () => {
    assert.equal(releaseVelocity([]), 0);
    assert.equal(releaseVelocity([{ x: 0, time: 0 }]), 0);
  });

  it('reads the speed over the recent window', () => {
    const samples = [
      { x: 0, time: 0 },
      { x: 10, time: 200 },
      { x: 30, time: 250 },
      { x: 60, time: 300 },
    ];
    assert.equal(releaseVelocity(samples), 50 / 100);
  });

  it('falls back to the last two samples after a pause', () => {
    const samples = [
      { x: 0, time: 0 },
      { x: -40, time: 500 },
    ];
    assert.equal(releaseVelocity(samples), -40 / 500);
  });
});
