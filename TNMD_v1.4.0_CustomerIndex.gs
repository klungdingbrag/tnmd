/**
 * TNMD v1.4.0 - Customer Index Engine
 * Development branch: dev/v1.4
 * Baseline: TNMD v1.3.2 (frozen)
 *
 * Builds a reusable customer index for active piutang.
 * Adds explicit JSON logging so Apps Script execution logs always show
 * the test result instead of relying only on the function return value.
 */

const TNMD140 = {
  VERSION: '1.4.0',
  PAGE_SIZE: 100,
  DEFAULT_EXPECTED_TRANSACTIONS: 2164,
  DEFAULT_EXPECTED_PIUTANG: 1833274428,
  DEFAULT_EXPECTED_CUSTOMERS: 254
};

function tnmd140_now_() {
  return new Date().toISOString();
}

function tnmd140_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
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

function tnmd140_category_(customer, jenis) {
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

function tnmd140_fetchPage_(offset) {
  tnmd140_requireCore_();

  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql = `
    SELECT pelanggan,jenis,piutang
    FROM penjualan
    WHERE piutang > 0
    LIMIT ${TNMD140.PAGE_SIZE} OFFSET ${safeOffset}
  `;

  const response = requestSid_(sql);
  const rows = Array.isArray(response) ? response :
    (response && Array.isArray(response.data) ? response.data : []);

  return rows.map(function(row) {
    return {
      pelanggan: String(row.pelanggan || '').trim(),
      jenis: String(row.jenis || '').trim(),
      piutang: tnmd140_num_(row.piutang)
    };
  });
}

function tnmd140_newCustomer_(customer, jenis) {
  return {
    pelanggan: customer,
    kategori: tnmd140_category_(customer, jenis),
    jumlah_transaksi: 0,
    total_piutang: 0
  };
}

function tnmd140_buildCustomerIndex() {
  const customers = {};
  const categoryTotals = {
    TOKO: { jumlah_transaksi: 0, total_piutang: 0 },
    CABANG: { jumlah_transaksi: 0, total_piutang: 0 },
    PARTAI: { jumlah_transaksi: 0, total_piutang: 0 },
    LAIN: { jumlah_transaksi: 0, total_piutang: 0 }
  };

  let offset = 0;
  let totalTransactions = 0;
  let totalPiutang = 0;
  let pageCount = 0;

  while (true) {
    const rows = tnmd140_fetchPage_(offset);
    pageCount++;

    rows.forEach(function(row) {
      if (!row.pelanggan || row.piutang <= 0) return;

      const category = tnmd140_category_(row.pelanggan, row.jenis);
      const key = row.pelanggan;

      if (!customers[key]) {
        customers[key] = tnmd140_newCustomer_(row.pelanggan, row.jenis);
      }

      customers[key].jumlah_transaksi++;
      customers[key].total_piutang += row.piutang;
      categoryTotals[category].jumlah_transaksi++;
      categoryTotals[category].total_piutang += row.piutang;
      totalTransactions++;
      totalPiutang += row.piutang;
    });

    if (rows.length < TNMD140.PAGE_SIZE) break;
    offset += TNMD140.PAGE_SIZE;
  }

  const data = Object.keys(customers).map(function(key) {
    return customers[key];
  });

  data.sort(function(a, b) {
    return b.total_piutang - a.total_piutang ||
      a.pelanggan.localeCompare(b.pelanggan);
  });

  return {
    success: true,
    api_version: TNMD140.VERSION,
    generated_at: tnmd140_now_(),
    total: {
      transaksi: totalTransactions,
      piutang: totalPiutang,
      jumlah_customer: data.length
    },
    pagination: {
      page_size: TNMD140.PAGE_SIZE,
      jumlah_page: pageCount
    },
    kategori: categoryTotals,
    data: data
  };
}

function tnmd140_result_(test, started, fn) {
  try {
    const result = fn();
    return {
      success: true,
      test: test,
      generated_at: tnmd140_now_(),
      duration_ms: new Date().getTime() - started,
      result: result
    };
  } catch (err) {
    return {
      success: false,
      test: test,
      generated_at: tnmd140_now_(),
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function tnmd140_testCustomerIndex() {
  const started = new Date().getTime();
  const output = tnmd140_result_('tnmd140_testCustomerIndex', started, function() {
    const index = tnmd140_buildCustomerIndex();
    const checks = {
      transaction_count: index.total.transaksi === TNMD140.DEFAULT_EXPECTED_TRANSACTIONS,
      total_piutang: index.total.piutang === TNMD140.DEFAULT_EXPECTED_PIUTANG,
      customer_count: index.total.jumlah_customer === TNMD140.DEFAULT_EXPECTED_CUSTOMERS,
      page_size: index.pagination.page_size === TNMD140.PAGE_SIZE
    };

    const pass = Object.keys(checks).every(function(key) {
      return checks[key];
    });

    return {
      api_version: TNMD140.VERSION,
      total: index.total,
      expected: {
        transaksi: TNMD140.DEFAULT_EXPECTED_TRANSACTIONS,
        piutang: TNMD140.DEFAULT_EXPECTED_PIUTANG,
        jumlah_customer: TNMD140.DEFAULT_EXPECTED_CUSTOMERS
      },
      pagination: index.pagination,
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
      return row.pelanggan &&
        ['TOKO', 'CABANG', 'PARTAI', 'LAIN'].indexOf(row.kategori) !== -1 &&
        row.jumlah_transaksi > 0 &&
        row.total_piutang > 0;
    });

    return {
      customer_count: index.data.length,
      first_customer: first,
      valid_customer_rows: validCustomerRows,
      status: first && validCustomerRows ? 'PASS' : 'FAIL'
    };
  });

  return tnmd140_logJson_('TNMD v1.4.0 - Customer Index Structure Test', output);
}

function tnmd140_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd140_testCustomerIndex(),
    tnmd140_testCustomerIndexStructure()
  ];

  const status = tests.every(function(item) {
    return item && item.success && (!item.result || item.result.status !== 'FAIL');
  }) ? 'PASS' : 'FAIL';

  const output = {
    success: status === 'PASS',
    test: 'tnmd140_runAllTests',
    generated_at: tnmd140_now_(),
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

  return tnmd140_logJson_('TNMD v1.4.0 - ALL TESTS', output);
}
