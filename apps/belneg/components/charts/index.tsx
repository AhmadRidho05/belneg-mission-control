"use client";
import {
  ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend,
  Treemap, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, ScatterChart, Scatter, ZAxis,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  AreaChart, Area, Brush, ReferenceLine
} from "recharts";
import { ResponsiveSankey } from "@nivo/sankey";
import { fmt, pct } from "@/lib/utils";

const NAVY = "#0f172a";
const PALETTE = ["#f59e0b", "#fbbf24", "#10b981", "#3b82f6", "#a78bfa", "#ec4899", "#ef4444", "#0ea5e9", "#84cc16", "#f97316", "#22d3ee", "#e879f9"];
const TOOLTIP_STYLE = { background: "#0d1424", border: "1px solid rgba(255,255,255,0.08)", color: "#e8edf5", fontSize: 12, borderRadius: 6 };

// ────────────────────────── 1. DOUGHNUT ──────────────────────────
export function DoughnutChart({ data, dataKey = "n", nameKey = "name", colors = PALETTE, total }: { data: any[]; dataKey?: string; nameKey?: string; colors?: string[]; total?: number }) {
  const sum = total ?? data.reduce((s, d) => s + d[dataKey], 0);
  return (
    <div className="relative h-[280px]">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" innerRadius={62} outerRadius={100} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke={NAVY} strokeWidth={2} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ transform: "translateY(-12px)" }}>
        <div className="font-display text-2xl font-bold text-ink-muted">{fmt(sum)}</div>
        <div className="text-[10px] uppercase tracking-widest text-ink-subtle">Total</div>
      </div>
    </div>
  );
}

