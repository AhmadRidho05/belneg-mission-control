"""
Extract Pilpres 2019 kecamatan-level results from KawalPemilu data tree.

Tree structure:
  depth 0 = National (id=0)
  depth 1 = Province (children of root)
  depth 2 = Kabupaten/Kota (children of province)
  depth 3 = Kecamatan (children of kabupaten)
  depth 4 = Kelurahan/Desa (children of kecamatan)
  depth 5 = TPS (leaf)

A node's `kpu` field contains the FINAL OFFICIAL KPU results aggregated for each
of its direct children. So to get kecamatan-level data, we read kabupaten nodes
(depth 2) — their `kpu` dict is keyed by kecamatan-id with vote totals.

Paslon mapping 2019:
  pas1 = Jokowi Widodo - Ma'ruf Amin
  pas2 = Prabowo Subianto - Sandiaga Uno

Output: pilpres_2019_kecamatan.csv
Columns: kode_kec, nama_kec, kode_kab, nama_kab, kode_prov, nama_prov,
         votes_jokowi, votes_prabowo, suara_sah, suara_tidak_sah, suara_total
"""
import json
import csv
import re
from pathlib import Path

DUMP = Path('/home/claude/kp2019_dump/c')
WILAYAH = Path('/home/claude/wilayah_master.csv')

# Manual overrides for kecamatan with naming changes 2019 -> 2025 master.
# Key: (province_norm, kabupaten_norm, kecamatan_norm) AFTER normalize() applied.
# Note: normalize() strips 'kabupaten'/'kota' prefixes, so 'KOTA PEKANBARU' -> 'pekanbaru'.
MANUAL_OVERRIDES = {
    # STM = "Sinembah Tanjung Muda" (abbreviation expanded in newer master)
    ('sumaterautara', 'deliserdang', 'stmhilir'): '120708',
    ('sumaterautara', 'deliserdang', 'stmhulu'): '120720',
    # Spelling normalisation Sarik <-> Sariak
    ('sumaterabarat', 'padangpariaman', 'viikotosungaisarik'): '130505',
    ('sumaterabarat', 'padangpariaman', 'vkotokampungdalam'): '130503',
    ('sumaterabarat', 'padangpariaman', 'padangsago'): '130511',
    # "IV Angkat Candung" -> "Ampek Angkek"
    ('sumaterabarat', 'agam', 'ivangkatcandung'): '130607',
    # Pekanbaru kecamatan changes: Tampan & Rumbai Pesisir split.
    # Map to closest current kecamatan; vote totals here represent the
    # 2019 super-kecamatan, not the smaller 2025 unit.
    ('riau', 'pekanbaru', 'tampan'): '147108',          # -> Binawidya (closest)
    ('riau', 'pekanbaru', 'rumbaipesisir'): '147115',   # -> Rumbai Timur
    # Pelabai (Lebong) was renamed
    ('bengkulu', 'lebong', 'pelabai'): '170902',
    # Lepar Pongok -> Lepar
    ('kepulauanbangkabelitung', 'bangkaselatan', 'leparpongok'): '190302',
    # Purwonegoro -> Purwanegara
    ('jawatengah', 'banjarnegara', 'purwonegoro'): '330404',
    # Manggarai Timur: Poco Ranaka split into Lamba Leda area
    ('nusatenggaratimur', 'manggaraitimur', 'pocoranaka'): '531903',       # -> Lamba Leda
    ('nusatenggaratimur', 'manggaraitimur', 'pocoranakatimur'): '531908',  # -> Lamba Leda Timur
    # Sepang Simin -> Sepang
    ('kalimantantengah', 'gunungmas', 'sepangsimin'): '621001',
    # Maluku Barat Daya - heavily split kecamatans
    ('maluku', 'malukubaratdaya', 'moalakor'): '810801',
    ('maluku', 'malukubaratdaya', 'mndonahiera'): '810807',
    ('maluku', 'malukubaratdaya', 'wetar'): '810804',
    ('maluku', 'malukubaratdaya', 'pulaupulauterselatan'): '810803',
    # Maluku Tenggara Barat -> renamed/restructured
    ('maluku', 'malukutenggarabarat', 'yaru'): '810511',
    # Pulau Moti -> Moti
    ('malukuutara', 'ternate', 'pulaumoti'): '827104',
}


import difflib

