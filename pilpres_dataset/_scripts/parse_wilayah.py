"""
Parse wilayah.sql (Kepmendagri No 300.2.2-2138/2025) into a clean kecamatan-level master.
Output: wilayah_master.csv with columns kode_kec, nama_kec, kode_kab, nama_kab, kode_prov, nama_prov
"""
import re
import csv

with open('/home/claude/wilayah.sql', 'r', encoding='utf-8', errors='replace') as f:
    content = f.read()

# Pattern: ('code','name') where name can contain '' as SQL-escaped single quote
# Capture name as anything except ' OR doubled '' (which means escaped ')
pattern = re.compile(r"\(\s*'([\d.]+)'\s*,\s*'((?:[^']|'')*)'\s*\)")
matches = pattern.findall(content)
print(f"Total wilayah rows: {len(matches):,}")

# Build hierarchical maps
provinsi = {}
kabupaten = {}
kecamatan = {}

for code, name in matches:
    # Un-escape SQL double-quoted apostrophes
    name = name.replace("''", "'").strip()
    parts = code.split('.')
    n = len(parts)
    if n == 1:
        provinsi[code] = name
    elif n == 2:
        kabupaten[code] = name
    elif n == 3:
        kecamatan[code] = name

print(f"Provinsi: {len(provinsi)}")
print(f"Kabupaten/Kota: {len(kabupaten)}")
print(f"Kecamatan: {len(kecamatan):,}")

# Build flat CSV at kecamatan grain
out_path = '/home/claude/wilayah_master.csv'
with open(out_path, 'w', newline='', encoding='utf-8') as f:
    w = csv.writer(f)
    w.writerow(['kode_kec', 'nama_kec', 'kode_kab', 'nama_kab', 'kode_prov', 'nama_prov'])
    rows = 0
    for kec_code, kec_name in sorted(kecamatan.items()):
        parts = kec_code.split('.')
        prov_code = parts[0]
        kab_code = '.'.join(parts[:2])
        # KPU SIREKAP uses no-dot 6-digit kecamatan code
        kpu_kec = kec_code.replace('.', '').zfill(6)
        kpu_kab = kab_code.replace('.', '').zfill(4)
        kpu_prov = prov_code.zfill(2)
        w.writerow([kpu_kec, kec_name, kpu_kab,
                    kabupaten.get(kab_code, ''), kpu_prov,
                    provinsi.get(prov_code, '')])
        rows += 1

print(f"Wrote {rows:,} kecamatan rows -> {out_path}")
