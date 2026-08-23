/**
 * ============================================================
 * TNMD API GATEWAY v1.2.1
 * TB NUSANTARA MANAGEMENT DASHBOARD
 * ============================================================
 * READ ONLY
 * Fix: SID SQL must be sent as one-line SQL.
 * Fix: customer pagination and pagination test.
 * ============================================================
 */

const CONFIG = {
  SID_API_URL: 'https://sidretail.id/api',
  PIUTANG_PAGE_SIZE: 100,
  TOP_CUSTOMER_LIMIT: 20,
  MAX_PAGINATION_OFFSET: 100000,
  REQUEST_TIMEOUT_MS: 30000
};

const CUSTOMER_CABANG = [
  'FBR', 'RIMBAL', 'KUKUH', 'TB BEJA', 'BARBEX2', 'HENDRA', 'ITHENG',
  'KURNIA', 'MARTO', 'RHD', 'SUMA', '____2204024', '____2207004', '____2509014'
];

const KATEGORI_PIUTANG = ['TOKO', 'CABANG', 'PARTAI', 'LAIN'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('TNMD - TB Nusantara Management Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getApiKey_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  if (!apiKey) {
    throw new Error('SID_API_KEY belum ditemukan. Buka Project Settings → Script Properties lalu tambahkan SID_API_KEY.');
  }
  return apiKey.trim();
}

function generateTransactionCode_() {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmssSSS');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return 'TNMD' + timestamp + random;
}

function sqlQuote_(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

function escapeSql_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function createSidUrl_(sql, kodeTrx) {
  return [
    CONFIG.SID_API_URL,
    encodeURIComponent(getApiKey_()),
    encodeURIComponent(kodeTrx),
    encodeURIComponent(String(sql).trim().replace(/\s+/g, ' '))
  ].join('/');
}

function requestSid_(sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL tidak boleh kosong.');

  const cleanSql = String(sql).trim().replace(/\s+/g, ' ');
  const kodeTrx = generateTransactionCode_();
  const url = createSidUrl_(cleanSql, kodeTrx);
  let response;

  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    throw new Error('Gagal menghubungi SID Retail API.\n\n' + error.message);
  }

  const httpCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (httpCode < 200 || httpCode >= 300) {
    let preview = responseText || '';
    if (preview.length > 1500) preview = preview.substring(0, 1500) + '\n...';
    throw new Error('SID RETAIL API ERROR\n\nHTTP Status: ' + httpCode + '\n\nSQL:\n' + cleanSql + '\n\nResponse:\n' + preview);
  }

  let sidResponse;
  try {
    sidResponse = JSON.parse(responseText);
  } catch (error) {
    throw new Error('SID Retail mengembalikan response bukan JSON.\n\nHTTP Status: ' + httpCode + '\n\nSQL:\n' + cleanSql + '\n\n' + responseText.substring(0, 1500));
  }

  if (sidResponse && sidResponse.status === 'error') {
    throw new Error('SID Retail SQL ERROR\n\nSQL:\n' + cleanSql + '\n\nResponse:\n' + JSON.stringify(sidResponse));
  }

  return {
    success: true,
    kode_trx: kodeTrx,
    message: null,
    sid_response: sidResponse
  };
}

function extractSidData_(response) {
  return response && response.sid_response && Array.isArray(response.sid_response.data)
    ? response.sid_response.data
    : [];
}

function normalizeCustomer_(value) {
  return String(value || '').trim().toUpperCase();
}

function parseMoney_(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(String(value).trim().replace(/,/g, '')) || 0;
}

function isCustomerCabang_(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);
  return CUSTOMER_CABANG.some(function(item) {
    return normalizeCustomer_(item) === customer;
  });
}

function jenisToKategori_(jenis) {
  switch (String(jenis || '').trim().toUpperCase()) {
    case 'PENJUALAN TOKO': return 'TOKO';
    case 'PENJUALAN CABANG': return 'CABANG';
    case 'PENJUALAN PARTAI': return 'PARTAI';
    case 'PENJUALAN LAIN': return 'LAIN';
    default: return 'LAIN';
  }
}

function getKategoriPiutang_(pelanggan, jenisSid) {
  return isCustomerCabang_(pelanggan) ? 'CABANG' : jenisToKategori_(jenisSid);
}

function createPiutangSummary_() {
  return {
    TOKO: { jumlah_transaksi: 0, total_piutang: 0 },
    CABANG: { jumlah_transaksi: 0, total_piutang: 0 },
    PARTAI: { jumlah_transaksi: 0, total_piutang: 0 },
    LAIN: { jumlah_transaksi: 0, total_piutang: 0 }
  };
}

function sumSummaryField_(summary, field) {
  return KATEGORI_PIUTANG.reduce(function(total, kategori) {
    return total + (summary[kategori][field] || 0);
  }, 0);
}

