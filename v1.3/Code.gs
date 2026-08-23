/**
 * ============================================================
 * TNMD API GATEWAY v1.3
 * TB NUSANTARA MANAGEMENT DASHBOARD
 * ============================================================
 * READ ONLY - Google Apps Script
 *
 * v1.3 goals:
 * - satu pintu untuk SID Retail API
 * - helper kecil dan reusable
 * - mapping bisnis CABANG terpusat
 * - JSON test output selalu tersedia
 * - pagination customer aman
 * - dashboard tetap kompatibel dengan fungsi utama v1.2
 * ============================================================
 */

const CONFIG = Object.freeze({
  SID_API_URL: 'https://sidretail.id/api',
  PIUTANG_PAGE_SIZE: 100,
  TOP_CUSTOMER_LIMIT: 20,
  MAX_PAGINATION_OFFSET: 100000,
  API_TIMEOUT_NOTE: 'SID Retail tidak menyediakan timeout client yang dapat dikontrol secara langsung melalui UrlFetchApp.'
});

const CUSTOMER_CABANG = Object.freeze([
  'FBR', 'RIMBAL', 'KUKUH', 'TB BEJA', 'BARBEX2', 'HENDRA', 'ITHENG',
  'KURNIA', 'MARTO', 'RHD', 'SUMA', '____2204024', '____2207004', '____2509014'
]);

const KATEGORI_PIUTANG = Object.freeze(['TOKO', 'CABANG', 'PARTAI', 'LAIN']);

/* ============================================================
 * WEB APP
 * ============================================================ */

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('TNMD - TB Nusantara Management Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/* ============================================================
 * SID API - SINGLE ACCESS LAYER
 * ============================================================ */

function getApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  if (!key || !String(key).trim()) {
    throw new Error(
      'SID_API_KEY belum ditemukan.\n\n' +
      'Project Settings → Script Properties → SID_API_KEY'
    );
  }
  return String(key).trim();
}

function generateTransactionCode_() {
  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone() || 'Asia/Jakarta',
    'yyyyMMddHHmmssSSS'
  );
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return 'TNMD' + stamp + random;
}

function buildSidUrl_(sql, kodeTrx) {
  return [
    CONFIG.SID_API_URL,
    encodeURIComponent(getApiKey_()),
    encodeURIComponent(kodeTrx),
    encodeURIComponent(sql)
  ].join('/');
}

/**
 * Semua request SID wajib melewati fungsi ini.
 */
function requestSid_(sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL tidak boleh kosong.');

  const kodeTrx = generateTransactionCode_();
  const url = buildSidUrl_(String(sql).trim(), kodeTrx);

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json' }
    });
  } catch (err) {
    throw new Error(
      'Gagal menghubungi SID Retail API.\n\n' +
      'Timeout/network error: ' + err.message
    );
  }

  const httpCode = response.getResponseCode();
  const text = response.getContentText() || '';

  if (httpCode < 200 || httpCode >= 300) {
    throw new Error(
      'SID RETAIL API ERROR\n\n' +
      'HTTP Status: ' + httpCode + '\n\n' +
      'SQL:\n' + sql + '\n\n' +
      'Response:\n' + truncate_(text, 1500)
    );
  }

  let sid;
  try {
    sid = JSON.parse(text);
  } catch (err) {
    throw new Error(
      'SID Retail mengembalikan response bukan JSON.\n\n' +
      'HTTP Status: ' + httpCode + '\n\n' +
      'SQL:\n' + sql + '\n\n' +
      truncate_(text, 1500)
    );
  }

  if (sid && String(sid.status).toLowerCase() === 'error') {
    return {
      success: false,
      kode_trx: kodeTrx,
      message: sid.result || sid.message || 'SID Retail mengembalikan error.',
      sid_response: sid
    };
  }

  return {
    success: true,
    kode_trx: kodeTrx,
    message: null,
    sid_response: sid
  };
}

function extractSidData_(response) {
  return response && response.sid_response && Array.isArray(response.sid_response.data)
    ? response.sid_response.data
    : [];
}

