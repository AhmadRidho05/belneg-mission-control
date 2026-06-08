"use client";
import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils";

export type MultiSelectOption = {
  id: string;
  label: string;
  sub?: string;          // secondary line (e.g. parent kodam for a kodim)
  group?: string;        // optional grouping label
};

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Pilih…",
  searchPlaceholder = "Cari…",
  maxBadgeCount = 2,
  className,
  emptyHint,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  maxBadgeCount?: number;
  className?: string;
  emptyHint?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const selSet = new Set(selected);
  const q = query.trim().toLowerCase();
  const filtered = q
    ? options.filter(o => o.label.toLowerCase().includes(q) || (o.sub ?? "").toLowerCase().includes(q))
    : options;
  const selectedOptions = options.filter(o => selSet.has(o.id));

  const toggle = (id: string) => {
    if (selSet.has(id)) onChange(selected.filter(s => s !== id));
    else onChange([...selected, id]);
  };
  const clear = (e: React.MouseEvent) => { e.stopPropagation(); onChange([]); };
  const selectAllFiltered = () => onChange(Array.from(new Set([...selected, ...filtered.map(o => o.id)])));
  const removeAllFiltered = () => onChange(selected.filter(s => !filtered.some(o => o.id === s)));

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-md border border-white/10 bg-bg/60 px-2.5 py-1.5 text-left text-[12px] hover:bg-white/5 transition",
          open && "border-accent/40 ring-1 ring-accent/30"
        )}
      >
        <div className="flex flex-wrap items-center gap-1 min-w-0 flex-1">
          {selected.length === 0 && <span className="text-ink-subtle">{placeholder}</span>}
          {selected.length > 0 && (
            <>
              {selectedOptions.slice(0, maxBadgeCount).map(opt => (
                <span key={opt.id} className="inline-flex items-center gap-1 rounded-sm bg-accent/15 px-1.5 py-0.5 text-[10px] text-accent-glow">
                  {opt.label.length > 18 ? opt.label.slice(0, 16) + "…" : opt.label}
                  <button
                    onClick={(e) => { e.stopPropagation(); toggle(opt.id); }}
                    aria-label={`Hapus ${opt.label}`}
                    className="hover:text-ink"
                  >
                    <X size={9} />
                  </button>
                </span>
              ))}
              {selected.length > maxBadgeCount && (
                <span className="text-[10px] text-ink-muted">+ {selected.length - maxBadgeCount} lainnya</span>
              )}
            </>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0 text-ink-muted">
          {selected.length > 0 && (
            <button
              onClick={clear}
              aria-label="Kosongkan pilihan"
              className="hover:text-ink rounded-sm hover:bg-white/5 p-0.5"
            >
              <X size={12} />
            </button>
          )}
          <ChevronDown size={12} className={cn("transition", open && "rotate-180")} />
        </div>
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full sm:min-w-[260px] max-w-[calc(100vw-1.5rem)] rounded-md border border-white/10 bg-bg-soft shadow-2xl">
          {/* Search */}
          <div className="relative border-b border-white/5 p-2">
            <Search size={11} className="absolute left-4 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={searchPlaceholder}
              autoFocus
              className="w-full rounded-sm border border-white/10 bg-bg/60 pl-6 pr-2 py-1.5 text-[12px] text-ink placeholder:text-ink-subtle"
            />
          </div>

          {/* Bulk actions */}
          {filtered.length > 0 && (
            <div className="flex items-center justify-between border-b border-white/5 px-2 py-1.5 text-[10px] text-ink-muted">
              <span>{filtered.length} item · {selected.length} terpilih</span>
              <div className="flex gap-1">
                <button onClick={selectAllFiltered} className="rounded-sm bg-white/5 hover:bg-white/10 px-1.5 py-0.5">
                  Pilih semua
                </button>
                <button onClick={removeAllFiltered} className="rounded-sm bg-white/5 hover:bg-white/10 px-1.5 py-0.5">
                  Hapus
                </button>
              </div>
            </div>
          )}

          {/* List */}
          <div className="max-h-[280px] overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="p-4 text-center text-[11px] text-ink-subtle">
                {emptyHint || "Tidak ada hasil."}
              </div>
            ) : (
              filtered.map(opt => {
                const isSel = selSet.has(opt.id);
                return (
                  <button
                    key={opt.id}
                    onClick={() => toggle(opt.id)}
                    className={cn(
                      "flex w-full items-center gap-2 px-2 py-1.5 text-left text-[12px] hover:bg-white/5",
                      isSel && "bg-accent/10"
                    )}
                  >
                    <span className={cn(
                      "flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded-sm border",
                      isSel ? "border-accent bg-accent text-bg" : "border-white/15"
                    )}>
                      {isSel && <Check size={9} strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <div className={cn("truncate", isSel ? "text-ink font-medium" : "text-ink-muted")}>
                        {opt.label}
                      </div>
                      {opt.sub && (
                        <div className="text-[10px] text-ink-subtle truncate">{opt.sub}</div>
                      )}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
}
