"use client";
import { useState } from "react";
import { money } from "../../lib/money";

export type ChartWeek = { start: string; value: number; limit: number };

const W = 340;
const H = 190;
const PAD = { top: 12, right: 6, bottom: 24, left: 46 };
const plotW = W - PAD.left - PAD.right;
const plotH = H - PAD.top - PAD.bottom;

const shortDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

const dayDate = (date: string) =>
  new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${date}T12:00:00Z`));

// A round axis maximum: 1, 2 or 5 times a power of ten, at or above `max`.
function niceMax(max: number): number {
  if (max <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(max));
  return ([1, 2, 5, 10].find((m) => m * power >= max) ?? 10) * power;
}

// Bar with 4px rounded top corners, anchored square to the baseline.
function barPath(x: number, y: number, w: number, base: number): string {
  const r = Math.min(4, w / 2, base - y);
  return `M${x},${base}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${base}Z`;
}

export default function WeeklyChart({
  title,
  kind,
  unit = "week",
  weeks,
  valueLabel,
  limitLabel,
}: {
  title: string;
  kind: "money" | "count";
  unit?: "week" | "day";
  weeks: ChartWeek[];
  valueLabel: string;
  limitLabel: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const fmt = (n: number) => (kind === "money" ? money(n) : String(n));
  const max = Math.max(...weeks.flatMap((w) => [w.value, w.limit]));
  // Counts round up to an even number so the midpoint tick is whole.
  const top =
    kind === "count" ? Math.max(2, Math.ceil(max / 2) * 2) : niceMax(max);
  const y = (v: number) => PAD.top + plotH - (v / top) * plotH;
  const slot = plotW / weeks.length;
  const barW = Math.min(slot * 0.6, 24);
  const base = PAD.top + plotH;
  const labelEvery = Math.ceil(weeks.length / 4);
  const shown = active === null ? null : weeks[active];
  const label = (start: string) =>
    unit === "week" ? `Week of ${shortDate(start)}` : dayDate(start);
  return (
    <figure className="chart">
      <figcaption>
        <h2>{title}</h2>
        <ul className="legend" aria-label="Legend">
          <li>
            <span className="swatch bar" aria-hidden /> Within{" "}
            {limitLabel.toLowerCase()}
          </li>
          <li>
            <span className="swatch over" aria-hidden /> Over{" "}
            {limitLabel.toLowerCase()}
          </li>
          <li>
            <span className="swatch limit" aria-hidden /> {limitLabel}
          </li>
        </ul>
      </figcaption>
      <div className="chart-plot" onMouseLeave={() => setActive(null)}>
        {shown && active !== null && (
          <div
            className="chart-tooltip"
            role="status"
            style={{
              left: `${Math.min(80, Math.max(20, ((PAD.left + slot * (active + 0.5)) / W) * 100))}%`,
            }}
          >
            <strong>{label(shown.start)}</strong>
            <span>
              {valueLabel}: {fmt(shown.value)}
            </span>
            <span>
              {limitLabel}: {fmt(shown.limit)}
            </span>
            {shown.value > shown.limit ? (
              <span className="over-text">
                Over by {fmt(shown.value - shown.limit)}
              </span>
            ) : (
              <span className="muted">
                {fmt(shown.limit - shown.value)} under
              </span>
            )}
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={title}>
          {[0, top / 2, top].map((tick) => (
            <g key={tick}>
              <line
                className="grid"
                x1={PAD.left}
                x2={W - PAD.right}
                y1={y(tick)}
                y2={y(tick)}
              />
              <text
                className="axis"
                x={PAD.left - 6}
                y={y(tick) + 4}
                textAnchor="end"
              >
                {kind === "money" ? `$${Math.round(tick / 100)}` : tick}
              </text>
            </g>
          ))}
          {weeks.map((week, i) => {
            const cx = PAD.left + slot * (i + 0.5);
            const over = week.value > week.limit;
            return (
              <g
                key={week.start}
                className={i === active ? "week active" : "week"}
                tabIndex={0}
                aria-label={`${label(week.start)}: ${fmt(week.value)} of ${fmt(week.limit)}${over ? ", over" : ""}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              >
                {/* Hit target spans the whole slot, larger than the bar. */}
                <rect
                  className="hit"
                  x={PAD.left + slot * i}
                  y={PAD.top}
                  width={slot}
                  height={plotH}
                />
                {week.value > 0 && (
                  <path
                    className={over ? "bar over" : "bar"}
                    d={barPath(cx - barW / 2, y(week.value), barW, base)}
                  />
                )}
                <line
                  className="limit"
                  x1={cx - barW / 2 - 3}
                  x2={cx + barW / 2 + 3}
                  y1={y(week.limit)}
                  y2={y(week.limit)}
                />
                {/* Count from the end, so the last label never crowds the one before. */}
                {(weeks.length - 1 - i) % labelEvery === 0 && (
                  <text className="axis" x={cx} y={H - 6} textAnchor="middle">
                    {i === weeks.length - 1
                      ? unit === "week"
                        ? "This wk"
                        : "Today"
                      : shortDate(week.start)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      <details className="chart-table">
        <summary>Show as table</summary>
        <table>
          <thead>
            <tr>
              <th scope="col">{unit === "week" ? "Week of" : "Day"}</th>
              <th scope="col">{valueLabel}</th>
              <th scope="col">{limitLabel}</th>
            </tr>
          </thead>
          <tbody>
            {[...weeks].reverse().map((week) => (
              <tr key={week.start}>
                <th scope="row">
                  {unit === "week" ? shortDate(week.start) : dayDate(week.start)}
                </th>
                <td className="amount">
                  {fmt(week.value)}
                  {week.value > week.limit && (
                    <span className="over-text"> (over)</span>
                  )}
                </td>
                <td className="amount">{fmt(week.limit)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
