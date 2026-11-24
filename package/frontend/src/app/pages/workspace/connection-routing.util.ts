import { CanvasConnectionAnchor, WorkspaceCanvasItem } from '../../interface/workspace.interface';

interface Point {
  x: number;
  y: number;
}

const ROUTE_MARGIN = 20;
export const CONNECTION_ARROW_SIZE = 8;
export const CONNECTION_ARROW_REF_X = CONNECTION_ARROW_SIZE;

export function connectionArrowClearance(strokeWidth: number): number {
  return Math.max(ROUTE_MARGIN, (CONNECTION_ARROW_REF_X + 1) * strokeWidth);
}

export function connectionArrowSizeForDistance(distance: number, strokeWidth: number): number {
  return Math.min(
    CONNECTION_ARROW_SIZE,
    (distance * CONNECTION_ARROW_SIZE) / ((CONNECTION_ARROW_REF_X + 1) * strokeWidth),
  );
}

export function connectionAnchorPoint(
  item: WorkspaceCanvasItem,
  anchor: CanvasConnectionAnchor,
): Point {
  switch (anchor) {
    case 'top':
      return { x: item.x + item.width / 2, y: item.y };
    case 'right':
      return { x: item.x + item.width, y: item.y + item.height / 2 };
    case 'bottom':
      return { x: item.x + item.width / 2, y: item.y + item.height };
    case 'left':
      return { x: item.x, y: item.y + item.height / 2 };
  }
}

export function connectionAnchorOffset(
  point: Point,
  anchor: CanvasConnectionAnchor,
  distance = ROUTE_MARGIN,
): Point {
  switch (anchor) {
    case 'top':
      return { x: point.x, y: point.y - distance };
    case 'right':
      return { x: point.x + distance, y: point.y };
    case 'bottom':
      return { x: point.x, y: point.y + distance };
    case 'left':
      return { x: point.x - distance, y: point.y };
  }
}

function intersects(start: Point, end: Point, item: WorkspaceCanvasItem): boolean {
  if (start.x === end.x) {
    return (
      start.x > item.x &&
      start.x < item.x + item.width &&
      Math.max(start.y, end.y) > item.y &&
      Math.min(start.y, end.y) < item.y + item.height
    );
  }
  return (
    start.y > item.y &&
    start.y < item.y + item.height &&
    Math.max(start.x, end.x) > item.x &&
    Math.min(start.x, end.x) < item.x + item.width
  );
}

function exitPoint(
  point: Point,
  anchor: CanvasConnectionAnchor,
  other: WorkspaceCanvasItem,
  desiredDistance = ROUTE_MARGIN,
): Point {
  const fullOffset = connectionAnchorOffset(point, anchor, desiredDistance);
  if (!intersects(point, fullOffset, other)) return fullOffset;
  const distance =
    anchor === 'right'
      ? other.x - point.x
      : anchor === 'left'
        ? point.x - other.x - other.width
        : anchor === 'bottom'
          ? other.y - point.y
          : point.y - other.y - other.height;
  return connectionAnchorOffset(point, anchor, Math.max(0, distance / 2));
}

export function connectionArrowMarkerSize(
  source: WorkspaceCanvasItem,
  target: WorkspaceCanvasItem,
  targetAnchor: CanvasConnectionAnchor,
  strokeWidth: number,
): number {
  const end = connectionAnchorPoint(target, targetAnchor);
  const endExit = exitPoint(end, targetAnchor, source, connectionArrowClearance(strokeWidth));
  const availableDistance = Math.abs(endExit.x - end.x) + Math.abs(endExit.y - end.y);
  return connectionArrowSizeForDistance(availableDistance, strokeWidth);
}

function simplify(points: Point[]): Point[] | null {
  const simplified: Point[] = [];
  for (const point of points) {
    const previous = simplified[simplified.length - 1];
    if (previous && point.x === previous.x && point.y === previous.y) continue;
    if (previous && point.x !== previous.x && point.y !== previous.y) return null;
    const before = simplified[simplified.length - 2];
    if (
      before &&
      ((before.x === previous.x && previous.x === point.x) ||
        (before.y === previous.y && previous.y === point.y))
    ) {
      const direction =
        (previous.x - before.x) * (point.x - previous.x) +
        (previous.y - before.y) * (point.y - previous.y);
      if (direction < 0) return null;
      simplified.pop();
    }
    simplified.push(point);
  }
  return simplified;
}

