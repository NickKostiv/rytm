export type RuleSegment = { orientation: 'horizontal' | 'vertical'; position: number; start: number; end: number };

export type Box = { left: number; right: number; bottom: number; top: number };

export type TableCell = Box & { row: number; column: number; rowSpan: number; columnSpan: number };

export type TableGrid = Box & { rowCount: number; columnCount: number; cells: TableCell[] };

type Point = { x: number; y: number };

const SNAP_TOLERANCE = 2;
const MIN_TABLE_ROWS = 2;
const MIN_TABLE_COLUMNS = 2;

const mergeSegments = (segments: RuleSegment[]): RuleSegment[] => {
  const sorted = segments
    .map((segment) => ({ ...segment, start: Math.min(segment.start, segment.end), end: Math.max(segment.start, segment.end) }))
    .sort((a, b) => a.position - b.position || a.start - b.start);
  const lines: RuleSegment[][] = [];
  sorted.forEach((segment) => {
    const line = lines.at(-1);
    const anchor = line?.[0];
    if (line && anchor && segment.position - anchor.position <= SNAP_TOLERANCE) line.push({ ...segment, position: anchor.position });
    else lines.push([segment]);
  });
  return lines.flatMap((line) =>
    line
      .sort((a, b) => a.start - b.start)
      .reduce<RuleSegment[]>((merged, segment) => {
        const last = merged.at(-1);
        if (last && segment.start <= last.end + SNAP_TOLERANCE) {
          return [...merged.slice(0, -1), { ...last, end: Math.max(last.end, segment.end) }];
        }
        return [...merged, segment];
      }, []),
  );
};

const covers = (segments: RuleSegment[], position: number, from: number, to: number): boolean =>
  segments.some(
    (segment) =>
      segment.position === position &&
      segment.start <= Math.min(from, to) + SNAP_TOLERANCE &&
      segment.end >= Math.max(from, to) - SNAP_TOLERANCE,
  );

const findIntersections = (horizontal: RuleSegment[], vertical: RuleSegment[]): Point[] =>
  horizontal.flatMap((h) =>
    vertical
      .filter(
        (v) =>
          v.start - SNAP_TOLERANCE <= h.position &&
          h.position <= v.end + SNAP_TOLERANCE &&
          h.start - SNAP_TOLERANCE <= v.position &&
          v.position <= h.end + SNAP_TOLERANCE,
      )
      .map((v) => ({ x: v.position, y: h.position })),
  );

const pointKey = ({ x, y }: Point): string => `${x}|${y}`;

const findCells = (horizontal: RuleSegment[], vertical: RuleSegment[]): Box[] => {
  const points = findIntersections(horizontal, vertical);
  const pointKeys = new Set(points.map(pointKey));
  return points.flatMap((topLeft) => {
    const below = points.filter(({ x, y }) => x === topLeft.x && y < topLeft.y).sort((a, b) => b.y - a.y);
    const right = points.filter(({ x, y }) => y === topLeft.y && x > topLeft.x).sort((a, b) => a.x - b.x);
    for (const bottomLeft of below) {
      if (!covers(vertical, topLeft.x, topLeft.y, bottomLeft.y)) continue;
      for (const topRight of right) {
        if (!covers(horizontal, topLeft.y, topLeft.x, topRight.x)) continue;
        const bottomRight = { x: topRight.x, y: bottomLeft.y };
        if (
          pointKeys.has(pointKey(bottomRight)) &&
          covers(vertical, topRight.x, topRight.y, bottomRight.y) &&
          covers(horizontal, bottomLeft.y, bottomLeft.x, bottomRight.x)
        ) {
          return [{ left: topLeft.x, right: topRight.x, top: topLeft.y, bottom: bottomLeft.y }];
        }
      }
    }
    return [];
  });
};

const cornerKeys = (cell: Box): string[] =>
  [
    { x: cell.left, y: cell.top },
    { x: cell.right, y: cell.top },
    { x: cell.left, y: cell.bottom },
    { x: cell.right, y: cell.bottom },
  ].map(pointKey);

const groupTouchingCells = (cells: Box[]): Box[][] => {
  const groups: Array<{ cells: Box[]; corners: Set<string> }> = [];
  cells.forEach((cell) => {
    const corners = cornerKeys(cell);
    const touching = groups.filter((group) => corners.some((corner) => group.corners.has(corner)));
    const merged = {
      cells: [...touching.flatMap((group) => group.cells), cell],
      corners: new Set([...touching.flatMap((group) => [...group.corners]), ...corners]),
    };
    groups.splice(0, groups.length, ...groups.filter((group) => !touching.includes(group)), merged);
  });
  return groups.map((group) => group.cells);
};

const toGrid = (cells: Box[]): TableGrid => {
  const columns = [...new Set(cells.flatMap(({ left, right }) => [left, right]))].sort((a, b) => a - b);
  const rows = [...new Set(cells.flatMap(({ top, bottom }) => [top, bottom]))].sort((a, b) => b - a);
  const gridCells = cells
    .map((cell) => {
      const column = columns.indexOf(cell.left);
      const row = rows.indexOf(cell.top);
      return { ...cell, row, column, rowSpan: rows.indexOf(cell.bottom) - row, columnSpan: columns.indexOf(cell.right) - column };
    })
    .sort((a, b) => a.row - b.row || a.column - b.column);
  return {
    left: columns[0] ?? 0,
    right: columns.at(-1) ?? 0,
    top: rows[0] ?? 0,
    bottom: rows.at(-1) ?? 0,
    rowCount: rows.length - 1,
    columnCount: columns.length - 1,
    cells: gridCells,
  };
};

export const detectTables = (segments: RuleSegment[]): TableGrid[] => {
  const horizontal = mergeSegments(segments.filter(({ orientation }) => orientation === 'horizontal'));
  const vertical = mergeSegments(segments.filter(({ orientation }) => orientation === 'vertical'));
  return groupTouchingCells(findCells(horizontal, vertical))
    .map(toGrid)
    .filter(({ rowCount, columnCount }) => rowCount >= MIN_TABLE_ROWS && columnCount >= MIN_TABLE_COLUMNS)
    .sort((a, b) => b.top - a.top || a.left - b.left);
};
