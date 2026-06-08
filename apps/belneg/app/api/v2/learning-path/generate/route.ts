// Generate a personalised 3-phase learning path via Claude Sonnet 4.6.
// Idempotent within 7 days unless ?force=true.
//
// Inputs to Sonnet:
//   - User's gaps (critical/moderate/minimal) from siswa_self_assessments
//   - Target career (siswa_users.primary_career_onet)
//   - Up to ~40 most relevant courses (top-5 per critical/moderate skill from
//     course_catalog JOIN course_skill_tags, ranked by tag confidence)
//
// Output (via forced tool_use):
//   {
//     phases: [{ phase_number, title, estimated_weeks, description,
//                skill_targets, courses, project_suggestion, social_accounts }]
//   }
//
// Persists: siswa_learning_paths + siswa_learning_phases + pre-populates
// siswa_course_progress rows with status='belum'. Logs 'learning_path_generated'.

import { NextRequest } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { qAll, qGet, qRun, requireSiswa, newId, ok, bad } from "../../_lib";
import { checkAllBadges } from "../../_badges";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const TTL_DAYS = 7;
const MAX_COURSES_IN_PROMPT = 40;

const tool: Anthropic.Tool = {
  name: "submit_learning_path",
  description: "Submit a personalised 3-phase learning path for the student.",
  input_schema: {
    type: "object",
    properties: {
      phases: {
        type: "array",
        minItems: 3,
        maxItems: 3,
        items: {
          type: "object",
          properties: {
            phase_number: { type: "integer", enum: [1, 2, 3] },
            title:        { type: "string", description: "Judul fase dalam Bahasa Indonesia (max 60 karakter)." },
            estimated_weeks: { type: "integer", minimum: 4, maximum: 26 },
            description: { type: "string", description: "1–2 kalimat deskripsi fase dalam Bahasa Indonesia." },
            skill_targets: {
              type: "array",
              items: { type: "string", description: "O*NET element_id, e.g. '2.A.1.a'." },
            },
            courses: {
              type: "array",
              minItems: 2,
              maxItems: 12,
              items: {
                type: "object",
                properties: {
                  id:    { type: "string", description: "course_catalog.id, e.g. 'crs_abc'." },
                  title: { type: "string" },
                  why_chosen: { type: "string", description: "1 kalimat alasan pilihan dalam Bahasa Indonesia." },
                },
                required: ["id", "title", "why_chosen"],
              },
            },
            project_suggestion: {
              type: "object",
              properties: {
                title:       { type: "string", description: "Judul proyek hands-on dalam Bahasa Indonesia." },
                description: { type: "string", description: "1–2 kalimat ringkasan." },
                deliverable: { type: "string", description: "Output konkret (link demo, repo GitHub, dsb)." },
                est_weeks:   { type: "integer", minimum: 1, maximum: 12 },
              },
              required: ["title", "description", "deliverable", "est_weeks"],
            },
            social_accounts: {
              type: "array",
              minItems: 2,
              maxItems: 4,
              items: {
                type: "object",
                properties: {
                  platform: { type: "string", enum: ["instagram", "tiktok", "youtube"] },
                  handle:   { type: "string", description: "@-handle without leading @." },
                  why:      { type: "string", description: "1 kalimat alasan." },
                },
                required: ["platform", "handle", "why"],
              },
            },
          },
          required: ["phase_number", "title", "estimated_weeks", "description", "skill_targets", "courses", "project_suggestion", "social_accounts"],
        },
      },
    },
    required: ["phases"],
  },
};

