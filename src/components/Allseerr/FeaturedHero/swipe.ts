// Pure math behind the hero's swipe: which slide sits where, whether a
// release moves on, and how long the settle takes. Kept apart from the
// component so it can be unit tested.

/** Share of the banner's width a drag has to pass to move on */
export const COMMIT_FRACTION = 0.25;
/** Release speed, in px/ms, that moves on whatever the distance */
export const FLICK_VELOCITY = 0.3;
/** A flick still has to travel this far, so a tap never turns the slide */
export const FLICK_MIN_DISTANCE = 10;
export const SETTLE_MIN_MS = 200;
export const SETTLE_MAX_MS = 350;
/** How much a fast release shortens the settle, per px/ms of speed */
const SPEED_SHORTENING = 0.25;

/** An index wrapped into 0..count-1, for any whole number */
export const wrapIndex = (index: number, count: number): number =>
  count > 0 ? ((index % count) + count) % count : 0;

/**
 * Where a slide sits relative to the active one, in slide widths: 0 for the
 * active slide, -1 and 1 for its neighbours, wrapping round the ends. With
 * an even count the slide opposite the active one counts as behind it.
 */
export const relativeSlot = (
  index: number,
  active: number,
  count: number
): number => {
  if (count < 1) {
    return 0;
  }
  const half = Math.floor(count / 2);
  return wrapIndex(index - active + half, count) - half;
};

/**
 * Whether a released drag moves on: 1 for the next slide, -1 for the
 * previous one, 0 to snap back. The offset is how far the track was dragged
 * (negative means towards the next slide) and the velocity is in px/ms.
 */
export const snapDirection = (
  offset: number,
  velocity: number,
  width: number
): -1 | 0 | 1 => {
  if (
    Math.abs(velocity) >= FLICK_VELOCITY &&
    Math.abs(offset) >= FLICK_MIN_DISTANCE
  ) {
    // A flick back towards the start cancels rather than going the other way
    if (Math.sign(velocity) !== Math.sign(offset)) {
      return 0;
    }
    return velocity < 0 ? 1 : -1;
  }
  if (width > 0 && Math.abs(offset) >= width * COMMIT_FRACTION) {
    return offset < 0 ? 1 : -1;
  }
  return 0;
};

/**
 * How long the settle takes, in ms: longer for a longer way to go, shorter
 * after a fast release so a flick keeps its momentum. The ease-out curve
 * starts several times faster than its average, so even the longest settle
 * leaves the finger's speed behind rather than braking under it.
 */
export const settleDuration = (
  remaining: number,
  velocity: number,
  width: number
): number => {
  const share = Math.min(1, Math.abs(remaining) / (width || 1));
  const byDistance = SETTLE_MIN_MS + (SETTLE_MAX_MS - SETTLE_MIN_MS) * share;
  const shortened = byDistance / (1 + Math.abs(velocity) * SPEED_SHORTENING);
  return Math.round(Math.max(SETTLE_MIN_MS, shortened));
};

interface Sample {
  x: number;
  time: number;
}

/**
 * Release speed in px/ms from recent pointer samples, oldest first, looking
 * back over the last `window` ms so a pause before letting go reads as slow
 */
export const releaseVelocity = (samples: Sample[], window = 100): number => {
  if (samples.length < 2) {
    return 0;
  }
  const last = samples[samples.length - 1];
  let first = samples[samples.length - 2];
  for (let i = samples.length - 2; i >= 0; i--) {
    if (last.time - samples[i].time > window) {
      break;
    }
    first = samples[i];
  }
  const elapsed = last.time - first.time;
  return elapsed > 0 ? (last.x - first.x) / elapsed : 0;
};
