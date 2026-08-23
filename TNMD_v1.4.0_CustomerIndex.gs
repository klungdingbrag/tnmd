/**
 * TNMD v1.4.0 - Customer Index Engine
 * Branch: dev/v1.4
 * Baseline: TNMD v1.3.2 (frozen)
 *
 * ARCHITECTURE v1.4.0
 * 1. Read the penjualan table through global pagination only.
 * 2. Aggregate the 2,164 raw transactions locally into a customer index.
 * 3. Do NOT query every customer during index construction.
 * 4. Customer ledger remains on-demand and can reuse v1.3.2 pagination later.
 *
 * This avoids the previous 254-customer x N-page query explosion that caused
 * SID/MySQL connection loss on customer 2204017.
 *
 * SID wrapper shape discovered by raw diagnostics:
 * { success, kode_trx, message,
 *   sid_response:{ status, count, data:[] } }
 */

const TNMD140 = {
  VERSION: '1.4.0',
  PAGE_SIZE: 100,
  MAX_GLOBAL_PAGES: 100,
  TRANSIENT_RETRIES: 2,
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
  Logger.log(label + '\n' + JSON.stringify(value, null, 2));
  return value;
}

function tnmd140_escapeSql_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

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
    throw new Error('SID reported ' + response.sid_response.count + ' rows but parser extracted 0 rows in ' + context + '.');
  }
  return rows;
}

function tnmd140_isTransient_(err) {
  const text = String(err && err.message ? err.message : err).toLowerCase();
  return text.indexOf('lost connection') !== -1 ||
         text.indexOf('timeout') !== -1 ||
         text.indexOf('timed out') !== -1 ||
         text.indexOf('temporarily') !== -1;
}

/**
 * Read one global page. A transient SID/MySQL connection failure gets a
 * small bounded retry; permanent SQL errors fail immediately.
 */
