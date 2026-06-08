// Stores user's self-rated current_level (1..5) for each skill/knowledge
// returned by /skills, computes target_level from O*NET, and categorises
// the gap (critical / moderate / minimal).
import { NextRequest } from "next/server";
import { qAll, qGet, qRun, requireSiswa, newId, ok, bad } from "../../_lib";
import { checkAllBadges } from "../../_badges";

export const dynamic = "force-dynamic";

// O*NET importance is 1..5, level is 1..7. We want target_level on the
// SAME 1..5 scale as current_level so gap math is intuitive. Map
// O*NET level (1..7) to 1..5 by linear scaling: round((level - 1) / 6 * 4 + 1).
function onetLevelToUser(level: number): number {
  return Math.max(1, Math.min(5, Math.round(((level - 1) / 6) * 4 + 1)));
}

export async function POST(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const ratings = Array.isArray(body?.ratings) ? body.ratings : null;
  if (!ratings || ratings.length === 0) return bad("ratings (array) required");

  // Validate each rating shape
  const parsed: { element_id: string; current_level: number }[] = [];
  for (const r of ratings) {
    const eid = String(r?.element_id ?? "").trim();
    const cur = Number.isInteger(r?.current_level) ? r.current_level : NaN;
    if (!eid) return bad(`element_id required for each rating`);
    if (!(cur >= 1 && cur <= 5)) return bad(`current_level untuk ${eid} harus 1..5`);
    parsed.push({ element_id: eid, current_level: cur });
  }

  // Need the user's top-5 careers to compute target_level. Re-run the
  // same cosine match as /skills (DRY-violation acknowledged; if this
  // becomes a perf issue, factor into a shared SQL helper).
  const a = await qGet<any>(
    `SELECT id, riasec_realistic AS r, riasec_investigative AS i,
            riasec_artistic AS a, riasec_social AS s,
            riasec_enterprising AS e, riasec_conventional AS c
     FROM siswa_assessments WHERE user_id = ?
     ORDER BY submitted_at DESC LIMIT 1`,
    [auth.user.sub]
  );
  if (!a) return bad("belum ada asesmen", 404);

  const careers = await qAll<{ onet_soc_code: string }>(
    `WITH occ AS (
       SELECT o.onet_soc_code,
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
     SELECT onet_soc_code,
       ((? * r + ? * i + ? * a + ? * s + ? * e + ? * c) /
        (SQRT(? * ? + ? * ? + ? * ? + ? * ? + ? * ? + ? * ?) *
         SQRT(r * r + i * i + a * a + s * s + e * e + c * c))) AS sim
     FROM occ
     ORDER BY sim DESC LIMIT 5`,
    [
      a.r, a.i, a.a, a.s, a.e, a.c,
      a.r, a.r, a.i, a.i, a.a, a.a, a.s, a.s, a.e, a.e, a.c, a.c,
    ]
  );
  const topSoc = careers.map(c => c.onet_soc_code);
  if (topSoc.length === 0) return bad("top careers tidak ditemukan", 500);

  // Fetch max level per element_id across top careers, for both skills and knowledge
  const placeholders = topSoc.map(() => "?").join(",");
  const elementIds = parsed.map(r => r.element_id);
  const elPlaceholders = elementIds.map(() => "?").join(",");

  // IMPORTANT: same importance > 3.5 filter as /self-assessment/skills. The
  // submitted element_ids must be in the personalised /skills set; otherwise
  // reject with 422. Otherwise a client could rate skills not tied to its
  // top careers and pollute the gap dashboard.
  const targetRows = await qAll<{ element_id: string; max_level: number; kind: string }>(
    `SELECT element_id, MAX(level) AS max_level, 'skill' AS kind
       FROM onet_occupation_skills
       WHERE onet_soc_code IN (${placeholders})
         AND element_id IN (${elPlaceholders})
         AND importance > 3.5
       GROUP BY element_id
     UNION ALL
     SELECT element_id, MAX(level) AS max_level, 'knowledge' AS kind
       FROM onet_occupation_knowledge
       WHERE onet_soc_code IN (${placeholders})
         AND element_id IN (${elPlaceholders})
         AND importance > 3.5
       GROUP BY element_id`,
    [...topSoc, ...elementIds, ...topSoc, ...elementIds]
  );

  // Build target_level per element_id
  const targetByEid = new Map<string, { level: number; kind: string }>();
  for (const r of targetRows) {
    const userLevel = onetLevelToUser(Number(r.max_level));
    const cur = targetByEid.get(r.element_id);
    if (!cur || userLevel > cur.level) {
      targetByEid.set(r.element_id, { level: userLevel, kind: r.kind });
    }
  }

  // Hard-reject any submitted element_id that isn't in the personalised
  // /skills set for this user. Prevents pollution + matches spec.
  const unknown = parsed
    .map(r => r.element_id)
    .filter(eid => !targetByEid.has(eid));
  if (unknown.length > 0) {
    return bad(
      `element_id berikut tidak ada di /api/v2/self-assessment/skills untuk user ini: ${unknown.slice(0, 5).join(", ")}${unknown.length > 5 ? ` (+${unknown.length - 5} lainnya)` : ""}. Submit hanya skill dari endpoint /skills.`,
      422
    );
  }

  // Delete prior self-assessment rows for these element_ids only (preserve
  // historical rows for other skills if any).
  await qRun(
    `DELETE FROM siswa_self_assessments WHERE user_id = ? AND onet_skill_id IN (${elPlaceholders})`,
    [auth.user.sub, ...elementIds]
  );

  const summary = { critical: 0, moderate: 0, minimal: 0 };
  const items: any[] = [];
  for (const r of parsed) {
    // targetByEid is now guaranteed to contain every parsed.element_id by
    // the unknown-rejection check above.
    const target = targetByEid.get(r.element_id)!;
    const gap = target.level - r.current_level;
    const category: "critical" | "moderate" | "minimal" =
      gap >= 3 ? "critical" : (gap === 2 ? "moderate" : "minimal");
    summary[category] += 1;
    await qRun(
      `INSERT INTO siswa_self_assessments
        (id, user_id, onet_skill_id, current_level, target_level, gap_category)
       VALUES (?,?,?,?,?,?)`,
      [newId("sass"), auth.user.sub, r.element_id, r.current_level, target.level, category]
    );
    items.push({
      element_id: r.element_id,
      current_level: r.current_level,
      target_level: target.level,
      gap,
      category,
    });
  }

  await qRun(
    `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
    [newId("act"), auth.user.sub, "self_assessment_done", null]
  );

  const newBadges = await checkAllBadges(auth.user.sub).catch(e => { console.warn("[badges] error:", e?.message); return []; });

  return ok({ summary, items, new_badges: newBadges });
}
