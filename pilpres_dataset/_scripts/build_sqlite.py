"""
Build a single SQLite database combining Pilpres 2019 and 2024 kecamatan data
+ the BPS wilayah master. Designed for vibecoding / Claude API joins.
"""
import sqlite3
import csv

DB = '/home/claude/pilpres_kecamatan.sqlite'
W2019 = '/home/claude/pilpres_2019_kecamatan.csv'
W2024 = '/home/claude/pilpres_2024_kecamatan.csv'
WILAYAH = '/home/claude/wilayah_master.csv'

con = sqlite3.connect(DB)
con.execute('PRAGMA foreign_keys = ON')

# Drop if exist
for t in ('wilayah','pilpres_2019','pilpres_2024'):
    con.execute(f'DROP TABLE IF EXISTS {t}')

# Master wilayah
con.execute('''
CREATE TABLE wilayah (
    kode_kec  TEXT PRIMARY KEY,
    nama_kec  TEXT NOT NULL,
    kode_kab  TEXT NOT NULL,
    nama_kab  TEXT NOT NULL,
    kode_prov TEXT NOT NULL,
    nama_prov TEXT NOT NULL
)
''')
con.execute('CREATE INDEX idx_wilayah_kab ON wilayah(kode_kab)')
con.execute('CREATE INDEX idx_wilayah_prov ON wilayah(kode_prov)')

# 2019
con.execute('''
CREATE TABLE pilpres_2019 (
    kode_kec TEXT PRIMARY KEY,
    votes_jokowi      INTEGER NOT NULL,  -- paslon 01 Jokowi-Ma'ruf
    votes_prabowo     INTEGER NOT NULL,  -- paslon 02 Prabowo-Sandi
    suara_sah         INTEGER NOT NULL,
    suara_tidak_sah   INTEGER NOT NULL,
    suara_total       INTEGER NOT NULL
)
''')

# 2024
con.execute('''
CREATE TABLE pilpres_2024 (
    kode_kec TEXT PRIMARY KEY,
    votes_anies       INTEGER NOT NULL,  -- paslon 01 Anies-Muhaimin
    votes_prabowo     INTEGER NOT NULL,  -- paslon 02 Prabowo-Gibran
    votes_ganjar      INTEGER NOT NULL,  -- paslon 03 Ganjar-Mahfud
    suara_sah         INTEGER NOT NULL,
    suara_tidak_sah   INTEGER NOT NULL,
    jumlah_tps        INTEGER NOT NULL,
    tps_dengan_data   INTEGER NOT NULL,
    tps_coverage_pct  REAL    NOT NULL
)
''')

# Load wilayah
with open(WILAYAH, encoding='utf-8') as f:
    rows = [tuple(r.values()) for r in csv.DictReader(f)]
con.executemany('INSERT INTO wilayah VALUES (?,?,?,?,?,?)', rows)
print(f"wilayah: {len(rows):,}")

# Load 2019
with open(W2019, encoding='utf-8') as f:
    rows = []
    for r in csv.DictReader(f):
        rows.append((
            r['kode_kec'],
            int(r['votes_jokowi']),
            int(r['votes_prabowo']),
            int(r['suara_sah']),
            int(r['suara_tidak_sah']),
            int(r['suara_total']),
        ))
con.executemany('INSERT INTO pilpres_2019 VALUES (?,?,?,?,?,?)', rows)
print(f"pilpres_2019: {len(rows):,}")

# Load 2024
with open(W2024, encoding='utf-8') as f:
    rows = []
    for r in csv.DictReader(f):
        rows.append((
            r['kode_kec'],
            int(r['votes_anies']),
            int(r['votes_prabowo']),
            int(r['votes_ganjar']),
            int(r['suara_sah']),
            int(r['suara_tidak_sah']),
            int(r['jumlah_tps']),
            int(r['tps_dengan_data']),
            float(r['tps_coverage_pct']),
        ))
