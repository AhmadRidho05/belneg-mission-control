// GET /api/notifications — aggregates actionable items from live Turso tables.
// No notifications table needed: items are derived directly from source data.
//
// Sources:
//   users        → web accounts with status = 'pending'
//   kkri_reports → field reports with status = 'submitted' (unreviewed, last 14 days)
//   kkri_users   → Pembina accounts with is_active = 0 AND approved_at IS NULL
//
// Uses Promise.allSettled so a missing/broken table degrades gracefully
// (returns empty for that source) instead of crashing the whole endpoint.
import "server-only";
import { NextResponse } from "next/server";
import { qAll } from "../v1/_lib";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export type NotifType = "user_pending" | "report_new" | "pembina_pending";

export type NotifItem = {
  id: string;
  type: NotifType;
  title: string;
  message: string;
  href: string;
  created_at: string;
};

export async function GET() {
  const [webUsersResult, reportsResult, pembinasResult] = await Promise.allSettled([
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
  ]);

  const items: NotifItem[] = [];

  // — Web MC users pending —
  if (webUsersResult.status === "fulfilled") {
    for (const u of webUsersResult.value) {
      items.push({
        id: `user_pending_${u.id}`,
        type: "user_pending",
        title: "Akun baru menunggu approval",
        message: `${u.full_name} mendaftar dan menunggu persetujuan admin.`,
        href: "/admin/users",
        created_at: u.created_at,
      });
    }
  }

  // — Unreviewed field reports —
  if (reportsResult.status === "fulfilled") {
    for (const r of reportsResult.value) {
      const who = r.user_full_name ?? "Pembina";
      const where = r.sekolah_nama ?? (r.sekolah_npsn ? `NPSN ${r.sekolah_npsn}` : "sekolah");
      const jenis = r.jenis_kegiatan ? ` · ${r.jenis_kegiatan}` : "";
      items.push({
        id: `report_${r.id}`,
        type: "report_new",
        title: "Laporan baru masuk",
        message: `${who}${jenis} di ${where}.`,
        href: "/admin/reports",
        created_at: r.submitted_at ?? new Date().toISOString(),
      });
    }
  }

  // — Pembina pending approval —
  if (pembinasResult.status === "fulfilled") {
    for (const p of pembinasResult.value) {
      items.push({
        id: `pembina_pending_${p.id}`,
        type: "pembina_pending",
        title: "Pembina baru menunggu approval",
        message: `${p.full_name} mendaftar via aplikasi mobile.`,
        href: "/admin/pembina",
        created_at: p.created_at,
      });
    }
  }

  // Newest first
  items.sort((a, b) => b.created_at.localeCompare(a.created_at));

  return NextResponse.json({ ok: true, count: items.length, items });
}
