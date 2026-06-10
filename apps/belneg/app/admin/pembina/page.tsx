import { qAll } from "../../api/web/_lib";
import UsersClient from "./users-client";
import { getAdminStats } from "./admin-stats";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage() {
  const [rows, allUnits, stats] = await Promise.all([
    qAll<any>(`
      SELECT u.id, u.email, u.phone, u.full_name, u.nrp, u.role, u.unit_id, u.is_active,
             u.created_at, u.approved_at, u.last_login_at,
             (SELECT name FROM dim_kodim WHERE kodim_id = u.unit_id) AS kodim_name,
             (SELECT name FROM dim_korem WHERE korem_id = u.unit_id) AS korem_name,
             (SELECT name FROM dim_kodam WHERE kodam_id = u.unit_id) AS kodam_name,
             (SELECT COUNT(*) FROM kkri_reports r WHERE r.user_id = u.id) AS n_reports
      FROM kkri_users u
      WHERE u.deleted_at IS NULL
      ORDER BY u.is_active, u.created_at DESC
    `),
    qAll<any>(`
      SELECT kodim_id AS id, name, 'KODIM' AS kind FROM dim_kodim
      UNION ALL SELECT korem_id, name, 'KOREM' FROM dim_korem WHERE is_berdiri_sendiri = 0
      UNION ALL SELECT kodam_id, name, 'KODAM' FROM dim_kodam
      ORDER BY kind, name
    `),
    getAdminStats(),
  ]);
  return <UsersClient users={rows} units={allUnits} stats={stats} />;
}
