import { qAll, qGet } from "../../../api/web/_lib";
import { notFound } from "next/navigation";
import UserDetailClient from "./user-detail-client";

export const dynamic = "force-dynamic";

export default async function UserDetailPage({ params }: { params: { id: string } }) {
  const user = await qGet<any>(`
    SELECT u.id, u.email, u.phone, u.full_name, u.nrp, u.role, u.unit_id,
           u.is_active, u.deleted_at, u.created_at, u.approved_at, u.last_login_at,
           (SELECT name FROM dim_kodim WHERE kodim_id = u.unit_id) AS kodim_name,
           (SELECT name FROM dim_korem WHERE korem_id = u.unit_id) AS korem_name,
           (SELECT name FROM dim_kodam WHERE kodam_id = u.unit_id) AS kodam_name
    FROM kkri_users u WHERE u.id = ?
  `, [params.id]);
  if (!user) notFound();

  const allUnits = await qAll<any>(`
    SELECT kodim_id AS id, name, 'KODIM' AS kind FROM dim_kodim
    UNION ALL SELECT korem_id, name, 'KOREM' FROM dim_korem WHERE is_berdiri_sendiri = 0
    UNION ALL SELECT kodam_id, name, 'KODAM' FROM dim_kodam
    ORDER BY kind, name
  `);

  return <UserDetailClient initialUser={user} units={allUnits} />;
}