function sidResult_(moduleName, sql, response) {
  return {
    success: !!(response && response.success),
    module: moduleName,
    sql: sql,
    kode_trx: response ? response.kode_trx : null,
    message: response ? response.message : null,
    result: response ? response.sid_response : null
  };
}

/* ============================================================
 * GENERIC HELPERS
 * ============================================================ */

function truncate_(value, maxLength) {
  const text = String(value || '');
  return text.length > maxLength ? text.substring(0, maxLength) + '\n...' : text;
}

function normalizeCustomer_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function parseNumber_(value) {
  if (value == null || value === '') return 0;
  const normalized = String(value).trim().replace(/,/g, '');
  const number = Number(normalized);
  return isFinite(number) ? number : 0;
}

function sqlQuote_(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

function isCustomerCabang_(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);
  return CUSTOMER_CABANG.indexOf(customer) !== -1;
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

function kategoriBisnis_(pelanggan, jenisSid) {
  return isCustomerCabang_(pelanggan) ? 'CABANG' : jenisToKategori_(jenisSid);
}

function emptySummary_() {
  return {
    TOKO: { jumlah_transaksi: 0, total_piutang: 0 },
    CABANG: { jumlah_transaksi: 0, total_piutang: 0 },
    PARTAI: { jumlah_transaksi: 0, total_piutang: 0 },
    LAIN: { jumlah_transaksi: 0, total_piutang: 0 }
  };
}

function sumSummary_(summary, field) {
  return KATEGORI_PIUTANG.reduce(function(total, kategori) {
    return total + parseNumber_(summary[kategori] && summary[kategori][field]);
  }, 0);
}

function addSummary_(target, kategori, jumlah, piutang) {
  if (!target[kategori]) target[kategori] = { jumlah_transaksi: 0, total_piutang: 0 };
  target[kategori].jumlah_transaksi += parseNumber_(jumlah);
  target[kategori].total_piutang += parseNumber_(piutang);
}

/* ============================================================
 * PIUTANG - SID BASELINE
 * ============================================================ */

function getPiutangSummaryByJenis_() {
  const sql =
    'SELECT jenis, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang ' +
    'FROM penjualan WHERE piutang > 0 GROUP BY jenis';

  const data = extractSidData_(requestSid_(sql));
  const summary = emptySummary_();

  data.forEach(function(row) {
    addSummary_(
      summary,
      jenisToKategori_(row.jenis),
      row.jumlah_transaksi,
      row.total_piutang
    );
  });

  return summary;
}

function getCustomerCabangBreakdown_() {
  const list = CUSTOMER_CABANG.map(sqlQuote_).join(',');
  const sql =
    'SELECT jenis, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang ' +
    'FROM penjualan WHERE piutang > 0 AND pelanggan IN (' + list + ') GROUP BY jenis';

  const data = extractSidData_(requestSid_(sql));
  const summary = emptySummary_();

  data.forEach(function(row) {
    addSummary_(
      summary,
      jenisToKategori_(row.jenis),
      row.jumlah_transaksi,
      row.total_piutang
    );
  });

  return summary;
}

/**
 * Reclassify customer yang secara bisnis dianggap CABANG,
 * walaupun jenis transaksi SID bukan PENJUALAN CABANG.
 */
function buildBusinessSummary_(baseline, branchBreakdown) {
  const result = emptySummary_();

  KATEGORI_PIUTANG.forEach(function(kategori) {
    result[kategori].jumlah_transaksi = baseline[kategori].jumlah_transaksi;
    result[kategori].total_piutang = baseline[kategori].total_piutang;
  });

  KATEGORI_PIUTANG.forEach(function(kategori) {
    if (kategori === 'CABANG') return;

    const jumlah = branchBreakdown[kategori].jumlah_transaksi;
    const piutang = branchBreakdown[kategori].total_piutang;

    result[kategori].jumlah_transaksi -= jumlah;
    result[kategori].total_piutang -= piutang;
    result.CABANG.jumlah_transaksi += jumlah;
    result.CABANG.total_piutang += piutang;
  });

  return result;
}

function getPiutangCabangBusiness_() {
  const breakdown = getCustomerCabangBreakdown_();
  return {
    jumlah_transaksi: sumSummary_(breakdown, 'jumlah_transaksi'),
    total_piutang: sumSummary_(breakdown, 'total_piutang')
  };
}

function getJumlahPelangganPiutang_() {
  const sql =
    'SELECT COUNT(DISTINCT pelanggan) AS jumlah_pelanggan ' +
    'FROM penjualan WHERE piutang > 0';
  const data = extractSidData_(requestSid_(sql));
  return data.length ? parseNumber_(data[0].jumlah_pelanggan) : 0;
}

function getTopPiutangCustomer_() {
  const sql =
    'SELECT pelanggan, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang ' +
    'FROM penjualan WHERE piutang > 0 ' +
    'GROUP BY pelanggan ORDER BY SUM(piutang) DESC LIMIT ' + CONFIG.TOP_CUSTOMER_LIMIT;

  const data = extractSidData_(requestSid_(sql));

  return data.map(function(row) {
    const pelanggan = normalizeCustomer_(row.pelanggan);
    return {
      pelanggan: pelanggan,
      kategori: isCustomerCabang_(pelanggan) ? 'CABANG' : 'NON-CABANG',
      jumlah_transaksi: parseNumber_(row.jumlah_transaksi),
      total_piutang: parseNumber_(row.total_piutang)
    };
  });
}

function getDashboardPiutang() {
  const baseline = getPiutangSummaryByJenis_();
  const branchBreakdown = getCustomerCabangBreakdown_();
  const business = buildBusinessSummary_(baseline, branchBreakdown);

  const transaksi = sumSummary_(business, 'jumlah_transaksi');
  const piutang = sumSummary_(business, 'total_piutang');
  const baselineTransaksi = sumSummary_(baseline, 'jumlah_transaksi');
  const baselinePiutang = sumSummary_(baseline, 'total_piutang');

  return {
    success: true,
    generated_at: new Date().toISOString(),
    total: {
      transaksi: transaksi,
      piutang: piutang,
      jumlah_customer: getJumlahPelangganPiutang_()
    },
    kategori: business,
    top_customer: getTopPiutangCustomer_(),
    audit: {
      baseline_sid: {
        transaksi: baselineTransaksi,
        piutang: baselinePiutang
      },
      final_dashboard: {
        transaksi: transaksi,
        piutang: piutang
      },
      selisih: {
        transaksi: transaksi - baselineTransaksi,
        piutang: piutang - baselinePiutang
      },
      summary_jenis_sid: baseline,
      customer_cabang: branchBreakdown,
      piutang_cabang_mapping: getPiutangCabangBusiness_()
    },
    konfigurasi_cabang: CUSTOMER_CABANG.slice()
  };
}

/* ============================================================
 * CUSTOMER PIUTANG - PAGINATION
 * ============================================================ */

function getPiutangCustomerPage_(pelanggan, offset, pageSize) {
  const customer = normalizeCustomer_(pelanggan);
  if (!customer) throw new Error('Kode pelanggan wajib diisi.');

  const limit = Number(pageSize || CONFIG.PIUTANG_PAGE_SIZE);
  const safeOffset = Math.max(0, Number(offset) || 0);

  if (limit < 1 || limit > 100) {
    throw new Error('pageSize harus antara 1 sampai 100.');
  }
  if (safeOffset > CONFIG.MAX_PAGINATION_OFFSET) {
    throw new Error('Offset melewati safety limit ' + CONFIG.MAX_PAGINATION_OFFSET + '.');
  }

  // Jangan menggunakan WHERE piutang > 0 pada halaman.
  // Kita harus mempertahankan urutan/raw record SID agar OFFSET konsisten.
  const sql =
    'SELECT kode,tanggal,pelanggan,jenis,piutang ' +
    'FROM penjualan WHERE pelanggan=' + sqlQuote_(customer) +
    ' LIMIT ' + limit + ' OFFSET ' + safeOffset;

  const raw = extractSidData_(requestSid_(sql));
  const data = raw.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: normalizeCustomer_(row.pelanggan || customer),
      jenis: row.jenis || '',
      piutang: parseNumber_(row.piutang)
    };
  }).filter(function(row) {
    return row.piutang > 0;
  });

  return {
    success: true,
    pelanggan: customer,
    offset: safeOffset,
    page_size: limit,
    jumlah_data: raw.length,
    jumlah_piutang: data.length,
    total_piutang: data.reduce(function(total, row) { return total + row.piutang; }, 0),
    transaksi_pertama: raw.length ? raw[0].kode : null,
    transaksi_terakhir: raw.length ? raw[raw.length - 1].kode : null,
    data: data
  };
}

