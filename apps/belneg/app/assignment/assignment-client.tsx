"use client";
import dynamic from "next/dynamic";
import type { KodimRow } from "@/lib/db";
import { SubNav } from "./koramil-stress/koramil-stress-client";

const AssignmentMap = dynamic(() => import("./assignment-map"), {
  ssr: false,
  loading: () => (
    <div className="grid h-full w-full place-items-center bg-bg-soft">
      <div className="text-sm text-ink-muted animate-pulse">Loading tactical map…</div>
    </div>
  ),
});

export default function AssignmentClient({ kodim, isAdmin = false }: { kodim: KodimRow[]; isAdmin?: boolean }) {
  return (
    <div className="flex flex-col h-full">
      {isAdmin && (
        <div className="px-5 pt-4 shrink-0 lg:pr-72 xl:pr-80">
          <SubNav active="kodim-load" />
        </div>
      )}
      <div className="flex-1 min-h-0">
        <AssignmentMap kodim={kodim} isAdmin={isAdmin} />
      </div>
    </div>
  );
}
