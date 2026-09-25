export interface GroupBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface GroupOutline {
  left: number;
  top: number;
  width: number;
  height: number;
  path: string;
  topPoint: { x: number; y: number };
  points: { x: number; y: number }[];
}

interface Point {
  x: number;
  y: number;
}

interface ItemRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

// guaranteed minimum clearance kept between the outline and every item edge
const OUTLINE_PADDING = 50;
// jitter only ever expands the loop outward so the padding clearance is never violated
const OUTLINE_JITTER_RATIO = 0.18;
const OUTLINE_POINT_COUNT = 14;
// how far (and how many times) a point is nudged outward until it clears every item
const CLEARANCE_STEP = 6;
const MAX_CLEARANCE_ITERATIONS = 40;

/** Deterministic PRNG so a group's hand-drawn loop stays stable across re-renders. */
function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function computeGroupBounds(items: ReadonlyArray<ItemRect>): GroupBounds {
  const minX = Math.min(...items.map((item) => item.x));
  const minY = Math.min(...items.map((item) => item.y));
  const maxX = Math.max(...items.map((item) => item.x + item.width));
  const maxY = Math.max(...items.map((item) => item.y + item.height));

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

function normalize(vector: Point): Point {
  const length = Math.hypot(vector.x, vector.y) || 1;
  return { x: vector.x / length, y: vector.y / length };
}

function distanceToRect(point: Point, rect: ItemRect): number {
  const closestX = Math.min(Math.max(point.x, rect.x), rect.x + rect.width);
  const closestY = Math.min(Math.max(point.y, rect.y), rect.y + rect.height);
  return Math.hypot(point.x - closestX, point.y - closestY);
}

/** Nudges a point straight outward from the group's center until it clears every item by OUTLINE_PADDING. */
function pushPointClearOfItems(point: Point, center: Point, items: ReadonlyArray<ItemRect>): Point {
  const direction = normalize({ x: point.x - center.x, y: point.y - center.y });
  let current = point;

  for (let iteration = 0; iteration < MAX_CLEARANCE_ITERATIONS; iteration++) {
    const isTooClose = items.some((item) => distanceToRect(current, item) < OUTLINE_PADDING);
    if (!isTooClose) {
      return current;
    }
    current = {
      x: current.x + direction.x * CLEARANCE_STEP,
      y: current.y + direction.y * CLEARANCE_STEP,
    };
  }

  return current;
}

/**
 * Builds a smooth, hand-drawn looking oval loop around the group's items: a jittered
 * ellipse for the sketchy circle look, with every point nudged outward as needed so it
 * never comes within OUTLINE_PADDING of an item's edge.
 */
export function generateGroupOutline(items: ReadonlyArray<ItemRect>, seed: number): GroupOutline {
  const random = createSeededRandom(seed);
  const bounds = computeGroupBounds(items);

  const center: Point = { x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height / 2 };
  const baseRadiusX = bounds.width / 2 + OUTLINE_PADDING;
  const baseRadiusY = bounds.height / 2 + OUTLINE_PADDING;

  const points = Array.from({ length: OUTLINE_POINT_COUNT }, (_, index) => {
    const angle = (index / OUTLINE_POINT_COUNT) * Math.PI * 2;
    const jitter = 1 + random() * OUTLINE_JITTER_RATIO;
    const rawPoint: Point = {
      x: center.x + Math.cos(angle) * baseRadiusX * jitter,
      y: center.y + Math.sin(angle) * baseRadiusY * jitter,
    };
    return pushPointClearOfItems(rawPoint, center, items);
  });

  const minX = Math.min(...points.map((point) => point.x));
  const minY = Math.min(...points.map((point) => point.y));
  const maxX = Math.max(...points.map((point) => point.x));
  const maxY = Math.max(...points.map((point) => point.y));

  const left = minX;
  const top = minY;
  const width = maxX - minX;
  const height = maxY - minY;

  const localPoints = points.map((point) => ({ x: point.x - left, y: point.y - top }));
  const topPointLocal = localPoints.reduce((top, point) => (point.y < top.y ? point : top));

  return {
    left,
    top,
    width,
    height,
    path: buildSmoothClosedPath(localPoints),
    topPoint: { x: left + topPointLocal.x, y: top + topPointLocal.y },
    points,
  };
}

/** Ray-casting point-in-polygon test against an outline's world-space loop points. */
export function isPointInsideOutline(outline: GroupOutline, point: Point): boolean {
  const { points } = outline;
  let isInside = false;

  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const current = points[i];
    const previous = points[j];
    const intersects =
      current.y > point.y !== previous.y > point.y &&
      point.x <
        ((previous.x - current.x) * (point.y - current.y)) / (previous.y - current.y) + current.x;
    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

/** Catmull-Rom -> cubic Bezier through every point, so the loop reads as a smooth curve rather than a faceted polygon. */
function buildSmoothClosedPath(points: ReadonlyArray<Point>): string {
  const count = points.length;
  let path = `M ${points[0].x} ${points[0].y} `;

  for (let index = 0; index < count; index++) {
    const previous = points[(index - 1 + count) % count];
    const current = points[index];
    const next = points[(index + 1) % count];
    const afterNext = points[(index + 2) % count];

    const control1X = current.x + (next.x - previous.x) / 6;
    const control1Y = current.y + (next.y - previous.y) / 6;
    const control2X = next.x - (afterNext.x - current.x) / 6;
    const control2Y = next.y - (afterNext.y - current.y) / 6;

    path += `C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${next.x} ${next.y} `;
  }

  return `${path}Z`;
}
