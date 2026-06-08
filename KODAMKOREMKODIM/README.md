# Data Hierarki TNI AD — Kodam · Korem · Kodim

Dataset hierarki teritorial TNI Angkatan Darat Indonesia: **21 Kodam**, **47 Korem** (+12 "Berdiri Sendiri"), **356 Kodim**, dengan koordinat geografis dan informasi administratif (kecamatan, kabupaten/kota).

## File yang tersedia

Pilih format yang paling sesuai dengan arsitektur aplikasi Anda:

| File | Format | Baris | Kegunaan |
|------|--------|-------|----------|
| `kodim_hierarchy.csv` | CSV flat (denormalized) | 356 | **Rekomendasi default.** Satu baris per Kodim, semua konteks hierarki ikut. Cocok untuk: tabel, filter, map markers, search. |
| `kodim_hierarchy.json` | JSON nested | 356 | Sama isinya tapi nested. Cocok untuk import langsung di TypeScript/JavaScript. |
| `kodam.csv` | CSV normalized | 21 | Tabel master Kodam dengan `kodam_id`. |
| `korem.csv` | CSV normalized | 59 | Tabel master Korem dengan FK `kodam_id`. |
| `kodim.csv` | CSV normalized | 356 | Tabel master Kodim dengan FK `korem_id` & `kodam_id`. |

**Untuk vibe coding cepat → pakai `kodim_hierarchy.csv` atau `kodim_hierarchy.json`.**
**Untuk relational DB (Supabase, Postgres) → pakai 3 file normalized.**

## Schema — `kodim_hierarchy.csv` (flat)

| Kolom | Tipe | Catatan |
|-------|------|---------|
| `id` | integer | 1–356, unique row identifier |
| `kodam` | string | Nama Kodam (mis. "Kodam I/Bukit Barisan") |
| `kodam_address` | string | Alamat markas Kodam |
| `kodam_lat`, `kodam_lng` | float | Koordinat markas Kodam (WGS84) |
| `korem` | string | Nama Korem atau `"Berdiri Sendiri"` jika Kodim langsung di bawah Kodam |
| `korem_address` | string\|empty | Alamat markas Korem (kosong jika "Berdiri Sendiri") |
| `korem_lat`, `korem_lng` | float\|empty | Koordinat markas Korem |
| `kodim` | string | Nama Kodim (mis. "Kodim 0201/Medan") |
| `kodim_address` | string | Alamat markas Kodim |
| `kodim_lat`, `kodim_lng` | float | Koordinat markas Kodim |
| `kecamatan` | string | Kecamatan tempat markas Kodim berada |
| `kabupaten_kota` | string | Kabupaten/Kota markas Kodim |
| `kecamatan_lat`, `kecamatan_lng` | float | Koordinat kecamatan (= koordinat Kodim sebagai proxy) |

**Catatan: ada 12 Kodim yang reporting langsung ke Kodam tanpa Korem perantara — di file ini ditandai `korem = "Berdiri Sendiri"` dengan field korem_address/lat/lng kosong.**

## Schema — Normalized (3 tabel)

### `kodam.csv` (21 baris)
```
kodam_id, name, address, lat, lng
```
Primary key: `kodam_id` (format `KODAM-01` … `KODAM-21`)

### `korem.csv` (59 baris)
```
korem_id, kodam_id, kodam, name, address, lat, lng
```
- Primary key: `korem_id` (`KOREM-001` … `KOREM-059`)
- Foreign key: `kodam_id` → `kodam.kodam_id`
- Kolom `kodam` (nama) di-include untuk denormalization/convenience

### `kodim.csv` (356 baris)
```
kodim_id, korem_id, kodam_id, kodam, korem, name, address, lat, lng,
kecamatan, kabupaten_kota, kecamatan_lat, kecamatan_lng
```
- Primary key: `kodim_id` (`KODIM-001` … `KODIM-356`)
- Foreign keys: `korem_id` → `korem.korem_id`, `kodam_id` → `kodam.kodam_id`

## Quick start

### TypeScript / JavaScript

```ts
// Option A — load CSV with PapaParse
import Papa from 'papaparse';
const csv = await fetch('/data/kodim_hierarchy.csv').then(r => r.text());
const { data } = Papa.parse(csv, { header: true, dynamicTyping: true });

// Option B — load JSON directly (zero parsing)
import data from './data/kodim_hierarchy.json';
console.log(data[0].kodim.name);  // "Kodim 0201/Medan"
console.log(data[0].kodim.lat);    // 3.5880613
```

### Python

```python
import pandas as pd
df = pd.read_csv('kodim_hierarchy.csv')
df.head()
# Filter by Kodam
medan = df[df['kodam'] == 'Kodam I/Bukit Barisan']
```

### Supabase / Postgres

```sql
CREATE TABLE kodam (kodam_id TEXT PRIMARY KEY, name TEXT, address TEXT, lat NUMERIC, lng NUMERIC);
CREATE TABLE korem (korem_id TEXT PRIMARY KEY, kodam_id TEXT REFERENCES kodam, name TEXT, address TEXT, lat NUMERIC, lng NUMERIC);
CREATE TABLE kodim (kodim_id TEXT PRIMARY KEY, korem_id TEXT REFERENCES korem, kodam_id TEXT REFERENCES kodam, name TEXT, address TEXT, lat NUMERIC, lng NUMERIC, kecamatan TEXT, kabupaten_kota TEXT, kecamatan_lat NUMERIC, kecamatan_lng NUMERIC);
-- Then import via Supabase Dashboard "Import CSV" or psql \copy
```

## Sumber & metodologi

- **Hierarki organisasi**: TNI AD official structure (PDM/PPDM 2024-2025)
- **Koordinat markas**: reverse-geocoded via Google Places API (alamat formal Google Maps)
- **Kode wilayah administratif** (sudah ada di file Excel sumber, removed di file ini): Kepmendagri No 300.2.2-2138 Tahun 2025
- **Lat/Long Kecamatan**: menggunakan koordinat markas Kodim sebagai proxy (Kodim berada di kecamatan tersebut)

## Catatan akurasi

Beberapa Kodim memiliki markas di lokasi yang berbeda dari namanya — sudah dikoreksi di data:

- `Kodim 0207/Simalungun` → markas di Kec. Siantar, **Kab. Simalungun**
- `Kodim 1023/Batulicin` → markas di Kec. Paringin Selatan, **Kab. Balangan**
- `Kodim 1006/Martapura` → Kec. Martapura, **Kab. Banjar (Kalsel)**
- `Kodim 0612/Tasikmalaya` → **Kota** Tasikmalaya (bukan Kab)
- `Kodim 0809/Kediri` → **Kota** Kediri
- `Kodim 0417/Kerinci` → **Kota Sungai Penuh**
- `Kodim 1604/Kupang` → **Kota** Kupang
- `Kodim 1608/Bima` → **Kota** Bima
- `Kodim 1712/Sarmi` → **Kab. Sarmi** (data Google menunjuk kantor perwakilan di Jayapura)
- `Kodim 1808/Manokwari Selatan` → **Kab. Manokwari Selatan** (bukan Kab. Manokwari)

## Encoding & format

- UTF-8 (mendukung karakter Indonesia)
- CSV: comma-separated, double-quote untuk field dengan koma
- Empty cells = NULL (string kosong dalam CSV, `null` dalam JSON)
- Koordinat: WGS84 decimal degrees, 7 desimal (~1 cm presisi)
