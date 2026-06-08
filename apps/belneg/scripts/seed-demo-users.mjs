// Populate 200 random demo Pembina KKRI users (with " *" name suffix = dummy
// marker), spread across 200 different units (10 KODAM + 30 KOREM + 160 KODIM).
// Each user gets:
//   - random Indonesian name + military rank (Kapten → Kolonel, sesuai unit level)
//   - 7..25 GPS-tagged reports linked to actual schools in their unit's scope
//   - random submitted_at over the past 12 months
//   - weighted random status (60% approved, 25% submitted, 10% reviewed, 5% rejected)
//
// To wipe all demo data later:
//   DELETE FROM kkri_reports WHERE user_id IN (SELECT id FROM kkri_users WHERE email LIKE '%@kkri.demo');
//   DELETE FROM kkri_users WHERE email LIKE '%@kkri.demo';

import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";

const __dirname = dirname(fileURLToPath(import.meta.url));
const env = readFileSync(resolve(__dirname, "..", ".env.local"), "utf-8");
for (const line of env.split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.+)$/);
  if (m) process.env[m[1]] = m[2];
}

const c = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

// ─── Indonesian name pools ───────────────────────────────────────

const FIRST_NAMES = [
  "Ahmad", "Budi", "Cahyo", "Dimas", "Eko", "Faisal", "Gilang", "Hadi",
  "Indra", "Joko", "Kurnia", "Lukman", "Mulyono", "Nugroho", "Oktavianus",
  "Pranata", "Rama", "Slamet", "Tono", "Untung", "Wahyu", "Yudi", "Zakaria",
  "Agus", "Andi", "Bayu", "Candra", "Dedi", "Erlangga", "Fajar", "Galang",
  "Hendro", "Iwan", "Jaya", "Kresna", "Lutfi", "Mahardika", "Nanda", "Pandu",
  "Reza", "Sapta", "Teguh", "Wibisono", "Yoga", "Adit", "Bagus", "Catur",
  "Danang", "Erwin", "Fadil", "Gunawan", "Hasan", "Ilham", "Jamal", "Karyo",
  "Lazuardi", "Mahesa", "Naufal", "Permadi", "Rangga", "Suryo", "Triyono",
  "Yusuf", "Zulkifli", "Anton", "Bambang", "Chandra", "Daniel", "Edi",
  "Fauzan", "Hartono", "Imam", "Junaedi", "Krisna", "Mardiansyah", "Norman",
];

const LAST_NAMES = [
  "Pratama", "Wijaya", "Susanto", "Setiawan", "Saputra", "Hidayat", "Nugraha",
  "Permana", "Santoso", "Hartanto", "Wibowo", "Mahardika", "Anggara", "Surya",
  "Putra", "Cahyono", "Kusumo", "Rahmat", "Anwar", "Hakim", "Pranoto", "Hasyim",
  "Maulana", "Pranata", "Sukma", "Wiranto", "Ardianto", "Baskoro", "Hardjo",
  "Suryadi", "Kurniawan", "Iskandar", "Sutrisno", "Hamzah", "Effendi", "Latif",
  "Mahendra", "Wicaksono", "Yanto", "Atmadja", "Lesmana", "Sumarna", "Soedirman",
  "Suparman", "Tanjung", "Sembiring", "Sinaga", "Manurung", "Sirait", "Lubis",
  "Harahap", "Pakpahan", "Simbolon", "Panjaitan", "Nasution", "Siregar", "Pohan",
  "Hutapea", "Marpaung", "Tobing", "Damanik", "Hutahaean", "Lumbantobing",
];

// ─── Military ranks (Perwira Pertama → Perwira Menengah) ───────

const KODIM_RANKS = [
  "Kapten Inf.", "Kapten Kav.", "Kapten Arh.", "Kapten Czi.", "Kapten Cba.",
  "Mayor Inf.", "Mayor Kav.", "Mayor Arh.", "Mayor Czi.",
  "Letkol Inf.", "Letkol Kav.", "Letkol Arh.",
];
const KOREM_RANKS = [
  "Letkol Inf.", "Letkol Kav.", "Letkol Arh.", "Letkol Czi.",
  "Kolonel Inf.", "Kolonel Kav.",
];
const KODAM_RANKS = [
  "Kolonel Inf.", "Kolonel Kav.", "Kolonel Arh.", "Kolonel Czi.",
];

// ─── Activity types ─────────────────────────────────────────────

