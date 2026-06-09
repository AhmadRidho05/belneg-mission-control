import { NextRequest, NextResponse } from "next/server";
import { qAll } from "../../../../v1/_lib";
import { getSessionFromRequest } from "../../../../web/_lib";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!await getSessionFromRequest(req)) return NextResponse.json({ error: "Akses ditolak." }, { status: 403 });
  const rows = await qAll<{ id: string; url: string; caption: string | null }>(
    `SELECT id, url, caption FROM kkri_report_photos WHERE report_id = ? ORDER BY uploaded_at`,
    [params.id]
  );
  return NextResponse.json({ photos: rows });
}
