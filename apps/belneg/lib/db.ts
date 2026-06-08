import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { unstable_cache } from "next/cache";
import { cache } from "react";

let _client: Client | null = null;
function client(): Client {
  if (_client) return _client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL env var is required");
  _client = createClient({ url, authToken });
  return _client;
}

// libsql -> better-sqlite3 compat helpers. Rows are converted to plain objects
// (using r.columns mapping) because the libsql Row class isn't a plain object
// and triggers Next.js "Only plain objects can be passed to Client Components" warnings.
async function qAll<T>(sql: string, ...args: InValue[]): Promise<T[]> {
  const r = await client().execute({ sql, args });
  return r.rows.map(row => {
    const obj: any = {};
    for (const col of r.columns) obj[col] = (row as any)[col];
    return obj;
  }) as T[];
}
async function qGet<T>(sql: string, ...args: InValue[]): Promise<T | undefined> {
  const rows = await qAll<T>(sql, ...args);
  return rows[0];
}

// ───────────────────────── Headline KPIs ─────────────────────────

export const headlineKpi = unstable_cache(
  async () => {
    return (await qGet<Record<string, number>>(`
      SELECT
        (SELECT COUNT(*) FROM fact_satpen_dikmen) AS total_sekolah,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE UPPER(status_sekolah)='NEGERI') AS total_negeri,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE UPPER(status_sekolah)='SWASTA') AS total_swasta,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE bentuk_pendidikan='SMA') AS total_sma,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE bentuk_pendidikan='SMK') AS total_smk,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE bentuk_pendidikan IN ('MA','MAK','SMAK','SMTK','SMAG.K')) AS total_ma,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE akreditasi='A') AS akr_a,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE akreditasi='B') AS akr_b,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE akreditasi='C') AS akr_c,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE lintang IS NOT NULL AND bujur IS NOT NULL) AS with_coords,
        (SELECT COUNT(*) FROM fact_yayasan) AS total_yayasan,
        (SELECT COUNT(*) FROM fact_yayasan_naungan) AS total_naungan,
        (SELECT COUNT(*) FROM dim_kodam) AS n_kodam,
        (SELECT COUNT(*) FROM dim_korem WHERE is_berdiri_sendiri=0) AS n_korem,
        (SELECT COUNT(*) FROM dim_kodim) AS n_kodim,
        (SELECT COUNT(*) FROM fact_satpen_dikmen WHERE kab_norm IN (SELECT kabupaten_norm FROM dim_kodim)) AS sekolah_dgn_kodim,
        (SELECT COUNT(DISTINCT province_kd) FROM fact_satpen_dikmen) AS n_provinsi
    `))!;
  },
  ["headline-kpi-v3"],
  { revalidate: 3600 }
);

// ───────────────────────── Kodam summary ─────────────────────────

export type KodamRow = {
  kodam_id: string; kodam_name: string;
  n_korem: number; n_kodim: number;
  n_sekolah: number; n_akreditasi_a: number;
  n_negeri: number; n_swasta: number;
  ratio_sekolah_per_kodim: number;
  pct_akreditasi_a: number;
};

export const kodamSummary = unstable_cache(
  async (): Promise<KodamRow[]> => {
    const rows = await qAll<Omit<KodamRow, "ratio_sekolah_per_kodim" | "pct_akreditasi_a">>(`
      SELECT kodam_id, kodam_name, n_korem, n_kodim, n_sekolah, n_akreditasi_a, n_negeri, n_swasta
      FROM vw_kodam_school_summary
      ORDER BY n_sekolah DESC
    `);
    return rows.map(r => ({
      ...r,
      ratio_sekolah_per_kodim: r.n_kodim > 0 ? r.n_sekolah / r.n_kodim : 0,
      pct_akreditasi_a: r.n_sekolah > 0 ? (r.n_akreditasi_a / r.n_sekolah) * 100 : 0,
    }));
  },
  ["kodam-summary-v4"],
  { revalidate: 3600 }
);

// ───────────────────────── Kodim summary ─────────────────────────

export type KodimRow = {
  kodim_id: string;
  kodim_name: string;
  kabupaten_kota: string | null;
  kabupaten_norm: string | null;
  kodam_id: string;
  kodam_name: string;
  korem_id: string | null;
  korem_name: string | null;
  lat: number | null;
  lng: number | null;
  n_sekolah: number;
  n_akreditasi_a: number;
  n_negeri: number;
  n_swasta: number;
};

export const kodimSummary = unstable_cache(
  async (): Promise<KodimRow[]> => {
    return qAll<KodimRow>(`
      SELECT
        k.kodim_id, k.name AS kodim_name, k.kabupaten_kota, k.kabupaten_norm,
        kd.kodam_id, kd.name AS kodam_name,
        kr.korem_id, kr.name AS korem_name,
        k.lat, k.lng,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = k.kabupaten_norm) AS n_sekolah,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = k.kabupaten_norm AND s.akreditasi='A') AS n_akreditasi_a,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = k.kabupaten_norm AND UPPER(s.status_sekolah)='NEGERI') AS n_negeri,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = k.kabupaten_norm AND UPPER(s.status_sekolah)='SWASTA') AS n_swasta
      FROM dim_kodim k
      JOIN dim_kodam kd ON kd.kodam_id = k.kodam_id
      LEFT JOIN dim_korem kr ON kr.korem_id = k.korem_id
      ORDER BY n_sekolah DESC
    `);
  },
  ["kodim-summary-v3"],
  { revalidate: 3600 }
);

