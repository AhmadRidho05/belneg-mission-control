import { NextRequest } from "next/server";
import { qGet, requireSiswa, ok, bad } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  const row = await qGet<any>(
    `SELECT id, riasec_realistic AS r, riasec_investigative AS i,
            riasec_artistic AS a, riasec_social AS s,
            riasec_enterprising AS e, riasec_conventional AS c,
            top_code, submitted_at
     FROM siswa_assessments
     WHERE user_id = ?
     ORDER BY submitted_at DESC
     LIMIT 1`,
    [auth.user.sub]
  );
  if (!row) return bad("belum ada asesmen", 404);

  return ok({
    id: row.id,
    scores: { R: row.r, I: row.i, A: row.a, S: row.s, E: row.e, C: row.c },
    top_code: row.top_code,
    submitted_at: row.submitted_at,
  });
}
