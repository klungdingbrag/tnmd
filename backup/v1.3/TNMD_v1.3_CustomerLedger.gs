/**
 * ============================================================
 * TNMD v1.3 - CUSTOMER LEDGER
 * ============================================================
 *
 * STANDALONE MODULE
 *
 * v1.3 tidak lagi bergantung pada Code.gs v1.2.1.
 * Modul ini memakai request SID sendiri berdasarkan mekanisme
 * TNMD v1.2.3 yang sudah terbukti PASS.
 *
 * Tujuan:
 * 1. Customer ledger reusable.
 * 2. Pagination SID stabil berdasarkan RAW DATA.
 * 3. Piutang = 0 tetap dihitung sebagai raw row agar OFFSET tidak bergeser.
 * 4. Tidak memakai requestSid_(), CONFIG, CUSTOMER_CABANG,
 *    escapeSql_(), atau fungsi dari Code.gs utama.
 *
 * Script Properties yang diperlukan:
 *   SID_API_KEY
 *
 * Baseline FBR dari TNMD v1.2.3:
 *   RAW ACTIVE : 238
 *   PAGES      : 4
 *   PIUTANG    : 203.200.000
 * ============================================================
 */

const TNMD13 = {
  API_URL: 'https://sidretail.id/api',
  PAGE_SIZE: 100,
  MAX_OFFSET: 100000,
  DEFAULT_CUSTOMER: 'FBR',
  EXPECTED_PAGES: 4,
  EXPECTED_ACTIVE: 238,
  EXPECTED_PIUTANG: 203200000,
  CUSTOMER_CABANG: [
    'FBR', 'RIMBAL', 'KUKUH', 'TB BEJA', 'BARBEX2', 'HENDRA', 'ITHENG',
    'KURNIA', 'MARTO', 'RHD', 'SUMA', '____2204024', '____2207004', '____2509014'
  ]
};

function tnmd13_now_() {
  return new Date().toISOString();
}

function tnmd13_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).trim().replace(/,/g, ''));
  return isNaN(n) ? 0 : n;
}

function tnmd13_customer_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function tnmd13_escapeSql_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function tnmd13_quote_(value) {
  return "'" + tnmd13_escapeSql_(value) + "'";
}

function tnmd13_apiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  if (!key || !String(key).trim()) {
    throw new Error('SID_API_KEY belum ditemukan di Script Properties.');
  }
  return String(key).trim();
}

function tnmd13_trxCode_() {
  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMddHHmmssSSS'
  );
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return 'TNMD' + stamp + random;
}

function tnmd13_url_(sql, trx) {
  return [
    TNMD13.API_URL,
    encodeURIComponent(tnmd13_apiKey_()),
    encodeURIComponent(trx),
    encodeURIComponent(String(sql).trim().replace(/\s+/g, ' '))
  ].join('/');
}

/**
 * Request langsung ke SID Retail.
 * SQL selalu dikirim satu baris karena mekanisme ini sudah terbukti
 * menghindari masalah parser SQL SID pada SQL multiline.
 */
function tnmd13_request_(sql) {
  const cleanSql = String(sql || '').trim().replace(/\s+/g, ' ');
  if (!cleanSql) throw new Error('SQL tidak boleh kosong.');

  const trx = tnmd13_trxCode_();
  let response;

  try {
    response = UrlFetchApp.fetch(tnmd13_url_(cleanSql, trx), {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json' }
    });
  } catch (err) {
    throw new Error('Gagal menghubungi SID Retail API: ' + err.message);
  }

  const status = response.getResponseCode();
  const text = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'SID RETAIL API ERROR\nHTTP Status: ' + status +
      '\nSQL: ' + cleanSql +
      '\nResponse: ' + text.substring(0, 1500)
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      'SID Retail mengembalikan response bukan JSON.\nHTTP Status: ' +
      status + '\nSQL: ' + cleanSql + '\nResponse: ' + text.substring(0, 1500)
    );
  }

  if (parsed && parsed.status === 'error') {
    throw new Error(
      'SID Retail SQL ERROR\nSQL: ' + cleanSql +
      '\nResponse: ' + JSON.stringify(parsed)
    );
  }

  return {
    kode_trx: trx,
    status_http: status,
    response: parsed
  };
}

/** Normalisasi semua bentuk data response SID yang sudah kita temui. */
function tnmd13_data_(result) {
  const response = result && result.response;

  if (response && Array.isArray(response.data)) return response.data;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) {
    return response.sid_response.data;
  }
  if (response && Array.isArray(response.result)) return response.result;
  if (response && response.sid_response && Array.isArray(response.sid_response.result)) {
    return response.sid_response.result;
  }

  return [];
}

