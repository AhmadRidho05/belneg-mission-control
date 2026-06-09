import { qAll } from "../../api/web/_lib";
import UsersClient from "./users-client";

export const dynamic = "force-dynamic";

export type WebUser = {
  id: string;
  full_name: string;
  email_or_phone: string;
  nrp: string | null;
  jabatan: string | null;
  unit_type: string | null;
  unit_name: string | null;
  role: string;
  status: string;
  is_active: number;
  created_at: string;
  updated_at: string | null;
};

export default async function AdminUsersPage() {
  let users: WebUser[] = [];
  let fetchError: string | null = null;

  try {
    users = await qAll<WebUser>(`
      SELECT id, full_name, email_or_phone, nrp, jabatan, unit_type, unit_name,
             role, status, is_active, created_at, updated_at
      FROM users
      ORDER BY
        CASE status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END,
        created_at DESC
    `);
  } catch (err) {
    fetchError =
      err instanceof Error ? err.message : "Gagal memuat data user dari database.";
  }

  return <UsersClient users={users} error={fetchError} />;
}