function tnmd140_fetchGlobalPage_(offset) {
  tnmd140_requireCore_();
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql = `
    SELECT kode,tanggal,pelanggan,jenis,piutang
    FROM penjualan
    LIMIT ${TNMD140.PAGE_SIZE} OFFSET ${safeOffset}
  `;

  let lastError = null;
  for (let attempt = 0; attempt <= TNMD140.TRANSIENT_RETRIES; attempt++) {
    try {
      const response = requestSid_(sql);
      return {
        offset: safeOffset,
        rows: tnmd140_assertRows_(response, 'global offset=' + safeOffset),
        attempts: attempt + 1
      };
    } catch (err) {
      lastError = err;
      if (!tnmd140_isTransient_(err) || attempt >= TNMD140.TRANSIENT_RETRIES) throw err;
      Utilities.sleep(750 * Math.pow(2, attempt));
    }
  }
  throw lastError || new Error('Unknown global page error.');
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

function tnmd140_buildCustomerIndex() {
  const customers = {};
  const categoryTotals = {
    TOKO: { jumlah_transaksi: 0, total_piutang: 0 },
    CABANG: { jumlah_transaksi: 0, total_piutang: 0 },
    PARTAI: { jumlah_transaksi: 0, total_piutang: 0 },
    LAIN: { jumlah_transaksi: 0, total_piutang: 0 }
  };

  let offset = 0;
  let pageCount = 0;
  let rawTransactions = 0;
  let totalPiutang = 0;
  let totalAttempts = 0;
  const seenCodes = {};
  let duplicateCount = 0;

  while (pageCount < TNMD140.MAX_GLOBAL_PAGES) {
    const page = tnmd140_fetchGlobalPage_(offset);
    const rows = page.rows;
    pageCount++;
    totalAttempts += page.attempts;
    rawTransactions += rows.length;

    rows.forEach(function(row) {
      const customer = String(row.pelanggan || '').trim();
      const kode = String(row.kode || '').trim();
      const jenis = String(row.jenis || '').trim();
      const piutang = tnmd140_num_(row.piutang);

      if (kode) {
        if (seenCodes[kode]) duplicateCount++;
        seenCodes[kode] = true;
      }

      if (!customer) return;

      if (!customers[customer]) {
        customers[customer] = {
          pelanggan: customer,
          kategori: tnmd140_category_(customer, jenis),
          jumlah_transaksi: 0,
          total_piutang: 0
        };
      }

      customers[customer].jumlah_transaksi++;

      if (piutang > 0) {
        customers[customer].total_piutang += piutang;
        const category = tnmd140_category_(customer, jenis);
        categoryTotals[category].jumlah_transaksi++;
        categoryTotals[category].total_piutang += piutang;
        totalPiutang += piutang;
      }
    });

    if (rows.length < TNMD140.PAGE_SIZE) break;
    offset += TNMD140.PAGE_SIZE;
  }

  if (pageCount >= TNMD140.MAX_GLOBAL_PAGES && rawTransactions % TNMD140.PAGE_SIZE === 0) {
    throw new Error('Global pagination reached MAX_GLOBAL_PAGES safety limit.');
  }

  const data = Object.keys(customers).map(function(key) {
    return customers[key];
  });

  const activeCustomers = data.filter(function(row) { return row.total_piutang > 0; });
  activeCustomers.sort(function(a, b) {
    return b.total_piutang - a.total_piutang || a.pelanggan.localeCompare(b.pelanggan);
  });

  return {
    success: true,
    api_version: TNMD140.VERSION,
    generated_at: tnmd140_now_(),
    total: {
      transaksi: rawTransactions,
      piutang: totalPiutang,
      jumlah_customer: activeCustomers.length
    },
    raw: {
      jumlah_customer_ditemukan: data.length,
      jumlah_customer_aktif: activeCustomers.length,
      jumlah_page: pageCount,
      page_size: TNMD140.PAGE_SIZE,
      request_attempts: totalAttempts,
      duplicate_kode: duplicateCount
    },
    kategori: categoryTotals,
    data: activeCustomers
  };
}

function tnmd140_result_(test, started, fn) {
  try {
    return {
      success: true,
      test: test,
      generated_at: tnmd140_now_(),
      duration_ms: new Date().getTime() - started,
      result: fn()
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
      page_size: index.raw.page_size === TNMD140.PAGE_SIZE,
      duplicate: index.raw.duplicate_kode === 0
    };

    const pass = Object.keys(checks).every(function(key) { return checks[key]; });

    return {
      api_version: TNMD140.VERSION,
      total: index.total,
      expected: {
        transaksi: TNMD140.DEFAULT_EXPECTED_TRANSACTIONS,
        piutang: TNMD140.DEFAULT_EXPECTED_PIUTANG,
        jumlah_customer: TNMD140.DEFAULT_EXPECTED_CUSTOMERS
      },
      pagination: index.raw,
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
    const valid = index.data.every(function(row) {
      return row.pelanggan &&
        ['TOKO', 'CABANG', 'PARTAI', 'LAIN'].indexOf(row.kategori) !== -1 &&
        row.jumlah_transaksi > 0 &&
        row.total_piutang > 0;
    });

    return {
      customer_count: index.data.length,
      first_customer: first,
      valid_customer_rows: valid,
      status: first && valid ? 'PASS' : 'FAIL'
    };
  });

  return tnmd140_logJson_('TNMD v1.4.0 - Customer Index Structure Test', output);
}

/** Control test: one known customer query, without rebuilding the index. */
function tnmd140_testOnDemandFBR() {
  const started = new Date().getTime();
  const output = tnmd140_result_('tnmd140_testOnDemandFBR', started, function() {
    const customer = 'FBR';
    const safeCustomer = tnmd140_escapeSql_(customer);
    const sql = `
      SELECT kode,tanggal,pelanggan,jenis,piutang
      FROM penjualan
      WHERE pelanggan='${safeCustomer}'
      LIMIT ${TNMD140.PAGE_SIZE} OFFSET 0
    `;
    const response = requestSid_(sql);
    const rows = tnmd140_assertRows_(response, 'on-demand FBR');
    const active = rows.filter(function(row) { return tnmd140_num_(row.piutang) > 0; });
    return {
      pelanggan: customer,
      raw_count: rows.length,
      active_count: active.length,
      total_piutang_page: active.reduce(function(sum, row) { return sum + tnmd140_num_(row.piutang); }, 0),
      first_code: rows.length ? rows[0].kode : null,
      last_code: rows.length ? rows[rows.length - 1].kode : null,
      status: rows.length === 100 ? 'PASS' : 'FAIL'
    };
  });
  return tnmd140_logJson_('TNMD v1.4.0 - On-Demand FBR Test', output);
}

function tnmd140_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd140_testCustomerIndex(),
    tnmd140_testCustomerIndexStructure(),
    tnmd140_testOnDemandFBR()
  ];

  const status = tests.every(function(item) {
    return item && item.success && (!item.result || item.result.status !== 'FAIL');
  }) ? 'PASS' : 'FAIL';

  return tnmd140_logJson_('TNMD v1.4.0 - ALL TESTS', {
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
  });
}