function tnmd13_category_(customer, jenis) {
  const name = tnmd13_customer_(customer);
  const type = String(jenis || '').trim().toUpperCase();

  if (TNMD13.CUSTOMER_CABANG.some(function(item) {
    return tnmd13_customer_(item) === name;
  })) {
    return 'CABANG';
  }

  if (type === 'PENJUALAN TOKO') return 'TOKO';
  if (type === 'PENJUALAN CABANG') return 'CABANG';
  if (type === 'PENJUALAN PARTAI') return 'PARTAI';
  return 'LAIN';
}

function tnmd13_customerSql_(customer, offset) {
  const target = tnmd13_customer_(customer);
  const safeOffset = Number(offset);

  if (!target) throw new Error('Customer wajib diisi.');
  if (!Number.isInteger(safeOffset) || safeOffset < 0) {
    throw new Error('Offset tidak valid.');
  }

  return 'SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan=' +
    tnmd13_quote_(target) +
    ' LIMIT ' + TNMD13.PAGE_SIZE +
    ' OFFSET ' + safeOffset;
}

/**
 * Ambil satu RAW page.
 * Jangan filter piutang di SQL karena OFFSET harus mengikuti raw rows SID.
 */
function tnmd13_fetchRawPage_(customer, offset) {
  const result = tnmd13_request_(tnmd13_customerSql_(customer, offset));
  const raw = tnmd13_data_(result);

  return raw.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || customer,
      jenis: row.jenis || '',
      piutang: tnmd13_num_(row.piutang)
    };
  });
}

function tnmd13_getCustomerLedger(customer, offset, pageSize) {
  customer = String(customer || TNMD13.DEFAULT_CUSTOMER).trim();
  offset = Math.max(0, Number(offset) || 0);
  pageSize = Math.max(1, Number(pageSize) || TNMD13.PAGE_SIZE);

  if (pageSize !== TNMD13.PAGE_SIZE) {
    throw new Error('TNMD v1.3 menggunakan pageSize=100 untuk menjaga pagination SID.');
  }

  const rows = tnmd13_fetchRawPage_(customer, offset);
  const active = rows.filter(function(row) {
    return row.piutang > 0;
  });

  const totalPiutang = active.reduce(function(sum, row) {
    return sum + row.piutang;
  }, 0);

  return {
    success: true,
    pelanggan: customer,
    kategori: active.length ? tnmd13_category_(customer, active[0].jenis) : tnmd13_category_(customer, ''),
    offset: offset,
    page_size: pageSize,
    raw_count: rows.length,
    active_count: active.length,
    total_piutang: totalPiutang,
    transaksi_pertama: rows.length ? rows[0].kode : null,
    transaksi_terakhir: rows.length ? rows[rows.length - 1].kode : null,
    data: active
  };
}

/**
 * Ambil seluruh ledger customer.
 * Pagination berhenti berdasarkan raw_count, bukan active_count.
 */
function tnmd13_getCustomerLedgerAll(customer) {
  customer = String(customer || TNMD13.DEFAULT_CUSTOMER).trim();

  const pages = [];
  const all = [];
  let offset = 0;

  while (true) {
    const page = tnmd13_getCustomerLedger(customer, offset, TNMD13.PAGE_SIZE);
    pages.push(page);
    Array.prototype.push.apply(all, page.data);

    if (page.raw_count < TNMD13.PAGE_SIZE) break;

    offset += TNMD13.PAGE_SIZE;
    if (offset > TNMD13.MAX_OFFSET) {
      throw new Error('Pagination melewati safety limit.');
    }
  }

  const totalPiutang = all.reduce(function(sum, row) {
    return sum + row.piutang;
  }, 0);

  return {
    success: true,
    pelanggan: customer,
    kategori: tnmd13_category_(customer, all.length ? all[0].jenis : ''),
    page_size: TNMD13.PAGE_SIZE,
    jumlah_page: pages.length,
    jumlah_transaksi_aktif: all.length,
    total_piutang: totalPiutang,
    pages: pages,
    data: all
  };
}

function tnmd13_getCustomerSummary(customer) {
  const ledger = tnmd13_getCustomerLedgerAll(customer);

  return {
    success: true,
    pelanggan: ledger.pelanggan,
    kategori: ledger.kategori,
    jumlah_page: ledger.jumlah_page,
    jumlah_transaksi_aktif: ledger.jumlah_transaksi_aktif,
    total_piutang: ledger.total_piutang
  };
}

function tnmd13_result_(test, started, fn) {
  let output;

  try {
    output = {
      success: true,
      test: test,
      generated_at: tnmd13_now_(),
      duration_ms: 0,
      result: fn()
    };
  } catch (err) {
    output = {
      success: false,
      test: test,
      generated_at: tnmd13_now_(),
      duration_ms: 0,
      error: err && err.message ? err.message : String(err)
    };
  }

  output.duration_ms = new Date().getTime() - started;
  const json = JSON.stringify(output, null, 2);
  Logger.log(json);
  console.log(json);
  return output;
}