const KEGIATAN = [
  "Latihan Peraturan Baris-Berbaris (PBB)",
  "Penyuluhan Wawasan Kebangsaan",
  "Upacara Bendera Mingguan",
  "Pengarahan Pembentukan Karakter Kadet",
  "Kunjungan Bina Sekolah Binaan",
  "Bimbingan Disiplin Korps Kadet",
  "Materi Bela Negara dan Pancasila",
  "Latihan Survival Lapangan Dasar",
  "Tata Upacara Militer (TUM)",
  "Olahraga Bersama dan Senam Kesegaran",
  "Penyuluhan Anti-Narkoba dan Bahaya Pergaulan",
  "Pembekalan Tata Tertib Sekolah",
  "Bakti Sosial Kadet di Lingkungan Sekolah",
  "Penyerahan Materi Sejarah Perjuangan Bangsa",
  "Pengkaderan Kepemimpinan dan Manajemen Diri",
  "Simulasi Tanggap Bencana",
  "Pelatihan Pertolongan Pertama (P3K)",
  "Diskusi Kelompok Wawasan Nusantara",
  "Pengenalan Alutsista TNI",
  "Lomba Yel-Yel Korps Kadet Antar Kelas",
];

const MATERI_SAMPLES = [
  "Penjelasan dasar empat pilar kebangsaan dan implementasinya.",
  "Praktik PBB tingkat dasar — hadap kanan, hadap kiri, langkah biasa.",
  "Diskusi peran pemuda dalam menjaga kedaulatan NKRI.",
  "Simulasi pertolongan pertama untuk korban pingsan dan luka ringan.",
  "Pengenalan struktur TNI dan kewenangan komando teritorial.",
  "Pembekalan materi bahaya narkoba dan radikalisme.",
  "Pelatihan jiwa korsa dan rasa solidaritas antar anggota.",
  "Latihan tata cara mengibarkan dan menurunkan bendera.",
];

const HASIL_SAMPLES = [
  "Peserta hadir penuh, antusiasme tinggi, materi tersampaikan 100%.",
  "Kegiatan berjalan lancar, peserta menunjukkan disiplin yang baik.",
  "Sebagian peserta perlu pembinaan tambahan terkait sikap dasar.",
  "Target materi tercapai, ada permintaan tindak lanjut dari pihak sekolah.",
  "Peserta menunjukkan peningkatan dibanding sesi sebelumnya.",
  "Suasana kondusif, koordinasi dengan guru pendamping berjalan baik.",
  "Beberapa peserta diminta mengulang gerakan PBB tertentu.",
  "Evaluasi tertulis menunjukkan pemahaman materi rata-rata baik.",
];

const KENDALA_SAMPLES = [
  "",  // most don't have kendala
  "",
  "",
  "Cuaca hujan menyebabkan beberapa kegiatan luar ruangan dipindah indoor.",
  "Lapangan terbatas, kelas dibagi menjadi 2 sesi.",
  "Beberapa peserta absen tanpa keterangan.",
  "Peralatan sound system bermasalah saat upacara.",
  "Koordinasi dengan wali kelas perlu ditingkatkan untuk sesi berikut.",
];

const SITUASI_SAMPLES = [
  "Cuaca cerah, halaman sekolah kering dan luas untuk kegiatan lapangan.",
  "Sekolah sedang ujian, kegiatan disesuaikan agar tidak mengganggu.",
  "Kondisi lapangan basah karena hujan semalam, alas terpasang.",
  "Antusiasme guru pendamping tinggi, ikut serta dalam diskusi.",
  "Lokasi cukup terpencil, akses jalan kurang baik di musim hujan.",
  "Sekolah baru saja renovasi, suasana lebih kondusif untuk pembinaan.",
];

const STATUS_WEIGHTED = [
  ...Array(60).fill("approved"),
  ...Array(25).fill("submitted"),
  ...Array(10).fill("reviewed"),
  ...Array(5).fill("rejected"),
];

// ─── Helpers ─────────────────────────────────────────────────────

const rand = (n) => Math.floor(Math.random() * n);
const pick = (arr) => arr[rand(arr.length)];
const sample = (arr, n) => {
  const a = [...arr];
  const out = [];
  for (let i = 0; i < n && a.length > 0; i++) {
    const idx = rand(a.length);
    out.push(a.splice(idx, 1)[0]);
  }
  return out;
};
const fmtDate = (d) => d.toISOString().replace("T", " ").slice(0, 19);
const slug = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");

async function batchInsert(sql, args, batchSize = 100) {
  let done = 0;
  for (let i = 0; i < args.length; i += batchSize) {
    const batch = args.slice(i, i + batchSize).map(a => ({ sql, args: a }));
    await c.batch(batch, "write");
    done += batch.length;
    process.stdout.write(`\r  ${done.toLocaleString()}/${args.length.toLocaleString()}`);
  }
  process.stdout.write("\n");
}

