// Assignment Map — spatial view of assignment points (KODIM load + politik overlay).
// This is the relocated home of the tactical map that used to live at /assignment
// (its own header already reads "Assignment Map" — see ../assignment-map.tsx).
// Reuses the existing AssignmentClient/AssignmentMap components as-is; nothing here
// duplicates or overwrites them.
import { getWebSession } from "@/lib/server-auth";
import { kodimSummary, kodimPolitik } from "@/lib/db";
import AssignmentClient from "../assignment-client";

export const dynamic = "force-dynamic";

export default async function AssignmentMapPage() {
  const [session, kodim, politik] = await Promise.all([
    getWebSession(),
    kodimSummary(),
    kodimPolitik(),
  ]);
  const isAdmin = session?.role === "admin";
  const politikMap = new Map(politik.map(p => [p.kodim_id, p]));
  const merged = kodim.map(k => {
    const p = politikMap.get(k.kodim_id);
    return { ...k, pct24_prabowo: p?.pct24_prabowo ?? null, swing_pp: p?.swing_pp ?? null };
  });
  return <AssignmentClient kodim={merged} isAdmin={isAdmin} />;
}
