import { NextRequest } from "next/server";
import { qGet, qRun, requireSiswa, newId, ok, bad } from "../../../_lib";
import { checkAllBadges } from "../../../_badges";

export const dynamic = "force-dynamic";

const STATUSES = new Set(["belum", "berproses", "selesai", "lompati"]);

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ course_id: string }> }) {
  const auth = await requireSiswa(req);
  if (!auth.ok) return auth.res;
  const userId = auth.user.sub;

  const { course_id } = await ctx.params;
  let body: any;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const status = String(body?.status ?? "");
  const notes  = body?.notes != null ? String(body.notes).slice(0, 500) : null;
  if (!STATUSES.has(status)) return bad(`status harus salah satu dari: belum, berproses, selesai, lompati`);

  // Course must exist + must be in the user's progress table (i.e. attached
  // to a learning path). Reject for orphan course rows.
  const prog = await qGet<any>(
    `SELECT user_id, course_id, status, started_at, completed_at, phase_id
     FROM siswa_course_progress WHERE user_id = ? AND course_id = ?`,
    [userId, course_id]
  );
  if (!prog) return bad("kursus tidak terdaftar di learning path-mu — generate path dulu", 404);

  const sets: string[] = ["status = ?"];
  const args: any[] = [status];
  let newActivity: string | null = null;

  if (status === "berproses" && !prog.started_at) {
    sets.push("started_at = CURRENT_TIMESTAMP");
    newActivity = "course_started";
  }
  if (status === "selesai" && !prog.completed_at) {
    sets.push("completed_at = CURRENT_TIMESTAMP");
    if (!prog.started_at) sets.push("started_at = CURRENT_TIMESTAMP");
    newActivity = "course_completed";
  }
  if (notes !== null) {
    sets.push("notes = ?");
    args.push(notes);
  }
  args.push(userId, course_id);
  await qRun(
    `UPDATE siswa_course_progress SET ${sets.join(", ")} WHERE user_id = ? AND course_id = ?`,
    args
  );

  if (newActivity) {
    await qRun(
      `INSERT INTO siswa_activity_log (id, user_id, activity_type, ref_id) VALUES (?,?,?,?)`,
      [newId("act"), userId, newActivity, course_id]
    );
  }

  const newBadges = await checkAllBadges(userId).catch(e => { console.warn("[badges] error:", e?.message); return []; });

  const updated = await qGet<any>(
    `SELECT user_id, course_id, phase_id, status, started_at, completed_at, notes
     FROM siswa_course_progress WHERE user_id = ? AND course_id = ?`,
    [userId, course_id]
  );

  return ok({ updated, new_badges: newBadges });
}