// ────────────────────────── 2. PIE ──────────────────────────
export function PieDistChart({ data, dataKey = "n", nameKey = "name", colors = PALETTE }: { data: any[]; dataKey?: string; nameKey?: string; colors?: string[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey={dataKey} nameKey={nameKey} cx="50%" cy="50%" outerRadius={100} label={({ percent }) => percent > 0.04 ? `${(percent * 100).toFixed(0)}%` : ""} labelLine={false}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke={NAVY} strokeWidth={1.5} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 3. TREEMAP ──────────────────────────
function TreemapCell(props: any) {
  const { x, y, width, height, name, value, depth, root } = props;
  const max = root?.children?.[0]?.value ?? 1;
  const colorIdx = (depth || 0) * 2 + (props.index ?? 0);
  const fill = PALETTE[colorIdx % PALETTE.length];
  const alpha = Math.max(0.35, Math.min(0.9, value / max));
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={alpha} stroke={NAVY} strokeWidth={2} />
      {width > 60 && height > 22 && (
        <text x={x + 6} y={y + 16} fill="#0a0f1c" fontSize={11} fontWeight={700} style={{ pointerEvents: "none" }}>{name}</text>
      )}
      {width > 60 && height > 36 && (
        <text x={x + 6} y={y + 30} fill="#0a0f1c" fontSize={10} fillOpacity={0.85} style={{ pointerEvents: "none" }}>{fmt(value)}</text>
      )}
    </g>
  );
}
export function TreemapChart({
  data, onCellClick,
}: {
  data: { name: string; children?: { name: string; value: number }[] }[];
  onCellClick?: (cell: { province: string; bentuk?: string }) => void;
}) {
  return (
    <div className="h-[360px]">
      <ResponsiveContainer>
        {/* @ts-ignore */}
        <Treemap
          data={data}
          dataKey="value"
          stroke={NAVY}
          content={<TreemapCell />}
          onClick={(c: any) => {
            if (!onCellClick) return;
            // Recharts treemap on click gives the deepest node
            const province = c?.root?.name ?? c?.name;
            const bentuk = c?.depth >= 1 ? c?.name : undefined;
            if (province) onCellClick({ province, bentuk });
          }}
          style={onCellClick ? { cursor: "pointer" } : undefined}
        >
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 4. SANKEY ──────────────────────────
export function SankeyChart({
  data, height = 480, onNodeClick,
}: {
  data: { nodes: { id: string; label: string; level?: number; meta?: Record<string, string> }[]; links: { source: string; target: string; value: number }[] };
  height?: number;
  onNodeClick?: (node: { id: string; label: string; level?: number; meta?: Record<string, string> }) => void;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveSankey
        data={data as any}
        margin={{ top: 16, right: 180, bottom: 16, left: 16 }}
        align="justify"
        colors={{ scheme: "orange_red" }}
        nodeOpacity={0.95}
        nodeHoverOpacity={1}
        nodeThickness={14}
        nodeSpacing={6}
        nodeBorderWidth={0}
        linkOpacity={0.4}
        linkHoverOpacity={0.85}
        linkContract={2}
        enableLinkGradient
        labelPosition="outside"
        labelTextColor="#e8edf5"
        labelOrientation="horizontal"
        label={(d: any) => d.label ?? d.id}
        animate={false}
        onClick={(node: any) => {
          if (!onNodeClick) return;
          // Nivo passes node OR link — only act on nodes (have .id but not .source)
          if (node?.id !== undefined && node?.source === undefined) {
            onNodeClick({ id: node.id, label: node.label, level: node.level, meta: node.meta });
          }
        }}
        theme={{
          background: "transparent",
          text: { fill: "#9aa6bd", fontSize: 10 },
          tooltip: { container: TOOLTIP_STYLE },
        }}
      />
    </div>
  );
}

// ────────────────────────── 5. STACKED BAR ──────────────────────────
export function StackedBarChart({
  data, keys, colors, onBarClick,
}: {
  data: any[];
  keys: string[];
  colors: string[];
  onBarClick?: (d: { province: string; level: string }) => void;
}) {
  return (
    <div className="h-[340px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, left: 0, bottom: 60 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="province" tick={{ fill: "#9aa6bd", fontSize: 10 }} interval={0} angle={-40} textAnchor="end" />
          <YAxis tick={{ fill: "#9aa6bd", fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={8} />
          {keys.map((k, i) => (
            <Bar
              key={k}
              dataKey={k}
              stackId="akr"
              fill={colors[i]}
              onClick={onBarClick ? (entry: any) => onBarClick({ province: entry.province, level: k }) : undefined}
              style={onBarClick ? { cursor: "pointer" } : undefined}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 6. SCATTERPLOT ──────────────────────────
export function ScatterPlot({ data }: { data: { x: number; akreditasi: string }[] }) {
  const grouped: Record<string, { x: number; y: number }[]> = { A: [], B: [], C: [] };
  data.forEach(d => {
    const y = d.akreditasi === "A" ? 3 : d.akreditasi === "B" ? 2 : 1;
    grouped[d.akreditasi]?.push({ x: d.x, y: y + (Math.random() - 0.5) * 0.35 });
  });
  const COLORS: Record<string, string> = { A: "#10b981", B: "#f59e0b", C: "#ef4444" };
  return (
    <div className="h-[320px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 20, bottom: 36, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" dataKey="x" name="Luas Tanah (m²)" tick={{ fill: "#9aa6bd", fontSize: 10 }} scale="log" domain={[100, 200000]} ticks={[100, 1000, 10000, 100000]} tickFormatter={v => fmt(v)}>
            <text />
          </XAxis>
          <YAxis type="number" dataKey="y" name="Akreditasi" tick={{ fill: "#9aa6bd", fontSize: 10 }} domain={[0, 4]} ticks={[1, 2, 3]} tickFormatter={v => v === 3 ? "A" : v === 2 ? "B" : v === 1 ? "C" : ""} />
          <ZAxis range={[30, 30]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any, n: string) => n === "y" ? "" : fmt(v as number)} cursor={{ strokeDasharray: "3 3" }} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={8} />
          {Object.entries(grouped).map(([k, v]) => (
            <Scatter key={k} name={`Akreditasi ${k}`} data={v} fill={COLORS[k]} fillOpacity={0.45} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 7. TREND LINE ──────────────────────────
export function TrendLineChart({ data }: { data: { year: string; sma_negeri: number; sma_swasta: number; smk_negeri: number; smk_swasta: number }[] }) {
  return (
    <div className="h-[320px]">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis dataKey="year" tick={{ fill: "#9aa6bd", fontSize: 11 }} />
          <YAxis tick={{ fill: "#9aa6bd", fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={10} />
          <Line type="monotone" dataKey="sma_negeri" name="SMA Negeri" stroke="#10b981" strokeWidth={2.5} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="sma_swasta" name="SMA Swasta" stroke="#fbbf24" strokeWidth={2.5} dot={{ r: 4 }} />
          <Line type="monotone" dataKey="smk_negeri" name="SMK Negeri" stroke="#3b82f6" strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="4 2" />
          <Line type="monotone" dataKey="smk_swasta" name="SMK Swasta" stroke="#ec4899" strokeWidth={2.5} dot={{ r: 4 }} strokeDasharray="4 2" />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 8. BUBBLE CHART ──────────────────────────
export function BubbleChart({
  data, onPointClick,
}: {
  data: { kab_kota: string; provinsi: string; n_sekolah: number; pct_a: number; n_kodim: number }[];
  onPointClick?: (d: { kab_kota: string; provinsi: string }) => void;
}) {
  return (
    <div className="h-[420px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 24, bottom: 40, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" dataKey="n_sekolah" name="Jumlah Sekolah" tick={{ fill: "#9aa6bd", fontSize: 10 }} tickFormatter={v => fmt(v)} label={{ value: "Jumlah Sekolah", position: "insideBottom", offset: -10, fill: "#9aa6bd", fontSize: 11 }} />
          <YAxis type="number" dataKey="pct_a" name="% Akreditasi A" tick={{ fill: "#9aa6bd", fontSize: 10 }} tickFormatter={v => `${v}%`} label={{ value: "% Akr A", angle: -90, position: "insideLeft", fill: "#9aa6bd", fontSize: 11 }} />
          <ZAxis type="number" dataKey="n_kodim" range={[40, 700]} name="Jumlah Kodim" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={TOOLTIP_STYLE}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-md border border-white/10 bg-bg-soft p-2.5 text-xs">
                  <div className="font-semibold text-ink">{d.kab_kota}</div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{d.provinsi}</div>
                  <div className="mt-1 text-ink-muted">Sekolah: <span className="text-ink font-semibold">{fmt(d.n_sekolah)}</span></div>
                  <div className="text-ink-muted">% Akr A: <span className="text-accent-glow font-semibold">{d.pct_a.toFixed(1)}%</span></div>
                  <div className="text-ink-muted">Kodim: <span className="text-ink font-semibold">{d.n_kodim}</span></div>
                  {onPointClick && <div className="mt-1 text-[10px] text-accent-glow">Klik untuk filter tabel ↓</div>}
                </div>
              );
            }}
          />
          <Scatter
            data={data}
            fill="#f59e0b"
            fillOpacity={0.55}
            stroke="#fbbf24"
            onClick={(p: any) => onPointClick?.({ kab_kota: p.kab_kota, provinsi: p.provinsi })}
            style={onPointClick ? { cursor: "pointer" } : undefined}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 9. HORIZONTAL BAR ──────────────────────────
export function HBarChart({
  data, valueKey, labelKey, color = "#f59e0b", onBarClick,
}: {
  data: any[];
  valueKey: string;
  labelKey: string;
  color?: string;
  onBarClick?: (d: any) => void;
}) {
  return (
    <div className="h-[400px]">
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 24, bottom: 6, left: 16 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" tick={{ fill: "#9aa6bd", fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <YAxis type="category" dataKey={labelKey} tick={{ fill: "#e8edf5", fontSize: 10 }} width={200} interval={0} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar
            dataKey={valueKey}
            fill={color}
            radius={[0, 3, 3, 0]}
            onClick={onBarClick ? (entry: any) => onBarClick(entry) : undefined}
            style={onBarClick ? { cursor: "pointer" } : undefined}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 10. RADAR ──────────────────────────
export function RadarKodam({ data }: { data: { metric: string; [k: string]: number | string }[] }) {
  const keys = Object.keys(data[0] || {}).filter(k => k !== "metric");
  return (
    <div className="h-[420px]">
      <ResponsiveContainer>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="72%">
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis dataKey="metric" tick={{ fill: "#9aa6bd", fontSize: 11 }} />
          <PolarRadiusAxis stroke="rgba(255,255,255,0.1)" tick={{ fill: "#5d6a85", fontSize: 9 }} angle={90} />
          {keys.map((k, i) => (
            <Radar key={k} name={k} dataKey={k} stroke={PALETTE[i]} fill={PALETTE[i]} fillOpacity={0.18} strokeWidth={2} />
          ))}
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={8} />
          <Tooltip contentStyle={TOOLTIP_STYLE} />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 11. TRAFFIC LIGHT GRID ──────────────────────────
export function TrafficLightGrid({
  items, onSelect, selectedId,
}: {
  items: { id: string; label: string; sub: string; value: number; level: "ok" | "warn" | "crit"; payload?: any }[];
  onSelect?: (item: { id: string; label: string; payload?: any }) => void;
  selectedId?: string | null;
}) {
  const COLOR = {
    ok: { bg: "bg-ok/10", border: "border-ok/40", text: "text-ok", dot: "bg-ok", glow: "shadow-[0_0_18px_-2px_rgba(16,185,129,0.5)]" },
    warn: { bg: "bg-warn/10", border: "border-warn/40", text: "text-warn", dot: "bg-warn", glow: "shadow-[0_0_18px_-2px_rgba(245,158,11,0.5)]" },
    crit: { bg: "bg-crit/10", border: "border-crit/40", text: "text-crit", dot: "bg-crit", glow: "shadow-[0_0_18px_-2px_rgba(239,68,68,0.55)]" },
  };
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4">
      {items.map(i => {
        const c = COLOR[i.level];
        const isSelected = selectedId === i.id;
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={i.id}
            onClick={onSelect ? () => onSelect({ id: i.id, label: i.label, payload: i.payload }) : undefined}
            className={`text-left rounded-md border p-3 transition ${c.bg} ${c.border} ${onSelect ? "hover:bg-opacity-100 hover:brightness-125 cursor-pointer" : ""} ${isSelected ? "ring-2 ring-accent-glow scale-[1.02]" : ""}`}
          >
            <div className="flex items-baseline justify-between">
              <span className={`inline-flex h-2.5 w-2.5 rounded-full ${c.dot} ${c.glow}`} />
              <span className={`font-display text-2xl font-bold tabular-nums ${c.text}`}>{Math.round(i.value)}</span>
            </div>
            <div className="mt-1 text-xs font-medium text-ink truncate" title={i.label}>{i.label}</div>
            <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{i.sub}</div>
          </Tag>
        );
      })}
    </div>
  );
}

// ────────────────────────── 12b. PRABOWO BUBBLE (cross-domain politik) ──────────────────────────
export function PrabowoBubbleChart({
  data, onPointClick,
}: {
  data: { kab_norm: string; nama_kab: string; nama_prov: string; pct24_prabowo: number; n_sekolah: number; n_kodim: number; total24: number; tps_coverage_pct: number }[];
  onPointClick?: (d: { kab_norm: string; nama_kab: string; nama_prov: string }) => void;
}) {
  // Bucket by dominance: opposition (<40), swing (40-60), dominant (60+)
  const groups: Record<string, any[]> = {
    "Oposisi (<40%)": data.filter(d => d.pct24_prabowo < 40),
    "Swing (40-60%)": data.filter(d => d.pct24_prabowo >= 40 && d.pct24_prabowo < 60),
    "Dominan (≥60%)": data.filter(d => d.pct24_prabowo >= 60),
  };
  const COLORS: Record<string, string> = {
    "Oposisi (<40%)": "#3b82f6",
    "Swing (40-60%)": "#a78bfa",
    "Dominan (≥60%)": "#ef4444",
  };
  return (
    <div className="h-[440px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 24, bottom: 40, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis
            type="number" dataKey="pct24_prabowo" name="% Prabowo 2024"
            tick={{ fill: "#9aa6bd", fontSize: 10 }}
            domain={[0, 100]} ticks={[0, 20, 40, 60, 80, 100]}
            tickFormatter={v => `${v}%`}
            label={{ value: "% Prabowo 2024", position: "insideBottom", offset: -10, fill: "#9aa6bd", fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="n_sekolah" name="Jumlah Sekolah"
            tick={{ fill: "#9aa6bd", fontSize: 10 }}
            tickFormatter={v => fmt(v)}
            label={{ value: "# Sekolah", angle: -90, position: "insideLeft", fill: "#9aa6bd", fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="n_kodim" range={[30, 600]} name="Jumlah Kodim" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={TOOLTIP_STYLE}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-md border border-white/10 bg-bg-soft p-2.5 text-xs">
                  <div className="font-semibold text-ink">{d.nama_kab}</div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{d.nama_prov}</div>
                  <div className="mt-1 text-ink-muted">% Prabowo 2024: <span className="text-accent-glow font-semibold">{d.pct24_prabowo.toFixed(1)}%</span></div>
                  <div className="text-ink-muted">Sekolah: <span className="text-ink font-semibold">{fmt(d.n_sekolah)}</span></div>
                  <div className="text-ink-muted">Kodim: <span className="text-ink font-semibold">{d.n_kodim}</span></div>
                  <div className="text-ink-muted">Total suara: <span className="text-ink">{fmt(d.total24)}</span></div>
                  {onPointClick && <div className="mt-1 text-[10px] text-accent-glow">Klik untuk filter ↓</div>}
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={9} />
          <ReferenceLine x={50} stroke="#fbbf24" strokeDasharray="3 3" />
          {Object.entries(groups).map(([k, pts]) => (
            <Scatter
              key={k}
              name={k}
              data={pts}
              fill={COLORS[k]}
              fillOpacity={0.55}
              stroke={COLORS[k]}
              strokeOpacity={0.9}
              onClick={(p: any) => onPointClick?.({ kab_norm: p.kab_norm, nama_kab: p.nama_kab, nama_prov: p.nama_prov })}
              style={onPointClick ? { cursor: "pointer" } : undefined}
            />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 12c. SWING SCATTER (2019 → 2024) ──────────────────────────
export function PrabowoSwingScatter({
  data,
}: {
  data: { kab_norm: string; nama_kab: string; nama_prov: string; pct19_prabowo: number; pct24_prabowo: number; swing_pp: number; n_sekolah: number }[];
}) {
  // Color by swing direction
  const positive = data.filter(d => d.swing_pp > 0);
  const negative = data.filter(d => d.swing_pp <= 0);
  return (
    <div className="h-[420px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 12, right: 24, bottom: 40, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis
            type="number" dataKey="pct19_prabowo" name="% Prabowo 2019"
            tick={{ fill: "#9aa6bd", fontSize: 10 }}
            domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            tickFormatter={v => `${v}%`}
            label={{ value: "% Prabowo 2019", position: "insideBottom", offset: -10, fill: "#9aa6bd", fontSize: 11 }}
          />
          <YAxis
            type="number" dataKey="pct24_prabowo" name="% Prabowo 2024"
            tick={{ fill: "#9aa6bd", fontSize: 10 }}
            domain={[0, 100]} ticks={[0, 25, 50, 75, 100]}
            tickFormatter={v => `${v}%`}
            label={{ value: "% Prabowo 2024", angle: -90, position: "insideLeft", fill: "#9aa6bd", fontSize: 11 }}
          />
          <ZAxis type="number" dataKey="n_sekolah" range={[15, 380]} name="Sekolah" />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={TOOLTIP_STYLE}
            content={({ active, payload }: any) => {
              if (!active || !payload?.length) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-md border border-white/10 bg-bg-soft p-2.5 text-xs">
                  <div className="font-semibold text-ink">{d.nama_kab}</div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{d.nama_prov}</div>
                  <div className="mt-1 text-ink-muted">2019: <span className="text-ink">{d.pct19_prabowo.toFixed(1)}%</span></div>
                  <div className="text-ink-muted">2024: <span className="text-ink">{d.pct24_prabowo.toFixed(1)}%</span></div>
                  <div className={`text-ink-muted font-semibold ${d.swing_pp > 0 ? "text-ok" : "text-crit"}`}>Swing: {d.swing_pp > 0 ? "+" : ""}{d.swing_pp.toFixed(1)} pp</div>
                  <div className="text-ink-muted">Sekolah: <span className="text-ink">{fmt(d.n_sekolah)}</span></div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconSize={9} />
          {/* Diagonal y=x reference line: drawn via a fake scatter */}
          <ReferenceLine segment={[{ x: 0, y: 0 }, { x: 100, y: 100 }]} stroke="#5d6a85" strokeDasharray="3 3" />
          <Scatter name={`Naik (+swing) · ${positive.length} kab`} data={positive} fill="#10b981" fillOpacity={0.6} />
          <Scatter name={`Turun (-swing) · ${negative.length} kab`} data={negative} fill="#ef4444" fillOpacity={0.55} />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 13. SK TIMELINE (Pendirian vs Operasional) ──────────────────────────
export function SkTimelineChart({
  data, height = 360, showBrush = true,
}: {
  data: { year: number; sk_pendirian: number; sk_operasional: number }[];
  height?: number;
  showBrush?: boolean;
}) {
  // Trim leading years with 0 data for visual focus (but keep at least 1980+)
  const firstNonZero = data.findIndex(d => d.sk_pendirian > 0 || d.sk_operasional > 0);
  const trimmed = firstNonZero > 0 ? data.slice(firstNonZero) : data;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={trimmed} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <defs>
            <linearGradient id="gradPendirian" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.55} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0.05} />
            </linearGradient>
            <linearGradient id="gradOperasional" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.45} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.03} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: "#9aa6bd", fontSize: 10 }} interval="preserveStartEnd" minTickGap={32} />
          <YAxis tick={{ fill: "#9aa6bd", fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(l) => `Tahun ${l}`}
            formatter={(v: number, n: string) => [fmt(v), n === "sk_pendirian" ? "SK Pendirian" : "SK Operasional"]}
            cursor={{ stroke: "#fbbf24", strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Legend
            wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }}
            iconType="circle"
            iconSize={9}
            formatter={(n: string) => n === "sk_pendirian" ? "SK Pendirian" : "SK Operasional"}
          />
          <Area type="monotone" dataKey="sk_pendirian" stroke="#f59e0b" strokeWidth={2} fill="url(#gradPendirian)" />
          <Area type="monotone" dataKey="sk_operasional" stroke="#3b82f6" strokeWidth={2} fill="url(#gradOperasional)" />
          {showBrush && (
            <Brush
              dataKey="year"
              height={22}
              fill="rgba(255,255,255,0.03)"
              stroke="#f59e0b"
              tickFormatter={v => String(v)}
              travellerWidth={8}
            />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 14. SK TIMELINE STACKED (by category) ──────────────────────────
export function SkTimelineStacked({
  data, keys, colors, height = 320, dateLabel = "SK Pendirian",
}: {
  data: { year: number; [k: string]: number }[];
  keys: string[];
  colors: string[];
  height?: number;
  dateLabel?: string;
}) {
  const firstNonZero = data.findIndex(d => keys.some(k => (d as any)[k] > 0));
  const trimmed = firstNonZero > 0 ? data.slice(firstNonZero) : data;
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={trimmed} margin={{ top: 8, right: 24, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="year" tick={{ fill: "#9aa6bd", fontSize: 10 }} interval="preserveStartEnd" minTickGap={32} />
          <YAxis tick={{ fill: "#9aa6bd", fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(l) => `${dateLabel} · Tahun ${l}`}
            formatter={(v: number, n: string) => [fmt(v), n]}
            cursor={{ stroke: "#fbbf24", strokeWidth: 1, strokeDasharray: "3 3" }}
          />
          <Legend wrapperStyle={{ fontSize: 11, color: "#9aa6bd" }} iconType="square" iconSize={9} />
          {keys.map((k, i) => (
            <Area
              key={k}
              type="monotone"
              dataKey={k}
              stackId="t"
              stroke={colors[i]}
              strokeWidth={1.2}
              fill={colors[i]}
              fillOpacity={0.72}
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 15. SK TIMELINE MINI (for kodim popup) ──────────────────────────
export function SkTimelineMini({
  data, height = 120,
}: {
  data: { year: number; sk_pendirian: number; sk_operasional: number }[];
  height?: number;
}) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <AreaChart data={data} margin={{ top: 4, right: 6, bottom: 4, left: 0 }}>
          <defs>
            <linearGradient id="miniGradP" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.7} />
              <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="miniGradO" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.6} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <XAxis dataKey="year" tick={{ fill: "#5d6a85", fontSize: 9 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fill: "#5d6a85", fontSize: 9 }} tickFormatter={v => fmt(v)} width={28} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            labelFormatter={(l) => `Tahun ${l}`}
            formatter={(v: number, n: string) => [fmt(v), n === "sk_pendirian" ? "Pendirian" : "Operasional"]}
            cursor={{ stroke: "#fbbf24", strokeDasharray: "2 2" }}
          />
          <Area type="monotone" dataKey="sk_pendirian" stroke="#f59e0b" strokeWidth={1.6} fill="url(#miniGradP)" />
          <Area type="monotone" dataKey="sk_operasional" stroke="#3b82f6" strokeWidth={1.6} fill="url(#miniGradO)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────────── 12. KODIM STRESS GRID (gradient) ──────────────────────────
// Per-kodim grid sorted desc by load, gradient color from green→yellow→red.
function stressColor(t: number): { bg: string; border: string; text: string; dot: string } {
  // t in [0, 1] — 0 = low (green), 1 = high (red)
  const clamp = Math.max(0, Math.min(1, t));
  // Three-stop interp: green → amber → red via HSL hue
  const hue = clamp < 0.5 ? 140 - clamp * 80 : 60 - (clamp - 0.5) * 120; // 140→60 then 60→0
  const sat = 70;
  const lightBg = clamp < 0.5 ? 12 + clamp * 8 : 14 + (clamp - 0.5) * 14;
  const lightBorder = lightBg + 18;
  const lightText = 55 + clamp * 12;
  return {
    bg: `hsl(${hue.toFixed(0)} ${sat}% ${lightBg.toFixed(0)}% / 0.55)`,
    border: `hsl(${hue.toFixed(0)} ${sat}% ${lightBorder.toFixed(0)}% / 0.45)`,
    text: `hsl(${hue.toFixed(0)} ${sat}% ${lightText.toFixed(0)}%)`,
    dot: `hsl(${hue.toFixed(0)} ${sat}% ${(lightText + 5).toFixed(0)}%)`,
  };
}

export function KodimStressGrid({
  items, onSelect, selectedId, maxValue,
}: {
  items: { id: string; label: string; sub: string; value: number; payload?: any }[];
  onSelect?: (item: { id: string; label: string; payload?: any }) => void;
  selectedId?: string | null;
  maxValue?: number;
}) {
  const max = maxValue ?? Math.max(...items.map(i => i.value), 1);
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
      {items.map(i => {
        const t = max > 0 ? i.value / max : 0;
        const c = stressColor(t);
        const isSelected = selectedId === i.id;
        const Tag = onSelect ? "button" : "div";
        return (
          <Tag
            key={i.id}
            onClick={onSelect ? () => onSelect({ id: i.id, label: i.label, payload: i.payload }) : undefined}
            className={`text-left rounded-md border p-2.5 transition group ${onSelect ? "hover:scale-[1.03] hover:brightness-125 cursor-pointer" : ""} ${isSelected ? "ring-2 ring-accent-glow" : ""}`}
            style={{ background: c.bg, borderColor: c.border }}
          >
            <div className="flex items-baseline justify-between">
              <span className="inline-flex h-2 w-2 rounded-full" style={{ background: c.dot, boxShadow: `0 0 8px ${c.dot}` }} />
              <span className="font-display text-xl font-bold tabular-nums" style={{ color: c.text }}>
                {fmt(i.value)}
              </span>
            </div>
            <div className="mt-1 text-[11px] font-semibold text-ink truncate" title={i.label}>{i.label}</div>
            <div className="text-[9.5px] uppercase tracking-widest text-ink-muted truncate">{i.sub}</div>
          </Tag>
        );
      })}
    </div>
  );
}