// ───────────────────────── Sankey hierarchy ─────────────────────────

export const sankeyKodamHierarchy = unstable_cache(
  async (topN: number = 5) => {
    const topKodam = await qAll<{ kodam_id: string; kodam_name: string; n_sekolah: number }>(`
      SELECT kodam_id, kodam_name, n_sekolah FROM vw_kodam_school_summary
      ORDER BY n_sekolah DESC LIMIT ?
    `, topN);
    const kodamIds = topKodam.map(k => k.kodam_id);
    if (!kodamIds.length) return { nodes: [], links: [] };

    const placeholders = kodamIds.map(() => "?").join(",");
    const koremRows = await qAll<{ korem_id: string; korem_name: string; kodam_id: string; n_sekolah: number }>(`
      SELECT
        kr.korem_id, kr.name AS korem_name, kr.kodam_id,
        (SELECT COUNT(*) FROM vw_satpen_with_kodim s WHERE s.korem_id = kr.korem_id) AS n_sekolah
      FROM dim_korem kr
      WHERE kr.kodam_id IN (${placeholders}) AND kr.is_berdiri_sendiri = 0
    `, ...kodamIds);

    const nodes: { id: string; label: string }[] = [];
    const seen = new Set<string>();
    const addNode = (id: string, label: string) => {
      if (!seen.has(id)) { seen.add(id); nodes.push({ id, label }); }
    };
    topKodam.forEach(k => addNode(`KD-${k.kodam_id}`, k.kodam_name));
    koremRows.forEach(k => addNode(`KR-${k.korem_id}`, k.korem_name));

    const links: { source: string; target: string; value: number }[] = [];
    koremRows.filter(k => k.n_sekolah > 0).forEach(k => {
      links.push({ source: `KD-${k.kodam_id}`, target: `KR-${k.korem_id}`, value: k.n_sekolah });
    });
    // Berdiri Sendiri rollup per kodam
    const bsResults = await Promise.all(
      topKodam.map(k => qGet<{ n: number }>(`
        SELECT COUNT(*) AS n FROM vw_satpen_with_kodim s
        WHERE s.kodam_id = ? AND s.korem_id IN (SELECT korem_id FROM dim_korem WHERE kodam_id = ? AND is_berdiri_sendiri = 1)
      `, k.kodam_id, k.kodam_id))
    );
    bsResults.forEach((bs, i) => {
      const k = topKodam[i];
      if (bs && bs.n > 0) {
        addNode(`BS-${k.kodam_id}`, "Berdiri Sendiri");
        links.push({ source: `KD-${k.kodam_id}`, target: `BS-${k.kodam_id}`, value: bs.n });
      }
    });
    return { nodes: nodes.map(n => ({ id: n.id, nodeColor: "#f59e0b", label: n.label })), links };
  },
  ["sankey-kodam-v4"],
  { revalidate: 3600 }
);

// ───────────────────────── Sankey: ALL KODAM → KODIM → kab/kota ─────────────────────────

