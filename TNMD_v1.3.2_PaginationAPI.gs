/**
 * ============================================================
 * TNMD v1.3.2 - PAGINATION API
 * ============================================================
 *
 * Evolusi dari TNMD v1.3.1 Customer API.
 *
 * DEPENDENCY:
 *   - TNMD v1.3 Customer Ledger Engine
 *
 * Tidak mengganti engine v1.3.
 * Tidak mengganti Code.gs utama.
 * Tidak mengubah TNMD v1.3.1.
 *
 * Perbaikan utama:
 *   v1.3.1 dapat menghasilkan total_page=null pada halaman
 *   yang belum diketahui sebagai halaman terakhir.
 *
 *   v1.3.2 menghitung total halaman dari ledger customer yang
 *   sudah terbukti stabil, sehingga API selalu mengembalikan
 *   total_page yang nyata.
 *
 * Baseline pengujian FBR:
 *   total_page            = 4
 *   transaksi aktif       = 238
 *   total piutang         = 203200000
 *
 * ============================================================
 */

const TNMD132 = {
  VERSION: '1.3.2',
  PAGE_SIZE: 100,
  DEFAULT_CUSTOMER: 'FBR'
};

/* ============================================================
 * UTILITIES
 * ============================================================
 */

function tnmd132_now_() {
  return new Date().toISOString();
}

function tnmd132_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function tnmd132_customer_(customer) {
  const value = String(customer || TNMD132.DEFAULT_CUSTOMER).trim();
  return value || TNMD132.DEFAULT_CUSTOMER;
}

function tnmd132_offset_(offset) {
  const value = Number(offset);
  if (!isFinite(value) || value < 0) return 0;
  return Math.floor(value);
}

function tnmd132_pageSize_(pageSize) {
  const value = Number(pageSize);
  if (!isFinite(value) || value <= 0) return TNMD132.PAGE_SIZE;

  if (Math.floor(value) !== TNMD132.PAGE_SIZE) {
    throw new Error('TNMD v1.3.2 menggunakan pageSize=100.');
  }

  return TNMD132.PAGE_SIZE;
}

/* ============================================================
 * VALIDATION
 * ============================================================
 */

function tnmd132_requireEngine_() {
  if (typeof tnmd13_getCustomerLedger !== 'function') {
    throw new Error(
      'TNMD v1.3 engine tidak ditemukan. Pastikan TNMD v1.3 sudah dimuat.'
    );
  }

  if (typeof tnmd13_getCustomerSummary !== 'function') {
    throw new Error(
      'tnmd13_getCustomerSummary tidak ditemukan.'
    );
  }
}

/* ============================================================
 * CUSTOMER PAGE
 * ============================================================
 */

function tnmd132_getCustomerPage(customer, offset, pageSize) {
  tnmd132_requireEngine_();

  customer = tnmd132_customer_(customer);
  offset = tnmd132_offset_(offset);
  pageSize = tnmd132_pageSize_(pageSize);

  const page = tnmd13_getCustomerLedger(
    customer,
    offset,
    pageSize
  );

  /*
   * v1.3.1 hanya mengetahui total_page ketika raw_count < pageSize.
   * v1.3.2 mengambil summary ledger yang sudah terbukti menghasilkan
   * jumlah halaman final, lalu menggunakannya untuk pagination API.
   */
  const summary = tnmd13_getCustomerSummary(customer);
  const totalPage = Number(summary.jumlah_page) || 1;

  return {
    success: true,
    api_version: TNMD132.VERSION,
    pelanggan: page.pelanggan,
    kategori: page.kategori,

    pagination: {
      offset: page.offset,
      page_size: page.page_size,
      page: Math.floor(page.offset / page.page_size) + 1,
      total_page: totalPage
    },

    summary: {
      jumlah_page: totalPage,
      jumlah_transaksi_aktif: Number(summary.jumlah_transaksi_aktif) || 0,
      total_piutang: tnmd132_num_(summary.total_piutang),
      raw_count_page: page.raw_count,
      active_count_page: page.active_count,
      total_piutang_page: tnmd132_num_(page.total_piutang)
    },

    transaksi: {
      pertama: page.transaksi_pertama,
      terakhir: page.transaksi_terakhir
    },

    data: page.data
  };
}

/* ============================================================
 * CUSTOMER API
 * ============================================================
 */

function tnmd132_getCustomerApi(customer, offset, pageSize) {
  return tnmd132_getCustomerPage(customer, offset, pageSize);
}

/* ============================================================
 * TEST HELPER
 * ============================================================
 */

