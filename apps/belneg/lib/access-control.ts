// Web Mission Control role-guard CONTRACT — structure only, NOT enforced yet.
//
// The web dashboard currently has no login/session mechanism (no middleware,
// no /login page, no cookie/JWT check on page routes — see app/api/v1/* for
// the *mobile* OTP auth, which is a separate system). Nothing here is wired
// into routing or rendering; it exists so that once real web-account auth
// lands, route/action guards can be built against a stable contract instead
// of being designed from scratch.
//
// Do NOT use this to gate UI yet — there is no way to know the current
// user's role, so doing so would just hide things behind a role that's
// always null, which is worse than not guarding at all.
//
// Web Mission Control roles are intentionally separate from "Pembina APK"
// roles (KODAM/KOREM/KODIM/KORAMIL/ADMIN, stored in kkri_users.role — see
// app/admin/pembina). A Pembina's role describes their military command
// level for field reporting; a web account's role describes their dashboard
// permission level. The two must never be conflated.

export type WebRole = "admin" | "user";

// Shape a future "web accounts" table/record would need to satisfy.
// Not backed by any table yet — see app/admin/users (Manage User) placeholder.
export type WebAccount = {
  id: string;
  full_name: string;
  email: string | null;
  role: WebRole;
  is_active: number;
  created_at: string;
};

// Routes under these prefixes are admin-only. Everything else is readable by
// both `admin` and `user`.
const ADMIN_ONLY_PREFIXES = ["/admin"] as const;

export function isAdminOnlyRoute(pathname: string): boolean {
  return ADMIN_ONLY_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

// `role: null` represents "not authenticated yet" — once login exists, that
// case should redirect to a login page rather than fall through to read-only.
export function canAccessRoute(role: WebRole | null, pathname: string): boolean {
  if (role === "admin") return true;
  return !isAdminOnlyRoute(pathname);
}

// Manage laporan/user/pembina, approve/reject/edit/delete — all admin-only actions.
export function canManage(role: WebRole | null): boolean {
  return role === "admin";
}
