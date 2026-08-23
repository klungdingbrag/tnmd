/**
 * TNMD v1.4.0 - Customer Index Engine
 * Development branch: dev/v1.4
 * Baseline: TNMD v1.3.2 (frozen)
 *
 * Uses the proven v1.3.2 customer pagination path. The SID wrapper returns
 * { success, kode_trx, message, sid_response:{ status, count, data:[] } },
 * so this module explicitly unwraps sid_response.data.
 *
 * v1.4.0 is intentionally read-only and does not replace the v1.3.2 core.
 */

const TNMD140 = {
  VERSION: '1.4.0',
  PAGE_SIZE: 100,
  DEFAULT_EXPECTED_TRANSACTIONS: 2164,
  DEFAULT_EXPECTED_PIUTANG: 1833274428,
  DEFAULT_EXPECTED_CUSTOMERS: 254
};

function tnmd140_now_() { return new Date().toISOString(); }

function tnmd140_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const text = String(value).trim().replace(/,/g, '');
  if (text === '.00' || text === '.0' || text === '.') return 0;
  const n = Number(text);
  return isNaN(n) ? 0 : n;
}

function tnmd140_requireCore_() {
  if (typeof requestSid_ !== 'function') {
    throw new Error('requestSid_ is not defined. Load the TNMD core first.');
  }
}

function tnmd140_logJson_(label, value) {
  const json = JSON.stringify(value, null, 2);
  Logger.log(label + '\n' + json);
  return value;
}

function tnmd140_escapeSql_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

/** Unwrap the actual SID response shape discovered by raw diagnostics. */
function tnmd140_rows_(response) {
  if (Array.isArray(response)) return response;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) {
    if (response.sid_response.status && response.sid_response.status !== 'success') {
      throw new Error('SID query failed: ' + JSON.stringify(response.sid_response));
    }
    return response.sid_response.data;
  }
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

function tnmd140_assertRows_(response, context) {
  const rows = tnmd140_rows_(response);
  if (!rows.length && response && response.sid_response && response.sid_response.status === 'success' && Number(response.sid_response.count) > 0) {
    throw new Error('SID reported ' + response.sid_response.count + ' rows but the parser extracted 0 rows in ' + context + '.');
  }
  return rows;
}

function tnmd140_category_(customer, jenis) {
  const name = String(customer || '').trim();
  const type = String(jenis || '').trim().toUpperCase();

  if (typeof CUSTOMER_CABANG !== 'undefined' && Array.isArray(CUSTOMER_CABANG) && CUSTOMER_CABANG.indexOf(name) !== -1) return 'CABANG';
  if (type === 'PENJUALAN TOKO') return 'TOKO';
  if (type === 'PENJUALAN CABANG') return 'CABANG';
  if (type === 'PENJUALAN PARTAI') return 'PARTAI';
  return 'LAIN';
}

/**
 * Customer discovery is based on the dashboard's known-good global query.
 * We only use the first page for discovery; the complete ledger is then
 * fetched per customer using the proven customer-filtered pagination.
 */
function tnmd140_discoverCustomers_() {
  tnmd140_requireCore_();

  const sql = `
    SELECT pelanggan,jenis,piutang
    FROM penjualan
    LIMIT ${TNMD140.PAGE_SIZE} OFFSET 0
  `;

  const response = requestSid_(sql);
  const rows = tnmd140_assertRows_(response, 'customer discovery');
  const customers = {};

  rows.forEach(function(row) {
    const customer = String(row.pelanggan || '').trim();
    if (!customer) return;
    if (!customers[customer]) {
      customers[customer] = { pelanggan: customer, jenis: String(row.jenis || '').trim() };
    }
  });

  return Object.keys(customers).map(function(key) { return customers[key]; });
}

function tnmd140_fetchCustomerPage_(customer, offset) {
  tnmd140_requireCore_();
  const safeCustomer = tnmd140_escapeSql_(customer);
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql = `
    SELECT kode,tanggal,pelanggan,jenis,piutang
    FROM penjualan
    WHERE pelanggan='${safeCustomer}'
    LIMIT ${TNMD140.PAGE_SIZE} OFFSET ${safeOffset}
  `;

  const response = requestSid_(sql);
  const rows = tnmd140_assertRows_(response, 'customer=' + customer + ', offset=' + safeOffset);

  return rows.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: String(row.pelanggan || customer).trim(),
      jenis: String(row.jenis || '').trim(),
      piutang: tnmd140_num_(row.piutang)
    };
  });
}

