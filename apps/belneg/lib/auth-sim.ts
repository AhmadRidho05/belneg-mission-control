// ─────────────────────────────────────────────────────────────────────────
// TEMPORARY AUTH SIMULATION — NOT real authentication.
//
// There is no web-account database/session system yet (see lib/access-control.ts
// for the contract real auth should eventually satisfy). This module fakes
// register → pending → admin approval → login with localStorage purely so the
// full Manage User review flow can be exercised before the real thing exists.
//
// DO NOT use this to gate data, mutating API routes, or anything security-
// sensitive — it is trivially editable from the browser console (including the
// plaintext "password" field, which a real implementation must never store this
// way). Delete this file once real auth/sessions land and replace it with the
// lib/access-control contract wired to actual sessions + a real accounts table.
// ─────────────────────────────────────────────────────────────────────────

import type { WebRole } from "./roles";

export const AUTH_STORAGE_KEY = "belneg_sim_account";
export const WEB_ACCOUNTS_STORAGE_KEY = "belneg_sim_web_accounts";

// Hardcoded admin credentials — temporary stand-in until "Manage User" is
// backed by a real web-accounts table and roles move there. These must match
// on email + NRP + password (just like self-registered accounts) and can log
// in directly; everyone else must register and wait for admin approval.
const HARDCODED_ADMINS: Array<{ email: string; nrp: string; password: string }> = [
  { email: "admin@kkri.id", nrp: "000000", password: "admin123" },
  { email: "seknaskkri@gmail.com", nrp: "111111", password: "admin123" },
];

function findHardcodedAdmin(email: string) {
  return HARDCODED_ADMINS.find((a) => a.email === email) ?? null;
}

export const JABATAN_OPTIONS = [
  "Pratu", "Praka", "Kopda", "Koptu", "Kopka",
  "Serda", "Sertu", "Serka", "Serma", "Pelda", "Peltu",
  "Letda", "Lettu", "Kapten", "Mayor", "Letkol", "Kolonel",
  "Brigjen", "Mayjen", "Letjen", "Jenderal",
] as const;

export const UNIT_JENIS_OPTIONS = ["KODAM", "KOREM", "KODIM", "KORAMIL"] as const;

export type SimAccount = {
  email: string;
  full_name: string;
  role: WebRole;
};

export type WebAccountStatus = "pending" | "approved" | "rejected";

// Shape of a self-registered Web Mission Control account, stored locally
// while waiting for admin approval. Mirrors the register form fields.
export type SimWebAccount = {
  id: string;
  full_name: string;
  contact: string;       // email or WhatsApp number, used as the login identifier
  jabatan: string;
  unit_jenis: string;    // KODAM | KOREM | KODIM | KORAMIL
  unit_nama: string;
  nrp: string;
  password: string;      // simulation only — see file header warning
  role: WebRole;         // always "user" for self-registration
  status: WebAccountStatus;
  created_at: string;    // ISO
  decided_at: string | null;
};

export type RegisterInput = {
  full_name: string;
  contact: string;
  jabatan: string;
  unit_jenis: string;
  unit_nama: string;
  nrp: string;
  password: string;
};

export type LoginInput = {
  identifier: string; // email or WhatsApp number
  nrp: string;
  password: string;
};

export type LoginResult =
  | { ok: true; account: SimAccount }
  | { ok: false; reason: "pending" | "rejected" | "not_found" | "nrp_mismatch" | "wrong_password" };

export function isHardcodedAdminEmail(email: string): boolean {
  return findHardcodedAdmin(email.trim().toLowerCase()) !== null;
}

// ─────────────────────────── Web account registry ───────────────────────────
// Self-registered accounts, persisted as a list so Manage User can review,
// approve, or reject them. Pure localStorage — no database writes.

export function listSimAccounts(): SimWebAccount[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(WEB_ACCOUNTS_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SimWebAccount[]) : [];
  } catch {
    return [];
  }
}

function persistAccounts(accounts: SimWebAccount[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(WEB_ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

export function findSimAccountByContact(contact: string): SimWebAccount | null {
  const normalized = contact.trim().toLowerCase();
  return listSimAccounts().find((a) => a.contact === normalized) ?? null;
}

export function countPendingSimAccounts(): number {
  return listSimAccounts().filter((a) => a.status === "pending").length;
}

// Register: always created as `pending` / role `user`. Does NOT log the
// visitor in — they must wait for admin approval in Manage User before they
// can sign in (see simulateLogin).
export function registerSimAccount(input: RegisterInput): SimWebAccount {
  const account: SimWebAccount = {
    id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    full_name: input.full_name.trim(),
    contact: input.contact.trim().toLowerCase(),
    jabatan: input.jabatan,
    unit_jenis: input.unit_jenis,
    unit_nama: input.unit_nama.trim(),
    nrp: input.nrp.trim(),
    password: input.password,
    role: "user",
    status: "pending",
    created_at: new Date().toISOString(),
    decided_at: null,
  };
  persistAccounts([account, ...listSimAccounts()]);
  return account;
}

// Manage User approve/reject — updates the account's status + decision time.
export function setSimAccountStatus(id: string, status: WebAccountStatus): SimWebAccount[] {
  const accounts = listSimAccounts().map((a) =>
    a.id === id ? { ...a, status, decided_at: new Date().toISOString() } : a
  );
  persistAccounts(accounts);
  return accounts;
}

// ─────────────────────────── Session (current login) ───────────────────────────

// Login: now requires identifier (email/WhatsApp) + NRP + password to match —
// hardcoded admin credentials sign in directly as `admin`, and self-registered
// accounts must match all three fields AND be `approved`. Wrong NRP / wrong
// password / pending / rejected / unknown identifiers are all turned away with
// a distinct reason so the UI can explain exactly why.
export function simulateLogin(input: LoginInput): LoginResult {
  const normalized = input.identifier.trim().toLowerCase();
  const nrp = input.nrp.trim();

  const hardcodedAdmin = findHardcodedAdmin(normalized);
  if (hardcodedAdmin) {
    if (hardcodedAdmin.nrp !== nrp) return { ok: false, reason: "nrp_mismatch" };
    if (hardcodedAdmin.password !== input.password) return { ok: false, reason: "wrong_password" };
    const account: SimAccount = { email: normalized, full_name: normalized.split("@")[0], role: "admin" };
    persistAccount(account);
    return { ok: true, account };
  }

  const registered = findSimAccountByContact(normalized);
  if (!registered) return { ok: false, reason: "not_found" };
  if (registered.nrp !== nrp) return { ok: false, reason: "nrp_mismatch" };
  if (registered.password !== input.password) return { ok: false, reason: "wrong_password" };
  if (registered.status === "pending") return { ok: false, reason: "pending" };
  if (registered.status === "rejected") return { ok: false, reason: "rejected" };

  const account: SimAccount = { email: registered.contact, full_name: registered.full_name, role: "user" };
  persistAccount(account);
  return { ok: true, account };
}

function persistAccount(account: SimAccount) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(account));
}

export function getSimAccount(): SimAccount | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(AUTH_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SimAccount) : null;
  } catch {
    return null;
  }
}

export function clearSimAccount() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
}

// Logout: clears the simulated session. Callers should send the visitor back
// to the landing page ("/") with no `?role=` param — logging out must not
// leave the simulated role behind in the URL.
export function simulateLogout() {
  clearSimAccount();
}

// Where to send the user after a (simulated) successful login — the
// dashboard, with the role carried as a query param so the existing `?role=`
// simulation in lib/roles.ts drives the sidebar/menus.
export function dashboardPathFor(role: WebRole): string {
  return `/dashboard?role=${role}`;
}
