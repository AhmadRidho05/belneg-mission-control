// Notifications feed for the dashboard's TopActions bell.
//
// TODO(integration): the real source for these notifications is the mobile
// APK / LMS backend (laporan masuk, approval pembina, aktivitas siswa, dst).
// That API does not exist yet, so this route currently serves an in-memory
// placeholder store — it returns an EMPTY list by default and is wired up
// purely so the dashboard contract (shape + endpoints) is ready to swap to
// the real integration later without touching the UI.
//
// `POST` exists only so this contract can be exercised manually while the
// real integration is pending — e.g.
//   curl -X POST http://localhost:3000/api/notifications \
//     -H "Content-Type: application/json" \
//     -d '{"title":"Laporan baru","body":"KODIM 0501/BS mengirim laporan mingguan","category":"report"}'
//
// Do NOT treat the seeded/posted items here as real data — there is no
// database table backing this yet (intentionally; see TODO above).

import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export type NotificationCategory = "report" | "approval" | "siswa" | "system";
export type NotificationSeverity = "info" | "warning" | "critical";

export type NotificationItem = {
  id: string;
  title: string;
  body: string;
  category: NotificationCategory;
  severity: NotificationSeverity;
  createdAt: string; // ISO 8601
  readAt: string | null;
};

const CATEGORIES: NotificationCategory[] = ["report", "approval", "siswa", "system"];
const SEVERITIES: NotificationSeverity[] = ["info", "warning", "critical"];

// In-memory placeholder store (resets on server restart / per-instance in
// serverless). Intentionally NOT persisted to Turso — see TODO at top of file.
const store: NotificationItem[] = [];

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

export async function GET() {
  const sorted = [...store].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return NextResponse.json({
    notifications: sorted,
    unreadCount: sorted.filter(n => !n.readAt).length,
    source: "placeholder", // becomes "apk-lms" once the real integration lands
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Body harus berupa JSON" }, { status: 400 });
  }

  if (!isNonEmptyString(body?.title) || !isNonEmptyString(body?.body)) {
    return NextResponse.json({ error: "Field 'title' dan 'body' wajib diisi" }, { status: 400 });
  }

  const category: NotificationCategory = CATEGORIES.includes(body?.category) ? body.category : "system";
  const severity: NotificationSeverity = SEVERITIES.includes(body?.severity) ? body.severity : "info";

  const item: NotificationItem = {
    id: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: body.title.trim(),
    body: body.body.trim(),
    category,
    severity,
    createdAt: new Date().toISOString(),
    readAt: null,
  };

  store.unshift(item);
  // Cap the placeholder store so manual testing can't grow it unbounded.
  if (store.length > 50) store.length = 50;

  return NextResponse.json({ notification: item }, { status: 201 });
}

// Convenience for manual testing — clears the placeholder store
// (e.g. `curl -X DELETE http://localhost:3000/api/notifications`).
export async function DELETE() {
  store.length = 0;
  return NextResponse.json({ cleared: true });
}