export const sankeyAllKodamKodimKab = unstable_cache(
  async (minSekolahPerKodim: number = 5) => {
    const kodimRows = await qAll<{
      kodim_id: string; kodim_name: string; kabupaten_kota: string; kabupaten_norm: string;
      kodam_id: string; kodam_name: string; n_sekolah: number;
    }>(`
      SELECT
        k.kodim_id, k.name AS kodim_name, k.kabupaten_kota, k.kabupaten_norm,
        kd.kodam_id, kd.name AS kodam_name,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = k.kabupaten_norm) AS n_sekolah
      FROM dim_kodim k
      JOIN dim_kodam kd ON kd.kodam_id = k.kodam_id
    `);

    const active = kodimRows.filter(r => r.n_sekolah >= minSekolahPerKodim);

    const nodes: { id: string; label: string; level: 0 | 1 | 2; meta?: Record<string, string> }[] = [];
    const seen = new Set<string>();
    const addNode = (id: string, label: string, level: 0 | 1 | 2, meta?: Record<string, string>) => {
      if (seen.has(id)) return;
      seen.add(id);
      nodes.push({ id, label, level, meta });
    };

    const links: { source: string; target: string; value: number }[] = [];

    for (const r of active) {
      const kodamNode = `KD-${r.kodam_id}`;
      const kodimNode = `KM-${r.kodim_id}`;
      const kabNode = `KAB-${r.kabupaten_norm}`;
      addNode(kodamNode, r.kodam_name.replace(/^Kodam\s+/, ""), 0, { kodam_id: r.kodam_id });
      addNode(kodimNode, r.kodim_name.replace(/^Kodim\s+\d+\//, ""), 1, { kodim_id: r.kodim_id, kab: r.kabupaten_kota });
      addNode(kabNode, r.kabupaten_kota, 2, { kab: r.kabupaten_kota });
      links.push({ source: kodamNode, target: kodimNode, value: r.n_sekolah });
      links.push({ source: kodimNode, target: kabNode, value: r.n_sekolah });
    }
    return { nodes, links, total_kodim: active.length, total_kab: nodes.filter(n => n.level === 2).length };
  },
  ["sankey-all-kodam-kodim-v3"],
  { revalidate: 3600 }
);

// ───────────────────────── Treemap province × bentuk ─────────────────────────

export const provinceBentukTree = unstable_cache(
  async () => qAll<{ province: string; bentuk: string; n: number }>(`
    SELECT
      REPLACE(provinsi, 'PROV. ', '') AS province,
      bentuk_pendidikan AS bentuk,
      COUNT(*) AS n
    FROM fact_satpen_dikmen
    WHERE provinsi IS NOT NULL AND bentuk_pendidikan IS NOT NULL
    GROUP BY provinsi, bentuk_pendidikan
  `),
  ["province-bentuk-treemap-v2"],
  { revalidate: 3600 }
);

// ───────────────────────── Akreditasi distribusi ─────────────────────────

export const akreditasiBreakdown = unstable_cache(
  async () => qAll<{ level: string; n: number }>(`
    SELECT
      CASE
        WHEN akreditasi='A' THEN 'A'
        WHEN akreditasi='B' THEN 'B'
        WHEN akreditasi='C' THEN 'C'
        WHEN akreditasi LIKE '%TIDAK%' THEN 'TT'
        WHEN akreditasi IS NULL OR akreditasi='' THEN 'BT'
        ELSE 'Lain'
      END AS level,
      COUNT(*) AS n
    FROM fact_satpen_dikmen
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["akreditasi-breakdown-v2"],
  { revalidate: 3600 }
);

export const akreditasiByProvince = unstable_cache(
  async () => qAll<{ province: string; A: number; B: number; C: number; TT: number; total: number }>(`
    SELECT
      REPLACE(provinsi, 'PROV. ', '') AS province,
      SUM(CASE WHEN akreditasi='A' THEN 1 ELSE 0 END) AS A,
      SUM(CASE WHEN akreditasi='B' THEN 1 ELSE 0 END) AS B,
      SUM(CASE WHEN akreditasi='C' THEN 1 ELSE 0 END) AS C,
      SUM(CASE WHEN akreditasi LIKE '%TIDAK%' THEN 1 ELSE 0 END) AS TT,
      COUNT(*) AS total
    FROM fact_satpen_dikmen
    WHERE provinsi IS NOT NULL
    GROUP BY provinsi
    ORDER BY total DESC
    LIMIT 12
  `),
  ["akreditasi-by-province-v2"],
  { revalidate: 3600 }
);

// ───────────────────────── Status & infra distribution ─────────────────────────

export const statusBreakdown = unstable_cache(
  async () => qAll<{ status: string; n: number }>(`
    SELECT UPPER(status_sekolah) AS status, COUNT(*) AS n
    FROM fact_satpen_dikmen
    WHERE status_sekolah IS NOT NULL AND status_sekolah != ''
    GROUP BY 1
  `),
  ["status-breakdown-v2"],
  { revalidate: 3600 }
);

export const internetBreakdown = unstable_cache(
  async () => qAll<{ akses: string; n: number }>(`
    SELECT
      CASE
        WHEN akses_internet IS NULL OR akses_internet='' THEN 'Tidak ada data'
        WHEN UPPER(akses_internet)='TIDAK ADA' THEN 'Tidak ada'
        ELSE akses_internet
      END AS akses,
      COUNT(*) AS n
    FROM fact_satpen_dikmen
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["internet-breakdown-v2"],
  { revalidate: 3600 }
);

export const listrikBreakdown = unstable_cache(
  async () => qAll<{ sumber: string; n: number }>(`
    SELECT
      CASE
        WHEN sumber_listrik IS NULL OR sumber_listrik='' THEN 'Tidak ada data'
        ELSE sumber_listrik
      END AS sumber,
      COUNT(*) AS n
    FROM fact_satpen_dikmen
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["listrik-breakdown-v2"],
  { revalidate: 3600 }
);

// ───────────────────────── Yayasan ─────────────────────────

export const topYayasan = unstable_cache(
  async (limit: number = 15) => qAll<{ npyp: string; nama: string; provinsi: string; n_naungan: number }>(`
    SELECT npyp,
           judul AS nama,
           REPLACE(COALESCE(nama_provinsi,''), 'PROV. ', '') AS provinsi,
           n_sekolah_naungan AS n_naungan
    FROM fact_yayasan
    WHERE n_sekolah_naungan IS NOT NULL AND n_sekolah_naungan > 0
    ORDER BY n_sekolah_naungan DESC
    LIMIT ?
  `, limit),
  ["top-yayasan-v3"],
  { revalidate: 3600 }
);

// ───────────────────────── Scatter luas vs akreditasi ─────────────────────────

export const scatterLuasAkreditasi = unstable_cache(
  async (sampleSize: number = 4000) => qAll<{ npsn: string; x: number; akreditasi: string }>(`
    SELECT npsn, luas_tanah AS x, akreditasi
    FROM fact_satpen_dikmen
    WHERE luas_tanah IS NOT NULL AND luas_tanah BETWEEN 100 AND 200000
      AND akreditasi IN ('A','B','C')
    ORDER BY RANDOM()
    LIMIT ?
  `, sampleSize),
  ["scatter-luas-akr-v2"],
  { revalidate: 3600 }
);

// ───────────────────────── Trend peserta didik 2023-2026 (SMA & SMK) ─────────────────────────

export const trendPesertaDidik = unstable_cache(
  async () => {
    type R = { kind: string; province_kd: string; col_index: number; value: number };
    const rows = await qAll<R>(`
      SELECT kind, province_kd, col_index, value
      FROM fact_stat_long
      WHERE table_code = '1.3.2' AND col_index BETWEEN 1 AND 9
    `);

    const years = ["2023/2024", "2024/2025", "2025/2026"];
    const buckets: Record<string, { year: string; sma_negeri: number; sma_swasta: number; smk_negeri: number; smk_swasta: number }> = {};
    years.forEach(y => { buckets[y] = { year: y, sma_negeri: 0, sma_swasta: 0, smk_negeri: 0, smk_swasta: 0 }; });

    rows.forEach(r => {
      const yearIdx = Math.floor((r.col_index - 1) / 3);
      const sub = (r.col_index - 1) % 3;
      if (yearIdx > 2 || sub === 2) return;
      const year = years[yearIdx];
      const key = `${r.kind}_${sub === 0 ? "negeri" : "swasta"}` as keyof typeof buckets[string];
      (buckets[year] as any)[key] += r.value || 0;
    });
    return years.map(y => buckets[y]);
  },
  ["trend-pd-1-3-2-v2"],
  { revalidate: 3600 }
);

// ───────────────────────── Bubble kabupaten cross-domain ─────────────────────────

export const bubbleKabupaten = unstable_cache(
  async () => {
    const rows = await qAll<{ kab_kota: string; provinsi: string; n_sekolah: number; n_a: number; n_kodim: number }>(`
      SELECT
        s.kab_kota,
        s.provinsi,
        COUNT(*) AS n_sekolah,
        SUM(CASE WHEN s.akreditasi='A' THEN 1 ELSE 0 END) AS n_a,
        (SELECT COUNT(*) FROM dim_kodim k WHERE k.kabupaten_norm = s.kab_norm) AS n_kodim
      FROM fact_satpen_dikmen s
      WHERE s.kab_kota IS NOT NULL
      GROUP BY s.kab_kota, s.provinsi
      HAVING n_sekolah >= 50
      ORDER BY n_sekolah DESC
      LIMIT 120
    `);
    return rows.map(r => ({
      ...r,
      pct_a: r.n_sekolah > 0 ? (r.n_a / r.n_sekolah) * 100 : 0,
    }));
  },
  ["bubble-kab-v2"],
  { revalidate: 3600 }
);

// ───────────────────────── SK timeline (Pendirian + Operasional) ─────────────────────────
const SK_MIN_YEAR = 1945;
const SK_MAX_YEAR = 2026;

export type SkYear = {
  year: number;
  sk_pendirian: number;
  sk_operasional: number;
};

export const skTimelineAll = unstable_cache(
  async (): Promise<SkYear[]> => {
    const [pend, oper] = await Promise.all([
      qAll<{ year: number; n: number }>(`
        SELECT CAST(strftime('%Y', tgl_sk_pendirian) AS INTEGER) AS year, COUNT(*) AS n
        FROM fact_satpen_dikmen
        WHERE tgl_sk_pendirian IS NOT NULL AND tgl_sk_pendirian != ''
        GROUP BY year
        HAVING year BETWEEN ? AND ?
      `, SK_MIN_YEAR, SK_MAX_YEAR),
      qAll<{ year: number; n: number }>(`
        SELECT CAST(strftime('%Y', tgl_sk_operasional) AS INTEGER) AS year, COUNT(*) AS n
        FROM fact_satpen_dikmen
        WHERE tgl_sk_operasional IS NOT NULL AND tgl_sk_operasional != ''
        GROUP BY year
        HAVING year BETWEEN ? AND ?
      `, SK_MIN_YEAR, SK_MAX_YEAR),
    ]);

    const map = new Map<number, SkYear>();
    for (let y = SK_MIN_YEAR; y <= SK_MAX_YEAR; y++) {
      map.set(y, { year: y, sk_pendirian: 0, sk_operasional: 0 });
    }
    pend.forEach(r => { const e = map.get(r.year); if (e) e.sk_pendirian = r.n; });
    oper.forEach(r => { const e = map.get(r.year); if (e) e.sk_operasional = r.n; });
    return Array.from(map.values());
  },
  ["sk-timeline-all-v2"],
  { revalidate: 3600 }
);

type StackedTimelineRow = { year: number; [key: string]: number };

export const skTimelineByAkreditasi = unstable_cache(
  async (dateCol: "pendirian" | "operasional" = "pendirian"): Promise<StackedTimelineRow[]> => {
    const col = dateCol === "pendirian" ? "tgl_sk_pendirian" : "tgl_sk_operasional";
    const rows = await qAll<{ year: number; level: string; n: number }>(`
      SELECT
        CAST(strftime('%Y', ${col}) AS INTEGER) AS year,
        CASE
          WHEN akreditasi='A' THEN 'A'
          WHEN akreditasi='B' THEN 'B'
          WHEN akreditasi='C' THEN 'C'
          WHEN akreditasi LIKE '%TIDAK%' THEN 'TT'
          ELSE 'BT'
        END AS level,
        COUNT(*) AS n
      FROM fact_satpen_dikmen
      WHERE ${col} IS NOT NULL AND ${col} != ''
      GROUP BY year, level
      HAVING year BETWEEN ? AND ?
    `, SK_MIN_YEAR, SK_MAX_YEAR);

    const map = new Map<number, StackedTimelineRow>();
    for (let y = SK_MIN_YEAR; y <= SK_MAX_YEAR; y++) {
      map.set(y, { year: y, A: 0, B: 0, C: 0, TT: 0, BT: 0 });
    }
    rows.forEach(r => { const e = map.get(r.year); if (e) e[r.level] = r.n; });
    return Array.from(map.values());
  },
  ["sk-timeline-akreditasi-v2"],
  { revalidate: 3600 }
);

export const skTimelineByStatus = unstable_cache(
  async (dateCol: "pendirian" | "operasional" = "pendirian"): Promise<StackedTimelineRow[]> => {
    const col = dateCol === "pendirian" ? "tgl_sk_pendirian" : "tgl_sk_operasional";
    const rows = await qAll<{ year: number; status: string; n: number }>(`
      SELECT
        CAST(strftime('%Y', ${col}) AS INTEGER) AS year,
        UPPER(status_sekolah) AS status,
        COUNT(*) AS n
      FROM fact_satpen_dikmen
      WHERE ${col} IS NOT NULL AND ${col} != ''
        AND status_sekolah IS NOT NULL AND status_sekolah != ''
      GROUP BY year, status
      HAVING year BETWEEN ? AND ?
    `, SK_MIN_YEAR, SK_MAX_YEAR);

    const map = new Map<number, StackedTimelineRow>();
    for (let y = SK_MIN_YEAR; y <= SK_MAX_YEAR; y++) {
      map.set(y, { year: y, Negeri: 0, Swasta: 0 });
    }
    rows.forEach(r => {
      const e = map.get(r.year);
      if (e) e[r.status === "NEGERI" ? "Negeri" : "Swasta"] = r.n;
    });
    return Array.from(map.values());
  },
  ["sk-timeline-status-v2"],
  { revalidate: 3600 }
);

export const skTimelineByKodim = async (kodimId: string): Promise<SkYear[]> => {
  const [pend, oper] = await Promise.all([
    qAll<{ year: number; n: number }>(`
      SELECT CAST(strftime('%Y', tgl_sk_pendirian) AS INTEGER) AS year, COUNT(*) AS n
      FROM fact_satpen_dikmen
      WHERE kab_norm = (SELECT kabupaten_norm FROM dim_kodim WHERE kodim_id = ?)
        AND tgl_sk_pendirian IS NOT NULL AND tgl_sk_pendirian != ''
      GROUP BY year
      HAVING year BETWEEN ? AND ?
    `, kodimId, SK_MIN_YEAR, SK_MAX_YEAR),
    qAll<{ year: number; n: number }>(`
      SELECT CAST(strftime('%Y', tgl_sk_operasional) AS INTEGER) AS year, COUNT(*) AS n
      FROM fact_satpen_dikmen
      WHERE kab_norm = (SELECT kabupaten_norm FROM dim_kodim WHERE kodim_id = ?)
        AND tgl_sk_operasional IS NOT NULL AND tgl_sk_operasional != ''
      GROUP BY year
      HAVING year BETWEEN ? AND ?
    `, kodimId, SK_MIN_YEAR, SK_MAX_YEAR),
  ]);

  const allYears = new Set<number>();
  pend.forEach(r => allYears.add(r.year));
  oper.forEach(r => allYears.add(r.year));
  if (allYears.size === 0) return [];

  const minY = Math.min(...allYears);
  const maxY = Math.max(...allYears);
  const map = new Map<number, SkYear>();
  for (let y = minY; y <= maxY; y++) map.set(y, { year: y, sk_pendirian: 0, sk_operasional: 0 });
  pend.forEach(r => { const e = map.get(r.year); if (e) e.sk_pendirian = r.n; });
  oper.forEach(r => { const e = map.get(r.year); if (e) e.sk_operasional = r.n; });
  return Array.from(map.values());
};

// ───────────────────────── Pilpres × Sekolah × Militer (cross-domain) ─────────────────────────

export type PrabowoKabRow = {
  kab_norm: string;
  nama_kab: string;
  nama_prov: string;
  // 2024
  votes24_anies: number;
  votes24_prabowo: number;
  votes24_ganjar: number;
  total24: number;
  pct24_prabowo: number;
  tps_coverage_pct: number;
  // 2019
  votes19_jokowi: number;
  votes19_prabowo: number;
  total19: number;
  pct19_prabowo: number;
  swing_pp: number;          // pct24_prabowo - pct19_prabowo (positive = gain)
  // School + Kodim joined
  n_sekolah: number;
  n_akr_a: number;
  pct_akr_a: number;
  n_kodim: number;
};

// All kabupaten with school + pilpres + kodim metrics. Filter happens client-side.
export const prabowoKabSummary = unstable_cache(
  async (): Promise<PrabowoKabRow[]> => {
    const rows = await qAll<any>(`
      SELECT
        p.kab_norm, p.nama_kab, p.nama_prov,
        p.sum24_anies AS votes24_anies, p.sum24_prabowo AS votes24_prabowo, p.sum24_ganjar AS votes24_ganjar,
        p.sum19_jokowi AS votes19_jokowi, p.sum19_prabowo AS votes19_prabowo,
        p.sum24_tps_total, p.sum24_tps_covered,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = p.kab_norm) AS n_sekolah,
        (SELECT COUNT(*) FROM fact_satpen_dikmen s WHERE s.kab_norm = p.kab_norm AND s.akreditasi='A') AS n_akr_a,
        (SELECT COUNT(*) FROM dim_kodim k WHERE k.kabupaten_norm = p.kab_norm) AS n_kodim
      FROM v_pilpres_kab p
    `);
    return rows
      .map(r => {
        const total24 = r.votes24_anies + r.votes24_prabowo + r.votes24_ganjar;
        const total19 = r.votes19_jokowi + r.votes19_prabowo;
        const pct24_prabowo = total24 > 0 ? (r.votes24_prabowo / total24) * 100 : 0;
        const pct19_prabowo = total19 > 0 ? (r.votes19_prabowo / total19) * 100 : 0;
        const tps_coverage_pct = r.sum24_tps_total > 0 ? (r.sum24_tps_covered / r.sum24_tps_total) * 100 : 0;
        return {
          kab_norm: r.kab_norm,
          nama_kab: r.nama_kab,
          nama_prov: r.nama_prov,
          votes24_anies: r.votes24_anies, votes24_prabowo: r.votes24_prabowo, votes24_ganjar: r.votes24_ganjar,
          total24, pct24_prabowo,
          tps_coverage_pct,
          votes19_jokowi: r.votes19_jokowi, votes19_prabowo: r.votes19_prabowo,
          total19, pct19_prabowo,
          swing_pp: pct24_prabowo - pct19_prabowo,
          n_sekolah: r.n_sekolah,
          n_akr_a: r.n_akr_a,
          pct_akr_a: r.n_sekolah > 0 ? (r.n_akr_a / r.n_sekolah) * 100 : 0,
          n_kodim: r.n_kodim,
        };
      })
      // drop kab with no coverage at all (no schools AND no pilpres data)
      .filter(r => r.total24 > 0);
  },
  ["prabowo-kab-summary-v1"],
  { revalidate: 3600 }
);

export type KodamPolitikRow = {
  kodam_id: string;
  kodam_name: string;
  n_sekolah: number;
  votes24_anies: number;
  votes24_prabowo: number;
  votes24_ganjar: number;
  total24: number;
  pct24_prabowo: number;
  votes19_prabowo: number;
  votes19_jokowi: number;
  pct19_prabowo: number;
  swing_pp: number;
};

// Roll pilpres data up to KODAM scope (sum all kab that this kodam covers).
export const kodamPolitikSummary = unstable_cache(
  async (): Promise<KodamPolitikRow[]> => {
    const rows = await qAll<any>(`
      SELECT
        kd.kodam_id, kd.name AS kodam_name,
        SUM(COALESCE(p.sum24_anies, 0))   AS sum24_anies,
        SUM(COALESCE(p.sum24_prabowo, 0)) AS sum24_prabowo,
        SUM(COALESCE(p.sum24_ganjar, 0))  AS sum24_ganjar,
        SUM(COALESCE(p.sum19_jokowi, 0))  AS sum19_jokowi,
        SUM(COALESCE(p.sum19_prabowo, 0)) AS sum19_prabowo,
        (SELECT COUNT(*) FROM vw_satpen_with_kodim s WHERE s.kodam_id = kd.kodam_id) AS n_sekolah
      FROM dim_kodam kd
      LEFT JOIN dim_kodim k ON k.kodam_id = kd.kodam_id
      LEFT JOIN v_pilpres_kab p ON p.kab_norm = k.kabupaten_norm
      GROUP BY kd.kodam_id, kd.name
    `);
    return rows.map(r => {
      const total24 = r.sum24_anies + r.sum24_prabowo + r.sum24_ganjar;
      const total19 = r.sum19_jokowi + r.sum19_prabowo;
      const pct24_prabowo = total24 > 0 ? (r.sum24_prabowo / total24) * 100 : 0;
      const pct19_prabowo = total19 > 0 ? (r.sum19_prabowo / total19) * 100 : 0;
      return {
        kodam_id: r.kodam_id,
        kodam_name: r.kodam_name,
        n_sekolah: r.n_sekolah,
        votes24_anies: r.sum24_anies,
        votes24_prabowo: r.sum24_prabowo,
        votes24_ganjar: r.sum24_ganjar,
        total24, pct24_prabowo,
        votes19_prabowo: r.sum19_prabowo,
        votes19_jokowi: r.sum19_jokowi,
        pct19_prabowo,
        swing_pp: pct24_prabowo - pct19_prabowo,
      };
    });
  },
  ["kodam-politik-v1"],
  { revalidate: 3600 }
);

// Per-kodim Prabowo dominance (for /assignment map color overlay).
export type KodimPolitikRow = {
  kodim_id: string;
  pct24_prabowo: number | null;
  swing_pp: number | null;
  total24: number;
};

export const kodimPolitik = unstable_cache(
  async (): Promise<KodimPolitikRow[]> => {
    const rows = await qAll<any>(`
      SELECT
        k.kodim_id,
        p.sum24_anies, p.sum24_prabowo, p.sum24_ganjar,
        p.sum19_jokowi, p.sum19_prabowo
      FROM dim_kodim k
      LEFT JOIN v_pilpres_kab p ON p.kab_norm = k.kabupaten_norm
    `);
    return rows.map(r => {
      const total24 = (r.sum24_anies ?? 0) + (r.sum24_prabowo ?? 0) + (r.sum24_ganjar ?? 0);
      const total19 = (r.sum19_jokowi ?? 0) + (r.sum19_prabowo ?? 0);
      const pct24 = total24 > 0 ? ((r.sum24_prabowo ?? 0) / total24) * 100 : null;
      const pct19 = total19 > 0 ? ((r.sum19_prabowo ?? 0) / total19) * 100 : null;
      return {
        kodim_id: r.kodim_id,
        pct24_prabowo: pct24,
        swing_pp: (pct24 != null && pct19 != null) ? pct24 - pct19 : null,
        total24,
      };
    });
  },
  ["kodim-politik-v1"],
  { revalidate: 3600 }
);

// SK timeline (Pendirian) bucketed by Prabowo dominance (≥60 / 40-60 / <40 of 2024 vote).
export type SkTimelinePolitikRow = {
  year: number;
  dominant: number;   // sekolah at kab where Prabowo ≥ 60%
  swing: number;      // 40-60%
  opposisi: number;   // < 40%
};

export const skTimelineByPrabowo = unstable_cache(
  async (): Promise<SkTimelinePolitikRow[]> => {
    const SK_MIN_YEAR = 1945, SK_MAX_YEAR = 2026;
    const rows = await qAll<any>(`
      WITH kab_prabowo AS (
        SELECT kab_norm,
          (sum24_anies + sum24_prabowo + sum24_ganjar) AS total24,
          1.0 * sum24_prabowo / NULLIF(sum24_anies + sum24_prabowo + sum24_ganjar, 0) * 100 AS pct
        FROM v_pilpres_kab
      )
      SELECT
        CAST(strftime('%Y', s.tgl_sk_pendirian) AS INTEGER) AS year,
        CASE
          WHEN kp.pct >= 60 THEN 'dominant'
          WHEN kp.pct >= 40 THEN 'swing'
          WHEN kp.pct IS NOT NULL THEN 'opposisi'
          ELSE 'unknown'
        END AS bucket,
        COUNT(*) AS n
      FROM fact_satpen_dikmen s
      LEFT JOIN kab_prabowo kp ON kp.kab_norm = s.kab_norm
      WHERE s.tgl_sk_pendirian IS NOT NULL AND s.tgl_sk_pendirian != ''
      GROUP BY year, bucket
      HAVING year BETWEEN ? AND ?
    `, SK_MIN_YEAR, SK_MAX_YEAR);

    const map = new Map<number, SkTimelinePolitikRow>();
    for (let y = SK_MIN_YEAR; y <= SK_MAX_YEAR; y++) {
      map.set(y, { year: y, dominant: 0, swing: 0, opposisi: 0 });
    }
    rows.forEach(r => {
      const e = map.get(r.year);
      if (!e || r.bucket === "unknown") return;
      (e as any)[r.bucket] = r.n;
    });
    return Array.from(map.values());
  },
  ["sk-timeline-prabowo-v1"],
  { revalidate: 3600 }
);

// ───────────────────────── Map data ─────────────────────────

export type MapSchoolPoint = {
  npsn: string; nama: string; bentuk: string; status: string; akr: string;
  lat: number; lng: number;
};
export type MapMilitaryPoint = {
  id: string; tipe: "KODAM" | "KOREM" | "KODIM";
  name: string; address: string | null; lat: number; lng: number;
};

// Per-request memo (React.cache) since payloads exceed Next.js 2MB cache limit.
export const mapSchools = cache(async (): Promise<MapSchoolPoint[]> => {
  return qAll<MapSchoolPoint>(`
    SELECT npsn, nama, bentuk_pendidikan AS bentuk,
           UPPER(status_sekolah) AS status,
           COALESCE(akreditasi, 'BT') AS akr,
           lintang AS lat, bujur AS lng
    FROM fact_satpen_dikmen
    WHERE lintang IS NOT NULL AND bujur IS NOT NULL
      AND lintang BETWEEN -12 AND 7 AND bujur BETWEEN 94 AND 142
  `);
});

export const mapMilitary = cache(async (): Promise<MapMilitaryPoint[]> => {
  const [kodam, korem, kodim] = await Promise.all([
    qAll<any>(`SELECT kodam_id AS id, name, address, lat, lng FROM dim_kodam WHERE lat IS NOT NULL`),
    qAll<any>(`SELECT korem_id AS id, name, address, lat, lng FROM dim_korem WHERE lat IS NOT NULL AND is_berdiri_sendiri = 0`),
    qAll<any>(`SELECT kodim_id AS id, name, address, lat, lng FROM dim_kodim WHERE lat IS NOT NULL`),
  ]);
  return [
    ...kodam.map(r => ({ ...r, tipe: "KODAM" as const })),
    ...korem.map(r => ({ ...r, tipe: "KOREM" as const })),
    ...kodim.map(r => ({ ...r, tipe: "KODIM" as const })),
  ];
});

// ───────────────────────── Koramil aggregates ─────────────────────────

export type KoramilStatsPerKodam = {
  kodam_id: string;
  kodam_name: string;
  n_koramils: number;
  n_kodims: number;
  n_schools: number;
  avg_schools_per_koramil: number;
};

export const koramilStatsPerKodam = unstable_cache(
  async (): Promise<KoramilStatsPerKodam[]> => qAll<KoramilStatsPerKodam>(`
    WITH school_count AS (
      SELECT k.kodam_id, COUNT(*) AS n_schools
      FROM dim_kodim k JOIN fact_satpen_dikmen s ON s.kab_norm = k.kabupaten_norm
      WHERE s.bentuk_pendidikan IN ('SMA','SMK','MA','MAK')
      GROUP BY k.kodam_id
    ),
    kodim_count AS (
      SELECT kodam_id, COUNT(*) AS n_kodims FROM dim_kodim GROUP BY kodam_id
    )
    SELECT ka.kodam_id, ka.name AS kodam_name,
           COUNT(km.koramil_id) AS n_koramils,
           COALESCE(kc.n_kodims, 0) AS n_kodims,
           COALESCE(sc.n_schools, 0) AS n_schools,
           ROUND(CAST(COALESCE(sc.n_schools, 0) AS REAL) / NULLIF(COUNT(km.koramil_id), 0), 1) AS avg_schools_per_koramil
    FROM dim_kodam ka
    LEFT JOIN dim_koramil km ON km.kodam_id = ka.kodam_id
    LEFT JOIN kodim_count kc  ON kc.kodam_id = ka.kodam_id
    LEFT JOIN school_count sc ON sc.kodam_id = ka.kodam_id
    GROUP BY ka.kodam_id
    ORDER BY n_koramils DESC
  `),
  ["koramil-stats-per-kodam-v1"],
  { revalidate: 3600 }
);

export type KoramilLoadScatter = {
  kodim_id: string;
  kodim_name: string;
  kodam_name: string;
  n_koramils: number;
  n_schools: number;
  schools_per_koramil: number;
};

export const koramilLoadScatter = unstable_cache(
  async (): Promise<KoramilLoadScatter[]> => qAll<KoramilLoadScatter>(`
    WITH school_count AS (
      SELECT k.kodim_id, COUNT(*) AS n_schools
      FROM dim_kodim k JOIN fact_satpen_dikmen s ON s.kab_norm = k.kabupaten_norm
      WHERE s.bentuk_pendidikan IN ('SMA','SMK','MA','MAK')
      GROUP BY k.kodim_id
    ),
    koramil_count AS (
      SELECT kodim_id, COUNT(*) AS n FROM dim_koramil WHERE kodim_id IS NOT NULL GROUP BY kodim_id
    )
    SELECT kd.kodim_id, kd.name AS kodim_name, ka.name AS kodam_name,
           COALESCE(kc.n, 0) AS n_koramils,
           COALESCE(sc.n_schools, 0) AS n_schools,
           ROUND(CAST(COALESCE(sc.n_schools, 0) AS REAL) / NULLIF(COALESCE(kc.n, 0), 0), 1) AS schools_per_koramil
    FROM dim_kodim kd
    JOIN dim_kodam ka ON ka.kodam_id = kd.kodam_id
    LEFT JOIN koramil_count kc ON kc.kodim_id = kd.kodim_id
    LEFT JOIN school_count sc  ON sc.kodim_id = kd.kodim_id
    WHERE kc.n IS NOT NULL AND sc.n_schools IS NOT NULL
  `),
  ["koramil-load-scatter-v1"],
  { revalidate: 3600 }
);

export type KoramilBentuk = { bentuk: string; n: number };

export const koramilBentukDistribution = unstable_cache(
  async (): Promise<KoramilBentuk[]> => qAll<KoramilBentuk>(`
    SELECT COALESCE(bentuk_wilayah, '(tidak diisi)') AS bentuk, COUNT(*) AS n
    FROM dim_koramil GROUP BY bentuk_wilayah ORDER BY n DESC
  `),
  ["koramil-bentuk-v1"],
  { revalidate: 3600 }
);

export type KoramilTopKorem = {
  korem_id: string;
  korem_name: string;
  n_koramils: number;
  n_schools: number;
};

export const koramilByKorem = unstable_cache(
  async (limit: number = 15): Promise<KoramilTopKorem[]> => qAll<KoramilTopKorem>(
    `
    WITH school_count AS (
      SELECT k.korem_id, COUNT(*) AS n_schools
      FROM dim_kodim k JOIN fact_satpen_dikmen s ON s.kab_norm = k.kabupaten_norm
      WHERE s.bentuk_pendidikan IN ('SMA','SMK','MA','MAK') AND k.korem_id IS NOT NULL
      GROUP BY k.korem_id
    )
    SELECT kr.korem_id, kr.name AS korem_name,
           COUNT(km.koramil_id) AS n_koramils,
           COALESCE(sc.n_schools, 0) AS n_schools
    FROM dim_korem kr
    LEFT JOIN dim_koramil km ON km.korem_id = kr.korem_id
    LEFT JOIN school_count sc ON sc.korem_id = kr.korem_id
    GROUP BY kr.korem_id
    ORDER BY n_koramils DESC LIMIT ?
    `,
    Number(limit)
  ),
  ["koramil-by-korem-v1"],
  { revalidate: 3600 }
);

// Map enrichment: { kodim_id → n_koramils } for badging kodim markers
export const koramilCountByKodim = unstable_cache(
  async (): Promise<Record<string, number>> => {
    const rows = await qAll<{ kodim_id: string; n: number }>(
      `SELECT kodim_id, COUNT(*) AS n FROM dim_koramil WHERE kodim_id IS NOT NULL GROUP BY kodim_id`
    );
    const out: Record<string, number> = {};
    for (const r of rows) out[r.kodim_id] = Number(r.n);
    return out;
  },
  ["koramil-count-by-kodim-v1"],
  { revalidate: 3600 }
);

// Lazy fetch: koramils under a specific kodim (used by /assignment sidebar)
export const koramilsForKodim = async (kodim_id: string) => qAll<any>(
  `SELECT koramil_id, name AS koramil_name, short_name, danramil_name, pangkat,
          phone_mobile, address, bentuk_wilayah
   FROM dim_koramil WHERE kodim_id = ? ORDER BY koramil_id ASC`,
  kodim_id
);
