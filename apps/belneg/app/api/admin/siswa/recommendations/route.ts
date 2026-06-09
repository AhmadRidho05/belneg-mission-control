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

  // Build a compact snapshot for the prompt (don't dump giant arrays)
  const snapshot = {
    total_users: stats.hero.total_users,
    new_30d:     stats.hero.new_users_30d,
    dau: stats.hero.dau, wau: stats.hero.wau, mau: stats.hero.mau,
    assessments_done: stats.hero.assessments_done,
    paths_generated:  stats.hero.paths_generated,
    courses_started:  stats.hero.courses_started,
    courses_completed: stats.hero.courses_completed,
    funnel: stats.funnel,
    avg_per_dim: stats.riasec.avg_per_dim,
    top_codes: stats.riasec.top_codes.slice(0, 5),
    top_careers: stats.career.top_primary.slice(0, 10).map(c => `${c.title} (${c.n})`),
    top_provinces_by_users: stats.geographic.by_provinsi.slice(0, 5),
    focus,
  };

  const prompt = `
Snapshot stats engagement siswa KKRI Pencari Arah (mobile app pencarian arah karier):

${JSON.stringify(snapshot, null, 2)}

Berdasarkan data ini, sarankan 3 aksi konkret yang bisa diambil admin atau product manager **minggu ini** untuk memperbaiki outcomes (engagement, retention, atau career match — sesuaikan dengan kondisi data).

Aturan ketat:
  - Setiap rekomendasi HARUS referensi angka spesifik dari snapshot (mis. "drop-off 65% dari sign-up ke asesmen").
  - action_steps HARUS bisa dieksekusi (mis. "kirim push notif ke 234 siswa yg belum self-assess", bukan "tingkatkan engagement").
  - Bahasa Indonesia profesional, ramah, dan ringkas.
  - Jangan mengarang fitur yang belum disebutkan; gunakan yang sudah ada (push notif, email, in-app banner, leaderboard, content reminder, badge baru, dsb).

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
