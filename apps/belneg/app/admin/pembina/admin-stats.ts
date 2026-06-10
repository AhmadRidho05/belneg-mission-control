// Server-side aggregation for the AdminSummary dashboard at /admin/pembina.
// Returns 13+ visualisation-ready datasets in one Promise.all.
import "server-only";
import { qAll, qGet } from "../../api/web/_lib";

export type AdminStats = {
  hero: {
    total_pembina: number;
    active_pembina: number;
    pending_pembina: number;
    total_laporan: number;
    total_peserta: number;
    sekolah_unik: number;
    avg_per_pembina: number;
    laporan_30d: number;
  };
  by_role: { name: string; n: number }[];
  by_status: { name: string; n: number }[];
  by_bentuk: { name: string; n: number }[];
  by_provinsi_sekolah: { name: string; n: number }[];
  trend_weekly: { week: string; laporan: number; peserta: number }[];
  candlestick_weekly_peserta: { date: string; open: number; high: number; low: number; close: number }[];
  sankey_kodam_kodim_status: { nodes: { id: string; label: string; level: 0 | 1 | 2 }[]; links: { source: string; target: string; value: number }[] };
  treemap_pangkat_role: { name: string; children: { name: string; value: number }[] }[];
  pembina_bubble: { id: string; full_name: string; role: string; n_laporan: number; avg_peserta: number; n_sekolah_unik: number }[];
  gps_scatter: { lat: number; lng: number; status: string }[];
  top_pembina: { full_name: string; role: string; unit_name: string | null; n_laporan: number; total_peserta: number }[];
  top_kodim: { kodim_name: string; n_laporan: number; n_pembina: number; n_sekolah_unik: number }[];
  pangkat_status: { pangkat: string; submitted: number; reviewed: number; approved: number; rejected: number; total: number }[];
  dow_hour_heatmap: { dow: number; hour: number; n: number }[];      // day-of-week × hour
  geographic_kab: { kab_kota: string; provinsi: string; n_laporan: number; n_pembina: number; n_sekolah: number }[];
};

// ─── Helpers (run in JS over raw rows) ──────────────────────────

function extractPangkat(fullName: string): string {
  // Format: "Letkol Inf. Budi Ardianto *"  → "Letkol"
  // Format: "Kapten Inf. Foo *"             → "Kapten"
  if (!fullName) return "Lainnya";
  const m = fullName.match(/^(Kapten|Mayor|Letkol|Kolonel|Brigjen|Mayjen|Letjen|Jenderal)/i);
  return m ? m[1] : "Lainnya";
}

function weekStart(iso: string): string {
  // Snap to nearest Monday. Reports use "YYYY-MM-DD HH:MM:SS" (UTC-ish).
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  const day = d.getUTCDay() || 7; // Mon=1 .. Sun=7
  d.setUTCDate(d.getUTCDate() - (day - 1));
  return d.toISOString().slice(0, 10);
}

// ─── Main aggregator ────────────────────────────────────────────

