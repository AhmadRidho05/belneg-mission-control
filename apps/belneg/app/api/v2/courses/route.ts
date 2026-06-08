// Course catalog browse. Public-ish — Bearer auth optional (returns the
// same result either way for now). Filters: skill_id, provider, language,
// level, free, q, plus pagination.
import { NextRequest } from "next/server";
import { qAll, ok } from "../_lib";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const q        = (sp.get("q")        || "").trim();
  const skillId  = (sp.get("skill_id") || "").trim();
  const provider = (sp.get("provider") || "").trim();
  const language = (sp.get("language") || "").trim();
  const level    = (sp.get("level")    || "").trim();
  const free     =  sp.get("free") === "true";
  const limit    = Math.min(Math.max(parseInt(sp.get("limit") || String(DEFAULT_LIMIT), 10) || DEFAULT_LIMIT, 1), MAX_LIMIT);
  const offset   = Math.max(parseInt(sp.get("offset") || "0", 10) || 0, 0);

  const conds: string[] = [`c.active = 1`];
  const args: any[] = [];

  if (q) {
    conds.push(`(c.title LIKE ? OR c.description LIKE ? OR c.provider LIKE ?)`);
    args.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  if (provider) { conds.push(`c.provider LIKE ?`); args.push(`%${provider}%`); }
  if (language && ["id","en"].includes(language)) { conds.push(`c.language = ?`); args.push(language); }
  if (level    && ["beginner","intermediate","advanced"].includes(level)) { conds.push(`c.level = ?`); args.push(level); }
  if (free)    { conds.push(`c.price_idr = 0`); }

  let joinSql = "";
  if (skillId) {
    joinSql = `JOIN course_skill_tags t ON t.course_id = c.id`;
    conds.push(`t.onet_element_id = ?`);
    args.push(skillId);
  }

  const whereSql = conds.join(" AND ");

  // Use a subquery so we can compute total ignoring limit/offset.
  const rows = await qAll<any>(
    `SELECT c.id, c.source, c.external_id, c.title, c.provider, c.description, c.url,
            c.duration_hours, c.language, c.price_idr, c.rating, c.level,
            c.tagged_at, c.created_at
     FROM course_catalog c
     ${joinSql}
     WHERE ${whereSql}
     ORDER BY c.rating DESC, c.duration_hours ASC, c.id ASC
     LIMIT ? OFFSET ?`,
    [...args, limit, offset]
  );

  const totalRow = await qAll<{ n: number }>(
    `SELECT COUNT(${skillId ? "DISTINCT c.id" : "*"}) AS n
     FROM course_catalog c ${joinSql}
     WHERE ${whereSql}`,
    args
  );

  // Optionally attach tags (skills+knowledge) per course — only if a small
  // result set, otherwise we'd N+1.
  let withTags = rows;
  if (rows.length > 0 && rows.length <= 30) {
    const ids = rows.map(r => r.id);
    const idPlaceholders = ids.map(() => "?").join(",");
    const tags = await qAll<any>(
      `SELECT t.course_id, t.onet_element_id, t.coverage, t.confidence,
              COALESCE(s.element_name, k.element_name) AS element_name,
              CASE WHEN s.element_id IS NOT NULL THEN 'skill'
                   WHEN k.element_id IS NOT NULL THEN 'knowledge'
                   ELSE NULL END AS kind
       FROM course_skill_tags t
       LEFT JOIN onet_skills    s ON s.element_id = t.onet_element_id
       LEFT JOIN onet_knowledge k ON k.element_id = t.onet_element_id
       WHERE t.course_id IN (${idPlaceholders})`,
      ids
    );
    const tagsByCourse = new Map<string, any[]>();
    for (const t of tags) {
      const arr = tagsByCourse.get(t.course_id) || [];
      arr.push({
        element_id: t.onet_element_id,
        element_name: t.element_name,
        kind: t.kind,
        coverage: t.coverage,
        confidence: t.confidence,
      });
      tagsByCourse.set(t.course_id, arr);
    }
    withTags = rows.map(r => ({ ...r, tags: tagsByCourse.get(r.id) || [] }));
  }

  return ok({
    total: totalRow[0]?.n ?? 0,
    count: rows.length,
    limit,
    offset,
    rows: withTags,
  });
}