function normalizePiutangSummary_(data) {
  const result = createPiutangSummary_();
  data.forEach(function(row) {
    const kategori = jenisToKategori_(row.jenis);
    result[kategori].jumlah_transaksi += parseMoney_(row.jumlah_transaksi);
    result[kategori].total_piutang += parseMoney_(row.total_piutang);
  });
  return result;
}

function getPiutangSummaryByJenis_() {
  const sql = 'SELECT jenis, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang FROM penjualan WHERE piutang > 0 GROUP BY jenis';
  return normalizePiutangSummary_(extractSidData_(requestSid_(sql)));
}

function getCustomerCabangBreakdown_() {
  const list = CUSTOMER_CABANG.map(sqlQuote_).join(',');
  const sql = 'SELECT jenis, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang FROM penjualan WHERE piutang > 0 AND pelanggan IN (' + list + ') GROUP BY jenis';
  return normalizePiutangSummary_(extractSidData_(requestSid_(sql)));
}

function getPiutangSummaryBusiness_() {
  const baseline = getPiutangSummaryByJenis_();
  const branchBreakdown = getCustomerCabangBreakdown_();
  const result = createPiutangSummary_();

  KATEGORI_PIUTANG.forEach(function(kategori) {
    result[kategori] = {
      jumlah_transaksi: baseline[kategori].jumlah_transaksi,
      total_piutang: baseline[kategori].total_piutang
    };
  });

  KATEGORI_PIUTANG.forEach(function(kategori) {
    if (kategori === 'CABANG') return;
    result[kategori].jumlah_transaksi -= branchBreakdown[kategori].jumlah_transaksi;
    result[kategori].total_piutang -= branchBreakdown[kategori].total_piutang;
    result.CABANG.jumlah_transaksi += branchBreakdown[kategori].jumlah_transaksi;
    result.CABANG.total_piutang += branchBreakdown[kategori].total_piutang;
  });

  return {
    summary: result,
    baseline_sid: baseline,
    customer_cabang: branchBreakdown
  };
}

function getJumlahPelangganPiutang_() {
  const sql = 'SELECT COUNT(DISTINCT pelanggan) AS jumlah_pelanggan FROM penjualan WHERE piutang > 0';
  const data = extractSidData_(requestSid_(sql));
  return data.length ? parseMoney_(data[0].jumlah_pelanggan) : 0;
}

function getTopPiutangCustomer_() {
  const sql = 'SELECT pelanggan, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang FROM penjualan WHERE piutang > 0 GROUP BY pelanggan ORDER BY SUM(piutang) DESC LIMIT ' + CONFIG.TOP_CUSTOMER_LIMIT;
  return extractSidData_(requestSid_(sql)).map(function(row) {
    const pelanggan = normalizeCustomer_(row.pelanggan);
    return {
      pelanggan: pelanggan,
      kategori: isCustomerCabang_(pelanggan) ? 'CABANG' : 'NON-CABANG',
      jumlah_transaksi: parseMoney_(row.jumlah_transaksi),
      total_piutang: parseMoney_(row.total_piutang)
    };
  });
}

function getDashboardPiutang() {
  const business = getPiutangSummaryBusiness_();
  const summaryBusiness = business.summary;
  const summaryJenis = business.baseline_sid;
  const cabangBreakdown = business.customer_cabang;
  const totalTransaksi = sumSummaryField_(summaryBusiness, 'jumlah_transaksi');
  const totalPiutang = sumSummaryField_(summaryBusiness, 'total_piutang');
  const baselineTransaksi = sumSummaryField_(summaryJenis, 'jumlah_transaksi');
  const baselinePiutang = sumSummaryField_(summaryJenis, 'total_piutang');

  return {
    success: true,
    generated_at: new Date().toISOString(),
    total: {
      transaksi: totalTransaksi,
      piutang: totalPiutang,
      jumlah_customer: getJumlahPelangganPiutang_()
    },
    kategori: summaryBusiness,
    top_customer: getTopPiutangCustomer_(),
    audit: {
      baseline_sid: { transaksi: baselineTransaksi, piutang: baselinePiutang },
      final_dashboard: { transaksi: totalTransaksi, piutang: totalPiutang },
      selisih: { transaksi: totalTransaksi - baselineTransaksi, piutang: totalPiutang - baselinePiutang },
      summary_jenis_sid: summaryJenis,
      customer_cabang: cabangBreakdown,
      piutang_cabang_mapping: {
        jumlah_transaksi: sumSummaryField_(cabangBreakdown, 'jumlah_transaksi'),
        total_piutang: sumSummaryField_(cabangBreakdown, 'total_piutang')
      }
    },
    konfigurasi_cabang: CUSTOMER_CABANG
  };
}