function tnmd13_testSidConnection() {
  return tnmd13_result_('tnmd13_testSidConnection', new Date().getTime(), function() {
    const result = tnmd13_request_('SELECT 1 AS sid_test');
    return {
      kode_trx: result.kode_trx,
      sid_status: result.response && result.response.status,
      data: tnmd13_data_(result)
    };
  });
}

function tnmd13_testCustomerMapping() {
  return tnmd13_result_('tnmd13_testCustomerMapping', new Date().getTime(), function() {
    const checks = TNMD13.CUSTOMER_CABANG.map(function(customer) {
      return {
        pelanggan: customer,
        kategori: tnmd13_category_(customer, '')
      };
    });

    return {
      jumlah_konfigurasi: checks.length,
      checks: checks,
      semua_cabang: checks.every(function(item) {
        return item.kategori === 'CABANG';
      })
    };
  });
}

function tnmd13_testCustomerLedgerPage() {
  return tnmd13_result_('tnmd13_testCustomerLedgerPage', new Date().getTime(), function() {
    const page = tnmd13_getCustomerLedger(TNMD13.DEFAULT_CUSTOMER, 0, TNMD13.PAGE_SIZE);

    return {
      pelanggan: page.pelanggan,
      offset: page.offset,
      page_size: page.page_size,
      raw_count: page.raw_count,
      active_count: page.active_count,
      total_piutang: page.total_piutang,
      transaksi_pertama: page.transaksi_pertama,
      transaksi_terakhir: page.transaksi_terakhir
    };
  });
}

function tnmd13_testCustomerLedger() {
  return tnmd13_result_('tnmd13_testCustomerLedger', new Date().getTime(), function() {
    const ledger = tnmd13_getCustomerLedgerAll(TNMD13.DEFAULT_CUSTOMER);
    const codes = {};
    let duplicateCount = 0;

    ledger.data.forEach(function(row) {
      if (row.kode && codes[row.kode]) duplicateCount++;
      if (row.kode) codes[row.kode] = true;
    });

    const checks = {
      page_count: ledger.jumlah_page === TNMD13.EXPECTED_PAGES,
      active_count: ledger.jumlah_transaksi_aktif === TNMD13.EXPECTED_ACTIVE,
      total_piutang: ledger.total_piutang === TNMD13.EXPECTED_PIUTANG,
      duplicate: duplicateCount === 0
    };

    const pass = Object.keys(checks).every(function(key) {
      return checks[key];
    });

    return {
      pelanggan: ledger.pelanggan,
      jumlah_page: ledger.jumlah_page,
      expected_page: TNMD13.EXPECTED_PAGES,
      jumlah_transaksi_aktif: ledger.jumlah_transaksi_aktif,
      expected_active: TNMD13.EXPECTED_ACTIVE,
      total_piutang: ledger.total_piutang,
      expected_piutang: TNMD13.EXPECTED_PIUTANG,
      selisih_piutang: ledger.total_piutang - TNMD13.EXPECTED_PIUTANG,
      duplicate_count: duplicateCount,
      checks: checks,
      status: pass ? 'PASS' : 'FAIL'
    };
  });
}

function tnmd13_testCustomerPagination() {
  return tnmd13_testCustomerLedger();
}

function tnmd13_testCustomerSummary() {
  return tnmd13_result_('tnmd13_testCustomerSummary', new Date().getTime(), function() {
    return tnmd13_getCustomerSummary(TNMD13.DEFAULT_CUSTOMER);
  });
}

/**
 * TEST UTAMA v1.3.
 * Menjalankan koneksi, mapping, page pertama, ledger penuh,
 * dan summary secara berurutan.
 */
function tnmd13_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd13_testSidConnection(),
    tnmd13_testCustomerMapping(),
    tnmd13_testCustomerLedgerPage(),
    tnmd13_testCustomerLedger(),
    tnmd13_testCustomerSummary()
  ];

  const passed = tests.every(function(item) {
    return item && item.success === true &&
      (!item.result || item.result.status !== 'FAIL');
  });

  const output = {
    success: passed,
    test: 'tnmd13_runAllTests',
    generated_at: tnmd13_now_(),
    duration_ms: new Date().getTime() - started,
    status: passed ? 'PASS' : 'FAIL',
    tests: tests.map(function(item) {
      return {
        test: item.test,
        success: item.success,
        status: item.result && item.result.status ? item.result.status : null,
        error: item.error || null
      };
    })
  };

  const json = JSON.stringify(output, null, 2);
  Logger.log(json);
  console.log(json);
  return output;
}