function outward(anchor: CanvasConnectionAnchor, from: Point, to: Point): boolean {
  switch (anchor) {
    case 'top':
      return to.x === from.x && to.y < from.y;
    case 'right':
      return to.y === from.y && to.x > from.x;
    case 'bottom':
      return to.x === from.x && to.y > from.y;
    case 'left':
      return to.y === from.y && to.x < from.x;
  }
}

export function routeCanvasConnection(
  source: WorkspaceCanvasItem,
  target: WorkspaceCanvasItem,
  sourceAnchor: CanvasConnectionAnchor,
  targetAnchor: CanvasConnectionAnchor,
  strokeWidth = 2,
): string | null {
  const start = connectionAnchorPoint(source, sourceAnchor);
  const end = connectionAnchorPoint(target, targetAnchor);
  const startExit = exitPoint(start, sourceAnchor, target);
  const arrowClearance = connectionArrowClearance(strokeWidth);
  const endExit = exitPoint(end, targetAnchor, source, arrowClearance);
  const middleX = (startExit.x + endExit.x) / 2;
  const middleY = (startExit.y + endExit.y) / 2;
  const xRoutes = [
    middleX,
    source.x - ROUTE_MARGIN,
    source.x + source.width + ROUTE_MARGIN,
    target.x - ROUTE_MARGIN,
    target.x + target.width + ROUTE_MARGIN,
  ];
  const yRoutes = [
    middleY,
    source.y - ROUTE_MARGIN,
    source.y + source.height + ROUTE_MARGIN,
    target.y - ROUTE_MARGIN,
    target.y + target.height + ROUTE_MARGIN,
  ];
  if (arrowClearance > ROUTE_MARGIN) {
    xRoutes.push(endExit.x);
    yRoutes.push(endExit.y);
  }
  const candidates: Point[][] = [
    [start, startExit, { x: middleX, y: startExit.y }, { x: middleX, y: endExit.y }, endExit, end],
    [start, startExit, { x: startExit.x, y: middleY }, { x: endExit.x, y: middleY }, endExit, end],
    [start, startExit, { x: endExit.x, y: startExit.y }, endExit, end],
    [start, startExit, { x: startExit.x, y: endExit.y }, endExit, end],
  ];
  for (const x of xRoutes) {
    for (const y of yRoutes) {
      candidates.push(
        [start, startExit, { x, y: startExit.y }, { x, y }, { x: endExit.x, y }, endExit, end],
        [start, startExit, { x: startExit.x, y }, { x, y }, { x, y: endExit.y }, endExit, end],
      );
    }
  }
  let best: Point[] | null = null;
  let bestLength = Infinity;
  for (const candidate of candidates) {
    const points = simplify(candidate);
    if (
      !points ||
      points.length < 2 ||
      !outward(sourceAnchor, points[0], points[1]) ||
      !outward(targetAnchor, points[points.length - 1], points[points.length - 2])
    )
      continue;
    let length = 0;
    let blocked = false;
    for (let index = 1; index < points.length; index++) {
      const previous = points[index - 1];
      const current = points[index];
      if (intersects(previous, current, source) || intersects(previous, current, target)) {
        blocked = true;
        break;
      }
      length += Math.abs(current.x - previous.x) + Math.abs(current.y - previous.y);
    }
    if (
      !blocked &&
      (!best ||
        points.length < best.length ||
        (points.length === best.length && length < bestLength))
    ) {
      best = points;
      bestLength = length;
    }
  }
  if (!best) return null;
  const bestPath = best;
  return bestPath
    .slice(1)
    .reduce(
      (path, point, index) =>
        `${path} ${point.x === bestPath[index].x ? `V ${point.y}` : `H ${point.x}`}`,
      `M ${bestPath[0].x} ${bestPath[0].y}`,
    );
}
