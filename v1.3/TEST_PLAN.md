# TNMD v1.3 — Test Plan

## A. Infrastruktur

### A1. Configuration
Expected:
- SID_API_KEY tersedia.
- API URL benar.
- mode READ ONLY.
- page size 100.
- daftar customer cabang berjumlah 14.

### A2. SID connectivity
Test query ringan terlebih dahulu. Jangan langsung menjalankan query seluruh penjualan.

## B. Dashboard

### B1. Baseline SID
Ambil agregasi `piutang > 0` menurut `jenis`.

### B2. Customer cabang breakdown
Ambil agregasi hanya untuk 14 customer cabang.

### B3. Business mapping
Pindahkan transaksi customer cabang dari kategori SID asal ke kategori CABANG.

### B4. Reconciliation
Wajib:

```text
final transaksi - baseline transaksi = 0
final piutang   - baseline piutang   = 0
```

## C. Customer detail

Prioritas:
1. FBR
2. RIMBAL
3. KUKUH
4. TB BEJA

Untuk setiap customer:
- total transaksi piutang
- total piutang
- kategori
- pagination
- transaksi pertama/terakhir

## D. Pagination

Page size default: 100.

Test FBR pada offset:
- 0
- 100
- 200
- 300

Tidak boleh mengandalkan satu query `LIMIT 5000`.

## E. Error handling

Simulasikan/observasi:
- HTTP 504
- HTTP 404
- response non-JSON
- SID status error
- timeout UrlFetchApp
- API key kosong

Error harus dikembalikan sebagai JSON terstruktur dari fungsi test, bukan hanya pesan console.

## F. Release gate

Semua test berikut harus PASS:

```text
[ ] testConfiguration
[ ] testSidConnectivity
[ ] testDashboardPiutang
[ ] testPiutangReconciliation
[ ] testCustomerCabangMapping
[ ] testTopPiutangCustomer
[ ] testPiutangFBRPage0
[ ] testPiutangFBRPage100
[ ] testPiutangFBRPage200
[ ] testPiutangFBRPage300
[ ] testPiutangFBR
[ ] testCustomer2209025
[ ] testCustomer2103002
```

Release v1.3 belum dilakukan sebelum semua gate selesai.
