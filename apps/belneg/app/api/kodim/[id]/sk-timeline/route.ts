import { skTimelineByKodim } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const id = params.id.trim();
  if (!/^KODIM-\d+$/i.test(id)) return NextResponse.json({ error: "invalid kodim id" }, { status: 400 });
  const data = await skTimelineByKodim(id);
  return NextResponse.json({ data });
}
