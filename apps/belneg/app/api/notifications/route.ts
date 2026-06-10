// GET /api/notifications — aggregates actionable items from live Turso tables.
// No notifications table needed: items are derived directly from source data.
//
// Sources:
//   users                        → web accounts with status = 'pending'
//   kkri_reports                 → field reports with status = 'submitted' (last 14 days)
//   kkri_users                   → Pembina accounts pending approval
//   kkri_profile_change_requests → Pembina profile change requests pending review
//
// Uses Promise.allSettled so a broken table degrades gracefully.
import "server-only";
import { NextResponse } from "next/server";
import { qAll } from "../v1/_lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type NotifType = "user_pending" | "report_new" | "pembina_pending" | "profile_change_pending";

export type NotifItem = {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  href: string;
  created_at: string; // always a valid UTC ISO-8601 string (with Z suffix)
};

// SQLite CURRENT_TIMESTAMP stores "YYYY-MM-DD HH:MM:SS" — no timezone suffix.
// Without the "Z", JS Date() parses it as LOCAL time, not UTC, causing a 7-8h offset.
// This helper appends "Z" so the string is unambiguously treated as UTC.
function toUtcIso(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // "YYYY-MM-DD HH:MM:SS" → "YYYY-MM-DDTHH:MM:SSZ"
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(s)) return s.replace(" ", "T") + "Z";
  // Already has T separator but no zone → append Z
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(s)) return s + "Z";
  return s; // already has Z or +offset, leave untouched
}

export async function GET() {
  const [webUsersResult, reportsResult, pembinasResult, profileChangesResult] =
    await Promise.allSettled([

    // 1. Web MC accounts awaiting approval
    qAll<{ id: string; full_name: string; created_at: string }>(`
      SELECT id, full_name, created_at
      FROM users
      WHERE status = 'pending'
      ORDER BY created_at DESC
      LIMIT 30
    `),

    // 2. Field reports submitted but not yet reviewed (last 14 days)
    qAll<{
      id: string;
      jenis_kegiatan: string | null;
      sekolah_npsn: string | null;
      submitted_at: string | null;
      user_full_name: string | null;
      sekolah_nama: string | null;
    }>(`
      SELECT r.id,
             r.jenis_kegiatan,
             r.sekolah_npsn,
             r.submitted_at,
             u.full_name  AS user_full_name,
             s.nama       AS sekolah_nama
      FROM kkri_reports r
      LEFT JOIN kkri_users u ON u.id = r.user_id
      LEFT JOIN fact_satpen_dikmen s ON s.npsn = r.sekolah_npsn
      WHERE r.status = 'submitted'
        AND r.submitted_at >= date('now', '-14 days')
      ORDER BY r.submitted_at DESC
      LIMIT 30
    `),

    // 3. Pembina (mobile app) accounts awaiting approval
    qAll<{ id: string; full_name: string; created_at: string }>(`
      SELECT id, full_name, created_at
      FROM kkri_users
      WHERE is_active = 0
        AND approved_at IS NULL
        AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 30
    `),

    // 4. Pembina profile change requests pending review
    qAll<{ id: string; full_name: string; change_type: string; created_at: string }>(`
      SELECT cr.id, u.full_name, cr.change_type, cr.created_at
      FROM kkri_profile_change_requests cr
      JOIN kkri_users u ON u.id = cr.user_id
      WHERE cr.status = 'pending'
        AND u.deleted_at IS NULL
      ORDER BY cr.created_at DESC
      LIMIT 30
    `),
  ]);

  const items: NotifItem[] = [];

  // — Web MC users pending —
  if (webUsersResult.status === "fulfilled") {
    for (const u of webUsersResult.value) {
      const ts = toUtcIso(u.created_at);
      if (!ts) continue;
      items.push({
        id: `user_pending_${u.id}`,
        type: "user_pending",
        title: "Akun baru menunggu approval",
        message: `${u.full_name} mendaftar dan menunggu persetujuan admin.`,
        href: "/admin/users",
        created_at: ts,
      });
    }
  }

  // — Unreviewed field reports —
  if (reportsResult.status === "fulfilled") {
    for (const r of reportsResult.value) {
      const ts = toUtcIso(r.submitted_at);
      if (!ts) continue; // skip reports with no timestamp rather than faking "now"
      const who = r.user_full_name ?? "Pembina";
      const where = r.sekolah_nama ?? (r.sekolah_npsn ? `NPSN ${r.sekolah_npsn}` : "sekolah");
      const jenis = r.jenis_kegiatan ? ` · ${r.jenis_kegiatan}` : "";
      items.push({
        id: `report_${r.id}`,
        type: "report_new",
        title: "Laporan baru masuk",
        message: `${who}${jenis} di ${where}.`,
        href: "/admin/reports",
        created_at: ts,
      });
    }
  }

  // — Pembina pending approval —
  if (pembinasResult.status === "fulfilled") {
    for (const p of pembinasResult.value) {
      const ts = toUtcIso(p.created_at);
      if (!ts) continue;
      items.push({
        id: `pembina_pending_${p.id}`,
        type: "pembina_pending",
        title: "Pembina baru menunggu approval",
        message: `${p.full_name} mendaftar via aplikasi mobile.`,
        href: "/admin/pembina",
        created_at: ts,
      });
    }
  }

  // — Pembina profile change requests —
  if (profileChangesResult.status === "fulfilled") {
    for (const cr of profileChangesResult.value) {
      const ts = toUtcIso(cr.created_at);
      if (!ts) continue;
      const changeLabel = cr.change_type === "pangkat" ? "kenaikan pangkat"
        : cr.change_type === "sekolah" ? "pindah sekolah binaan"
        : "perubahan pangkat & sekolah";
      items.push({
        id: `profile_change_${cr.id}`,
        type: "profile_change_pending",
        title: "Pengajuan perubahan profil",
        message: `${cr.full_name} mengajukan ${changeLabel}.`,
        href: "/admin/pembina",
        created_at: ts,
      });
    }
  }

  // Sort newest first (ISO strings with Z sort correctly lexicographically)
  items.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ ok: true, count: items.length, items });
}
