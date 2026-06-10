import "server-only";
import { createClient, type Client, type InValue } from "@libsql/client";
import { unstable_cache } from "next/cache";

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

// ───────────────────────── KKRI Target KPI (kkri_target_korem/kodim/koramil) ─────────────────────────
// Mission Briefing dashboard headline numbers, sourced from the curated KKRI target-school
// tables (one row per target school per level) instead of the full DAPODIK dataset.

export type KkriTargetKpi = {
  total_sekolah_target: number;
  n_korem_target: number;
  n_kodim_target: number;
  n_koramil_target: number;
  n_provinsi: number;
  n_kabkota_target: number;
  with_coords: number;
  without_coords: number;
};

export const kkriTargetKpi = unstable_cache(
  async (): Promise<KkriTargetKpi> => {
    return (await qGet<KkriTargetKpi>(`
      SELECT
        (SELECT COUNT(DISTINCT npsn) FROM (
          SELECT npsn FROM kkri_target_korem
          UNION SELECT npsn FROM kkri_target_kodim
          UNION SELECT npsn FROM kkri_target_koramil
        )) AS total_sekolah_target,
        (SELECT COUNT(DISTINCT korem) FROM kkri_target_korem) AS n_korem_target,
        (SELECT COUNT(DISTINCT kodim) FROM kkri_target_kodim) AS n_kodim_target,
        (SELECT COUNT(*) FROM kkri_target_koramil) AS n_koramil_target,
        (SELECT COUNT(DISTINCT provinsi) FROM (
          SELECT UPPER(provinsi_sekolah) AS provinsi FROM kkri_target_korem
          UNION SELECT UPPER(provinsi) FROM kkri_target_kodim
          UNION SELECT UPPER(provinsi) FROM kkri_target_koramil
        )) AS n_provinsi,
        (SELECT COUNT(DISTINCT kab_kota_sekolah) FROM (
          SELECT kab_kota_sekolah FROM kkri_target_korem
          UNION SELECT kab_kota_sekolah FROM kkri_target_kodim
          UNION SELECT kab_kota_sekolah FROM kkri_target_koramil
        )) AS n_kabkota_target,
        (
          (SELECT COUNT(*) FROM kkri_target_korem WHERE lintang IS NOT NULL AND bujur IS NOT NULL) +
          (SELECT COUNT(*) FROM kkri_target_kodim WHERE lintang IS NOT NULL AND bujur IS NOT NULL) +
          (SELECT COUNT(*) FROM kkri_target_koramil WHERE lintang IS NOT NULL AND bujur IS NOT NULL)
        ) AS with_coords,
        (
          (SELECT COUNT(*) FROM kkri_target_korem WHERE lintang IS NULL OR bujur IS NULL) +
          (SELECT COUNT(*) FROM kkri_target_kodim WHERE lintang IS NULL OR bujur IS NULL) +
          (SELECT COUNT(*) FROM kkri_target_koramil WHERE lintang IS NULL OR bujur IS NULL)
        ) AS without_coords
    `))!;
  },
  ["kkri-target-kpi-v1"],
  { revalidate: 3600 }
);

