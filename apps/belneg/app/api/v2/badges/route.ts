import { NextRequest } from "next/server";
import { qAll, requireSiswa, ok } from "../_lib";
import { BADGES } from "../_badges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const owned = await qAll<{ badge_code: string; awarded_at: string; meta: string | null }>(
    `SELECT badge_code, awarded_at, meta FROM siswa_badges WHERE user_id = ? ORDER BY awarded_at DESC`,
    [auth.user.sub]
  );
  const ownedSet = new Set(owned.map(r => r.badge_code));
  const ownedMap = new Map(owned.map(r => [r.badge_code, r]));

  const earned = BADGES.filter(b => ownedSet.has(b.code)).map(b => {
    const o = ownedMap.get(b.code)!;
    let meta: any = null;
    try { meta = o.meta ? JSON.parse(o.meta) : null; } catch {}
    return { ...b, awarded_at: o.awarded_at, meta };
  });
  const available = BADGES.filter(b => !ownedSet.has(b.code));

  return ok({
    earned,
    available,
    total: BADGES.length,
    earned_count: earned.length,
  });
}
