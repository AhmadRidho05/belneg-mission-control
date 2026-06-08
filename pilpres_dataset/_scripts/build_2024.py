"""
Aggregate Pilpres 2024 SIREKAP TPS-level data to kecamatan level.
Source: abdshomad/pilpres2024 hasil-tps dump (Feb 28 - Mar 2, 2024 snapshot).

Paslon mapping (Pilpres 2024):
  100025 = Anies Baswedan - Muhaimin Iskandar (paslon 01)
  100026 = Prabowo Subianto - Gibran Rakabuming Raka (paslon 02)
  100027 = Ganjar Pranowo - Mahfud MD (paslon 03)

Note: SIREKAP data is OCR-based from C1 forms at TPS level. The dump captures
the public state as of late Feb/early Mar 2024, when SIREKAP was effectively
paused around 78-82% completion nationally. The data is NOT the final certified
KPU rekapitulasi - that was finalized 20 March 2024 via Berita Acara at PPK level.

Coverage metrics per kecamatan are included so users can assess reliability.
"""
import json
import csv
import os
import subprocess
import shutil
from pathlib import Path
from collections import defaultdict

REPO = Path('/home/claude/abds')
DATA = REPO / 'hasil-tps'
WILAYAH = Path('/home/claude/wilayah_master.csv')
OUT_CSV = Path('/home/claude/pilpres_2024_kecamatan.csv')

PASLON = {'100025': 'anies', '100026': 'prabowo', '100027': 'ganjar'}

# Province codes (Indonesia domestic, excludes 99=luar negeri)
PROVINCES = [
    '11','12','13','14','15','16','17','18','19','21',
    '31','32','33','34','35','36',
    '51','52','53',
    '61','62','63','64','65',
    '71','72','73','74','75','76',
    '81','82',
    '91','92','93','94','95','96',
]


def sparse_checkout(prov):
    """Set sparse-checkout to one province only, then checkout."""
    # Clean any lock files from previous attempts
    git_dir = REPO / '.git'
    for lock in git_dir.rglob('*.lock'):
        try:
            lock.unlink()
        except OSError:
            pass
    try:
        subprocess.run(
            ['git', '-C', str(REPO), 'sparse-checkout', 'set',
             f'hasil-tps/{prov}'],
            check=True, capture_output=True, timeout=60,
        )
    except (subprocess.CalledProcessError, subprocess.TimeoutExpired) as e:
        print(f"  sparse-checkout set failed: {e}")
        return False
    # checkout retries
    for attempt in range(3):
        try:
            subprocess.run(
                ['git', '-C', str(REPO), 'checkout', '--', '.'],
                check=True, capture_output=True, timeout=240,
            )
            return True
        except subprocess.TimeoutExpired:
            print(f"  checkout retry {attempt+1}/3")
        except subprocess.CalledProcessError as e:
            print(f"  checkout error: {e.stderr.decode()[:100]}")
            return False
    return False


def aggregate_province(prov):
    """Walk all TPS json files for one province, aggregate to kecamatan."""
    agg = defaultdict(lambda: {
        'anies': 0, 'prabowo': 0, 'ganjar': 0,
        'suara_sah': 0, 'suara_tidak_sah': 0,
        'pengguna_total_l': 0, 'pengguna_total_p': 0,
        'pemilih_dpt_l': 0, 'pemilih_dpt_p': 0,
        'jumlah_tps': 0, 'tps_dengan_data': 0,
    })
    prov_root = DATA / prov
    if not prov_root.exists():
        return agg
    for path in prov_root.rglob('*.json'):
        tps = path.stem
        if not tps.isdigit() or len(tps) != 13:
            continue
        kec = tps[:6]
        rec = agg[kec]
        rec['jumlah_tps'] += 1
        try:
            with open(path) as f:
                data = json.load(f)
        except Exception:
            continue
        chart = data.get('chart')
        if not chart:
            continue
        # require any vote count present
        has_data = any(isinstance(chart.get(k), (int, float)) for k in PASLON)
        if has_data:
            rec['tps_dengan_data'] += 1
            for pid, key in PASLON.items():
                v = chart.get(pid)
                if isinstance(v, (int, float)):
                    rec[key] += int(v)
            adm = data.get('administrasi') or {}
            for k in ('suara_sah','suara_tidak_sah',
                      'pengguna_total_l','pengguna_total_p',
                      'pemilih_dpt_l','pemilih_dpt_p'):
                v = adm.get(k)
                if isinstance(v, (int, float)):
                    rec[k] += int(v)
    return agg