export async function POST(req: NextRequest) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;
  const userId = auth.user.sub;
  const force = req.nextUrl.searchParams.get("force") === "true";

  if (!process.env.ANTHROPIC_API_KEY) return bad("ANTHROPIC_API_KEY belum dikonfigurasi", 503);

  // ─── Idempotency ───
  if (!force) {
    const existing = await qGet<{ id: string; generated_at: string }>(
      `SELECT id, generated_at FROM siswa_learning_paths
       WHERE user_id = ? AND generated_at >= datetime('now','-${TTL_DAYS} days')
       ORDER BY generated_at DESC LIMIT 1`,
      [userId]
    );
    if (existing) {
      return ok({ reused: true, id: existing.id, generated_at: existing.generated_at, note: `Learning path masih segar (<${TTL_DAYS} hari). Pakai ?force=true untuk regenerate.` });
    }
  }

  // ─── Inputs ───
  const user = await qGet<any>(
    `SELECT id, full_name, school_class, primary_career_onet FROM siswa_users WHERE id = ?`,
    [userId]
  );
  if (!user?.primary_career_onet) return bad("siswa belum memilih primary_career_onet — pilih karier dulu di /api/v2/careers/[code]/select", 422);

  const career = await qGet<{ onet_soc_code: string; title: string; description: string }>(
    `SELECT onet_soc_code, title, description FROM onet_occupations WHERE onet_soc_code = ?`,
    [user.primary_career_onet]
  );
  if (!career) return bad("primary_career_onet tidak ditemukan di onet_occupations", 422);

  const gaps = await qAll<any>(
    `SELECT sa.onet_skill_id AS element_id,
            sa.current_level, sa.target_level, sa.gap_category,
            COALESCE(s.element_name, k.element_name) AS element_name,
            CASE WHEN s.element_id IS NOT NULL THEN 'skill'
                 WHEN k.element_id IS NOT NULL THEN 'knowledge'
                 ELSE NULL END AS kind
     FROM siswa_self_assessments sa
     LEFT JOIN onet_skills    s ON s.element_id = sa.onet_skill_id
     LEFT JOIN onet_knowledge k ON k.element_id = sa.onet_skill_id
     WHERE sa.user_id = ?
     ORDER BY sa.gap_category, (sa.target_level - sa.current_level) DESC`,
    [userId]
  );
  if (gaps.length === 0) return bad("siswa belum mengisi self-assessment — submit dulu di /api/v2/self-assessment/submit", 422);

  // Relevant courses: top-5 per non-minimal skill, ranked by tag confidence
  const targetElementIds = gaps.filter(g => g.gap_category !== "minimal").map(g => g.element_id);
  let candidateCourses: any[] = [];
  if (targetElementIds.length > 0) {
    const placeholders = targetElementIds.map(() => "?").join(",");
    candidateCourses = await qAll<any>(
      `WITH ranked AS (
         SELECT c.id, c.title, c.provider, c.url, c.duration_hours, c.language,
                c.price_idr, c.rating, c.level, c.description,
                t.onet_element_id, t.coverage, t.confidence,
                ROW_NUMBER() OVER (PARTITION BY t.onet_element_id ORDER BY t.confidence DESC, c.rating DESC) AS rn
         FROM course_skill_tags t
         JOIN course_catalog c ON c.id = t.course_id AND c.active = 1
         WHERE t.onet_element_id IN (${placeholders})
       )
       SELECT id, title, provider, url, duration_hours, language, price_idr, rating, level, description,
              GROUP_CONCAT(DISTINCT onet_element_id) AS teaches_element_ids
       FROM ranked WHERE rn <= 5
       GROUP BY id
       ORDER BY rating DESC, duration_hours ASC
       LIMIT ?`,
      [...targetElementIds, MAX_COURSES_IN_PROMPT]
    );
  }
  if (candidateCourses.length < 3) return bad(`hanya ${candidateCourses.length} kursus relevan ditemukan; jalankan tag-courses dulu agar katalog kaya`, 422);

  // Element name map for prompt
  const elementNameById = new Map<string, string>();
  for (const g of gaps) elementNameById.set(g.element_id, g.element_name);

  // ─── Sonnet prompt ───
  const gapsBlock = gaps.map(g =>
    `  • ${g.element_name} [${g.element_id}] — sekarang ${g.current_level}/5, target ${g.target_level}/5, gap ${g.gap_category}`
  ).join("\n");

  const coursesBlock = candidateCourses.map(c => {
    const skillNames = (c.teaches_element_ids || "").split(",").map((eid: string) => elementNameById.get(eid)).filter(Boolean).join(", ");
    const price = c.price_idr === 0 ? "GRATIS" : `Rp${Number(c.price_idr).toLocaleString("id-ID")}`;
    return `  • [${c.id}] "${c.title}" — ${c.provider}, ${c.duration_hours}j, ${c.language}, ${price}, rating ${c.rating}, ${c.level}\n      URL: ${c.url}\n      Mengajarkan: ${skillNames}`;
  }).join("\n");

  const prompt = `
Profil siswa SMA Indonesia (kelas ${user.school_class || "?"}):
  Karier target: ${career.title} (O*NET ${career.onet_soc_code})
  Deskripsi karier: ${career.description?.slice(0, 200) || "(tidak ada)"}

Gap skill saya (urut prioritas):
${gapsBlock}

Katalog kursus yang tersedia (${candidateCourses.length} kursus, sudah disaring relevan):
${coursesBlock}

Tugas:
Susun learning path 3 fase:
  Fase 1 — Tutup gap KRITIS (target 12–16 minggu)
  Fase 2 — Tutup gap MODERATE (target 8–12 minggu)
  Fase 3 — Pengayaan & spesialisasi (target 8–12 minggu)

Aturan ketat:
  - Untuk SETIAP kursus yang dimasukkan, GUNAKAN id PERSIS dari katalog di atas (kolom dalam tanda kurung siku).
  - JANGAN mengarang id kursus. JANGAN memasukkan kursus yang tidak ada di daftar.
  - Urutkan kursus berdasarkan logika prerequisite (dasar → lanjut).
  - Setiap fase butuh 1 proyek hands-on + 2–4 akun Instagram/TikTok/YouTube Indonesia yang relevan.
  - Akun media sosial: pilih kreator nyata Indonesia yang aktif di bidang teknis siswa (mis. @ngodingwithivan, @dataengineerlife, @kelvinandbasil) — jangan mengarang.
  - Semua judul, deskripsi, alasan, dan teks lain dalam Bahasa Indonesia yang ramah pelajar SMA.
  - skill_targets per fase: gunakan element_id dari daftar gap di atas.

Panggil tool submit_learning_path dengan output yang lengkap dan terstruktur.
`.trim();

  // ─── Call Sonnet ───
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 4096,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_learning_path" },
      system: "Kamu adalah career coach yang membantu siswa SMA Indonesia menyusun roadmap belajar personal yang konkret dan actionable. Selalu pakai Bahasa Indonesia yang ramah anak muda. Selalu panggil tool submit_learning_path dengan output JSON yang valid dan lengkap.",
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e: any) {
    console.error("[learning-path/generate] Sonnet error:", e?.message);
    return bad(`gagal generate learning path: ${e?.message || "unknown"}`, 502);
  }

  const toolUse = resp.content.find((b: any) => b.type === "tool_use" && b.name === "submit_learning_path") as any;
  if (!toolUse?.input?.phases) return bad("Sonnet tidak mengembalikan struktur phases yang valid", 502);
  const phases = toolUse.input.phases as any[];

  // Validate course ids referenced by Sonnet against catalog
  const validCourseIds = new Set(candidateCourses.map(c => c.id));
  for (const ph of phases) {
    ph.courses = (ph.courses || []).filter((c: any) => validCourseIds.has(c.id));
  }

  // ─── Persist ───
  const pathId = newId("path");
  const fullJson = { phases, model: MODEL, generated_at: new Date().toISOString() };
  await qRun(
    `INSERT INTO siswa_learning_paths
       (id, user_id, target_career_onet, ai_prompt_tokens, ai_completion_tokens, full_json)
     VALUES (?,?,?,?,?,?)`,
    [pathId, userId, user.primary_career_onet, resp.usage.input_tokens ?? null, resp.usage.output_tokens ?? null, JSON.stringify(fullJson)]
  );

  // Persist phases + pre-create siswa_course_progress with status='belum'
  for (const ph of phases) {
    const phaseId = newId("phase");
    await qRun(
      `INSERT INTO siswa_learning_phases
         (id, path_id, phase_number, title, estimated_weeks, description, skill_targets, project_suggestion, social_accounts)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [
        phaseId, pathId, ph.phase_number, ph.title, ph.estimated_weeks, ph.description,
        JSON.stringify(ph.skill_targets || []),
        JSON.stringify(ph.project_suggestion || null),
        JSON.stringify(ph.social_accounts || []),
      ]
    );
    for (const c of (ph.courses || [])) {
      // INSERT OR IGNORE — user might already have started this course in a previous path
      try {
        await qRun(
          `INSERT OR IGNORE INTO siswa_course_progress (user_id, course_id, phase_id, status) VALUES (?,?,?, 'belum')`,
          [userId, c.id, phaseId]
        );
        // If row pre-existed without phase_id, update to attach to this phase
        await qRun(
          `UPDATE siswa_course_progress SET phase_id = ? WHERE user_id = ? AND course_id = ? AND phase_id IS NULL`,
          [phaseId, userId, c.id]
        );
      } catch (e: any) {
        console.warn("[learning-path] course_progress insert warn:", e?.message);
      }
    }
  }

  await qRun(
    `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
    [newId("act"), userId, "learning_path_generated", pathId]
  );

  const newBadges = await checkAllBadges(userId).catch(e => { console.warn("[badges] error:", e?.message); return []; });

  return ok({
    id: pathId,
    reused: false,
    generated_at: new Date().toISOString(),
    target_career: { onet_soc_code: career.onet_soc_code, title: career.title },
    phases,
    new_badges: newBadges,
    tokens: { input: resp.usage.input_tokens, output: resp.usage.output_tokens },
  });
}