con.executemany('INSERT INTO pilpres_2024 VALUES (?,?,?,?,?,?,?,?,?)', rows)
print(f"pilpres_2024: {len(rows):,}")

# Convenience view: percentages computed from sum of paslon votes
# (since suara_sah can be lower than sum due to SIREKAP OCR gaps in admin section)
con.execute('''
CREATE VIEW v_2024_pct AS
SELECT
    p.kode_kec,
    w.nama_kec, w.nama_kab, w.nama_prov,
    p.votes_anies, p.votes_prabowo, p.votes_ganjar,
    (p.votes_anies + p.votes_prabowo + p.votes_ganjar) AS total_votes,
    CASE WHEN (p.votes_anies+p.votes_prabowo+p.votes_ganjar) > 0
         THEN ROUND(100.0*p.votes_anies   /(p.votes_anies+p.votes_prabowo+p.votes_ganjar), 2) END AS pct_anies,
    CASE WHEN (p.votes_anies+p.votes_prabowo+p.votes_ganjar) > 0
         THEN ROUND(100.0*p.votes_prabowo /(p.votes_anies+p.votes_prabowo+p.votes_ganjar), 2) END AS pct_prabowo,
    CASE WHEN (p.votes_anies+p.votes_prabowo+p.votes_ganjar) > 0
         THEN ROUND(100.0*p.votes_ganjar  /(p.votes_anies+p.votes_prabowo+p.votes_ganjar), 2) END AS pct_ganjar,
    p.tps_coverage_pct
FROM pilpres_2024 p LEFT JOIN wilayah w USING (kode_kec)
''')

con.execute('''
CREATE VIEW v_2019_pct AS
SELECT
    p.kode_kec,
    w.nama_kec, w.nama_kab, w.nama_prov,
    p.votes_jokowi, p.votes_prabowo,
    (p.votes_jokowi + p.votes_prabowo) AS total_votes,
    CASE WHEN (p.votes_jokowi+p.votes_prabowo) > 0
         THEN ROUND(100.0*p.votes_jokowi /(p.votes_jokowi+p.votes_prabowo), 2) END AS pct_jokowi,
    CASE WHEN (p.votes_jokowi+p.votes_prabowo) > 0
         THEN ROUND(100.0*p.votes_prabowo/(p.votes_jokowi+p.votes_prabowo), 2) END AS pct_prabowo
FROM pilpres_2019 p LEFT JOIN wilayah w USING (kode_kec)
''')

con.commit()

# Quick verification queries
print("\n=== Verification queries ===")
print("\n1) Top 10 kecamatan paling Anies (2024, coverage >=80%, total>5000):")
for r in con.execute('''
    SELECT nama_kab, nama_kec, votes_anies, votes_prabowo, votes_ganjar,
           pct_anies, tps_coverage_pct
    FROM v_2024_pct
    WHERE total_votes > 5000 AND tps_coverage_pct >= 80
    ORDER BY pct_anies DESC LIMIT 10
'''):
    print(f"  {r[0]:<35} {r[1]:<25} A={r[2]:>6,} P={r[3]:>6,} G={r[4]:>6,} (Anies {r[5]}%, cov {r[6]}%)")

print("\n2) Top 10 swing kecamatan (Prabowo % gain 2019->2024, cov>=80%):")
for r in con.execute('''
    SELECT v19.nama_kab, v19.nama_kec, v19.pct_prabowo, v24.pct_prabowo,
           v24.tps_coverage_pct
    FROM v_2019_pct v19 JOIN v_2024_pct v24 USING (kode_kec)
    WHERE v24.tps_coverage_pct >= 80 AND v24.total_votes > 5000
      AND v19.total_votes > 5000
    ORDER BY v24.pct_prabowo - v19.pct_prabowo DESC
    LIMIT 10
'''):
    print(f"  {r[0]:<35} {r[1]:<25} {r[2]}% -> {r[3]}%  (cov {r[4]}%)")

con.close()
print(f"\nDB written: {DB}")
import os
print(f"Size: {os.path.getsize(DB)/1024:.0f} KB")
