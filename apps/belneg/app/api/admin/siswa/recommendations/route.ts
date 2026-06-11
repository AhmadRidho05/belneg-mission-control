// AI Recommendations endpoint — feeds the current /admin/siswa snapshot
// into Claude Sonnet 4.6 and returns 3 actionable items. In-memory 24h cache
// per ?focus value so repeated page loads don't burn API budget.
import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { ok, bad } from "../../../v1/_lib";
import { getAdminFromRequest } from "../../../web/_lib";
import { getSiswaStats } from "../../../../admin/siswa/admin-stats";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = "claude-sonnet-4-6";
const CACHE_TTL_MS = 24 * 3600 * 1000;

type CacheEntry = { generated_at: string; data: any };
const cache = new Map<string, { ts: number; entry: CacheEntry }>();

const tool: Anthropic.Tool = {
  name: "submit_recommendations",
  description: "Submit 3 actionable, data-driven recommendations for the admin.",
  input_schema: {
    type: "object",
    properties: {
      recommendations: {
        type: "array",
        minItems: 3, maxItems: 3,
        items: {
          type: "object",
          properties: {
            title:        { type: "string", description: "Judul singkat (max 80 karakter), dalam Bahasa Indonesia." },
            rationale:    { type: "string", description: "2–3 kalimat penjelasan berbasis angka dari snapshot." },
            action_steps: {
              type: "array",
              minItems: 2, maxItems: 5,
              items: { type: "string", description: "Langkah konkret yang bisa dieksekusi admin/PM minggu ini." },
            },
          },
          required: ["title", "rationale", "action_steps"],
        },
      },
    },
    required: ["recommendations"],
  },
};

export async function POST(req: NextRequest) {
  if (!await getAdminFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const focus = (req.nextUrl.searchParams.get("focus") || "general").trim();
  const force = req.nextUrl.searchParams.get("force") === "true";

  // Cache check
  if (!force) {
    const c = cache.get(focus);
    if (c && (Date.now() - c.ts) < CACHE_TTL_MS) {
      return ok({ ...c.entry.data, cached: true });
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) return bad("ANTHROPIC_API_KEY belum dikonfigurasi", 503);

  let stats;
  try {
    stats = await getSiswaStats();
  } catch (e: any) {
    return bad(`gagal load stats: ${e?.message || "unknown"}`, 500);
  }

  // Build a compact LMS snapshot for the prompt
  const snapshot = {
    total_users:        stats.hero.total_users,
    total_enrollments:  stats.hero.total_enrollments,
    total_completed:    stats.hero.total_completed,
    completion_rate:    `${stats.hero.completion_rate}%`,
    active_programs:    stats.hero.active_programs,
    total_courses:      stats.hero.total_courses,
    total_certificates: stats.hero.total_certificates,
    programs: stats.programs.map(p => ({
      name:       p.name,
      n_pending:  p.n_pending,
      n_accepted: p.n_accepted,
      n_rejected: p.n_rejected,
      max:        p.maxParticipants,
    })),
    top_courses: stats.enrollment_by_course.slice(0, 8).map(c =>
      `${c.title} — enrolled:${c.n_enrolled}, completed:${c.n_completed}, rate:${c.completion_rate}%`
    ),
    organizations: stats.organizations.map(o =>
      `${o.name} (${o.n_courses} kursus, ${o.n_programs} program)`
    ),
    focus,
  };

  const prompt = `
Snapshot dashboard LMS KKRI:

${JSON.stringify(snapshot, null, 2)}

Berdasarkan data ini, sarankan 3 aksi konkret yang bisa diambil admin atau product manager **minggu ini** untuk meningkatkan enrollment, completion rate, atau efektivitas program LMS KKRI.

Aturan ketat:
  - Setiap rekomendasi HARUS referensi angka spesifik dari snapshot (mis. "completion rate hanya 20% di kursus X", "5 pendaftar masih PENDING di program Y").
  - action_steps HARUS bisa dieksekusi (mis. "follow-up 5 pendaftar PENDING program Y via WhatsApp", bukan "tingkatkan engagement").
  - Bahasa Indonesia profesional, ramah, dan ringkas.
  - Fokus pada program dengan pending tinggi, kursus dengan completion rendah, dan peluang enrollment baru.

Panggil tool submit_recommendations.
`.trim();

  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  let resp;
  try {
    resp = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 2048,
      tools: [tool],
      tool_choice: { type: "tool", name: "submit_recommendations" },
      system: "Kamu adalah Senior Product Operations Manager untuk platform edutech Indonesia. Output JSON via tool. Data-driven, ringkas, actionable.",
      messages: [{ role: "user", content: prompt }],
    });
  } catch (e: any) {
    return bad(`gagal generate recommendations: ${e?.message || "unknown"}`, 502);
  }

  const toolUse = resp.content.find((b: any) => b.type === "tool_use" && b.name === "submit_recommendations") as any;
  if (!toolUse?.input?.recommendations) return bad("Sonnet tidak mengembalikan struktur recommendations", 502);

  const payload = {
    recommendations: toolUse.input.recommendations,
    generated_at: new Date().toISOString(),
    tokens: { input: resp.usage.input_tokens, output: resp.usage.output_tokens },
    focus,
  };

  cache.set(focus, { ts: Date.now(), entry: { generated_at: payload.generated_at, data: payload } });

  return ok({ ...payload, cached: false });
}
