import { NextRequest, NextResponse } from "next/server";
import { qRun, qGet } from "../../../v1/_lib";
import { getAdminFromRequest, getSessionFromRequest } from "../../../web/_lib";

export const dynamic = "force-dynamic";

// GET — fetch full report detail (text bodies) for modal lazy-load; readable by any authenticated web user
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const row = await qGet<any>(`
    SELECT materi, hasil, kendala, situasi_lapangan
    FROM kkri_reports WHERE id = ?
  `, [params.id]);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(row);
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getAdminFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const id = params.id;
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid json" }, { status: 400 }); }

  const exists = await qGet<{ id: string }>(`SELECT id FROM kkri_reports WHERE id = ?`, [id]);
  if (!exists) return NextResponse.json({ error: "not found" }, { status: 404 });

  const allowed = ["submitted", "reviewed", "approved", "rejected"];
  if (body.status && !allowed.includes(body.status)) {
    return NextResponse.json({ error: "invalid status" }, { status: 400 });
  }

  const sets: string[] = [];
  const args: any[] = [];
  if (typeof body.status === "string") {
    sets.push("status = ?", "reviewed_at = CURRENT_TIMESTAMP");
    args.push(body.status);
  }
  if (typeof body.review_notes === "string") { sets.push("review_notes = ?"); args.push(body.review_notes.slice(0, 2000)); }

  if (sets.length === 0) return NextResponse.json({ error: "no fields to update" }, { status: 400 });
  args.push(id);

  await qRun(`UPDATE kkri_reports SET ${sets.join(", ")} WHERE id = ?`, args);
  return NextResponse.json({ updated: true });
}
