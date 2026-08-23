/**
 * ============================================================
 * TNMD v1.3.1 - CUSTOMER API LAYER
 * ============================================================
 *
 * Dibangun di atas TNMD v1.3 Customer Ledger Engine.
 *
 * DEPENDENCY:
 *   - TNMD v1.3
 *
 * Tidak mengganti engine v1.3.
 * Tidak mengganti Code.gs utama.
 *
 * Tujuan:
 *   Menyediakan response JSON yang konsisten untuk frontend.
 *
 * ============================================================
 */

const TNMD131 = {
  VERSION: '1.3.1',
  PAGE_SIZE: 100,
  DEFAULT_CUSTOMER: 'FBR'
};


/* ============================================================
 * UTILITIES
 * ============================================================
 */

function tnmd131_now_() {
  return new Date().toISOString();
}


function tnmd131_num_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  const n = Number(
    String(value)
      .replace(/,/g, '')
      .trim()
  );

  return isNaN(n) ? 0 : n;
}


function tnmd131_customer_(customer) {
  const value = String(
    customer || TNMD131.DEFAULT_CUSTOMER
  ).trim();

  if (!value) {
    return TNMD131.DEFAULT_CUSTOMER;
  }

  return value;
}


function tnmd131_offset_(offset) {
  const value = Number(offset);

  if (!isFinite(value) || value < 0) {
    return 0;
  }

  return Math.floor(value);
}


function tnmd131_pageSize_(pageSize) {
  const value = Number(pageSize);

  if (!isFinite(value) || value <= 0) {
    return TNMD131.PAGE_SIZE;
  }

  /*
   * Untuk saat ini kita sengaja mempertahankan
   * page size = 100 karena pagination SID sudah
   * terbukti dengan ukuran tersebut.
   */
  if (Math.floor(value) !== TNMD131.PAGE_SIZE) {
    throw new Error(
      'TNMD v1.3.1 menggunakan pageSize=100.'
    );
  }

  return TNMD131.PAGE_SIZE;
}


/* ============================================================
 * VALIDATION
 * ============================================================
 */

function tnmd131_requireEngine_() {

  if (typeof tnmd13_getCustomerLedger !== 'function') {
    throw new Error(
      'TNMD v1.3 engine tidak ditemukan. ' +
      'Pastikan TNMD v1.3 sudah dimuat.'
    );
  }

  if (typeof tnmd13_getCustomerLedgerAll !== 'function') {
    throw new Error(
      'tnmd13_getCustomerLedgerAll tidak ditemukan.'
    );
  }

  if (typeof tnmd13_getCustomerSummary !== 'function') {
    throw new Error(
      'tnmd13_getCustomerSummary tidak ditemukan.'
    );
  }
}


/* ============================================================
 * CUSTOMER PAGE API
 * ============================================================
 *
 * Mengambil satu halaman customer.
 *
 * Contoh:
 *
 * tnmd131_getCustomerPage('FBR', 0, 100)
 *
 * ============================================================
 */

function tnmd131_getCustomerPage(
  customer,
  offset,
  pageSize
) {

  tnmd131_requireEngine_();

  customer = tnmd131_customer_(customer);
  offset = tnmd131_offset_(offset);
  pageSize = tnmd131_pageSize_(pageSize);

  const page = tnmd13_getCustomerLedger(
    customer,
    offset,
    pageSize
  );

  const totalPage = (
    page.raw_count < pageSize
      ? Math.floor(offset / pageSize) + 1
      : null
  );

  return {
    success: true,

    api_version: TNMD131.VERSION,

    pelanggan: page.pelanggan,
    kategori: page.kategori,

    pagination: {
      offset: page.offset,
      page_size: page.page_size,
      page: Math.floor(page.offset / page.page_size) + 1,
      total_page: totalPage
    },

    summary: {
      raw_count: page.raw_count,
      active_count: page.active_count,
      total_piutang_page: tnmd131_num_(
        page.total_piutang
      )
    },

    transaksi: {
      pertama: page.transaksi_pertama,
      terakhir: page.transaksi_terakhir
    },

    data: page.data
  };
}


/* ============================================================
 * CUSTOMER SUMMARY API
 * ============================================================
 */

function tnmd131_getCustomerSummary(customer) {

  tnmd131_requireEngine_();

  customer = tnmd131_customer_(customer);

  const summary = tnmd13_getCustomerSummary(
    customer
  );

  return {
    success: true,

    api_version: TNMD131.VERSION,

    pelanggan: summary.pelanggan,
    kategori: summary.kategori,

    summary: {
      jumlah_page: summary.jumlah_page,
      jumlah_transaksi_aktif:
        summary.jumlah_transaksi_aktif,

      total_piutang:
        tnmd131_num_(summary.total_piutang)
    }
  };
}


