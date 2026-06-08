"use client";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, LineChart, Line, ComposedChart, ScatterChart, Scatter, ZAxis,
  Treemap, Area, ReferenceLine,
} from "recharts";
import { ResponsiveSankey } from "@nivo/sankey";
import { fmt } from "@/lib/utils";

const C_INK = "#e8edf5";
const C_MUTED = "#9aa6bd";
const C_SUBTLE = "#5d6a85";
const NAVY = "#0f172a";
const PALETTE = ["#f59e0b", "#fbbf24", "#10b981", "#3b82f6", "#a78bfa", "#ec4899", "#ef4444", "#0ea5e9", "#84cc16", "#f97316"];
const STATUS_COLOR: Record<string, string> = {
  submitted: "#f59e0b",
  reviewed: "#3b82f6",
  approved: "#10b981",
  rejected: "#ef4444",
};
const TOOLTIP_STYLE = { background: "#0d1424", border: "1px solid rgba(255,255,255,0.08)", color: C_INK, fontSize: 12, borderRadius: 6 };

// ────────────────────── DOUGHNUT ──────────────────────
export function DoughnutChart({ data, colors = PALETTE, total }: { data: { name: string; n: number }[]; colors?: string[]; total?: number }) {
  const sum = total ?? data.reduce((s, d) => s + d.n, 0);
  return (
    <div className="relative h-[240px]">
      <ResponsiveContainer>
        <PieChart>
          <Pie data={data} dataKey="n" nameKey="name" cx="50%" cy="50%" innerRadius={56} outerRadius={92} paddingAngle={2}>
            {data.map((_, i) => <Cell key={i} fill={colors[i % colors.length]} stroke={NAVY} strokeWidth={2} />)}
          </Pie>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 10, color: C_MUTED }} iconSize={8} />
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center" style={{ transform: "translateY(-14px)" }}>
        <div className="font-display text-xl font-bold text-ink">{fmt(sum)}</div>
        <div className="text-[9px] uppercase tracking-widest text-ink-subtle">Total</div>
      </div>
    </div>
  );
}

