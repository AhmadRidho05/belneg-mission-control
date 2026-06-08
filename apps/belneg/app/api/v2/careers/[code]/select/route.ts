import { NextRequest } from "next/server";
import { qGet, qRun, requireSiswa, newId, ok, bad } from "../../../_lib";

export const dynamic = "force-dynamic";

const ONET_CODE_RE = /^\d{2}-\d{4}\.\d{2}$/;

export async function POST(req: NextRequest, ctx: { params: Promise<{ code: string }> }) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const { code } = await ctx.params;
  if (!ONET_CODE_RE.test(code)) return bad("onet_soc_code format invalid (expected NN-NNNN.NN)");

  const occ = await qGet<{ onet_soc_code: string; title: string }>(
    `SELECT onet_soc_code, title FROM onet_occupations WHERE onet_soc_code = ?`,
    [code]
  );
  if (!occ) return bad("karier tidak ditemukan", 404);

  await qRun(`UPDATE siswa_users SET primary_career_onet = ? WHERE id = ?`, [code, auth.user.sub]);
  await qRun(
    `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
    [newId("act"), auth.user.sub, "career_selected", code]
  );

  return ok({ ok: true, primary_career_onet: code, title: occ.title });
}
