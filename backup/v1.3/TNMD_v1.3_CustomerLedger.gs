/**
 * TNMD v1.3 - Customer Ledger
 *
 * Depends on the existing v1.2.1 core functions:
 *   - requestSid_(sql)
 *   - CUSTOMER_CABANG
 *
 * Purpose:
 *   Provide a single, reusable customer-ledger engine using the pagination
 *   behavior proven by TNMD v1.2.3 tests.
 *
 * Important:
 *   This module does NOT replace Code.gs v1.2.1 yet.
 *   Add it as a separate .gs file first and run the tests below.
 */

const TNMD13 = {
  PAGE_SIZE: 100,
  DEFAULT_CUSTOMER: 'FBR'
};

function tnmd13_now_() {
  return new Date().toISOString();
}

function tnmd13_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function tnmd13_escapeSql_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function tnmd13_category_(customer, jenis) {
  const name = String(customer || '').trim();
  const type = String(jenis || '').trim().toUpperCase();

  if (typeof CUSTOMER_CABANG !== 'undefined' &&
      Array.isArray(CUSTOMER_CABANG) &&
      CUSTOMER_CABANG.indexOf(name) !== -1) {
    return 'CABANG';
  }

  if (type === 'PENJUALAN TOKO') return 'TOKO';
  if (type === 'PENJUALAN CABANG') return 'CABANG';
  if (type === 'PENJUALAN PARTAI') return 'PARTAI';
  return 'LAIN';
}

/**
 * Fetch one raw page. The SQL deliberately filters only by customer.
 * piutang=0 records must remain in the raw page so OFFSET pagination
 * stays stable and matches the SID result set.
 */
function tnmd13_fetchRawPage_(customer, offset) {
  if (typeof requestSid_ !== 'function') {
    throw new Error('requestSid_ is not defined. Load Code.gs v1.2.1 first.');
  }

  const safeCustomer = tnmd13_escapeSql_(customer);
  const sql = `
    SELECT kode,tanggal,pelanggan,jenis,piutang
    FROM penjualan
    WHERE pelanggan='${safeCustomer}'
    LIMIT ${TNMD13.PAGE_SIZE} OFFSET ${Number(offset) || 0}
  `;

  const response = requestSid_(sql);
  const rows = Array.isArray(response) ? response :
    (response && Array.isArray(response.data) ? response.data : []);

  return rows.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || customer,
      jenis: row.jenis || '',
      piutang: tnmd13_num_(row.piutang)
    };
  });
}

/**
 * Get one customer ledger page.
 * raw_count = all SID rows in the page.
 * active_count = rows where piutang > 0.
 */
function tnmd13_getCustomerLedger(customer, offset, pageSize) {
  customer = String(customer || TNMD13.DEFAULT_CUSTOMER).trim();
  offset = Math.max(0, Number(offset) || 0);
  pageSize = Math.max(1, Number(pageSize) || TNMD13.PAGE_SIZE);

  if (pageSize !== TNMD13.PAGE_SIZE) {
    throw new Error('TNMD v1.3 currently uses pageSize=100 to preserve SID pagination behavior.');
  }

  const rows = tnmd13_fetchRawPage_(customer, offset);
  const active = rows.filter(function(row) { return row.piutang > 0; });
  const totalPiutang = active.reduce(function(sum, row) { return sum + row.piutang; }, 0);

  return {
    success: true,
    pelanggan: customer,
    kategori: active.length ? tnmd13_category_(customer, active[0].jenis) : 'NON-CABANG',
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
 * Fetch all customer pages until the raw page is shorter than PAGE_SIZE.
 * This is intentionally based on raw_count, not active_count.
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
  }

  const totalPiutang = all.reduce(function(sum, row) { return sum + row.piutang; }, 0);

  return {
    success: true,
    pelanggan: customer,
    kategori: all.length ? tnmd13_category_(customer, all[0].jenis) : 'NON-CABANG',
    page_size: TNMD13.PAGE_SIZE,
    jumlah_page: pages.length,
    jumlah_transaksi_aktif: all.length,
    total_piutang: totalPiutang,
    pages: pages,
    data: all
  };
}

/** Lightweight summary for a customer. */
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
  try {
    const result = fn();
    return {
      success: true,
      test: test,
      generated_at: tnmd13_now_(),
      duration_ms: new Date().getTime() - started,
      result: result
    };
  } catch (err) {
    return {
      success: false,
      test: test,
      generated_at: tnmd13_now_(),
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }
}

/** Test page 1 only. */
function tnmd13_testCustomerLedgerPage() {
  const started = new Date().getTime();
  return tnmd13_result_('tnmd13_testCustomerLedgerPage', started, function() {
    const page = tnmd13_getCustomerLedger(TNMD13.DEFAULT_CUSTOMER, 0, 100);
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

/**
 * Test the complete ledger against the values proven by v1.2.3.
 */
function tnmd13_testCustomerLedger() {
  const started = new Date().getTime();
  return tnmd13_result_('tnmd13_testCustomerLedger', started, function() {
    const ledger = tnmd13_getCustomerLedgerAll(TNMD13.DEFAULT_CUSTOMER);
    const expectedPages = 4;
    const expectedActive = 238;
    const expectedPiutang = 203200000;

    const codes = {};
    let duplicateCount = 0;
    ledger.data.forEach(function(row) {
      if (row.kode && codes[row.kode]) duplicateCount++;
      if (row.kode) codes[row.kode] = true;
    });

    const checks = {
      page_count: ledger.jumlah_page === expectedPages,
      active_count: ledger.jumlah_transaksi_aktif === expectedActive,
      total_piutang: ledger.total_piutang === expectedPiutang,
      duplicate: duplicateCount === 0
    };

    const pass = Object.keys(checks).every(function(key) { return checks[key]; });

    return {
      pelanggan: ledger.pelanggan,
      jumlah_page: ledger.jumlah_page,
      expected_page: expectedPages,
      jumlah_transaksi_aktif: ledger.jumlah_transaksi_aktif,
      expected_active: expectedActive,
      total_piutang: ledger.total_piutang,
      expected_piutang: expectedPiutang,
      selisih_piutang: ledger.total_piutang - expectedPiutang,
      duplicate_count: duplicateCount,
      checks: checks,
      status: pass ? 'PASS' : 'FAIL'
    };
  });
}

/** Test the lightweight summary endpoint. */
function tnmd13_testCustomerSummary() {
  const started = new Date().getTime();
  return tnmd13_result_('tnmd13_testCustomerSummary', started, function() {
    return tnmd13_getCustomerSummary(TNMD13.DEFAULT_CUSTOMER);
  });
}

function tnmd13_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd13_testCustomerLedgerPage(),
    tnmd13_testCustomerLedger(),
    tnmd13_testCustomerSummary()
  ];

  const status = tests.every(function(item) {
    return item.success && (!item.result || item.result.status !== 'FAIL');
  }) ? 'PASS' : 'FAIL';

  return {
    success: status === 'PASS',
    test: 'tnmd13_runAllTests',
    generated_at: tnmd13_now_(),
    duration_ms: new Date().getTime() - started,
    status: status,
    tests: tests.map(function(item) {
      return {
        test: item.test,
        success: item.success,
        status: item.result ? item.result.status || null : null,
        error: item.error || null
      };
    })
  };
}