export async function getAdminStats(): Promise<AdminStats> {
  // Run all independent queries in parallel.
  const [
    hero,
    byRoleRows,
    byStatusRows,
    byBentukRows,
    byProvRows,
    reportRowsForTrend,
    pembinaForBubble,
    gpsRows,
    topPembinaRows,
    topKodimRows,
    dowHourRows,
    geoKabRows,
    sankeyRawRows,
    usersWithReports,
  ] = await Promise.all([
    // 1. Hero KPIs
    qGet<any>(`
      SELECT
        (SELECT COUNT(*) FROM kkri_users WHERE deleted_at IS NULL) AS total_pembina,
        (SELECT COUNT(*) FROM kkri_users WHERE deleted_at IS NULL AND is_active = 1) AS active_pembina,
        (SELECT COUNT(*) FROM kkri_users WHERE deleted_at IS NULL AND is_active = 0) AS pending_pembina,
        (SELECT COUNT(*) FROM kkri_reports r WHERE EXISTS (SELECT 1 FROM kkri_users u WHERE u.id = r.user_id AND u.deleted_at IS NULL)) AS total_laporan,
        (SELECT COALESCE(SUM(peserta_laki + peserta_perempuan), 0) FROM kkri_reports r WHERE EXISTS (SELECT 1 FROM kkri_users u WHERE u.id = r.user_id AND u.deleted_at IS NULL)) AS total_peserta,
        (SELECT COUNT(DISTINCT sekolah_npsn) FROM kkri_reports WHERE sekolah_npsn IS NOT NULL) AS sekolah_unik,
        (SELECT COUNT(*) FROM kkri_reports WHERE submitted_at >= date('now', '-30 days')) AS laporan_30d
    `),
    // 2. By role
    qAll<any>(`SELECT role AS name, COUNT(*) AS n FROM kkri_users WHERE deleted_at IS NULL GROUP BY role`),
    // 3. By status
    qAll<any>(`SELECT status AS name, COUNT(*) AS n FROM kkri_reports GROUP BY status`),
    // 4. By bentuk sekolah
    qAll<any>(`
      SELECT s.bentuk_pendidikan AS name, COUNT(*) AS n
      FROM kkri_reports r LEFT JOIN fact_satpen_dikmen s ON s.npsn = r.sekolah_npsn
      WHERE s.bentuk_pendidikan IS NOT NULL
      GROUP BY s.bentuk_pendidikan ORDER BY n DESC
    `),
    // 5. By provinsi sekolah (where reports happen)
    qAll<any>(`
      SELECT REPLACE(s.provinsi, 'PROV. ', '') AS name, COUNT(*) AS n
      FROM kkri_reports r LEFT JOIN fact_satpen_dikmen s ON s.npsn = r.sekolah_npsn
      WHERE s.provinsi IS NOT NULL
      GROUP BY s.provinsi ORDER BY n DESC LIMIT 15
    `),
    // 6. All reports last 12mo for trend + candlestick (JS-aggregated)
    qAll<{ reported_at: string; peserta: number }>(`
      SELECT reported_at, peserta_laki + peserta_perempuan AS peserta
      FROM kkri_reports
      WHERE reported_at >= date('now', '-12 months')
      ORDER BY reported_at
    `),
    // 7. Pembina bubble
    qAll<any>(`
      SELECT u.id, u.full_name, u.role,
             COUNT(r.id) AS n_laporan,
             COALESCE(AVG(r.peserta_laki + r.peserta_perempuan), 0) AS avg_peserta,
             COUNT(DISTINCT r.sekolah_npsn) AS n_sekolah_unik
      FROM kkri_users u LEFT JOIN kkri_reports r ON r.user_id = u.id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
      HAVING n_laporan > 0
      ORDER BY n_laporan DESC
      LIMIT 200
    `),
    // 8. GPS scatter (sample 800)
    qAll<any>(`
      SELECT lat, lng, status FROM kkri_reports
      WHERE lat IS NOT NULL AND lng IS NOT NULL
        AND lat BETWEEN -12 AND 7 AND lng BETWEEN 94 AND 142
      ORDER BY RANDOM() LIMIT 800
    `),
    // 9. Top 15 pembina by laporan
    qAll<any>(`
      SELECT u.full_name, u.role,
             COALESCE(
               (SELECT name FROM dim_kodim WHERE kodim_id = u.unit_id),
               (SELECT name FROM dim_korem WHERE korem_id = u.unit_id),
               (SELECT name FROM dim_kodam WHERE kodam_id = u.unit_id)
             ) AS unit_name,
             COUNT(r.id) AS n_laporan,
             COALESCE(SUM(r.peserta_laki + r.peserta_perempuan), 0) AS total_peserta
      FROM kkri_users u LEFT JOIN kkri_reports r ON r.user_id = u.id
      WHERE u.deleted_at IS NULL
      GROUP BY u.id
      HAVING n_laporan > 0
      ORDER BY n_laporan DESC LIMIT 15
    `),
    // 10. Top 10 KODIM by activity
    qAll<any>(`
      SELECT k.name AS kodim_name,
             COUNT(DISTINCT r.id) AS n_laporan,
             COUNT(DISTINCT r.user_id) AS n_pembina,
             COUNT(DISTINCT r.sekolah_npsn) AS n_sekolah_unik
      FROM kkri_reports r
      INNER JOIN dim_kodim k ON k.kodim_id = r.unit_id
      GROUP BY r.unit_id
      ORDER BY n_laporan DESC LIMIT 10
    `),
    // 11. Day-of-week × hour heatmap
    qAll<any>(`
      SELECT CAST(strftime('%w', reported_at) AS INTEGER) AS dow,
             CAST(strftime('%H', reported_at) AS INTEGER) AS hour,
             COUNT(*) AS n
      FROM kkri_reports
      WHERE reported_at IS NOT NULL
      GROUP BY dow, hour
    `),
    // 12. Geographic concentration per kabupaten
    qAll<any>(`
      SELECT s.kab_kota, REPLACE(s.provinsi, 'PROV. ', '') AS provinsi,
             COUNT(DISTINCT r.id) AS n_laporan,
             COUNT(DISTINCT r.user_id) AS n_pembina,
             COUNT(DISTINCT r.sekolah_npsn) AS n_sekolah
      FROM kkri_reports r LEFT JOIN fact_satpen_dikmen s ON s.npsn = r.sekolah_npsn
      WHERE s.kab_kota IS NOT NULL
      GROUP BY s.kab_kota, s.provinsi
      ORDER BY n_laporan DESC LIMIT 50
    `),
    // 13. Raw rows for sankey (top kodam → kodim → status)
    qAll<any>(`
      SELECT
        COALESCE(kd.name, 'Tidak terklasifikasi') AS kodam_name,
        COALESCE(k.name, 'Tidak terklasifikasi') AS kodim_name,
        kd.kodam_id, k.kodim_id,
        r.status,
        COUNT(*) AS n
      FROM kkri_reports r
      LEFT JOIN dim_kodim k ON k.kodim_id = r.unit_id
      LEFT JOIN dim_kodam kd ON kd.kodam_id = COALESCE(
        k.kodam_id,
        (SELECT kodam_id FROM dim_korem WHERE korem_id = r.unit_id),
        r.unit_id
      )
      WHERE r.unit_id IS NOT NULL
      GROUP BY kodam_name, kodim_name, r.status
    `),
    // 14. Users + reports for pangkat × status crosstab
    qAll<any>(`
      SELECT u.full_name, u.role, r.status
      FROM kkri_reports r INNER JOIN kkri_users u ON u.id = r.user_id
      WHERE u.deleted_at IS NULL
    `),
  ]);

  // ─── JS-side derivations ────────────────────────────────────

  // Avg laporan per pembina
  const avgPerPembina = (hero?.total_pembina ?? 0) > 0
    ? Math.round((hero?.total_laporan ?? 0) / hero!.total_pembina * 10) / 10
    : 0;

  // Trend weekly (laporan + peserta)
  const weekMap = new Map<string, { laporan: number; peserta: number; samples: number[] }>();
  for (const r of reportRowsForTrend) {
    const w = weekStart(r.reported_at);
    const cur = weekMap.get(w) ?? { laporan: 0, peserta: 0, samples: [] };
    cur.laporan++;
    cur.peserta += r.peserta || 0;
    cur.samples.push(r.peserta || 0);
    weekMap.set(w, cur);
  }
  const trend_weekly = Array.from(weekMap.entries())
    .map(([week, v]) => ({ week, laporan: v.laporan, peserta: v.peserta }))
    .sort((a, b) => a.week.localeCompare(b.week));

  // Candlestick: last 3 months only (more visible)
  const cutoff = new Date(Date.now() - 90 * 86400 * 1000).toISOString().slice(0, 10);
  const candlestick_weekly_peserta = Array.from(weekMap.entries())
    .filter(([w]) => w >= cutoff)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([week, v]) => {
      const s = v.samples;
      return {
        date: week,
        open: s[0] ?? 0,
        close: s[s.length - 1] ?? 0,
        high: s.length ? Math.max(...s) : 0,
        low: s.length ? Math.min(...s) : 0,
      };
    });

  // Sankey: top 5 kodam → their kodim → status
  const sankey = buildSankey(sankeyRawRows);

  // Treemap pangkat × role
  const treemapMap = new Map<string, Map<string, number>>();
  for (const u of (await qAll<{ full_name: string; role: string }>(`
    SELECT full_name, role FROM kkri_users WHERE deleted_at IS NULL
  `))) {
    const p = extractPangkat(u.full_name);
    if (!treemapMap.has(p)) treemapMap.set(p, new Map());
    const inner = treemapMap.get(p)!;
    inner.set(u.role, (inner.get(u.role) ?? 0) + 1);
  }
  const treemap_pangkat_role = Array.from(treemapMap.entries())
    .map(([pangkat, roleMap]) => ({
      name: pangkat,
      children: Array.from(roleMap.entries()).map(([role, n]) => ({ name: role, value: n })),
    }))
    .sort((a, b) => b.children.reduce((s, c) => s + c.value, 0) - a.children.reduce((s, c) => s + c.value, 0));

  // Pangkat × status crosstab
  const pangkatMap = new Map<string, { submitted: number; reviewed: number; approved: number; rejected: number; total: number }>();
  for (const r of usersWithReports) {
    const p = extractPangkat(r.full_name);
    const cur = pangkatMap.get(p) ?? { submitted: 0, reviewed: 0, approved: 0, rejected: 0, total: 0 };
    if (r.status === "submitted") cur.submitted++;
    else if (r.status === "reviewed") cur.reviewed++;
    else if (r.status === "approved") cur.approved++;
    else if (r.status === "rejected") cur.rejected++;
    cur.total++;
    pangkatMap.set(p, cur);
  }
  const pangkat_status = Array.from(pangkatMap.entries())
    .map(([pangkat, v]) => ({ pangkat, ...v }))
    .sort((a, b) => b.total - a.total);

  // Round avg_peserta in bubble data
  const pembina_bubble = pembinaForBubble.map(p => ({
    ...p,
    avg_peserta: Math.round((p.avg_peserta ?? 0) * 10) / 10,
  }));

  return {
    hero: {
      ...hero!,
      avg_per_pembina: avgPerPembina,
    },
    by_role: byRoleRows,
    by_status: byStatusRows,
    by_bentuk: byBentukRows,
    by_provinsi_sekolah: byProvRows,
    trend_weekly,
    candlestick_weekly_peserta,
    sankey_kodam_kodim_status: sankey,
    treemap_pangkat_role,
    pembina_bubble,
    gps_scatter: gpsRows,
    top_pembina: topPembinaRows,
    top_kodim: topKodimRows,
    pangkat_status,
    dow_hour_heatmap: dowHourRows,
    geographic_kab: geoKabRows,
  };
}

