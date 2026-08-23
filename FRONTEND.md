# TNMD Frontend v1

Frontend awal untuk **TNMD Customer Intelligence Dashboard**.

## Stable API

Frontend menggunakan Web API TNMD **v1.4.1** yang telah melalui internal test dan HTTP contract test.

Base endpoint dikonfigurasi di `assets/js/app.js`.

## Fitur Dashboard v1

- KPI total customer
- Total piutang aktif
- Transaksi aktif
- Total data pages
- Top 5 customer berdasarkan piutang
- Insight konsentrasi piutang
- Customer table
- Search customer
- Filter kategori
- Sorting
- Pagination
- Customer detail drawer
- Loading, empty, dan error states
- Responsive desktop/mobile layout

## Prinsip arsitektur

Frontend **tidak** mengakses SID Retail secara langsung. Jalurnya:

`Frontend → Web API v1.4.1 → Customer Query / Customer Index V2 → SID Retail`

API v1.4.1 diperlakukan sebagai stable contract selama fase UI awal.

## Development next steps

1. Review visual pada GitHub Pages.
2. Uji seluruh interaksi browser terhadap Web API.
3. Rapikan accessibility dan keyboard navigation.
4. Tambahkan customer detail transaction timeline setelah contract endpoint tersedia.
5. Tambahkan production hardening sebelum deployment final.