// ─── 1. Sample units ─────────────────────────────────────────────

console.log("[1/4] Sampling units …");
const allKodam = (await c.execute("SELECT kodam_id AS id, name FROM dim_kodam")).rows;
const allKorem = (await c.execute("SELECT korem_id AS id, name FROM dim_korem WHERE is_berdiri_sendiri = 0")).rows;
const allKodim = (await c.execute("SELECT kodim_id AS id, name FROM dim_kodim")).rows;

const N_KODAM = Math.min(10, allKodam.length);    // 10 of 21
const N_KOREM = Math.min(30, allKorem.length);    // 30 of 47
const N_KODIM = 200 - N_KODAM - N_KOREM;          // 160 of 356

const selectedUnits = [
  ...sample(allKodam, N_KODAM).map(u => ({ id: u.id, role: "KODAM", ranks: KODAM_RANKS, name: u.name })),
  ...sample(allKorem, N_KOREM).map(u => ({ id: u.id, role: "KOREM", ranks: KOREM_RANKS, name: u.name })),
  ...sample(allKodim, N_KODIM).map(u => ({ id: u.id, role: "KODIM", ranks: KODIM_RANKS, name: u.name })),
];

console.log(`  picked ${N_KODAM} KODAM + ${N_KOREM} KOREM + ${N_KODIM} KODIM = ${selectedUnits.length} units`);

// ─── 2. Generate + insert users ──────────────────────────────────

console.log("[2/4] Generating + inserting users …");
const users = selectedUnits.map((unit, idx) => {
  const first = pick(FIRST_NAMES);
  const last = pick(LAST_NAMES);
  const rank = pick(unit.ranks);
  const fullName = `${rank} ${first} ${last} *`;
  const id = `usr_demo_${nanoid(12)}`;
  const email = `${slug(first)}.${slug(last)}.${idx + 1}@kkri.demo`;
  // NRP: 6-digit + 1 letter — TNI style
  const nrp = String(110000 + rand(880000)) + " " + "ABCDEFGH"[rand(8)];
  // Random last_login in last 30 days
  const lastLogin = new Date(Date.now() - rand(30) * 86400 * 1000);
  return {
    id, email, fullName, nrp,
    role: unit.role, unit_id: unit.id, unit_name: unit.name,
    lastLogin,
  };
});

await batchInsert(
  `INSERT INTO kkri_users(id, email, full_name, nrp, role, unit_id, is_active, approved_at, last_login_at) VALUES (?,?,?,?,?,?,1, CURRENT_TIMESTAMP, ?)`,
  users.map(u => [u.id, u.email, u.fullName, u.nrp, u.role, u.unit_id, fmtDate(u.lastLogin)])
);

// ─── 3. Pre-fetch schools per unit (cache to avoid N+1) ─────────

console.log("[3/4] Pre-fetching schools per unit …");
const schoolsPerUnit = new Map();   // unit_id → [{npsn, nama, lintang, bujur}]

// Group units by id for unique school lookup
const uniqueUnitIds = [...new Set(users.map(u => u.unit_id))];

for (const unitId of uniqueUnitIds) {
  let sql;
  if (unitId.startsWith("KODAM-")) {
    sql = `SELECT npsn, nama, lintang, bujur, bentuk_pendidikan AS bentuk
           FROM fact_satpen_dikmen
           WHERE kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE kodam_id = ?)
             AND lintang IS NOT NULL AND bujur IS NOT NULL
             AND lintang BETWEEN -12 AND 7 AND bujur BETWEEN 94 AND 142
           LIMIT 500`;
  } else if (unitId.startsWith("KOREM-")) {
    sql = `SELECT npsn, nama, lintang, bujur, bentuk_pendidikan AS bentuk
           FROM fact_satpen_dikmen
           WHERE kab_norm IN (SELECT kabupaten_norm FROM dim_kodim WHERE korem_id = ?)
             AND lintang IS NOT NULL AND bujur IS NOT NULL
             AND lintang BETWEEN -12 AND 7 AND bujur BETWEEN 94 AND 142
           LIMIT 500`;
  } else {
    sql = `SELECT npsn, nama, lintang, bujur, bentuk_pendidikan AS bentuk
           FROM fact_satpen_dikmen
           WHERE kab_norm = (SELECT kabupaten_norm FROM dim_kodim WHERE kodim_id = ?)
             AND lintang IS NOT NULL AND bujur IS NOT NULL
             AND lintang BETWEEN -12 AND 7 AND bujur BETWEEN 94 AND 142
           LIMIT 500`;
  }
  const r = await c.execute({ sql, args: [unitId] });
  schoolsPerUnit.set(unitId, r.rows);
  process.stdout.write(`\r  units processed: ${schoolsPerUnit.size}/${uniqueUnitIds.length}`);
}
process.stdout.write("\n");