// Sankey builder: top 5 kodam by total laporan → their kodim → status
function buildSankey(rows: any[]) {
  const kodamTotals = new Map<string, number>();
  for (const r of rows) kodamTotals.set(r.kodam_name, (kodamTotals.get(r.kodam_name) ?? 0) + r.n);
  const top5 = Array.from(kodamTotals.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([k]) => k);
  const topSet = new Set(top5);

  const STATUS_LABEL: Record<string, string> = {
    submitted: "Pending",
    reviewed: "Reviewed",
    approved: "Approved",
    rejected: "Rejected",
  };

  const nodes: { id: string; label: string; level: 0 | 1 | 2 }[] = [];
  const seen = new Set<string>();
  const addNode = (id: string, label: string, level: 0 | 1 | 2) => {
    if (seen.has(id)) return;
    seen.add(id);
    nodes.push({ id, label, level });
  };

  // Aggregate kodam → kodim and kodim → status separately to keep diagram balanced
  const kodamKodimMap = new Map<string, number>();      // "kodam|kodim" → n
  const kodimStatusMap = new Map<string, number>();     // "kodim|status" → n

  for (const r of rows) {
    if (!topSet.has(r.kodam_name)) continue;
    const kodamId = `KD-${r.kodam_name}`;
    const kodimId = `KM-${r.kodim_name}`;
    const statusId = `ST-${r.status}`;
    addNode(kodamId, r.kodam_name.replace(/^Kodam\s+/, ""), 0);
    addNode(kodimId, r.kodim_name.replace(/^Kodim\s+\d+\//, ""), 1);
    addNode(statusId, STATUS_LABEL[r.status] ?? r.status, 2);
    kodamKodimMap.set(`${kodamId}|${kodimId}`, (kodamKodimMap.get(`${kodamId}|${kodimId}`) ?? 0) + r.n);
    kodimStatusMap.set(`${kodimId}|${statusId}`, (kodimStatusMap.get(`${kodimId}|${statusId}`) ?? 0) + r.n);
  }

  const links: { source: string; target: string; value: number }[] = [];
  for (const [k, v] of kodamKodimMap.entries()) {
    const [source, target] = k.split("|");
    links.push({ source, target, value: v });
  }
  for (const [k, v] of kodimStatusMap.entries()) {
    const [source, target] = k.split("|");
    links.push({ source, target, value: v });
  }

  return { nodes, links };
}
