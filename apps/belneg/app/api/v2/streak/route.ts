import { NextRequest } from "next/server";
import { requireSiswa, ok } from "../_lib";
import { computeStreak } from "../_badges";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;
  const { current, longest, lastActive } = await computeStreak(auth.user.sub);
  return ok({ current_streak: current, longest_streak: longest, last_active_at: lastActive });
}