// ─── 4. Generate + insert reports per user ───────────────────────

console.log("[4/4] Generating + inserting reports (7-25 per user) …");
const allReports = [];
const NOW = Date.now();
const YEAR_MS = 365 * 86400 * 1000;

for (const u of users) {
  const schools = schoolsPerUnit.get(u.unit_id) || [];
  if (schools.length === 0) continue;   // skip if no schools (rare)

  const nReports = 7 + rand(19);   // 7..25
  for (let r = 0; r < nReports; r++) {
    const school = pick(schools);
    // Small GPS offset (~50-500m) from school
    const lat = school.lintang + (Math.random() - 0.5) * 0.005;
    const lng = school.bujur + (Math.random() - 0.5) * 0.005;
    const reportedAt = new Date(NOW - rand(YEAR_MS));
    const submittedAt = new Date(reportedAt.getTime() + rand(86400 * 1000));  // up to 1 day after
    const pesertaL = 8 + rand(28);
    const pesertaP = 6 + rand(22);
    const kendala = pick(KENDALA_SAMPLES);

    allReports.push([
      `rpt_demo_${nanoid(14)}`,
      u.id,
      u.unit_id,
      school.npsn,
      pick(KEGIATAN),
      pick(MATERI_SAMPLES),
      pesertaL,
      pesertaP,
      pick(HASIL_SAMPLES),
      kendala || null,
      pick(SITUASI_SAMPLES),
      lat,
      lng,
      fmtDate(reportedAt),
      fmtDate(submittedAt),
      pick(STATUS_WEIGHTED),
    ]);
  }
}

console.log(`  generated ${allReports.length.toLocaleString()} reports`);

await batchInsert(
  `INSERT INTO kkri_reports(
     id, user_id, unit_id, sekolah_npsn, jenis_kegiatan, materi,
     peserta_laki, peserta_perempuan, hasil, kendala, situasi_lapangan,
     lat, lng, reported_at, submitted_at, status
   ) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
  allReports
);

// ─── Verify ──────────────────────────────────────────────────────

console.log("\n✓ Done. Verifying …");
const stats = await c.execute(`
  SELECT 'users' AS t, COUNT(*) AS n FROM kkri_users WHERE email LIKE '%@kkri.demo'
  UNION ALL SELECT 'reports', COUNT(*) FROM kkri_reports WHERE user_id LIKE 'usr_demo_%'
  UNION ALL SELECT 'with_gps', COUNT(*) FROM kkri_reports WHERE user_id LIKE 'usr_demo_%' AND lat IS NOT NULL
  UNION ALL SELECT 'avg_reports_per_user', CAST(ROUND((SELECT COUNT(*) FROM kkri_reports WHERE user_id LIKE 'usr_demo_%') * 1.0 / NULLIF((SELECT COUNT(*) FROM kkri_users WHERE email LIKE '%@kkri.demo'),0)) AS INTEGER)
`);
console.table(stats.rows.map(r => ({ metric: r.t, value: r.n })));

console.log("\n[*] Sample 3 users:");
const samples = await c.execute(`
  SELECT u.full_name, u.role, u.unit_id,
         (SELECT name FROM dim_kodam WHERE kodam_id = u.unit_id) AS kdm,
         (SELECT name FROM dim_korem WHERE korem_id = u.unit_id) AS krm,
         (SELECT name FROM dim_kodim WHERE kodim_id = u.unit_id) AS kdi,
         (SELECT COUNT(*) FROM kkri_reports WHERE user_id = u.id) AS n_reports
  FROM kkri_users u
  WHERE email LIKE '%@kkri.demo'
  ORDER BY RANDOM() LIMIT 3
`);
console.table(samples.rows.map(r => ({
  user: r.full_name,
  unit: r.kdm || r.krm || r.kdi,
  reports: r.n_reports,
})));

await c.close();
console.log("\nDemo seed complete. Lihat dashboard: https://belneg.vercel.app/admin/users");
console.log("Cleanup: DELETE FROM kkri_reports WHERE user_id LIKE 'usr_demo_%'; DELETE FROM kkri_users WHERE email LIKE '%@kkri.demo';");