/**
 * Membuat SQL pagination SID dalam SATU BARIS.
 * Ini sengaja tidak menggunakan template literal multiline karena SID
 * pada pengujian sebelumnya menganggap baris SQL berikutnya sebagai command.
 */
function buildCustomerPageSql_(pelanggan, pageSize, offset) {
  const customer = normalizeCustomer_(pelanggan);
  const limit = Number(pageSize);
  const safeOffset = Number(offset);

  if (!customer) throw new Error('Kode pelanggan wajib diisi.');
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('pageSize harus antara 1 sampai 100.');
  if (!Number.isInteger(safeOffset) || safeOffset < 0) throw new Error('offset tidak valid.');

  return 'SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan=' + sqlQuote_(customer) + ' LIMIT ' + limit + ' OFFSET ' + safeOffset;
}

function getPiutangCustomerPage_(pelanggan, offset, pageSize) {
  const customer = normalizeCustomer_(pelanggan);
  const limit = Number(pageSize || CONFIG.PIUTANG_PAGE_SIZE);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql = buildCustomerPageSql_(customer, limit, safeOffset);
  const rawData = extractSidData_(requestSid_(sql));

  const data = rawData.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || customer,
      jenis: row.jenis || '',
      piutang: parseMoney_(row.piutang)
    };
  });

  const active = data.filter(function(row) { return row.piutang > 0; });

  return {
    success: true,
    pelanggan: customer,
    offset: safeOffset,
    page_size: limit,
    jumlah_data: data.length,
    jumlah_piutang: active.length,
    total_piutang: active.reduce(function(total, row) { return total + row.piutang; }, 0),
    transaksi_pertama: data.length ? data[0].kode : null,
    transaksi_terakhir: data.length ? data[data.length - 1].kode : null,
    data: active
  };
}

function getPiutangCustomer(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);
  if (!customer) throw new Error('Kode pelanggan wajib diisi.');

  const pageSize = CONFIG.PIUTANG_PAGE_SIZE;
  let offset = 0;
  const semuaTransaksi = [];
  const halaman = [];

  while (true) {
    const page = getPiutangCustomerPage_(customer, offset, pageSize);
    halaman.push({
      offset: page.offset,
      jumlah_data: page.jumlah_data,
      jumlah_piutang: page.jumlah_piutang,
      total_piutang: page.total_piutang,
      transaksi_pertama: page.transaksi_pertama,
      transaksi_terakhir: page.transaksi_terakhir
    });
    semuaTransaksi.push.apply(semuaTransaksi, page.data);

    if (page.jumlah_data < pageSize) break;
    offset += pageSize;
    if (offset > CONFIG.MAX_PAGINATION_OFFSET) {
      throw new Error('Pagination berhenti karena melewati safety limit ' + CONFIG.MAX_PAGINATION_OFFSET + ' record.');
    }
  }

  const kategoriMap = {};
  semuaTransaksi.forEach(function(row) {
    const kategori = getKategoriPiutang_(row.pelanggan, row.jenis);
    if (!kategoriMap[kategori]) kategoriMap[kategori] = { jumlah_transaksi: 0, total_piutang: 0 };
    kategoriMap[kategori].jumlah_transaksi++;
    kategoriMap[kategori].total_piutang += row.piutang;
  });

  return {
    success: true,
    pelanggan: customer,
    kategori: isCustomerCabang_(customer) ? 'CABANG' : null,
    summary: {
      jumlah_transaksi: semuaTransaksi.length,
      total_piutang: semuaTransaksi.reduce(function(total, row) { return total + row.piutang; }, 0)
    },
    kategori_detail: kategoriMap,
    pagination: {
      page_size: pageSize,
      jumlah_halaman: halaman.length,
      jumlah_record_raw: halaman.reduce(function(total, page) { return total + page.jumlah_data; }, 0)
    },
    halaman: halaman,
    transaksi: semuaTransaksi
  };
}

function getPiutangCustomerPage(pelanggan, offset) {
  return getPiutangCustomerPage_(pelanggan, offset, CONFIG.PIUTANG_PAGE_SIZE);
}

function getCustomerByKode(kode) {
  const customer = normalizeCustomer_(kode);
  const sql = 'SELECT kode,nama,telp,saldo_piutang,saldo_tabungan,max_piutang,saldo_hutang FROM pelanggan WHERE kode=' + sqlQuote_(customer) + ' LIMIT 1';
  const data = extractSidData_(requestSid_(sql));
  return { success: true, pelanggan: customer, ditemukan: data.length > 0, data: data.length ? data[0] : null };
}

