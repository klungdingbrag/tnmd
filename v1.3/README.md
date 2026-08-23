# TNMD v1.3

## Tujuan
TNMD v1.3 adalah tahap refactoring setelah TNMD v1.2 berhasil mencapai reconciliation:

- selisih transaksi = 0
- selisih piutang = 0

v1.3 **belum mengubah logika bisnis piutang yang sudah tervalidasi**. Fokusnya adalah membuat arsitektur lebih stabil, ringan, mudah dites, dan siap dikembangkan.

## Prinsip
1. READ ONLY terhadap SID Retail.
2. Tidak mengubah data SID Retail.
3. v1.2 tetap menjadi baseline/rollback reference.
4. Query berat tidak dijalankan berulang-ulang oleh UI.
5. Semua fungsi test harus mengembalikan object JSON yang dapat dibaca.
6. Business mapping customer cabang tetap eksplisit.
7. Reconciliation wajib tetap 0 sebelum release.

## Arsitektur target

SID Retail API
    |
    v
Data Access Layer
    |
    v
Piutang Snapshot / Cache
    |
    +--> Business Mapping
    |       +--> TOKO
    |       +--> CABANG
    |       +--> PARTAI
    |       +--> LAIN
    |
    v
Dashboard / Customer Detail

## Perubahan utama

### 1. Data Access Layer
Semua komunikasi SID dipusatkan pada helper API. Fungsi bisnis tidak membuat request HTTP sendiri.

### 2. Snapshot
Dashboard akan menggunakan snapshot hasil pengambilan data yang tervalidasi, sehingga refresh UI tidak selalu melakukan query agregasi berat ke SID.

### 3. Business Mapping
Customer berikut tetap diperlakukan sebagai CABANG berdasarkan kebijakan bisnis TB Nusantara:

FBR, RIMBAL, KUKUH, TB BEJA, BARBEX2, HENDRA, ITHENG, KURNIA, MARTO, RHD, SUMA, ____2204024, ____2207004, ____2509014.

### 4. Test Harness
Setiap test menghasilkan format konsisten:

```json
{
  "test": "nama_test",
  "success": true,
  "result": {},
  "errors": []
}
```

### 5. Audit
Setiap snapshot dashboard harus menyimpan baseline SID, hasil mapping, hasil akhir dashboard, dan selisih.

## Release gate
v1.3 hanya dianggap siap apabila:

- API test PASS
- dashboard test PASS
- reconciliation transaksi = 0
- reconciliation piutang = 0
- mapping CABANG PASS
- FBR detail PASS
- pagination PASS
- tidak ada query 504 pada skenario normal

## Status
IN DEVELOPMENT — belum untuk production.
