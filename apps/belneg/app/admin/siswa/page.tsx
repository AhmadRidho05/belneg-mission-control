import SiswaClient from "./siswa-client";
import { getSiswaStats } from "./admin-stats";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminSiswaPage() {
  const stats = await getSiswaStats();
  return <SiswaClient stats={stats} />;
}