function tnmd132_result_(testName, started, callback) {
  try {
    return {
      success: true,
      test: testName,
      generated_at: tnmd132_now_(),
      duration_ms: new Date().getTime() - started,
      result: callback()
    };
  } catch (err) {
    return {
      success: false,
      test: testName,
      generated_at: tnmd132_now_(),
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }
}

/* ============================================================
 * TEST 1 - PAGINATION
 * ============================================================
 */

function tnmd132_testPagination() {
  const started = new Date().getTime();

  return tnmd132_result_('tnmd132_testPagination', started, function() {
    const result = tnmd132_getCustomerPage(
      TNMD132.DEFAULT_CUSTOMER,
      0,
      TNMD132.PAGE_SIZE
    );

    const expectedPage = 1;
    const expectedTotalPage = 4;
    const expectedTransactions = 238;
    const expectedPiutang = 203200000;

    const checks = {
      page: result.pagination.page === expectedPage,
      page_size: result.pagination.page_size === 100,
      total_page: result.pagination.total_page === expectedTotalPage,
      transaction_count:
        result.summary.jumlah_transaksi_aktif === expectedTransactions,
      total_piutang:
        result.summary.total_piutang === expectedPiutang
    };

    const pass = Object.keys(checks).every(function(key) {
      return checks[key] === true;
    });

    return {
      api_version: result.api_version,
      pelanggan: result.pelanggan,
      kategori: result.kategori,
      pagination: result.pagination,
      expected: {
        page: expectedPage,
        page_size: 100,
        total_page: expectedTotalPage,
        jumlah_transaksi_aktif: expectedTransactions,
        total_piutang: expectedPiutang
      },
      checks: checks,
      status: pass ? 'PASS' : 'FAIL'
    };
  });
}

/* ============================================================
 * TEST 2 - CUSTOMER API
 * ============================================================
 */

function tnmd132_testCustomerApi() {
  const started = new Date().getTime();

  return tnmd132_result_('tnmd132_testCustomerApi', started, function() {
    const result = tnmd132_getCustomerApi(
      TNMD132.DEFAULT_CUSTOMER,
      0,
      TNMD132.PAGE_SIZE
    );

    const valid =
      result.success === true &&
      result.api_version === '1.3.2' &&
      result.pelanggan === 'FBR' &&
      result.pagination.page === 1 &&
      result.pagination.page_size === 100 &&
      result.pagination.total_page === 4 &&
      result.summary.jumlah_transaksi_aktif === 238 &&
      result.summary.total_piutang === 203200000 &&
      Array.isArray(result.data);

    return {
      api_version: result.api_version,
      pelanggan: result.pelanggan,
      kategori: result.kategori,
      pagination: result.pagination,
      summary: result.summary,
      data_count: result.data.length,
      valid: valid,
      status: valid ? 'PASS' : 'FAIL'
    };
  });
}

/* ============================================================
 * TEST 3 - ALL TESTS
 * ============================================================
 */

function tnmd132_runAllTests() {
  const started = new Date().getTime();

  const tests = [
    tnmd132_testPagination(),
    tnmd132_testCustomerApi()
  ];

  const status = tests.every(function(test) {
    return test &&
      test.success === true &&
      (!test.result || test.result.status !== 'FAIL');
  }) ? 'PASS' : 'FAIL';

  return {
    success: status === 'PASS',
    test: 'tnmd132_runAllTests',
    generated_at: tnmd132_now_(),
    duration_ms: new Date().getTime() - started,
    status: status,
    tests: tests.map(function(test) {
      return {
        test: test.test,
        success: test.success,
        status: test.result ? test.result.status || null : null,
        error: test.error || null
      };
    })
  };
}

/* ============================================================
 * JSON OUTPUT HELPERS
 * ============================================================
 */

function tnmd132_printJson_(label, data) {
  const json = JSON.stringify(data, null, 2);
  console.log(label + '\n' + json);
  return data;
}

function tnmd132_runTestPagination() {
  return tnmd132_printJson_(
    'TNMD v1.3.2 - TEST PAGINATION',
    tnmd132_testPagination()
  );
}

function tnmd132_runTestApi() {
  return tnmd132_printJson_(
    'TNMD v1.3.2 - TEST CUSTOMER API',
    tnmd132_testCustomerApi()
  );
}

function tnmd132_runTestRunner() {
  return tnmd132_printJson_(
    'TNMD v1.3.2 - ALL TESTS',
    tnmd132_runAllTests()
  );
}