def load_wilayah():
    by_code = {}
    with open(WILAYAH) as f:
        for r in csv.DictReader(f):
            by_code[r['kode_kec']] = r
    return by_code


def main():
    print(f"Loading wilayah master from {WILAYAH}")
    wilayah = load_wilayah()
    print(f"  {len(wilayah):,} kecamatans in master")

    all_rows = []
    nat_anies = nat_prabowo = nat_ganjar = 0

    for prov in PROVINCES:
        print(f"\n=== Province {prov} ===")
        ok = sparse_checkout(prov)
        if not ok:
            print(f"  checkout FAILED, skipping")
            continue
        agg = aggregate_province(prov)
        n_kec = len(agg)
        prov_anies = sum(r['anies'] for r in agg.values())
        prov_prabowo = sum(r['prabowo'] for r in agg.values())
        prov_ganjar = sum(r['ganjar'] for r in agg.values())
        nat_anies += prov_anies
        nat_prabowo += prov_prabowo
        nat_ganjar += prov_ganjar
        tps_total = sum(r['jumlah_tps'] for r in agg.values())
        tps_data = sum(r['tps_dengan_data'] for r in agg.values())
        cov = (tps_data / tps_total * 100) if tps_total else 0
        print(f"  kec={n_kec}  TPS={tps_total:,} ({cov:.1f}% with data)"
              f"  Anies={prov_anies:,}  Prabowo={prov_prabowo:,}  Ganjar={prov_ganjar:,}")

        # Build rows for this province
        for kec_code, rec in sorted(agg.items()):
            wil = wilayah.get(kec_code)
            if wil:
                row = {
                    'kode_kec': kec_code,
                    'nama_kec': wil['nama_kec'],
                    'kode_kab': wil['kode_kab'],
                    'nama_kab': wil['nama_kab'],
                    'kode_prov': wil['kode_prov'],
                    'nama_prov': wil['nama_prov'],
                }
            else:
                row = {
                    'kode_kec': kec_code,
                    'nama_kec': '',
                    'kode_kab': kec_code[:4],
                    'nama_kab': '',
                    'kode_prov': kec_code[:2],
                    'nama_prov': '',
                }
            row.update({
                'votes_anies': rec['anies'],
                'votes_prabowo': rec['prabowo'],
                'votes_ganjar': rec['ganjar'],
                'suara_sah': rec['suara_sah'],
                'suara_tidak_sah': rec['suara_tidak_sah'],
                'jumlah_tps': rec['jumlah_tps'],
                'tps_dengan_data': rec['tps_dengan_data'],
                'tps_coverage_pct': round(rec['tps_dengan_data']/rec['jumlah_tps']*100, 1) if rec['jumlah_tps'] else 0,
            })
            all_rows.append(row)

    print(f"\n{'='*60}")
    print(f"NATIONAL totals:")
    print(f"  Anies-Muhaimin  : {nat_anies:>12,}")
    print(f"  Prabowo-Gibran  : {nat_prabowo:>12,}")
    print(f"  Ganjar-Mahfud   : {nat_ganjar:>12,}")
    print(f"  Total rows      : {len(all_rows):,}")
    print(f"  Official (incl. luar negeri):")
    print(f"    Anies   40,971,906   Prabowo 96,214,691   Ganjar 27,040,878")
    cov_a = nat_anies/40971906*100 if nat_anies else 0
    cov_p = nat_prabowo/96214691*100 if nat_prabowo else 0
    cov_g = nat_ganjar/27040878*100 if nat_ganjar else 0
    print(f"  Coverage: Anies {cov_a:.1f}%   Prabowo {cov_p:.1f}%   Ganjar {cov_g:.1f}%")

    # Write CSV
    fieldnames = [
        'kode_kec','nama_kec','kode_kab','nama_kab','kode_prov','nama_prov',
        'votes_anies','votes_prabowo','votes_ganjar',
        'suara_sah','suara_tidak_sah',
        'jumlah_tps','tps_dengan_data','tps_coverage_pct',
    ]
    with open(OUT_CSV, 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(all_rows)
    print(f"\nWrote -> {OUT_CSV}")


if __name__ == '__main__':
    main()