function getPiutangCustomer_(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);
  if (!customer) throw new Error('Kode pelanggan wajib diisi.');

  const halaman = [];
  const transaksi = [];
  let offset = 0;

  while (true) {
    const page = getPiutangCustomerPage_(customer, offset, CONFIG.PIUTANG_PAGE_SIZE);

    halaman.push({
      offset: page.offset,
      jumlah_data: page.jumlah_data,
      jumlah_piutang: page.jumlah_piutang,
      total_piutang: page.total_piutang,
      transaksi_pertama: page.transaksi_pertama,
      transaksi_terakhir: page.transaksi_terakhir
    });

    Array.prototype.push.apply(transaksi, page.data);

    if (page.jumlah_data < CONFIG.PIUTANG_PAGE_SIZE) break;

    offset += CONFIG.PIUTANG_PAGE_SIZE;
    if (offset > CONFIG.MAX_PAGINATION_OFFSET) {
      throw new Error('Pagination berhenti karena melewati safety limit.');
    }
  }

  const kategoriDetail = emptySummary_();
  transaksi.forEach(function(row) {
    addSummary_(kategoriDetail, kategoriBisnis_(row.pelanggan, row.jenis), 1, row.piutang);
  });

  return {
    success: true,
    pelanggan: customer,
    kategori: isCustomerCabang_(customer) ? 'CABANG' : 'NON-CABANG',
    summary: {
      jumlah_transaksi: transaksi.length,
      total_piutang: transaksi.reduce(function(total, row) { return total + row.piutang; }, 0)
    },
    kategori_detail: kategoriDetail,
    pagination: {
      page_size: CONFIG.PIUTANG_PAGE_SIZE,
      jumlah_halaman: halaman.length,
      jumlah_record_raw: halaman.reduce(function(total, page) { return total + page.jumlah_data; }, 0)
    },
    halaman: halaman,
    transaksi: transaksi
  };
}

