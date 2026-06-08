import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const FMT = new Intl.NumberFormat("id-ID");
export function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return FMT.format(Math.round(n));
}

export function pct(num: number, denom: number, digits = 1): string {
  if (!denom) return "—";
  return ((num / denom) * 100).toFixed(digits) + "%";
}

export function prettyProv(s: string | null | undefined): string {
  if (!s) return "—";
  return s.replace(/^PROV\.\s*/i, "").replace(/_/g, " ");
}