// Komposisi bentuk sekolah (SMA/SMK/MA/...) across all 3 target levels.
export const targetBentukDistribution = unstable_cache(
  async () => qAll<{ bentuk: string; n: number }>(`
    SELECT COALESCE(bentuk, 'Tidak diisi') AS bentuk, COUNT(*) AS n
    FROM (
      SELECT bentuk FROM kkri_target_korem
      UNION ALL SELECT bentuk FROM kkri_target_kodim
      UNION ALL SELECT bentuk FROM kkri_target_koramil
    )
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["target-bentuk-v1"],
  { revalidate: 3600 }
);

// Komposisi akreditasi across all 3 target levels.
export const targetAkreditasiBreakdown = unstable_cache(
  async () => qAll<{ level: string; n: number }>(`
    SELECT
      CASE
        WHEN akreditasi='A' THEN 'A'
        WHEN akreditasi='B' THEN 'B'
        WHEN akreditasi='C' THEN 'C'
        WHEN akreditasi LIKE '%TIDAK%' THEN 'TT'
        ELSE 'BT'
      END AS level,
      COUNT(*) AS n
    FROM (
      SELECT akreditasi FROM kkri_target_korem
      UNION ALL SELECT akreditasi FROM kkri_target_kodim
      UNION ALL SELECT akreditasi FROM kkri_target_koramil
    )
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["target-akreditasi-v1"],
  { revalidate: 3600 }
);

// Status akses internet across all 3 target levels.
export const targetInternetBreakdown = unstable_cache(
  async () => qAll<{ akses: string; n: number }>(`
    SELECT
      CASE
        WHEN internet IS NULL OR internet='' OR internet='N/A' THEN 'Tidak ada data'
        WHEN UPPER(internet)='TIDAK ADA' THEN 'Tidak ada'
        ELSE internet
      END AS akses,
      COUNT(*) AS n
    FROM (
      SELECT internet FROM kkri_target_korem
      UNION ALL SELECT internet FROM kkri_target_kodim
      UNION ALL SELECT internet FROM kkri_target_koramil
    )
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["target-internet-v1"],
  { revalidate: 3600 }
);

// Distribusi sekolah target per KODAM (level KORAMIL = paling detail/granular).
export type TargetKodamRow = {
  kodam: string;
  n_koramil_target: number;
  n_sekolah_target: number;
  n_akreditasi_a: number;
  pct_akreditasi_a: number;
  avg_sekolah_per_koramil: number;
};

export const targetKodamSummary = unstable_cache(
  async (): Promise<TargetKodamRow[]> => {
    const rows = await qAll<Omit<TargetKodamRow, "pct_akreditasi_a" | "avg_sekolah_per_koramil">>(`
      SELECT
        COALESCE(kodam, 'Tidak diisi') AS kodam,
        COUNT(DISTINCT koramil) AS n_koramil_target,
        COUNT(*) AS n_sekolah_target,
        SUM(CASE WHEN akreditasi='A' THEN 1 ELSE 0 END) AS n_akreditasi_a
      FROM kkri_target_koramil
      GROUP BY kodam
      ORDER BY n_sekolah_target DESC
    `);
    return rows.map(r => ({
      ...r,
      pct_akreditasi_a: r.n_sekolah_target > 0 ? (r.n_akreditasi_a / r.n_sekolah_target) * 100 : 0,
      avg_sekolah_per_koramil: r.n_koramil_target > 0 ? r.n_sekolah_target / r.n_koramil_target : 0,
    }));
  },
  ["target-kodam-summary-v1"],
  { revalidate: 3600 }
);

// Distribusi sekolah target per provinsi across all 3 target levels.
export const targetProvinceDistribution = unstable_cache(
  async (limit: number = 8) => qAll<{ provinsi: string; n: number }>(`
    SELECT provinsi, COUNT(*) AS n
    FROM (
      SELECT UPPER(provinsi_sekolah) AS provinsi FROM kkri_target_korem
      UNION ALL SELECT UPPER(provinsi) AS provinsi FROM kkri_target_kodim
      UNION ALL SELECT UPPER(provinsi) AS provinsi FROM kkri_target_koramil
    )
    WHERE provinsi IS NOT NULL
    GROUP BY provinsi
    ORDER BY n DESC
    LIMIT ?
  `, limit),
  ["target-province-dist-v1"],
  { revalidate: 3600 }
);

// Top KOREM by jumlah sekolah target (level KOREM).
export type TargetKoremRow = {
  korem: string;
  kodam: string;
  kab_kota_markas: string;
  n_sekolah_target: number;
  n_akreditasi_a: number;
  pct_akreditasi_a: number;
};

export const targetKoremSummary = unstable_cache(
  async (): Promise<TargetKoremRow[]> => {
    const rows = await qAll<Omit<TargetKoremRow, "pct_akreditasi_a">>(`
      SELECT
        COALESCE(korem, 'Tidak diisi') AS korem,
        COALESCE(kodam, 'Tidak diisi') AS kodam,
        COALESCE(kab_kota_markas, '-') AS kab_kota_markas,
        COUNT(*) AS n_sekolah_target,
        SUM(CASE WHEN akreditasi='A' THEN 1 ELSE 0 END) AS n_akreditasi_a
      FROM kkri_target_korem
      GROUP BY korem, kodam, kab_kota_markas
      ORDER BY n_sekolah_target DESC
    `);
    return rows.map(r => ({
      ...r,
      pct_akreditasi_a: r.n_sekolah_target > 0 ? (r.n_akreditasi_a / r.n_sekolah_target) * 100 : 0,
    }));
  },
  ["target-korem-summary-v1"],
  { revalidate: 3600 }
);

// Beban per KORAMIL by jumlah sekolah target (level KORAMIL).
export type TargetKoramilRow = {
  koramil: string;
  kodam: string;
  kab_kota: string;
  n_sekolah_target: number;
  n_akreditasi_a: number;
};

export const targetKoramilSummary = unstable_cache(
  async (limit: number = 15): Promise<TargetKoramilRow[]> => qAll<TargetKoramilRow>(`
    SELECT
      COALESCE(koramil, 'Tidak diisi') AS koramil,
      COALESCE(kodam, 'Tidak diisi') AS kodam,
      COALESCE(kab_kota, '-') AS kab_kota,
      COUNT(*) AS n_sekolah_target,
      SUM(CASE WHEN akreditasi='A' THEN 1 ELSE 0 END) AS n_akreditasi_a
    FROM kkri_target_koramil
    GROUP BY koramil, kodam, kab_kota
    ORDER BY n_sekolah_target DESC
    LIMIT ?
  `, limit),
  ["target-koramil-summary-v1"],
  { revalidate: 3600 }
);

// Top kabupaten/kota by jumlah sekolah target across all 3 levels.
export const targetKabKotaDistribution = unstable_cache(
  async (limit: number = 15) => qAll<{ kab_kota: string; n: number }>(`
    SELECT kab_kota, COUNT(*) AS n
    FROM (
      SELECT UPPER(kab_kota_sekolah) AS kab_kota FROM kkri_target_korem
      UNION ALL SELECT UPPER(kab_kota_sekolah) AS kab_kota FROM kkri_target_kodim
      UNION ALL SELECT UPPER(kab_kota_sekolah) AS kab_kota FROM kkri_target_koramil
    )
    WHERE kab_kota IS NOT NULL AND kab_kota != ''
    GROUP BY kab_kota
    ORDER BY n DESC
    LIMIT ?
  `, limit),
  ["target-kabkota-dist-v1"],
  { revalidate: 3600 }
);

// Top kecamatan by jumlah sekolah target across all 3 levels.
export const targetKecamatanDistribution = unstable_cache(
  async (limit: number = 15) => qAll<{ kecamatan: string; n: number }>(`
    SELECT kecamatan, COUNT(*) AS n
    FROM (
      SELECT UPPER(kecamatan) AS kecamatan FROM kkri_target_korem
      UNION ALL SELECT UPPER(kecamatan) AS kecamatan FROM kkri_target_kodim
      UNION ALL SELECT UPPER(kecamatan) AS kecamatan FROM kkri_target_koramil
    )
    WHERE kecamatan IS NOT NULL AND kecamatan != ''
    GROUP BY kecamatan
    ORDER BY n DESC
    LIMIT ?
  `, limit),
  ["target-kecamatan-dist-v1"],
  { revalidate: 3600 }
);

// Distribusi pulau — hanya tersedia pada kkri_target_koramil.
export const targetPulauDistribution = unstable_cache(
  async () => qAll<{ pulau: string; n: number }>(`
    SELECT COALESCE(pulau, 'Tidak diisi') AS pulau, COUNT(*) AS n
    FROM kkri_target_koramil
    GROUP BY pulau
    ORDER BY n DESC
  `),
  ["target-pulau-dist-v1"],
  { revalidate: 3600 }
);

// Klasifikasi posisi sekolah (mis. perkotaan/pedesaan) across all 3 target levels.
export const targetPosisiBreakdown = unstable_cache(
  async () => qAll<{ posisi: string; n: number }>(`
    SELECT COALESCE(posisi, 'Tidak diisi') AS posisi, COUNT(*) AS n
    FROM (
      SELECT posisi FROM kkri_target_korem
      UNION ALL SELECT posisi FROM kkri_target_kodim
      UNION ALL SELECT posisi FROM kkri_target_koramil
    )
    GROUP BY 1
    ORDER BY 2 DESC
  `),
  ["target-posisi-v1"],
  { revalidate: 3600 }
);

// Provinsi × bentuk sekolah across all 3 target levels (treemap source).
export const targetProvinceBentukTree = unstable_cache(
  async () => qAll<{ provinsi: string; bentuk: string; n: number }>(`
    SELECT provinsi, COALESCE(bentuk, 'Tidak diisi') AS bentuk, COUNT(*) AS n
    FROM (
      SELECT UPPER(provinsi_sekolah) AS provinsi, bentuk FROM kkri_target_korem
      UNION ALL SELECT UPPER(provinsi) AS provinsi, bentuk FROM kkri_target_kodim
      UNION ALL SELECT UPPER(provinsi) AS provinsi, bentuk FROM kkri_target_koramil
    )
    WHERE provinsi IS NOT NULL
    GROUP BY provinsi, bentuk
    ORDER BY provinsi ASC, n DESC
  `),
  ["target-province-bentuk-tree-v1"],
  { revalidate: 3600 }
);

// Jumlah baris sekolah target per level (KOREM/KODIM/KORAMIL).
export const targetLevelDistribution = unstable_cache(
  async () => qAll<{ level: string; n: number }>(`
    SELECT 'KOREM' AS level, COUNT(*) AS n FROM kkri_target_korem
    UNION ALL
    SELECT 'KODIM' AS level, COUNT(*) AS n FROM kkri_target_kodim
    UNION ALL
    SELECT 'KORAMIL' AS level, COUNT(*) AS n FROM kkri_target_koramil
  `),
  ["target-level-dist-v1"],
  { revalidate: 3600 }
);

// Full directory of target schools across all 3 levels — backs the /visualisasi
// "Daftar Sekolah Target" table and the /mapping markers.
export type TargetSchoolRow = {
  npsn: string;
  nama: string;
  bentuk: string;
  akreditasi: string;
  internet: string;
  posisi: string;
  level: "KOREM" | "KODIM" | "KORAMIL";
  unit: string;
  kodam: string | null;
  provinsi: string;
  kab_kota: string;
  kecamatan: string | null;
  lat: number | null;
  lng: number | null;
};

export const targetSchoolDirectory = unstable_cache(
  async (): Promise<TargetSchoolRow[]> => qAll<TargetSchoolRow>(`
    SELECT npsn, nama_sekolah AS nama, COALESCE(bentuk, '-') AS bentuk,
           CASE
             WHEN akreditasi='A' THEN 'A'
             WHEN akreditasi='B' THEN 'B'
             WHEN akreditasi='C' THEN 'C'
             WHEN akreditasi LIKE '%TIDAK%' THEN 'TT'
             ELSE 'BT'
           END AS akreditasi,
           COALESCE(internet, 'Tidak ada data') AS internet,
           COALESCE(posisi, '-') AS posisi,
           'KOREM' AS level, korem AS unit, kodam,
           UPPER(provinsi_sekolah) AS provinsi, kab_kota_sekolah AS kab_kota, kecamatan,
           lintang AS lat, bujur AS lng
    FROM kkri_target_korem
    UNION ALL
    SELECT npsn, nama_sekolah, COALESCE(bentuk, '-'),
           CASE
             WHEN akreditasi='A' THEN 'A'
             WHEN akreditasi='B' THEN 'B'
             WHEN akreditasi='C' THEN 'C'
             WHEN akreditasi LIKE '%TIDAK%' THEN 'TT'
             ELSE 'BT'
           END,
           COALESCE(internet, 'Tidak ada data'),
           COALESCE(posisi, '-'),
           'KODIM', kodim, NULL,
           UPPER(provinsi), kab_kota_sekolah, kecamatan,
           lintang, bujur
    FROM kkri_target_kodim
    UNION ALL
    SELECT npsn, nama_sekolah, COALESCE(bentuk, '-'),
           CASE
             WHEN akreditasi='A' THEN 'A'
             WHEN akreditasi='B' THEN 'B'
             WHEN akreditasi='C' THEN 'C'
             WHEN akreditasi LIKE '%TIDAK%' THEN 'TT'
             ELSE 'BT'
           END,
           COALESCE(internet, 'Tidak ada data'),
           COALESCE(posisi, '-'),
           'KORAMIL', koramil, kodam,
           UPPER(provinsi), kab_kota_sekolah, kecamatan,
           lintang, bujur
    FROM kkri_target_koramil
    ORDER BY provinsi ASC, kab_kota ASC, nama ASC
  `),
  ["target-school-directory-v1"],
  { revalidate: 3600 }
);

// Per-KODAM centroid (rata-rata koordinat koramil target) + jumlah sekolah/koramil
// target — pengganti marker markas KODAM/KOREM/KODIM di /mapping karena tabel
// target tidak menyimpan koordinat markas.
export type TargetKodamAgg = {
  kodam: string;
  n_sekolah_target: number;
  n_koramil_target: number;
  lat: number;
  lng: number;
};

export const targetKodamAggregates = unstable_cache(
  async (): Promise<TargetKodamAgg[]> => qAll<TargetKodamAgg>(`
    SELECT
      COALESCE(kodam, 'Tidak diisi') AS kodam,
      COUNT(*) AS n_sekolah_target,
      COUNT(DISTINCT koramil) AS n_koramil_target,
      AVG(lintang) AS lat,
      AVG(bujur) AS lng
    FROM kkri_target_koramil
    WHERE lintang IS NOT NULL AND bujur IS NOT NULL
    GROUP BY kodam
  `),
  ["target-kodam-aggregates-v1"],
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
        kodim AS kodim_id,
        kodim AS kodim_name,
        kab_kota AS kabupaten_kota,
        UPPER(kab_kota) AS kabupaten_norm,
        NULL AS kodam_id,
        NULL AS kodam_name,
        NULL AS korem_id,
        NULL AS korem_name,
        AVG(lintang) AS lat,
        AVG(bujur) AS lng,
        COUNT(*) AS n_sekolah,
        SUM(CASE WHEN akreditasi = 'A' THEN 1 ELSE 0 END) AS n_akreditasi_a,
        0 AS n_negeri,
        0 AS n_swasta
      FROM kkri_target_kodim
      GROUP BY kodim, kab_kota
      ORDER BY n_sekolah DESC
    `);
  },
  ["kodim-summary-v4"],
  { revalidate: 3600 }
);

// ───────────────────────── SK timeline per kodim ─────────────────────────
const SK_MIN_YEAR = 1945;
const SK_MAX_YEAR = 2026;

export type SkYear = {
  year: number;
  sk_pendirian: number;
  sk_operasional: number;
};

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

// Lazy fetch: koramils under a specific kodim (used by /assignment sidebar)
export const koramilsForKodim = async (kodim_id: string) => qAll<any>(
  `SELECT koramil_id, name AS koramil_name, short_name, danramil_name, pangkat,
          phone_mobile, address, bentuk_wilayah
   FROM dim_koramil WHERE kodim_id = ? ORDER BY koramil_id ASC`,
  kodim_id
);
