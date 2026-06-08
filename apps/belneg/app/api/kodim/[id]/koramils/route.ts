// Lazy fetch: list of koramils under a kodim. Used by /assignment sidebar
// when a kodim marker is selected.
import { NextRequest } from "next/server";
import { koramilsForKodim } from "@/lib/db";
import { ok } from "../../../v1/_lib";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const rows = await koramilsForKodim(id);
  return ok({ kodim_id: id, count: rows.length, rows });
}