/* ============================================================
 * CUSTOMER API
 * ============================================================
 *
 * Menggabungkan:
 *   - summary customer
 *   - halaman pertama
 *
 * Tujuannya agar frontend dapat melakukan
 * satu request awal.
 * ============================================================
 */

function tnmd131_getCustomerApi(
  customer,
  offset,
  pageSize
) {

  tnmd131_requireEngine_();

  customer = tnmd131_customer_(customer);
  offset = tnmd131_offset_(offset);
  pageSize = tnmd131_pageSize_(pageSize);

  const page = tnmd131_getCustomerPage(
    customer,
    offset,
    pageSize
  );

  const summary = tnmd131_getCustomerSummary(
    customer
  );

  return {
    success: true,

    api_version: TNMD131.VERSION,

    pelanggan: customer,

    kategori: page.kategori,

    pagination: page.pagination,

    summary: {
      jumlah_page:
        summary.summary.jumlah_page,

      jumlah_transaksi_aktif:
        summary.summary.jumlah_transaksi_aktif,

      total_piutang:
        summary.summary.total_piutang,

      raw_count_page:
        page.summary.raw_count,

      active_count_page:
        page.summary.active_count,

      total_piutang_page:
        page.summary.total_piutang_page
    },

    transaksi: page.transaksi,

    data: page.data
  };
}


/* ============================================================
 * TEST HELPER
 * ============================================================
 */

function tnmd131_result_(
  testName,
  started,
  callback
) {

  try {

    const result = callback();

    return {
      success: true,
      test: testName,
      generated_at: tnmd131_now_(),
      duration_ms:
        new Date().getTime() - started,

      result: result
    };

  } catch (err) {

    return {
      success: false,
      test: testName,
      generated_at: tnmd131_now_(),
      duration_ms:
        new Date().getTime() - started,

      error:
        err && err.message
          ? err.message
          : String(err)
    };
  }
}


/* ============================================================
 * TEST 1
 * CUSTOMER PAGE
 * ============================================================
 */

function tnmd131_testCustomerPage() {

  const started = new Date().getTime();

  return tnmd131_result_(
    'tnmd131_testCustomerPage',
    started,
    function() {

      const result =
        tnmd131_getCustomerPage(
          TNMD131.DEFAULT_CUSTOMER,
          0,
          TNMD131.PAGE_SIZE
        );

      return {
        pelanggan: result.pelanggan,
        kategori: result.kategori,

        page:
          result.pagination.page,

        page_size:
          result.pagination.page_size,

        raw_count:
          result.summary.raw_count,

        active_count:
          result.summary.active_count,

        total_piutang_page:
          result.summary.total_piutang_page,

        transaksi_pertama:
          result.transaksi.pertama,

        transaksi_terakhir:
          result.transaksi.terakhir
      };
    }
  );
}


/* ============================================================
 * TEST 2
 * CUSTOMER SUMMARY
 * ============================================================
 */

function tnmd131_testCustomerSummary() {

  const started = new Date().getTime();

  return tnmd131_result_(
    'tnmd131_testCustomerSummary',
    started,
    function() {

      const result =
        tnmd131_getCustomerSummary(
          TNMD131.DEFAULT_CUSTOMER
        );

      const expectedTransactions = 238;
      const expectedPiutang = 203200000;
      const expectedPages = 4;

      const checks = {

        page_count:
          result.summary.jumlah_page ===
          expectedPages,

        transaction_count:
          result.summary.jumlah_transaksi_aktif ===
          expectedTransactions,

        total_piutang:
          result.summary.total_piutang ===
          expectedPiutang
      };

      const pass =
        Object.keys(checks).every(
          function(key) {
            return checks[key] === true;
          }
        );

      return {
        pelanggan: result.pelanggan,
        kategori: result.kategori,

        jumlah_page:
          result.summary.jumlah_page,

        expected_page:
          expectedPages,

        jumlah_transaksi_aktif:
          result.summary.jumlah_transaksi_aktif,

        expected_transaksi:
          expectedTransactions,

        total_piutang:
          result.summary.total_piutang,

        expected_piutang:
          expectedPiutang,

        selisih_piutang:
          result.summary.total_piutang -
          expectedPiutang,

        checks: checks,

        status:
          pass ? 'PASS' : 'FAIL'
      };
    }
  );
}


