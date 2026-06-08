import { NextRequest } from "next/server";
import { qGet, requireUser, ok, bad } from "../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;

  const u = await qGet<any>(
    `SELECT id, email, phone, full_name, nrp, role, unit_id, is_active, created_at, last_login_at
     FROM kkri_users WHERE id = ?`,
    [auth.user.sub]
  );
  if (!u) return bad("user not found", 404);

  // Enrich with unit name if available
  let unit_name: string | null = null;
  if (u.unit_id) {
    if (u.unit_id.startsWith("KODAM-")) {
      const r = await qGet<{ name: string }>(`SELECT name FROM dim_kodam WHERE kodam_id = ?`, [u.unit_id]);
      unit_name = r?.name ?? null;
    } else if (u.unit_id.startsWith("KOREM-")) {
      const r = await qGet<{ name: string }>(`SELECT name FROM dim_korem WHERE korem_id = ?`, [u.unit_id]);
      unit_name = r?.name ?? null;
    } else if (u.unit_id.startsWith("KODIM-")) {
      const r = await qGet<{ name: string }>(`SELECT name FROM dim_kodim WHERE kodim_id = ?`, [u.unit_id]);
      unit_name = r?.name ?? null;
    }
  }

  return ok({ ...u, unit_name });
}

export async function PATCH(req: NextRequest) {
  const auth = await requireUser(req);
  if (!auth.ok) return auth.res;
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }

  const allow = ["full_name", "nrp"] as const;
  const sets: string[] = [];
  const args: any[] = [];
  for (const k of allow) {
    if (body[k] != null) { sets.push(`${k} = ?`); args.push(String(body[k]).trim().slice(0, 200)); }
  }
  if (sets.length === 0) return bad("no fields to update");
  args.push(auth.user.sub);

  await (await import("../_lib")).qRun(
    `UPDATE kkri_users SET ${sets.join(", ")} WHERE id = ?`,
    args
  );
  return ok({ updated: true });
}
