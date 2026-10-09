import { Bar, BarChart, Cell, LabelList, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { SENTIMENTS, type Sentiment } from "../../shared/types";
import { pct, QUESTION_COLORS, SENTIMENT_META, type CategoryCount } from "../lib/analytics";

const tooltipStyle = {
  borderRadius: 12,
  border: "1px solid #E3E8F0",
  boxShadow: "0 12px 24px -6px rgba(16,42,67,.15)",
  fontSize: 13,
  fontFamily: "inherit",
};

export function SentimentDonut({
  counts,
  dark,
  size = 220,
  onPick,
}: {
  counts: Record<Sentiment, number>;
  dark?: boolean;
  size?: number;
  onPick?: (s: Sentiment) => void;
}) {
  const total = SENTIMENTS.reduce((a, s) => a + counts[s], 0);
  const data = SENTIMENTS.map((s) => ({ key: s, name: SENTIMENT_META[s].label, value: counts[s] })).filter((d) => d.value > 0);
  return (
    <div className="donut-wrap" style={{ gridTemplateColumns: `${size}px 1fr` }}>
      <div className="donut-center" style={{ height: size }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data.length ? data : [{ key: "none", name: "Sin datos", value: 1 }]}
              dataKey="value"
              innerRadius="64%"
              outerRadius="96%"
              paddingAngle={data.length > 1 ? 2.5 : 0}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              onClick={(d: { key?: string }) => d.key && d.key !== "none" && onPick?.(d.key as Sentiment)}
              style={{ cursor: onPick ? "pointer" : "default", outline: "none" }}
            >
              {(data.length ? data : [{ key: "none" }]).map((d) => (
                <Cell key={d.key} fill={d.key === "none" ? (dark ? "rgba(255,255,255,.1)" : "#EEF1F5") : SENTIMENT_META[d.key as Sentiment].color} />
              ))}
            </Pie>
            {!dark && <Tooltip contentStyle={tooltipStyle} formatter={(v: number) => [`${v} (${pct(v, total)}%)`, "Respuestas"]} />}
          </PieChart>
        </ResponsiveContainer>
        <div className="label-c">
          <div>
            <b style={dark ? { color: "#fff", fontSize: 44 } : undefined}>{total}</b>
            <span style={dark ? { color: "rgba(255,255,255,.6)", fontSize: 15 } : undefined}>respuestas analizadas</span>
          </div>
        </div>
      </div>
      <div className="legend">
        {SENTIMENTS.map((s) => (
          <button key={s} className="legend-row" onClick={() => onPick?.(s)} disabled={!onPick || counts[s] === 0}>
            <span className="legend-swatch" style={{ background: SENTIMENT_META[s].color, width: dark ? 18 : 12, height: dark ? 18 : 12 }} />
            {SENTIMENT_META[s].label}
            <b>{counts[s]}</b>
            <span className="pct">{pct(counts[s], total)}%</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function SentimentByQuestion({
  rows,
  dark,
  height = 220,
  onPick,
}: {
  rows: { ord: number; label: string; counts: Record<Sentiment, number> }[];
  dark?: boolean;
  height?: number;
  onPick?: (ord: number, s: Sentiment) => void;
}) {
  const data = rows.map((r) => {
    const total = SENTIMENTS.reduce((a, s) => a + r.counts[s], 0);
    return { name: r.label, ord: r.ord, total, ...Object.fromEntries(SENTIMENTS.map((s) => [s, total ? (r.counts[s] / total) * 100 : 0])), raw: r.counts };
  });
  const tick = { fill: dark ? "rgba(255,255,255,.85)" : "#334E68", fontSize: dark ? 17 : 13, fontWeight: 600 };
  return (
    <div>
      <ResponsiveContainer width="100%" height={height}>
        <BarChart data={data} layout="vertical" margin={{ left: 0, right: 8, top: 4, bottom: 4 }} barCategoryGap="22%">
          <XAxis type="number" domain={[0, 100]} hide />
          <YAxis type="category" dataKey="name" width={dark ? 130 : 100} tick={tick} axisLine={false} tickLine={false} />
          {!dark && (
            <Tooltip
              contentStyle={tooltipStyle}
              cursor={{ fill: "rgba(36,99,235,.05)" }}
              formatter={(v: number, key: string, item: { payload?: { raw: Record<Sentiment, number> } }) => [
                `${item.payload?.raw[key as Sentiment] ?? 0} (${Math.round(v)}%)`,
                SENTIMENT_META[key as Sentiment].label,
              ]}
            />
          )}
          {SENTIMENTS.map((s, i) => (
            <Bar
              key={s}
              dataKey={s}
              stackId="a"
              fill={SENTIMENT_META[s].color}
              radius={i === 0 ? [6, 0, 0, 6] : i === SENTIMENTS.length - 1 ? [0, 6, 6, 0] : 0}
              onClick={(d: { ord?: number }) => d.ord && onPick?.(d.ord, s)}
              style={{ cursor: onPick ? "pointer" : "default" }}
            >
              <LabelList
                dataKey={s}
                content={(p) => {
                  const x = Number(p.x ?? 0), y = Number(p.y ?? 0), w = Number(p.width ?? 0), hgt = Number(p.height ?? 0);
                  return w > 34 ? (
                    <text x={x + w / 2} y={y + hgt / 2} dy={5} textAnchor="middle" fill="#fff" fontSize={dark ? 16 : 12} fontWeight={700}>
                      {Math.round(Number(p.value ?? 0))}%
                    </text>
                  ) : null;
                }}
              />
            </Bar>
          ))}
        </BarChart>
      </ResponsiveContainer>
      <div className="row wrap" style={{ gap: 16, justifyContent: "center", marginTop: 6 }}>
        {SENTIMENTS.map((s) => (
          <span key={s} className="row small" style={{ gap: 6, color: dark ? "rgba(255,255,255,.8)" : undefined, fontSize: dark ? 16 : undefined }}>
            <span className="legend-swatch" style={{ background: SENTIMENT_META[s].color }} />
            {SENTIMENT_META[s].label}
          </span>
        ))}
      </div>
    </div>
  );
}

export function CategoryBars({
  items,
  showQuestion,
  limit,
  onPick,
}: {
  items: CategoryCount[];
  showQuestion?: boolean;
  limit?: number;
  onPick?: (c: CategoryCount) => void;
}) {
  const shown = limit ? items.slice(0, limit) : items;
  const max = Math.max(1, ...shown.map((c) => c.count));
  return (
    <div className="cat-bars">
      {shown.map((c) => (
        <button key={c.key} className="cat-bar" onClick={() => onPick?.(c)} title={`${c.count} respuestas · clic para ver testimonios`}>
          <span className="cat-bar-label">
            {showQuestion && (
              <span className="code-tag" style={{ color: QUESTION_COLORS[c.questionOrd - 1], borderColor: "currentColor", background: "transparent" }}>
                P{c.questionOrd}
              </span>
            )}
            <span className="n">{c.name}</span>
          </span>
          <span className="cat-bar-track">
            {SENTIMENTS.map((s) =>
              c.sentiments[s] ? <i key={s} style={{ width: `${(c.sentiments[s] / max) * 100}%`, background: SENTIMENT_META[s].color }} /> : null,
            )}
          </span>
          <span className="cat-bar-count">{c.count}</span>
        </button>
      ))}
    </div>
  );
}