function tnmd140_buildCustomerIndex() {
  const discovered = tnmd140_discoverCustomers_();
  const customers = {};
  const categoryTotals = {
    TOKO: { jumlah_transaksi: 0, total_piutang: 0 },
    CABANG: { jumlah_transaksi: 0, total_piutang: 0 },
    PARTAI: { jumlah_transaksi: 0, total_piutang: 0 },
    LAIN: { jumlah_transaksi: 0, total_piutang: 0 }
  };

  let totalTransactions = 0;
  let totalPiutang = 0;
  let ledgerCustomers = 0;
  let customerPageCalls = 0;

  discovered.forEach(function(item) {
    const customer = item.pelanggan;
    let offset = 0;
    let customerHasActive = false;

    while (true) {
      const rows = tnmd140_fetchCustomerPage_(customer, offset);
      customerPageCalls++;

      rows.forEach(function(row) {
        if (!row.pelanggan || row.piutang <= 0) return;
        const category = tnmd140_category_(row.pelanggan, row.jenis);
        const key = row.pelanggan;

        if (!customers[key]) {
          customers[key] = { pelanggan: key, kategori: category, jumlah_transaksi: 0, total_piutang: 0 };
        }

        customers[key].jumlah_transaksi++;
        customers[key].total_piutang += row.piutang;
        categoryTotals[category].jumlah_transaksi++;
        categoryTotals[category].total_piutang += row.piutang;
        totalTransactions++;
        totalPiutang += row.piutang;
        customerHasActive = true;
      });

      if (rows.length < TNMD140.PAGE_SIZE) break;
      offset += TNMD140.PAGE_SIZE;
    }

    if (customerHasActive) ledgerCustomers++;
  });

  const data = Object.keys(customers).map(function(key) { return customers[key]; });
  data.sort(function(a, b) {
    return b.total_piutang - a.total_piutang || a.pelanggan.localeCompare(b.pelanggan);
  });

  return {
    success: true,
    api_version: TNMD140.VERSION,
    generated_at: tnmd140_now_(),
    total: { transaksi: totalTransactions, piutang: totalPiutang, jumlah_customer: data.length },
    discovery: {
      jumlah_customer_ditemukan: discovered.length,
      jumlah_customer_aktif: ledgerCustomers,
      customer_page_calls: customerPageCalls
    },
    kategori: categoryTotals,
    data: data
  };
}

function tnmd140_result_(test, started, fn) {
  try {
    return { success: true, test: test, generated_at: tnmd140_now_(), duration_ms: new Date().getTime() - started, result: fn() };
  } catch (err) {
    return { success: false, test: test, generated_at: tnmd140_now_(), duration_ms: new Date().getTime() - started, error: err && err.message ? err.message : String(err) };
  }
}

function tnmd140_testCustomerIndex() {
  const started = new Date().getTime();
  const output = tnmd140_result_('tnmd140_testCustomerIndex', started, function() {
    const index = tnmd140_buildCustomerIndex();
    const checks = {
      transaction_count: index.total.transaksi === TNMD140.DEFAULT_EXPECTED_TRANSACTIONS,
      total_piutang: index.total.piutang === TNMD140.DEFAULT_EXPECTED_PIUTANG,
      customer_count: index.total.jumlah_customer === TNMD140.DEFAULT_EXPECTED_CUSTOMERS
    };
    const pass = Object.keys(checks).every(function(key) { return checks[key]; });

    return {
      api_version: TNMD140.VERSION,
      total: index.total,
      expected: { transaksi: TNMD140.DEFAULT_EXPECTED_TRANSACTIONS, piutang: TNMD140.DEFAULT_EXPECTED_PIUTANG, jumlah_customer: TNMD140.DEFAULT_EXPECTED_CUSTOMERS },
      discovery: index.discovery,
      checks: checks,
      status: pass ? 'PASS' : 'FAIL'
    };
  });

  return tnmd140_logJson_('TNMD v1.4.0 - Customer Index Test', output);
}

function tnmd140_testCustomerIndexStructure() {
  const started = new Date().getTime();
  const output = tnmd140_result_('tnmd140_testCustomerIndexStructure', started, function() {
    const index = tnmd140_buildCustomerIndex();
    const first = index.data.length ? index.data[0] : null;
    const validCustomerRows = index.data.every(function(row) {
      return row.pelanggan && ['TOKO', 'CABANG', 'PARTAI', 'LAIN'].indexOf(row.kategori) !== -1 && row.jumlah_transaksi > 0 && row.total_piutang > 0;
    });
    return { customer_count: index.data.length, first_customer: first, valid_customer_rows: validCustomerRows, status: first && validCustomerRows ? 'PASS' : 'FAIL' };
  });
  return tnmd140_logJson_('TNMD v1.4.0 - Customer Index Structure Test', output);
}

function tnmd140_runAllTests() {
  const started = new Date().getTime();
  const tests = [tnmd140_testCustomerIndex(), tnmd140_testCustomerIndexStructure()];
  const status = tests.every(function(item) { return item && item.success && (!item.result || item.result.status !== 'FAIL'); }) ? 'PASS' : 'FAIL';
  const output = {
    success: status === 'PASS',
    test: 'tnmd140_runAllTests',
    generated_at: tnmd140_now_(),
    duration_ms: new Date().getTime() - started,
    status: status,
    tests: tests.map(function(item) { return { test: item.test, success: item.success, status: item.result ? item.result.status || null : null, error: item.error || null }; })
  };
  return tnmd140_logJson_('TNMD v1.4.0 - ALL TESTS', output);
}
