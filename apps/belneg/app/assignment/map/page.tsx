import { getWebSession } from "@/lib/server-auth";
import { kodimSummary } from "@/lib/db";
import AssignmentClient from "../assignment-client";

export const dynamic = "force-dynamic";

export default async function AssignmentMapPage() {
  const [session, kodim] = await Promise.all([
    getWebSession(),
    kodimSummary(),
  ]);
  const isAdmin = session?.role === "admin";
  return <AssignmentClient kodim={kodim} isAdmin={isAdmin} />;
}
