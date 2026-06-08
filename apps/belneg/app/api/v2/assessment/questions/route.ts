// Static question bank — same for everyone. Aggressively cached.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { NextResponse } from "next/server";

const QUESTIONS_PATH = resolve(process.cwd(), "data", "riasec-onet-ip-short.json");
let CACHED: any | null = null;
function loadBank() {
  if (CACHED) return CACHED;
  CACHED = JSON.parse(readFileSync(QUESTIONS_PATH, "utf-8"));
  return CACHED;
}

export async function GET() {
  const bank = loadBank();
  return NextResponse.json(bank, {
    headers: {
      // 1 hour CDN cache + 1 day SWR — instrument changes are rare; bumping
      // version field invalidates client cache via app code.
      "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