function getPiutangCustomer(pelanggan) {
  return getPiutangCustomer_(pelanggan);
}

function getPiutangCustomerPage(pelanggan, offset) {
  return getPiutangCustomerPage_(pelanggan, offset, CONFIG.PIUTANG_PAGE_SIZE);
}

/* ============================================================
 * MASTER CUSTOMER / BARANG
 * ============================================================ */

function getCustomerByKode(kode) {
  const customer = normalizeCustomer_(kode);
  if (!customer) throw new Error('Kode pelanggan wajib diisi.');

  const sql =
    'SELECT kode,nama,telp,saldo_piutang,saldo_tabungan,max_piutang,saldo_hutang ' +
    'FROM pelanggan WHERE kode=' + sqlQuote_(customer) + ' LIMIT 1';

  const data = extractSidData_(requestSid_(sql));
  return {
    success: true,
    pelanggan: customer,
    ditemukan: data.length > 0,
    data: data.length ? data[0] : null
  };
}

function getPelangganPiutangMaster() {
  const sql =
    'SELECT kode,nama,telp,saldo_piutang,max_piutang ' +
    'FROM pelanggan WHERE saldo_piutang > 0 ' +
    'ORDER BY saldo_piutang DESC LIMIT 100';
  return sidResult_('pelanggan_piutang_master', sql, requestSid_(sql));
}