def fuzzy_match(target_norm: str, candidates: list, threshold: float = 0.75):
    """Find closest match in candidates list (each is a wilayah row).
    Returns row if good match else None."""
    best = None
    best_score = 0.0
    for c in candidates:
        cn = normalize(c['nama_kec'])
        if not cn or not target_norm:
            continue
        score = difflib.SequenceMatcher(None, target_norm, cn).ratio()
        if score > best_score:
            best_score = score
            best = c
    if best_score >= threshold:
        return best
    return None


def normalize(s: str) -> str:
    """Normalize a name for fuzzy matching."""
    s = s.lower()
    # strip common admin prefixes
    for prefix in ('kabupaten administrasi', 'kota administrasi', 'kabupaten', 'kota'):
        if s.startswith(prefix + ' '):
            s = s[len(prefix):].strip()
    # remove all non-alphanumeric
    s = re.sub(r'[^a-z0-9]+', '', s)
    return s


def load_wilayah():
    """Build lookup: (kab_name_norm, kec_name_norm) -> (kode_kec, kab info)
    Also kab name -> kode_kab."""
    by_kab_kec = {}      # (kab_norm, kec_norm) -> row
    by_prov_kab_kec = {} # (prov_norm, kab_norm, kec_norm) -> row
    by_kab = {}          # kab_norm -> [rows]
    all_kecs = []        # all rows with prov_norm precomputed
    with open(WILAYAH, encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for r in reader:
            kab_n = normalize(r['nama_kab'])
            kec_n = normalize(r['nama_kec'])
            prov_n = normalize(r['nama_prov'])
            r['prov_norm'] = prov_n
            r['kab_norm'] = kab_n
            r['kec_norm'] = kec_n
            by_kab_kec[(kab_n, kec_n)] = r
            by_prov_kab_kec[(prov_n, kab_n, kec_n)] = r
            by_kab.setdefault(kab_n, []).append(r)
            all_kecs.append(r)
    return by_kab_kec, by_prov_kab_kec, by_kab, all_kecs


def read_json(node_id):
    p = DUMP / f'{node_id}.json'
    if not p.exists():
        return None
    with open(p) as f:
        return json.load(f)


def aggregate_2019():
    by_kab_kec, by_prov_kab_kec, by_kab, all_kecs = load_wilayah()
    print(f"Wilayah lookup: {len(by_kab_kec):,} (kab, kec) pairs, {len(by_kab):,} kab")

    rows_out = []
    matched_count = 0
    unmatched = []

    root = read_json(0)
    if root is None:
        raise RuntimeError("Could not read 0.json (root)")

    # children is list of [id, name, ...numbers]
    for prov_entry in root.get('children', []):
        prov_id = prov_entry[0]
        prov_name = prov_entry[1]
        if prov_id < 0:
            continue   # luar negeri, skip for kecamatan-level domestic data
        prov_node = read_json(prov_id)
        if prov_node is None:
            print(f"  WARN: province {prov_name} ({prov_id}) missing")
            continue
        prov_norm = normalize(prov_name)

        for kab_entry in prov_node.get('children', []):
            kab_id = kab_entry[0]
            kab_name = kab_entry[1]
            kab_node = read_json(kab_id)
            if kab_node is None:
                print(f"  WARN: kab {kab_name} ({kab_id}) missing")
                continue
            kab_norm = normalize(kab_name)

            # Build kec_id -> kec_name lookup from children
            kec_id_to_name = {}
            for kec_entry in kab_node.get('children', []):
                kec_id_to_name[kec_entry[0]] = kec_entry[1]

            kpu = kab_node.get('kpu') or {}
            for kec_id_str, votes in kpu.items():
                try:
                    kec_id = int(kec_id_str)
                except ValueError:
                    continue
                kec_name = kec_id_to_name.get(kec_id, '')
                if not kec_name:
                    # try string key too
                    kec_name = kec_id_to_name.get(str(kec_id), '')

                pas1 = votes.get('pas1') or 0  # Jokowi
                pas2 = votes.get('pas2') or 0  # Prabowo
                sah = votes.get('sah') or 0
                tsah = votes.get('tSah') or 0
                jum = votes.get('jum') or 0

                # Match to wilayah master
                kec_norm = normalize(kec_name)
                # 1) Manual override first
                override_code = MANUAL_OVERRIDES.get((prov_norm, kab_norm, kec_norm))
                if override_code:
                    match = next((r for r in all_kecs if r['kode_kec'] == override_code), None)
                else:
                    match = None
                if not match:
                    match = by_prov_kab_kec.get((prov_norm, kab_norm, kec_norm))
                if not match:
                    match = by_kab_kec.get((kab_norm, kec_norm))
                if not match:
                    candidates = by_kab.get(kab_norm, [])
                    match = fuzzy_match(kec_norm, candidates)
                if not match:
                    candidates = [r for r in all_kecs if r['prov_norm'] == prov_norm]
                    match = fuzzy_match(kec_norm, candidates, threshold=0.85)

                if match:
                    matched_count += 1
                    rows_out.append({
                        'kode_kec': match['kode_kec'],
                        'nama_kec': match['nama_kec'],
                        'kode_kab': match['kode_kab'],
                        'nama_kab': match['nama_kab'],
                        'kode_prov': match['kode_prov'],
                        'nama_prov': match['nama_prov'],
                        'votes_jokowi': pas1,
                        'votes_prabowo': pas2,
                        'suara_sah': sah,
                        'suara_tidak_sah': tsah,
                        'suara_total': jum,
                        '_kp_kec_id': kec_id,
                        '_kp_kec_name': kec_name,
                        '_match': 'matched',
                    })
                else:
                    rows_out.append({
                        'kode_kec': '',
                        'nama_kec': kec_name,
                        'kode_kab': '',
                        'nama_kab': kab_name,
                        'kode_prov': '',
                        'nama_prov': prov_name,
                        'votes_jokowi': pas1,
                        'votes_prabowo': pas2,
                        'suara_sah': sah,
                        'suara_tidak_sah': tsah,
                        'suara_total': jum,
                        '_kp_kec_id': kec_id,
                        '_kp_kec_name': kec_name,
                        '_match': 'unmatched',
                    })
                    unmatched.append((prov_name, kab_name, kec_name))

    print(f"\nRows extracted: {len(rows_out):,}")
    print(f"Matched to BPS codes: {matched_count:,}")
    print(f"Unmatched: {len(rows_out) - matched_count:,}")
    if unmatched[:5]:
        print("\nFirst 5 unmatched:")
        for u in unmatched[:5]:
            print(f"  {u}")

    return rows_out


if __name__ == '__main__':
    rows = aggregate_2019()

    # Deduplicate: some 2019 kecamatans got merged into one 2025 kecamatan
    # (e.g., Seberang Ulu I + II -> Seberang Ulu Dua). Sum votes by kode_kec.
    from collections import defaultdict
    merged = {}
    sources = defaultdict(list)
    for r in rows:
        k = r['kode_kec']
        sources[k].append(r['_kp_kec_name'])
        if k not in merged:
            merged[k] = dict(r)
        else:
            for col in ('votes_jokowi','votes_prabowo','suara_sah',
                        'suara_tidak_sah','suara_total'):
                merged[k][col] = int(merged[k][col]) + int(r[col])
    n_merged = sum(1 for v in sources.values() if len(v) > 1)
    print(f"Deduplicated: {n_merged} kode_kec had multiple 2019 source kecamatans (vote totals summed)")

    rows = list(merged.values())
    # Sort by code for clean output
    rows.sort(key=lambda r: r.get('kode_kec') or 'zzz')

    # Final clean CSV (no debug columns)
    out = '/home/claude/pilpres_2019_kecamatan.csv'
    with open(out, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=[
            'kode_kec', 'nama_kec', 'kode_kab', 'nama_kab', 'kode_prov', 'nama_prov',
            'votes_jokowi', 'votes_prabowo', 'suara_sah', 'suara_tidak_sah', 'suara_total',
        ], extrasaction='ignore')
        w.writeheader()
        w.writerows(rows)
    print(f"\nWrote -> {out}  ({len(rows):,} rows)")

    # Audit CSV with original KP names + match status (for debugging/QA)
    audit = '/home/claude/pilpres_2019_kecamatan_audit.csv'
    with open(audit, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=[
            'kode_kec', 'nama_kec', 'kode_kab', 'nama_kab', 'kode_prov', 'nama_prov',
            'votes_jokowi', 'votes_prabowo', 'suara_sah', 'suara_tidak_sah', 'suara_total',
            'kp_kec_names',
        ], extrasaction='ignore')
        w.writeheader()
        for r in rows:
            r['kp_kec_names'] = '; '.join(sources[r['kode_kec']])
            w.writerow(r)
    print(f"Audit  -> {audit}")

    # Sanity check totals
    jok = sum(int(r['votes_jokowi']) for r in rows)
    pra = sum(int(r['votes_prabowo']) for r in rows)
    print(f"\nNational totals (excl. luar negeri):")
    print(f"  Jokowi-Ma'ruf : {jok:>14,}")
    print(f"  Prabowo-Sandi : {pra:>14,}")
    print(f"  Official KPU  : Jokowi 85,607,362  Prabowo 68,650,239 (incl. luar negeri)")
