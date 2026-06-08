import { NextRequest } from "next/server";
import { qAll, requireSiswa, ok } from "../../_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;

  // Latest rating per element_id (in case user resubmits — submit DELETEs
  // priors anyway, but DISTINCT-on-element-id is belt-and-suspenders).
  const rows = await qAll<any>(
    `WITH latest AS (
       SELECT onet_skill_id, MAX(rated_at) AS rated_at
       FROM siswa_self_assessments
       WHERE user_id = ?
       GROUP BY onet_skill_id
     )
     SELECT sa.onet_skill_id AS element_id,
            sa.current_level, sa.target_level,
            (sa.target_level - sa.current_level) AS gap,
            sa.gap_category AS category,
            COALESCE(s.element_name, k.element_name) AS element_name,
            COALESCE(s.category,     k.category)     AS taxonomy_category,
            CASE WHEN s.element_id IS NOT NULL THEN 'skill'
                 WHEN k.element_id IS NOT NULL THEN 'knowledge'
                 ELSE NULL END AS kind,
            sa.rated_at
     FROM siswa_self_assessments sa
     JOIN latest l ON l.onet_skill_id = sa.onet_skill_id AND l.rated_at = sa.rated_at
     LEFT JOIN onet_skills    s ON s.element_id = sa.onet_skill_id
     LEFT JOIN onet_knowledge k ON k.element_id = sa.onet_skill_id
     WHERE sa.user_id = ?
     ORDER BY sa.gap_category ASC, gap DESC, sa.current_level ASC`,
    [auth.user.sub, auth.user.sub]
  );

  const summary = { critical: 0, moderate: 0, minimal: 0 };
  const grouped: Record<string, any[]> = { critical: [], moderate: [], minimal: [] };
  for (const r of rows) {
    if (r.category in summary) {
      summary[r.category as keyof typeof summary] += 1;
      grouped[r.category].push(r);
    }
  }

  return ok({
    summary,
    grouped,
    items: rows,
    total: rows.length,
  });
}