function getBarang() {
  const sql = 'SELECT kode,nama FROM barang';
  return sidResult_('barang', sql, requestSid_(sql));
}

function getBarangSample() {
  const sql = 'SELECT * FROM barang LIMIT 1';
  return sidResult_('barang_sample', sql, requestSid_(sql));
}

function getPelanggan() {
  const sql = 'SELECT kode,nama,telp,saldo_piutang,saldo_tabungan,max_piutang FROM pelanggan';
  return sidResult_('pelanggan', sql, requestSid_(sql));
}

/* ============================================================
 * TEST / DIAGNOSTIC
 * Semua fungsi test mengembalikan OBJECT JSON yang mudah dilihat
 * dengan Logger.log(JSON.stringify(test...(), null, 2)).
 * ============================================================ */

function testJson_(testName, callback) {
  const started = new Date();
  try {
    const result = callback();
    return {
      success: true,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: new Date().getTime() - started.getTime(),
      result: result
    };
  } catch (err) {
    return {
      success: false,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: new Date().getTime() - started.getTime(),
      error: err && err.message ? err.message : String(err)
    };
  }
}

function testSidConnection() {
  return testJson_('testSidConnection', function() {
    const sql = 'SELECT 1 AS sid_test';
    const response = requestSid_(sql);
    return {
      kode_trx: response.kode_trx,
      sid_status: response.sid_response ? response.sid_response.status : null,
      data: extractSidData_(response)
    };
  });
}

function testCustomerMapping() {
  return testJson_('testCustomerMapping', function() {
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

function testDashboardPiutang() {
  return testJson_('testDashboardPiutang', function() {
    const dashboard = getDashboardPiutang();
    return {
      total: dashboard.total,
      kategori: dashboard.kategori,
      audit: dashboard.audit,
      top_customer: dashboard.top_customer,
      konfigurasi_cabang: dashboard.konfigurasi_cabang
    };
  });
}

function testDashboardReconciliation() {
  return testJson_('testDashboardReconciliation', function() {
    const dashboard = getDashboardPiutang();
    const diff = dashboard.audit.selisih;
    return {
      ok: diff.transaksi === 0 && diff.piutang === 0,
      selisih_transaksi: diff.transaksi,
      selisih_piutang: diff.piutang
    };
  });
}

function testCustomerPiutang(pelanggan) {
  return testJson_('testCustomerPiutang', function() {
    const customer = normalizeCustomer_(pelanggan || 'FBR');
    const result = getPiutangCustomer_(customer);
    return {
      pelanggan: result.pelanggan,
      kategori: result.kategori,
      summary: result.summary,
      pagination: result.pagination,
      halaman: result.halaman
    };
  });
}

function testCustomerPage(pelanggan, offset) {
  return testJson_('testCustomerPage', function() {
    const customer = normalizeCustomer_(pelanggan || 'FBR');
    const page = getPiutangCustomerPage_(customer, Number(offset || 0), CONFIG.PIUTANG_PAGE_SIZE);
    return page;
  });
}

function testAll() {
  const tests = [
    testCustomerMapping(),
    testSidConnection(),
    testDashboardPiutang(),
    testDashboardReconciliation()
  ];

  return {
    success: tests.every(function(test) { return test.success; }),
    generated_at: new Date().toISOString(),
    tests: tests
  };
}

/**
 * Jalankan fungsi ini di Apps Script.
 * Output Logger akan selalu berupa JSON, bukan [object Object].
 */
function logJson_(value) {
  Logger.log(JSON.stringify(value, null, 2));
  return value;
}

function runTestDashboardPiutang() {
  return logJson_(testDashboardPiutang());
}

function runTestReconciliation() {
  return logJson_(testDashboardReconciliation());
}

function runTestCustomerMapping() {
  return logJson_(testCustomerMapping());
}

function runTestSidConnection() {
  return logJson_(testSidConnection());
}

function runTestAll() {
  return logJson_(testAll());
}
