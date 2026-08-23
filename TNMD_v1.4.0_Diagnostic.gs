/**
 * TNMD v1.4.0 - SID Diagnostic
 * Branch: dev/v1.4
 *
 * Purpose:
 * Diagnose which SID SQL patterns actually return usable data before
 * changing the Customer Index architecture.
 *
 * IMPORTANT:
 * - This file is diagnostic only.
 * - It does NOT replace v1.3.2.
 * - It does NOT modify Code.gs.
 * - It does NOT build the Customer Index.
 *
 * The tests compare several read-only query shapes and report the raw
 * response shape, row count, first rows, and errors.
 */

const TNMD140D = {
  VERSION: '1.4.0-DIAGNOSTIC',
  SAMPLE_ROWS: 5
};

function tnmd140d_now_() {
  return new Date().toISOString();
}

function tnmd140d_logJson_(label, value) {
  const json = JSON.stringify(value, null, 2);
  Logger.log(label + '\n' + json);
  return value;
}

function tnmd140d_requireCore_() {
  if (typeof requestSid_ !== 'function') {
    throw new Error('requestSid_ is not defined. Load the TNMD core first.');
  }
}

function tnmd140d_summarizeResponse_(response) {
  const rows = Array.isArray(response) ? response :
    (response && Array.isArray(response.data) ? response.data : []);

  return {
    response_type: Array.isArray(response) ? 'ARRAY' : typeof response,
    has_data_array: !!(response && Array.isArray(response.data)),
    row_count: rows.length,
    sample_rows: rows.slice(0, TNMD140D.SAMPLE_ROWS)
  };
}

function tnmd140d_runSql_(name, sql) {
  const started = new Date().getTime();

  try {
    tnmd140d_requireCore_();
    const response = requestSid_(sql);
    const summary = tnmd140d_summarizeResponse_(response);

    return {
      name: name,
      success: true,
      duration_ms: new Date().getTime() - started,
      sql: sql,
      summary: summary
    };
  } catch (err) {
    return {
      name: name,
      success: false,
      duration_ms: new Date().getTime() - started,
      sql: sql,
      error: err && err.message ? err.message : String(err)
    };
  }
}

/**
 * Test 1: the proven FBR customer query from v1.3.2.
 * This is our control query and should return 100 raw rows.
 */
function tnmd140d_testProvenCustomerQuery() {
  const output = tnmd140d_runSql_(
    'proven_customer_FBR',
    `
      SELECT kode,tanggal,pelanggan,jenis,piutang
      FROM penjualan
      WHERE pelanggan='FBR'
      LIMIT 100 OFFSET 0
    `
  );

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - PROVEN CUSTOMER QUERY', output);
}

/**
 * Test 2: broad customer discovery without piutang filter.
 */
function tnmd140d_testBroadCustomerQuery() {
  const output = tnmd140d_runSql_(
    'broad_customer_query',
    `
      SELECT pelanggan,jenis,piutang
      FROM penjualan
      LIMIT 100
    `
  );

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - BROAD CUSTOMER QUERY', output);
}

/**
 * Test 3: broad customer discovery with only pelanggan.
 */
function tnmd140d_testCustomerOnlyQuery() {
  const output = tnmd140d_runSql_(
    'customer_only_query',
    `
      SELECT pelanggan
      FROM penjualan
      LIMIT 100
    `
  );

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - CUSTOMER ONLY QUERY', output);
}

/**
 * Test 4: broad query with the primary key and customer fields.
 */
function tnmd140d_testCodeCustomerQuery() {
  const output = tnmd140d_runSql_(
    'code_customer_query',
    `
      SELECT kode,pelanggan
      FROM penjualan
      LIMIT 100
    `
  );

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - CODE CUSTOMER QUERY', output);
}

/**
 * Test 5: count query. This tells us whether aggregate COUNT is supported
 * and whether the table can be addressed without a customer filter.
 */
function tnmd140d_testCountQuery() {
  const output = tnmd140d_runSql_(
    'count_query',
    `
      SELECT COUNT(*) AS jumlah
      FROM penjualan
    `
  );

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - COUNT QUERY', output);
}

/**
 * Test 6: distinct customer query. This is the preferred discovery route
 * if SID supports DISTINCT correctly.
 */
function tnmd140d_testDistinctCustomerQuery() {
  const output = tnmd140d_runSql_(
    'distinct_customer_query',
    `
      SELECT DISTINCT pelanggan
      FROM penjualan
    `
  );

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - DISTINCT CUSTOMER QUERY', output);
}

/**
 * Run every diagnostic query and print one compact JSON result.
 */
function tnmd140d_runAllTests() {
  const started = new Date().getTime();

  const tests = [
    tnmd140d_testProvenCustomerQuery(),
    tnmd140d_testBroadCustomerQuery(),
    tnmd140d_testCustomerOnlyQuery(),
    tnmd140d_testCodeCustomerQuery(),
    tnmd140d_testCountQuery(),
    tnmd140d_testDistinctCustomerQuery()
  ];

  const output = {
    success: tests.every(function(item) { return item && item.success; }),
    test: 'tnmd140d_runAllTests',
    generated_at: tnmd140d_now_(),
    duration_ms: new Date().getTime() - started,
    version: TNMD140D.VERSION,
    tests: tests.map(function(item) {
      return {
        name: item.name,
        success: item.success,
        row_count: item.summary ? item.summary.row_count : null,
        error: item.error || null
      };
    })
  };

  return tnmd140d_logJson_('TNMD v1.4.0 DIAGNOSTIC - ALL TESTS', output);
}
