/**
 * components/day-view/DayEquityCurve.tsx — Mini SVG equity curve for one day.
 *
 * Plots running net P&L across a day's trades (ordered by close_time).
 * Self-contained inline SVG — no charting library needed. Similar approach
 * to CumulativePnlChart but scoped to a single day and compact (140×36 px).
 */

"use client";

interface Point {
  t: number; // timestamp ms
  cum: number;
}

interface Props {
  points: Point[];
  width?: number;
  height?: number;
}

export default function DayEquityCurve({ points, width = 200, height = 48 }: Props) {
  if (points.length === 0) {
    return (
      <div
        style={{ width, height }}
        className="flex items-center justify-center text-[10px] text-gray-300"
      >
        No data
      </div>
    );
  }

  // If only one point, render a flat line
  const series =
    points.length === 1
      ? [{ t: points[0].t - 1, cum: 0 }, points[0]]
      : points;

  const min = Math.min(0, ...series.map((p) => p.cum));
  const max = Math.max(0, ...series.map((p) => p.cum));
  const range = max - min || 1;

  const xMin = series[0].t;
  const xMax = series[series.length - 1].t;
  const xRange = xMax - xMin || 1;

  const pad = 2;
  const w = width - pad * 2;
  const h = height - pad * 2;

  const coord = (p: Point) => {
    const x = pad + ((p.t - xMin) / xRange) * w;
    const y = pad + h - ((p.cum - min) / range) * h;
    return [x, y] as const;
  };

  const path = series
    .map((p, i) => {
      const [x, y] = coord(p);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");

  const last = series[series.length - 1].cum;
  const stroke = last >= 0 ? "#16c784" : "#ea3943";
  const fill = last >= 0 ? "rgba(22,199,132,0.12)" : "rgba(234,57,67,0.12)";

  // Zero line y-coordinate
  const zeroY = pad + h - ((0 - min) / range) * h;

  // Area path: close to the zero line
  const [x0] = coord(series[0]);
  const [xN] = coord(series[series.length - 1]);
  const area = `${path} L${xN.toFixed(1)},${zeroY.toFixed(1)} L${x0.toFixed(1)},${zeroY.toFixed(1)} Z`;

  return (
    <svg width={width} height={height} className="block">
      <path d={area} fill={fill} />
      <line
        x1={pad}
        x2={width - pad}
        y1={zeroY}
        y2={zeroY}
        stroke="#e5e7eb"
        strokeDasharray="2 2"
      />
      <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinecap="round" />
    </svg>
  );
}
