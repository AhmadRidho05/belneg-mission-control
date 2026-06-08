import { NextRequest, NextResponse } from "next/server";
import { createClient, type Client } from "@libsql/client";

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

export async function GET(_req: NextRequest, { params }: { params: { npsn: string } }) {
  const npsn = params.npsn.trim();
  if (!/^[A-Z0-9]+$/i.test(npsn)) return NextResponse.json({ error: "invalid npsn" }, { status: 400 });

  const c = client();

  const sekolahRes = await c.execute({
    sql: `
      SELECT
        s.npsn, s.nama, s.alamat, s.desa_kelurahan, s.kecamatan, s.kab_kota,
        REPLACE(s.provinsi, 'PROV. ', '') AS provinsi,
        s.alamat_konsolidasi,
        UPPER(s.status_sekolah) AS status, s.bentuk_pendidikan, s.jenjang_pendidikan,
        s.kementerian_pembina, s.naungan, s.npyp,
        s.no_sk_pendirian, s.tgl_sk_pendirian, s.no_sk_operasional, s.tgl_sk_operasional,
        s.file_sk_operasional_url,
        COALESCE(s.akreditasi, 'BT') AS akreditasi,
        s.luas_tanah, s.akses_internet, s.sumber_listrik,
        s.fax, s.telepon, s.email, s.website, s.operator,
        s.lintang, s.bujur, s.kab_norm,
        s.scraped_at,
        (SELECT kodim_id FROM dim_kodim WHERE kabupaten_norm = s.kab_norm LIMIT 1) AS kodim_id,
        (SELECT name FROM dim_kodim WHERE kabupaten_norm = s.kab_norm LIMIT 1) AS kodim_name,
        (SELECT kd.name FROM dim_kodim k JOIN dim_kodam kd ON kd.kodam_id = k.kodam_id WHERE k.kabupaten_norm = s.kab_norm LIMIT 1) AS kodam_name
      FROM fact_satpen_dikmen s
      WHERE s.npsn = ?
    `,
    args: [npsn],
  });

  if (sekolahRes.rows.length === 0) return NextResponse.json({ error: "not found" }, { status: 404 });
  const toPlain = (row: any, cols: string[]) => {
    const o: any = {}; for (const c of cols) o[c] = row[c]; return o;
  };
  const sekolah: any = toPlain(sekolahRes.rows[0], sekolahRes.columns);

  let yayasan: any = null;
  let naungan: any[] = [];
  if (sekolah.npyp) {
    const yayasanRes = await c.execute({
      sql: `
        SELECT
          npyp, judul, pimpinan, operator, email,
          no_pendirian, tgl_pendirian,
          no_pengesahan_pn_ln, no_sk_badan_hukum, tgl_sk_pengesahan,
          n_sekolah_naungan,
          REPLACE(COALESCE(nama_provinsi, ''), 'PROV. ', '') AS provinsi
        FROM fact_yayasan
        WHERE npyp = ?
      `,
      args: [sekolah.npyp as string],
    });
    yayasan = yayasanRes.rows[0] ? toPlain(yayasanRes.rows[0], yayasanRes.columns) : null;

    const naunganRes = await c.execute({
      sql: `
        SELECT n.npsn, n.nama, n.jenjang, n.kabupaten,
               REPLACE(COALESCE(n.provinsi, ''), 'PROV. ', '') AS provinsi
        FROM fact_yayasan_naungan n
        WHERE n.npyp = ?
        ORDER BY n.nama
      `,
      args: [sekolah.npyp as string],
    });
    naungan = naunganRes.rows.map(r => toPlain(r, naunganRes.columns));
  }

  return NextResponse.json({ sekolah, yayasan, naungan });
}
