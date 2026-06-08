import { NextRequest } from "next/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { qAll, qRun, requireSiswa, newId, ok, bad } from "../../_lib";
import { checkAllBadges } from "../../_badges";

export const dynamic = "force-dynamic";

type Dim = "R" | "I" | "A" | "S" | "E" | "C";
type Question = { idx: number; text: string; dim: Dim };

const QUESTIONS_PATH = resolve(process.cwd(), "data", "riasec-onet-ip-short.json");
let CACHED: { questions: Question[] } | null = null;
function loadBank(): { questions: Question[] } {
  if (CACHED) return CACHED;
  CACHED = JSON.parse(readFileSync(QUESTIONS_PATH, "utf-8"));
  return CACHED!;
}

const DIMS: Dim[] = ["R", "I", "A", "S", "E", "C"];

export async function POST(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }

  const answers = Array.isArray(body?.answers) ? body.answers : null;
  if (!answers) return bad("answers harus array of {idx, value}");

  const bank = loadBank();
  const totalQ = bank.questions.length;

  // Index answers by idx for O(1) lookup; validate shape
  const answerByIdx = new Map<number, number>();
  for (const a of answers) {
    const idx = Number.isInteger(a?.idx) ? a.idx : NaN;
    const val = Number.isInteger(a?.value) ? a.value : NaN;
    if (!(idx >= 0 && idx < totalQ)) return bad(`idx ${a?.idx} di luar range 0..${totalQ - 1}`);
    if (!(val >= 1 && val <= 5))      return bad(`value ${a?.value} di luar range 1..5 untuk idx ${idx}`);
    answerByIdx.set(idx, val);
  }
  if (answerByIdx.size !== totalQ) {
    const missing: number[] = [];
    for (let i = 0; i < totalQ; i++) if (!answerByIdx.has(i)) missing.push(i);
    return bad(`butuh ${totalQ} jawaban, kurang: ${missing.slice(0, 10).join(",")}${missing.length > 10 ? "..." : ""}`);
  }

  // Score: sum per dim → normalize to 0..100
  const dimSums: Record<Dim, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  const dimCounts: Record<Dim, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  for (const q of bank.questions) {
    const v = answerByIdx.get(q.idx)!;
    dimSums[q.dim] += v;
    dimCounts[q.dim] += 1;
  }
  const scores: Record<Dim, number> = { R: 0, I: 0, A: 0, S: 0, E: 0, C: 0 };
  for (const d of DIMS) {
    const cnt = dimCounts[d] || 1;
    // (sum - min) / (max - min) * 100  where min = cnt*1, max = cnt*5
    scores[d] = Math.round(((dimSums[d] - cnt) / (cnt * 4)) * 100);
  }

  // top_code = top 3 dims (alphabet stable on ties for determinism)
  const topCode = DIMS
    .slice()
    .sort((a, b) => (scores[b] - scores[a]) || a.localeCompare(b))
    .slice(0, 3)
    .join("");

  // Persist
  const assessmentId = newId("ass");
  await qRun(
    `INSERT INTO siswa_assessments
       (id, user_id, riasec_realistic, riasec_investigative, riasec_artistic,
        riasec_social, riasec_enterprising, riasec_conventional, top_code)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    [assessmentId, auth.user.sub, scores.R, scores.I, scores.A, scores.S, scores.E, scores.C, topCode]
  );

  // Bulk insert answer rows. With 60 rows libsql is fine doing it serially;
  // for clarity (and to skip a "transaction" wrapper) we just await each.
  // batch=200 in libsql is fine — but let's be conservative and chunk.
  for (const q of bank.questions) {
    await qRun(
      `INSERT INTO siswa_assessment_answers (assessment_id, question_idx, answer, riasec_dim)
       VALUES (?,?,?,?)`,
      [assessmentId, q.idx, answerByIdx.get(q.idx)!, q.dim]
    );
  }

  await qRun(`UPDATE siswa_users SET riasec_top_code = ? WHERE id = ?`, [topCode, auth.user.sub]);
  await qRun(
    `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
    [newId("act"), auth.user.sub, "assessment_done", assessmentId]
  );

  // Career preview — top 3 via the same cosine-similarity query as /careers/match
  const careersPreview = await qAll<any>(
    `WITH occ AS (
       SELECT o.onet_soc_code, o.title,
         MAX(CASE WHEN oi.riasec_dim = 'Realistic'     THEN oi.score END) AS r,
         MAX(CASE WHEN oi.riasec_dim = 'Investigative' THEN oi.score END) AS i,
         MAX(CASE WHEN oi.riasec_dim = 'Artistic'      THEN oi.score END) AS a,
         MAX(CASE WHEN oi.riasec_dim = 'Social'        THEN oi.score END) AS s,
         MAX(CASE WHEN oi.riasec_dim = 'Enterprising'  THEN oi.score END) AS e,
         MAX(CASE WHEN oi.riasec_dim = 'Conventional'  THEN oi.score END) AS c
       FROM onet_occupations o
       JOIN onet_interests oi ON oi.onet_soc_code = o.onet_soc_code
       GROUP BY o.onet_soc_code
       HAVING r IS NOT NULL AND i IS NOT NULL AND a IS NOT NULL
          AND s IS NOT NULL AND e IS NOT NULL AND c IS NOT NULL
     )
     SELECT onet_soc_code, title,
       ROUND(
         (? * r + ? * i + ? * a + ? * s + ? * e + ? * c) /
         (SQRT(? * ? + ? * ? + ? * ? + ? * ? + ? * ? + ? * ?) *
          SQRT(r * r + i * i + a * a + s * s + e * e + c * c)),
         4
       ) AS match_score
     FROM occ
     ORDER BY match_score DESC
     LIMIT 3`,
    [
      scores.R, scores.I, scores.A, scores.S, scores.E, scores.C,
      scores.R, scores.R, scores.I, scores.I, scores.A, scores.A,
      scores.S, scores.S, scores.E, scores.E, scores.C, scores.C,
    ]
  );

  const newBadges = await checkAllBadges(auth.user.sub).catch(e => { console.warn("[badges] error:", e?.message); return []; });

  return ok({
    id: assessmentId,
    scores,
    top_code: topCode,
    careers_preview: careersPreview,
    new_badges: newBadges,
  });
}
