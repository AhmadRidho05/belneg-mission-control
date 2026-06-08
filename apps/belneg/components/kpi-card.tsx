import { cn, fmt, pct } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

export function KpiCard({
  label,
  value,
  icon: Icon,
  hint,
  accent = "default",
  className,
}: {
  label: string;
  value: number | string;
  icon?: LucideIcon;
  hint?: string;
  accent?: "default" | "gold" | "ok" | "warn" | "crit";
  className?: string;
}) {
  const ring =
    accent === "gold" ? "ring-1 ring-accent/30" :
    accent === "ok"   ? "ring-1 ring-ok/30"     :
    accent === "warn" ? "ring-1 ring-warn/30"   :
    accent === "crit" ? "ring-1 ring-crit/30"   : "";
  const num =
    accent === "gold" ? "text-accent-glow" :
    accent === "ok"   ? "text-ok"          :
    accent === "warn" ? "text-warn"        :
    accent === "crit" ? "text-crit"        : "text-ink";
  return (
    <div className={cn("panel p-4 flex items-start gap-3", ring, className)}>
      {Icon && (
        <span className="mt-0.5 inline-flex h-9 w-9 items-center justify-center rounded-md bg-white/5 text-ink-muted">
          <Icon size={16} />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="stat-label">{label}</div>
        <div className={cn("mt-1 font-display text-2xl font-bold tabular-nums", num)}>
          {typeof value === "number" ? fmt(value) : value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-ink-muted">{hint}</div>}
      </div>
    </div>
  );
}

export function MiniBar({ a, b, labelA = "Negeri", labelB = "Swasta" }: { a: number; b: number; labelA?: string; labelB?: string }) {
  const total = a + b;
  if (!total) return null;
  const aPct = (a / total) * 100;
  return (
    <div className="space-y-1">
      <div className="flex h-1.5 overflow-hidden rounded-sm bg-white/5">
        <div className="bg-ok" style={{ width: `${aPct}%` }} />
        <div className="bg-accent" style={{ width: `${100 - aPct}%` }} />
      </div>
      <div className="flex justify-between text-[10px] uppercase tracking-widest text-ink-subtle">
        <span>
          <span className="text-ok">●</span> {labelA} {pct(a, total, 0)}
        </span>
        <span>
          <span className="text-accent">●</span> {labelB} {pct(b, total, 0)}
        </span>
      </div>
    </div>
  );
}