// ────────────────────── LINE / TREND (DUAL AXIS) ──────────────────────
export function TrendLaporanPesertaChart({ data }: { data: { week: string; laporan: number; peserta: number }[] }) {
  return (
    <div className="h-[280px]">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 8, right: 20, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="week" tick={{ fill: C_MUTED, fontSize: 9 }} interval="preserveStartEnd" minTickGap={32} />
          <YAxis yAxisId="l" tick={{ fill: "#f59e0b", fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <YAxis yAxisId="r" orientation="right" tick={{ fill: "#3b82f6", fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} labelFormatter={(l) => `Minggu ${l}`} formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 10, color: C_MUTED }} iconSize={9} />
          <Area yAxisId="l" type="monotone" dataKey="laporan" name="Laporan" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.15} strokeWidth={2} />
          <Line yAxisId="r" type="monotone" dataKey="peserta" name="Peserta" stroke="#3b82f6" strokeWidth={2.5} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── CANDLESTICK ──────────────────────
// Custom shape: wick (low→high) + body (open→close, green up / red down).
function CandleShape(props: any) {
  const { x, y, width, height, payload } = props;
  if (!payload) return null;
  const { open, close, high, low } = payload;
  const yMin = Math.min(low, open, close);
  const yMax = Math.max(high, open, close);
  if (yMax === yMin) return null;

  const scale = (v: number) => y + ((yMax - v) / (yMax - yMin)) * height;
  const wickX = x + width / 2;
  const bodyW = Math.max(2, width * 0.6);
  const bodyX = x + (width - bodyW) / 2;
  const isUp = close >= open;
  const color = isUp ? "#10b981" : "#ef4444";
  const bodyTop = scale(Math.max(open, close));
  const bodyBottom = scale(Math.min(open, close));
  const bodyH = Math.max(1, bodyBottom - bodyTop);

  return (
    <g>
      <line x1={wickX} y1={scale(high)} x2={wickX} y2={scale(low)} stroke={color} strokeWidth={1} />
      <rect x={bodyX} y={bodyTop} width={bodyW} height={bodyH} fill={color} fillOpacity={isUp ? 0.6 : 0.7} stroke={color} strokeWidth={1} />
    </g>
  );
}

export function CandlestickChart({ data }: { data: { date: string; open: number; high: number; low: number; close: number }[] }) {
  if (data.length === 0) return <Empty>Belum cukup data untuk candlestick (butuh laporan 3 bulan terakhir).</Empty>;
  const allVals = data.flatMap(d => [d.open, d.close, d.high, d.low]);
  const yMin = Math.min(...allVals);
  const yMax = Math.max(...allVals);
  return (
    <div className="h-[280px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="date" tick={{ fill: C_MUTED, fontSize: 9 }} interval="preserveStartEnd" minTickGap={24} />
          <YAxis tick={{ fill: C_MUTED, fontSize: 10 }} domain={[yMin * 0.9, yMax * 1.05]} />
          <Tooltip
            contentStyle={TOOLTIP_STYLE}
            content={({ active, payload, label }: any) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              const isUp = d.close >= d.open;
              return (
                <div className="rounded-md border border-white/10 bg-bg-soft p-2.5 text-xs">
                  <div className="font-semibold text-ink">Minggu {label}</div>
                  <div className="mt-1 grid grid-cols-2 gap-x-3 gap-y-0.5 text-ink-muted">
                    <span>Open:</span><span className="text-ink">{fmt(d.open)}</span>
                    <span>Close:</span><span className={isUp ? "text-ok" : "text-crit"}>{fmt(d.close)}</span>
                    <span>High:</span><span className="text-ink">{fmt(d.high)}</span>
                    <span>Low:</span><span className="text-ink">{fmt(d.low)}</span>
                  </div>
                </div>
              );
            }}
          />
          {/* Single Bar whose shape we render fully (wick + body). dataKey "high" picks the max so bar fills the slot. */}
          <Bar dataKey="high" shape={<CandleShape />} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── SANKEY ──────────────────────
export function SankeyChart({ data, height = 460 }: { data: { nodes: { id: string; label: string; level?: number }[]; links: { source: string; target: string; value: number }[] }; height?: number }) {
  if (data.nodes.length === 0 || data.links.length === 0) return <Empty>Belum ada data untuk Sankey.</Empty>;
  return (
    <div style={{ height }}>
      <ResponsiveSankey
        data={data as any}
        margin={{ top: 12, right: 140, bottom: 12, left: 12 }}
        align="justify"
        colors={{ scheme: "orange_red" }}
        nodeOpacity={0.95}
        nodeThickness={12}
        nodeSpacing={8}
        nodeBorderWidth={0}
        linkOpacity={0.4}
        linkHoverOpacity={0.85}
        enableLinkGradient
        labelPosition="outside"
        labelTextColor="#e8edf5"
        labelOrientation="horizontal"
        label={(d: any) => d.label ?? d.id}
        animate={false}
        theme={{
          background: "transparent",
          text: { fill: C_MUTED, fontSize: 10 },
          tooltip: { container: TOOLTIP_STYLE },
        }}
      />
    </div>
  );
}

// ────────────────────── TREEMAP (Pangkat × Role) ──────────────────────
function TreemapCell(props: any) {
  const { x, y, width, height, name, value, depth, index } = props;
  const isLeaf = !props.children?.length;
  const colorIdx = (depth || 0) + (index ?? 0);
  const fill = PALETTE[colorIdx % PALETTE.length];
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} fill={fill} fillOpacity={isLeaf ? 0.7 : 0.25} stroke={NAVY} strokeWidth={2} />
      {width > 60 && height > 22 && (
        <text x={x + 6} y={y + 16} fill="#0a0f1c" fontSize={11} fontWeight={700}>{name}</text>
      )}
      {isLeaf && width > 60 && height > 36 && (
        <text x={x + 6} y={y + 30} fill="#0a0f1c" fontSize={10} fillOpacity={0.85}>{fmt(value)}</text>
      )}
    </g>
  );
}
export function TreemapPangkat({ data }: { data: { name: string; children: { name: string; value: number }[] }[] }) {
  if (data.length === 0) return <Empty>Belum ada data pangkat.</Empty>;
  return (
    <div className="h-[300px]">
      <ResponsiveContainer>
        {/* @ts-ignore */}
        <Treemap data={data} dataKey="value" stroke={NAVY} content={<TreemapCell />}>
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} />
        </Treemap>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── BUBBLE (Pembina activity) ──────────────────────
export function PembinaBubbleChart({ data }: { data: { id: string; full_name: string; role: string; n_laporan: number; avg_peserta: number; n_sekolah_unik: number }[] }) {
  if (data.length === 0) return <Empty>Belum ada data pembina aktif.</Empty>;
  const ROLE_COLOR: Record<string, string> = {
    KODAM: "#ef4444", KOREM: "#f59e0b", KODIM: "#3b82f6", KORAMIL: "#a78bfa", ADMIN: "#10b981",
  };
  const grouped: Record<string, any[]> = {};
  for (const d of data) (grouped[d.role] ??= []).push(d);

  return (
    <div className="h-[340px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" dataKey="n_laporan" name="Laporan" tick={{ fill: C_MUTED, fontSize: 10 }} label={{ value: "Jumlah Laporan", position: "insideBottom", offset: -10, fill: C_MUTED, fontSize: 10 }} />
          <YAxis type="number" dataKey="avg_peserta" name="Rata Peserta" tick={{ fill: C_MUTED, fontSize: 10 }} label={{ value: "Rata Peserta/Laporan", angle: -90, position: "insideLeft", fill: C_MUTED, fontSize: 10 }} />
          <ZAxis type="number" dataKey="n_sekolah_unik" range={[40, 360]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            contentStyle={TOOLTIP_STYLE}
            content={({ active, payload }: any) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-md border border-white/10 bg-bg-soft p-2.5 text-xs">
                  <div className="font-semibold text-ink">{d.full_name}</div>
                  <div className="text-[10px] uppercase tracking-widest" style={{ color: ROLE_COLOR[d.role] ?? C_MUTED }}>{d.role}</div>
                  <div className="mt-1 text-ink-muted">Laporan: <span className="text-ink">{fmt(d.n_laporan)}</span></div>
                  <div className="text-ink-muted">Avg peserta: <span className="text-ink">{d.avg_peserta}</span></div>
                  <div className="text-ink-muted">Sekolah unik: <span className="text-accent-glow">{d.n_sekolah_unik}</span></div>
                </div>
              );
            }}
          />
          <Legend wrapperStyle={{ fontSize: 10, color: C_MUTED }} iconSize={9} />
          {Object.entries(grouped).map(([role, pts]) => (
            <Scatter key={role} name={role} data={pts} fill={ROLE_COLOR[role] ?? "#9aa6bd"} fillOpacity={0.55} stroke={ROLE_COLOR[role] ?? "#9aa6bd"} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── GPS SCATTER (lat/lng) ──────────────────────
export function GpsScatterChart({ data }: { data: { lat: number; lng: number; status: string }[] }) {
  if (data.length === 0) return <Empty>Belum ada laporan dengan GPS.</Empty>;
  // Group by status for color legend
  const grouped: Record<string, any[]> = {};
  for (const d of data) (grouped[d.status] ??= []).push(d);
  return (
    <div className="h-[340px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" dataKey="lng" name="Longitude" domain={[94, 142]} tick={{ fill: C_MUTED, fontSize: 9 }} label={{ value: "Longitude (Sabang → Merauke)", position: "insideBottom", offset: -10, fill: C_MUTED, fontSize: 10 }} />
          <YAxis type="number" dataKey="lat" name="Latitude" domain={[-12, 7]} tick={{ fill: C_MUTED, fontSize: 9 }} label={{ value: "Latitude", angle: -90, position: "insideLeft", fill: C_MUTED, fontSize: 10 }} />
          <ZAxis range={[10, 30]} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: any) => typeof v === "number" ? v.toFixed(3) : v} cursor={{ strokeDasharray: "3 3" }} />
          <Legend wrapperStyle={{ fontSize: 10, color: C_MUTED }} iconSize={9} />
          {Object.entries(grouped).map(([status, pts]) => (
            <Scatter key={status} name={status} data={pts} fill={STATUS_COLOR[status] ?? "#9aa6bd"} fillOpacity={0.55} />
          ))}
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── STACKED BAR (Pangkat × Status) ──────────────────────
export function PangkatStatusStackedBar({ data }: { data: { pangkat: string; submitted: number; reviewed: number; approved: number; rejected: number }[] }) {
  if (data.length === 0) return <Empty>Belum ada data laporan per pangkat.</Empty>;
  return (
    <div className="h-[280px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="pangkat" tick={{ fill: C_INK, fontSize: 11 }} />
          <YAxis tick={{ fill: C_MUTED, fontSize: 10 }} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v: number) => fmt(v)} />
          <Legend wrapperStyle={{ fontSize: 10, color: C_MUTED }} iconSize={9} />
          <Bar dataKey="approved" stackId="s" name="Approved" fill={STATUS_COLOR.approved} />
          <Bar dataKey="reviewed" stackId="s" name="Reviewed" fill={STATUS_COLOR.reviewed} />
          <Bar dataKey="submitted" stackId="s" name="Pending" fill={STATUS_COLOR.submitted} />
          <Bar dataKey="rejected" stackId="s" name="Rejected" fill={STATUS_COLOR.rejected} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── HORIZONTAL BAR (Top lists) ──────────────────────
export function HBarChart({ data, valueKey, labelKey, color = "#f59e0b", height = 360 }: { data: any[]; valueKey: string; labelKey: string; color?: string; height?: number }) {
  return (
    <div style={{ height }}>
      <ResponsiveContainer>
        <BarChart data={data} layout="vertical" margin={{ top: 6, right: 20, bottom: 6, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" horizontal={false} />
          <XAxis type="number" tick={{ fill: C_MUTED, fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <YAxis type="category" dataKey={labelKey} tick={{ fill: C_INK, fontSize: 10 }} width={180} interval={0} />
          <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => fmt(v)} cursor={{ fill: "rgba(255,255,255,0.04)" }} />
          <Bar dataKey={valueKey} fill={color} radius={[0, 3, 3, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── DAY-OF-WEEK × HOUR HEATMAP ──────────────────────
const DOW = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export function DowHourHeatmap({ data }: { data: { dow: number; hour: number; n: number }[] }) {
  if (data.length === 0) return <Empty>Belum ada data heatmap.</Empty>;
  const max = Math.max(...data.map(d => d.n), 1);
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0));
  for (const d of data) grid[d.dow][d.hour] = d.n;
  return (
    <div className="overflow-x-auto">
      <div className="inline-block min-w-full p-2">
        <div className="flex items-center gap-1 text-[9px] text-ink-subtle">
          <div className="w-8"/>
          {Array.from({ length: 24 }).map((_, h) => (
            <div key={h} className="w-5 text-center">{h % 3 === 0 ? h : ""}</div>
          ))}
        </div>
        {grid.map((row, dow) => (
          <div key={dow} className="flex items-center gap-1 mt-1">
            <div className="w-8 text-[10px] uppercase tracking-widest text-ink-muted text-right pr-1">{DOW[dow]}</div>
            {row.map((n, h) => {
              const t = n / max;
              const bg = n === 0 ? "rgba(255,255,255,0.03)" : `rgba(245, 158, 11, ${0.15 + t * 0.75})`;
              return (
                <div key={h} className="w-5 h-5 rounded-sm" style={{ background: bg }} title={`${DOW[dow]} ${h}:00 — ${n} laporan`} />
              );
            })}
          </div>
        ))}
        <div className="mt-2 flex items-center justify-end gap-1 text-[9px] text-ink-subtle">
          <span>0</span>
          {[0.15, 0.4, 0.65, 0.9].map((a, i) => (
            <div key={i} className="w-3 h-3 rounded-sm" style={{ background: `rgba(245, 158, 11, ${a})` }} />
          ))}
          <span>{fmt(max)}</span>
        </div>
      </div>
    </div>
  );
}

// ────────────────────── BUBBLE Geografis (kab) ──────────────────────
export function GeoKabBubble({ data }: { data: { kab_kota: string; provinsi: string; n_laporan: number; n_pembina: number; n_sekolah: number }[] }) {
  if (data.length === 0) return <Empty>Belum ada data geografis.</Empty>;
  return (
    <div className="h-[340px]">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 8, right: 16, bottom: 32, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" />
          <XAxis type="number" dataKey="n_pembina" name="Pembina" tick={{ fill: C_MUTED, fontSize: 10 }} label={{ value: "Jumlah Pembina di Kab", position: "insideBottom", offset: -10, fill: C_MUTED, fontSize: 10 }} />
          <YAxis type="number" dataKey="n_laporan" name="Laporan" tick={{ fill: C_MUTED, fontSize: 10 }} label={{ value: "Jumlah Laporan", angle: -90, position: "insideLeft", fill: C_MUTED, fontSize: 10 }} />
          <ZAxis type="number" dataKey="n_sekolah" range={[40, 600]} />
          <Tooltip
            cursor={{ strokeDasharray: "3 3" }}
            content={({ active, payload }: any) => {
              if (!active || !payload?.[0]) return null;
              const d = payload[0].payload;
              return (
                <div className="rounded-md border border-white/10 bg-bg-soft p-2.5 text-xs">
                  <div className="font-semibold text-ink">{d.kab_kota}</div>
                  <div className="text-[10px] uppercase tracking-widest text-ink-subtle">{d.provinsi}</div>
                  <div className="mt-1 text-ink-muted">Pembina: <span className="text-ink">{fmt(d.n_pembina)}</span></div>
                  <div className="text-ink-muted">Laporan: <span className="text-accent-glow">{fmt(d.n_laporan)}</span></div>
                  <div className="text-ink-muted">Sekolah disambangi: <span className="text-ink">{fmt(d.n_sekolah)}</span></div>
                </div>
              );
            }}
          />
          <Scatter data={data} fill="#f59e0b" fillOpacity={0.55} stroke="#fbbf24" />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── PROVINSI BAR (where reports happen) ──────────────────────
export function ProvinsiBarChart({ data }: { data: { name: string; n: number }[] }) {
  if (data.length === 0) return <Empty>Belum ada data laporan per provinsi.</Empty>;
  return (
    <div className="h-[300px]">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 8, right: 12, bottom: 60, left: 8 }}>
          <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="name" tick={{ fill: C_MUTED, fontSize: 9 }} interval={0} angle={-35} textAnchor="end" />
          <YAxis tick={{ fill: C_MUTED, fontSize: 10 }} tickFormatter={v => fmt(v)} />
          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "rgba(255,255,255,0.04)" }} formatter={(v: number) => fmt(v)} />
          <Bar dataKey="n" fill="#10b981" radius={[3, 3, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// ────────────────────── Utility ──────────────────────
function Empty({ children }: { children: React.ReactNode }) {
  return <div className="grid h-[240px] place-items-center text-[12px] text-ink-subtle">{children}</div>;
}