/* ============================================================
 * TEST 3
 * CUSTOMER API
 * ============================================================
 */

function tnmd131_testCustomerApi() {

  const started = new Date().getTime();

  return tnmd131_result_(
    'tnmd131_testCustomerApi',
    started,
    function() {

      const result =
        tnmd131_getCustomerApi(
          TNMD131.DEFAULT_CUSTOMER,
          0,
          TNMD131.PAGE_SIZE
        );

      const valid =
        result.success === true &&
        result.api_version === '1.3.1' &&
        result.pelanggan === 'FBR' &&
        result.summary.jumlah_page === 4 &&
        result.summary.jumlah_transaksi_aktif === 238 &&
        result.summary.total_piutang === 203200000 &&
        result.pagination.page === 1 &&
        result.pagination.page_size === 100 &&
        Array.isArray(result.data);

      return {

        api_version:
          result.api_version,

        pelanggan:
          result.pelanggan,

        kategori:
          result.kategori,

        pagination:
          result.pagination,

        summary:
          result.summary,

        data_count:
          result.data.length,

        valid:
          valid,

        status:
          valid ? 'PASS' : 'FAIL'
      };
    }
  );
}


/* ============================================================
 * TEST 4
 * ALL TESTS
 * ============================================================
 */

function tnmd131_runAllTests() {

  const started = new Date().getTime();

  const tests = [

    tnmd131_testCustomerPage(),

    tnmd131_testCustomerSummary(),

    tnmd131_testCustomerApi()

  ];

  const status =
    tests.every(function(item) {

      return (
        item.success === true &&
        (!item.result ||
         item.result.status !== 'FAIL')
      );

    })
      ? 'PASS'
      : 'FAIL';

  return {

    success:
      status === 'PASS',

    test:
      'tnmd131_runAllTests',

    generated_at:
      tnmd131_now_(),

    duration_ms:
      new Date().getTime() - started,

    status:
      status,

    tests:
      tests.map(function(item) {

        return {

          test:
            item.test,

          success:
            item.success,

          status:
            item.result
              ? item.result.status || null
              : null,

          error:
            item.error || null
        };

      })
  };
}
/**
 * ============================================================
 * TNMD v1.3.1 - TEST RUNNER
 * ============================================================
 *
 * Tujuan:
 * Memastikan hasil test benar-benar muncul
 * di Execution log sebagai JSON.
 * ============================================================
 */

function tnmd131_printJson_(label, data) {
  const json = JSON.stringify(data, null, 2);

  console.log(label + '\n' + json);

  return data;
}


/**
 * TEST 1
 */
function tnmd131_runTestPage() {

  const result = tnmd131_testCustomerPage();

  return tnmd131_printJson_(
    'TNMD v1.3.1 - TEST CUSTOMER PAGE',
    result
  );
}


/**
 * TEST 2
 */
function tnmd131_runTestSummary() {

  const result = tnmd131_testCustomerSummary();

  return tnmd131_printJson_(
    'TNMD v1.3.1 - TEST CUSTOMER SUMMARY',
    result
  );
}


/**
 * TEST 3
 */
function tnmd131_runTestApi() {

  const result = tnmd131_testCustomerApi();

  return tnmd131_printJson_(
    'TNMD v1.3.1 - TEST CUSTOMER API',
    result
  );
}


/**
 * RUN SEMUA TEST
 */
function tnmd131_runTestRunner() {

  const started = new Date().getTime();

  const tests = [];

  tests.push(
    tnmd131_testCustomerPage()
  );

  tests.push(
    tnmd131_testCustomerSummary()
  );

  tests.push(
    tnmd131_testCustomerApi()
  );

  const status = tests.every(function(test) {

    return (
      test &&
      test.success === true &&
      (!test.result ||
       test.result.status !== 'FAIL')
    );

  }) ? 'PASS' : 'FAIL';

  const result = {

    success: status === 'PASS',

    test: 'tnmd131_runTestRunner',

    generated_at:
      new Date().toISOString(),

    duration_ms:
      new Date().getTime() - started,

    status: status,

    tests: tests.map(function(test) {

      return {

        test: test.test,

        success: test.success,

        status:
          test.result
            ? test.result.status || null
            : null,

        error:
          test.error || null

      };

    })

  };

  return tnmd131_printJson_(
    'TNMD v1.3.1 - ALL TESTS',
    result
  );
}
