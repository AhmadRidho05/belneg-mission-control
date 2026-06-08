// Temporary Web Mission Control role simulation — driven by a `?role=` query
// param so the read-only "user" UI can be reviewed before real web-account
// auth/sessions exist. NOT security: it's trivially overridable by the visitor
// and must never be used to gate data or mutating API routes — only to decide
// what the UI shows. See lib/access-control.ts for the contract real auth
// should eventually satisfy.

export type WebRole = "admin" | "user";

export const ROLE_QUERY_PARAM = "role";

// Empty/unknown query value falls back to "admin" so the existing dashboard
// stays fully visible unless someone explicitly opts into `?role=user`.
export const DEFAULT_ROLE: WebRole = "admin";

export function resolveRole(raw: string | null | undefined): WebRole {
  return raw === "user" ? "user" : DEFAULT_ROLE;
}

export function isAdmin(role: WebRole): boolean {
  return role === "admin";
}

// Manage laporan/user/pembina, approve/reject/edit/delete — all admin-only.
export function canManage(role: WebRole): boolean {
  return role === "admin";
}

// Re-appends the simulated role to a link href so it survives navigation,
// e.g. /?role=user -> /visualisasi?role=user. Leaves the href untouched when
// no `role` param is present (default admin view).
export function withRole(href: string, raw: string | null | undefined): string {
  if (!raw) return href;
  const sep = href.includes("?") ? "&" : "?";
  return `${href}${sep}${ROLE_QUERY_PARAM}=${encodeURIComponent(raw)}`;
}
