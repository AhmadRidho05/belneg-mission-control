import { NextRequest, NextResponse } from "next/server";
import { createClient, type Client, type InValue } from "@libsql/client";
import * as XLSX from "xlsx";

let _client: Client | null = null;
function client(): Client {
  if (_client) return _client;
  _client = createClient({
    url: process.env.TURSO_DATABASE_URL!,
    authToken: process.env.TURSO_AUTH_TOKEN,
  });
  return _client;
}

export const dynamic = "force-dynamic";

const ALLOWED_BENTUK = new Set(["SMA", "SMK", "MA", "MAK"]);
const ALLOWED_STATUS = new Set(["NEGERI", "SWASTA"]);
const ALLOWED_AKR = new Set(["A", "B", "C", "BT", "TT"]);
const EXPORT_MAX = 50_000; // hard cap to keep memory predictable

function splitList(s: string | null): string[] {
  if (!s) return [];
  return s.split(",").map(x => x.trim()).filter(Boolean);
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;

  // Multi-select (preferred)
  const kodamIds = splitList(sp.get("kodam_ids"));
  const kodimIds = splitList(sp.get("kodim_ids"));
  const statuses = splitList(sp.get("statuses")).filter(s => ALLOWED_STATUS.has(s));
  const bentuks  = splitList(sp.get("bentuks")).filter(s => ALLOWED_BENTUK.has(s));

  // Single-select (legacy / single-value entries from other charts)
  const kodamId = sp.get("kodam_id");
  const kodimId = sp.get("kodim_id");
  const kab = sp.get("kab");
  const provinsi = sp.get("provinsi");
  const bentuk = sp.get("bentuk");
  const status = sp.get("status");
  const akr = sp.get("akr");
  const npyp = sp.get("npyp");

  // Output controls
  const format = (sp.get("format") || "json").toLowerCase(); // json | csv | xlsx
  const limit = Math.min(parseInt(sp.get("limit") || "200", 10), 1000);
  const offset = Math.max(parseInt(sp.get("offset") || "0", 10), 0);

  const where: string[] = [];
  const params: InValue[] = [];

  // KODAM filter (multi takes precedence over single)
  const allKodamIds = kodamIds.length ? kodamIds : (kodamId ? [kodamId] : []);
  if (allKodamIds.length) {
    const ph = allKodamIds.map(() => "?").join(",");
    where.push(`s.kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE kodam_id IN (${ph}))`);
    params.push(...allKodamIds);
  }
  const allKodimIds = kodimIds.length ? kodimIds : (kodimId ? [kodimId] : []);
  if (allKodimIds.length) {
    const ph = allKodimIds.map(() => "?").join(",");
    where.push(`s.kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE kodim_id IN (${ph}))`);
    params.push(...allKodimIds);
  }

  if (kab) {
    where.push("(s.kab_kota = ? OR s.kab_norm = ?)");
    params.push(kab, kab.toUpperCase());
  }
  if (provinsi) {
    where.push("s.provinsi = ?");
    params.push(provinsi);
  }

  // Multi-status (e.g., NEGERI+SWASTA), else single status
  const allStatuses = statuses.length ? statuses : (status && ALLOWED_STATUS.has(status) ? [status] : []);
  if (allStatuses.length) {
    const ph = allStatuses.map(() => "?").join(",");
    where.push(`UPPER(s.status_sekolah) IN (${ph})`);
    params.push(...allStatuses);
  }

  const allBentuks = bentuks.length ? bentuks : (bentuk && ALLOWED_BENTUK.has(bentuk) ? [bentuk] : []);
  if (allBentuks.length) {
    const ph = allBentuks.map(() => "?").join(",");
    where.push(`s.bentuk_pendidikan IN (${ph})`);
    params.push(...allBentuks);
  }

  if (npyp) {
    where.push("s.npyp = ?");
    params.push(npyp);
  }
  if (akr && ALLOWED_AKR.has(akr)) {
    if (akr === "BT") {
      where.push("(s.akreditasi IS NULL OR s.akreditasi = '')");
    } else if (akr === "TT") {
      where.push("s.akreditasi LIKE '%TIDAK%'");
    } else {
      where.push("s.akreditasi = ?");
      params.push(akr);
    }
  }

  const whereSql = where.length ? "WHERE " + where.join(" AND ") : "";
  const c = client();

  // For exports, ignore pagination and pull a wider column set
  const isExport = format === "csv" || format === "xlsx";

  if (isExport) {
    const fullRes = await c.execute({
      sql: `
        SELECT
          s.npsn, s.nama, s.bentuk_pendidikan AS bentuk, UPPER(s.status_sekolah) AS status,
          COALESCE(s.akreditasi, 'BT') AS akreditasi,
          s.alamat, s.desa_kelurahan, s.kecamatan, s.kab_kota,
          REPLACE(s.provinsi, 'PROV. ', '') AS provinsi,
          s.naungan, s.npyp,
          s.akses_internet, s.sumber_listrik,
          s.luas_tanah, s.lintang, s.bujur,
          s.tgl_sk_pendirian, s.tgl_sk_operasional,
          s.telepon, s.email, s.website,
          (SELECT name FROM dim_kodim WHERE kabupaten_norm = s.kab_norm LIMIT 1) AS kodim,
          (SELECT kd.name FROM dim_kodim k JOIN dim_kodam kd ON kd.kodam_id = k.kodam_id
             WHERE k.kabupaten_norm = s.kab_norm LIMIT 1) AS kodam
        FROM fact_satpen_dikmen s
        ${whereSql}
        ORDER BY s.provinsi, s.kab_kota, s.nama
        LIMIT ?
      `,
      args: [...params, EXPORT_MAX],
    });

    const rows = fullRes.rows.map(r => {
      const o: any = {};
      for (const col of fullRes.columns) o[col] = (r as any)[col];
      return o;
    });

    const ts = new Date().toISOString().slice(0, 16).replace(/[T:]/g, "-");
    const filename = `belneg-sekolah-${ts}`;

    if (format === "csv") {
      const csv = toCsv(rows, fullRes.columns);
      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition": `attachment; filename="${filename}.csv"`,
          "Cache-Control": "no-store",
        },
      });
    }

    // xlsx
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Sekolah");
    const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
    return new Response(buf, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}.xlsx"`,
        "Cache-Control": "no-store",
      },
    });
  }

  // Default JSON list response
  const countRes = await c.execute({
    sql: `SELECT COUNT(*) AS n FROM fact_satpen_dikmen s ${whereSql}`,
    args: params,
  });
  const total = Number((countRes.rows[0] as any).n);

  const rowsRes = await c.execute({
    sql: `
      SELECT
        s.npsn, s.nama, s.bentuk_pendidikan AS bentuk, UPPER(s.status_sekolah) AS status,
        COALESCE(s.akreditasi, 'BT') AS akr,
        s.kab_kota, s.kecamatan, REPLACE(s.provinsi, 'PROV. ', '') AS provinsi,
        s.akses_internet, s.sumber_listrik,
        s.lintang, s.bujur
      FROM fact_satpen_dikmen s
      ${whereSql}
      ORDER BY s.provinsi, s.kab_kota, s.nama
      LIMIT ? OFFSET ?
    `,
    args: [...params, limit, offset],
  });

  const rows = rowsRes.rows.map(r => {
    const o: any = {};
    for (const col of rowsRes.columns) o[col] = (r as any)[col];
    return o;
  });

  return NextResponse.json({
    total,
    limit, offset,
    rows,
    filter: {
      kodamId, kodimId, kab, provinsi, bentuk, status, akr, npyp,
      kodamIds: allKodamIds, kodimIds: allKodimIds,
      statuses: allStatuses, bentuks: allBentuks,
    },
  });
}

function csvEscape(v: any): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
function toCsv(rows: any[], cols: string[]): string {
  const head = cols.map(csvEscape).join(",");
  const body = rows.map(r => cols.map(c => csvEscape(r[c])).join(",")).join("\n");
  return "﻿" + head + "\n" + body; // BOM for Excel UTF-8 auto-detect
}