function getPelangganPiutangMaster() {
  const sql = 'SELECT kode,nama,telp,saldo_piutang,max_piutang FROM pelanggan WHERE saldo_piutang > 0 ORDER BY saldo_piutang DESC LIMIT 100';
  return { success: true, module: 'pelanggan_piutang_master', result: requestSid_(sql).sid_response };
}

function getBarang() {
  const sql = 'SELECT kode,nama FROM barang';
  return { success: true, module: 'barang', result: requestSid_(sql).sid_response };
}

function getBarangSample() {
  const sql = 'SELECT * FROM barang LIMIT 1';
  return { success: true, module: 'barang_sample', result: requestSid_(sql).sid_response };
}

function getPelanggan() {
  const sql = 'SELECT kode,nama,telp,saldo_piutang,saldo_tabungan,max_piutang FROM pelanggan';
  return { success: true, module: 'pelanggan', result: requestSid_(sql).sid_response };
}

/* ========================= TESTS ========================= */

function testSidConnection() {
  return runTest_('testSidConnection', function() {
    const sql = 'SELECT 1 AS sid_test';
    const response = requestSid_(sql);
    return {
      kode_trx: response.kode_trx,
      sid_status: response.sid_response.status,
      data: extractSidData_(response)
    };
  });
}

function testCustomerMapping() {
  return runTest_('testCustomerMapping', function() {
    const checks = CUSTOMER_CABANG.map(function(customer) {
      return { pelanggan: customer, kategori: isCustomerCabang_(customer) ? 'CABANG' : 'NON-CABANG' };
    });
    return {
      jumlah_konfigurasi: CUSTOMER_CABANG.length,
      checks: checks,
      semua_cabang: checks.every(function(row) { return row.kategori === 'CABANG'; })
    };
  });
}

function testCustomerPage() {
  return runTest_('testCustomerPage', function() {
    return getPiutangCustomerPage_('FBR', 0, 100);
  });
}

function testCustomerPagination() {
  return runTest_('testCustomerPagination', function() {
    const customer = 'FBR';
    const expectedPiutang = 203200000;
    const pageSize = CONFIG.PIUTANG_PAGE_SIZE;
    let offset = 0;
    let pages = [];
    let allRows = [];
    let guard = 0;

    while (true) {
      guard++;
      if (guard > 1000) throw new Error('Pagination guard berhenti setelah 1000 halaman.');

      const page = getPiutangCustomerPage_(customer, offset, pageSize);
      pages.push(page);
      allRows = allRows.concat(page.data);

      if (page.jumlah_data < pageSize) break;
      offset += pageSize;
      if (offset > CONFIG.MAX_PAGINATION_OFFSET) throw new Error('Pagination melewati safety limit.');
    }

    const kodeSeen = {};
    const duplicateKode = [];
    allRows.forEach(function(row) {
      if (!row.kode) return;
      if (kodeSeen[row.kode]) duplicateKode.push(row.kode);
      kodeSeen[row.kode] = true;
    });

    const totalPiutang = allRows.reduce(function(total, row) { return total + row.piutang; }, 0);
    const status = totalPiutang === expectedPiutang && duplicateKode.length === 0;

    return {
      pelanggan: customer,
      jumlah_page: pages.length,
      total_raw: pages.reduce(function(total, page) { return total + page.jumlah_data; }, 0),
      jumlah_transaksi_aktif: allRows.length,
      total_piutang: totalPiutang,
      expected_piutang: expectedPiutang,
      selisih_piutang: totalPiutang - expectedPiutang,
      duplicate_count: duplicateKode.length,
      duplicate_kode: duplicateKode,
      pages: pages.map(function(page) {
        return {
          offset: page.offset,
          jumlah_data: page.jumlah_data,
          jumlah_piutang: page.jumlah_piutang,
          total_piutang: page.total_piutang,
          transaksi_pertama: page.transaksi_pertama,
          transaksi_terakhir: page.transaksi_terakhir
        };
      }),
      status: status ? 'PASS' : 'FAIL'
    };
  });
}

function testDashboardPiutang() {
  return runTest_('testDashboardPiutang', function() {
    return getDashboardPiutang();
  });
}

function testDashboardReconciliation() {
  return runTest_('testDashboardReconciliation', function() {
    const dashboard = getDashboardPiutang();
    const selisih = dashboard.audit.selisih;
    return {
      ok: selisih.transaksi === 0 && selisih.piutang === 0,
      selisih_transaksi: selisih.transaksi,
      selisih_piutang: selisih.piutang
    };
  });
}

function runTest_(testName, callback) {
  const started = new Date().getTime();
  try {
    return {
      success: true,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: new Date().getTime() - started,
      result: callback()
    };
  } catch (error) {
    return {
      success: false,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: new Date().getTime() - started,
      error: error && error.message ? error.message : String(error)
    };
  }
}
