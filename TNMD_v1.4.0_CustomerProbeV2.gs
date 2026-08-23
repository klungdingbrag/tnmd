/**
 * TNMD v1.4.0 - Customer Probe V2
 *
 * Diagnostic only. Does NOT replace v1.3.2 or the v1.4.0 engine.
 *
 * Purpose:
 *   Validate customer-scoped OFFSET pagination across a small, explicit
 *   customer set before building the final Customer Index.
 *
 * Safety:
 *   - Never scans the whole penjualan table.
 *   - Uses WHERE pelanggan=... for every request.
 *   - Uses LIMIT 100.
 *   - Has a hard maximum page count per customer.
 *   - Default probe set is deliberately small.
 *
 * Required core dependency:
 *   requestSid_(sql)
 */

const TNMD140PV2 = {
  VERSION: '1.4.0-customer-probe-v2',
  PAGE_SIZE: 100,
  MAX_PAGES_PER_CUSTOMER: 10,
  CUSTOMERS: ['FBR', 'RIMBAL'],
  STOP_ON_ERROR: false
};

function tnmd140pv2_now_() { return new Date().toISOString(); }

function tnmd140pv2_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function tnmd140pv2_escape_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function tnmd140pv2_rows_(response) {
  if (Array.isArray(response)) return response;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) {
    return response.sid_response.data;
  }
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

function tnmd140pv2_queryPage_(customer, offset) {
  if (typeof requestSid_ !== 'function') {
    throw new Error('requestSid_ is not defined. Load the TNMD core first.');
  }

  customer = String(customer || '').trim();
  offset = Math.max(0, Number(offset) || 0);

  const sql = `SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan='${tnmd140pv2_escape_(customer)}' ORDER BY tanggal,kode LIMIT ${TNMD140PV2.PAGE_SIZE} OFFSET ${offset}`;
  const started = new Date().getTime();
  const response = requestSid_(sql);
  const rows = tnmd140pv2_rows_(response).map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || customer,
      jenis: row.jenis || '',
      piutang: tnmd140pv2_num_(row.piutang)
    };
  });

  return {
    offset: offset,
    raw_count: rows.length,
    duration_ms: new Date().getTime() - started,
    first_code: rows.length ? rows[0].kode : null,
    last_code: rows.length ? rows[rows.length - 1].kode : null,
    rows: rows,
    sql: sql
  };
}

function tnmd140pv2_probeCustomer_(customer) {
  customer = String(customer || '').trim();
  if (!customer) throw new Error('Customer name is empty.');

  const started = new Date().getTime();
  const pages = [];
  const all = [];
  let offset = 0;
  let stoppedByMaxPages = false;

  for (let pageNo = 1; pageNo <= TNMD140PV2.MAX_PAGES_PER_CUSTOMER; pageNo++) {
    const page = tnmd140pv2_queryPage_(customer, offset);
    pages.push({
      page: pageNo,
      offset: page.offset,
      raw_count: page.raw_count,
      first_code: page.first_code,
      last_code: page.last_code,
      duration_ms: page.duration_ms
    });
    Array.prototype.push.apply(all, page.rows);

    if (page.raw_count < TNMD140PV2.PAGE_SIZE) break;

    if (pageNo === TNMD140PV2.MAX_PAGES_PER_CUSTOMER) {
      stoppedByMaxPages = true;
      break;
    }

    offset += TNMD140PV2.PAGE_SIZE;
  }

  const seen = {};
  let duplicateCount = 0;
  let totalPiutang = 0;
  let activeCount = 0;

  all.forEach(function(row) {
    if (row.kode && seen[row.kode]) duplicateCount++;
    if (row.kode) seen[row.kode] = true;
    if (row.piutang > 0) {
      activeCount++;
      totalPiutang += row.piutang;
    }
  });

  const lastPage = pages.length ? pages[pages.length - 1] : null;
  const complete = !!lastPage && lastPage.raw_count < TNMD140PV2.PAGE_SIZE;

  return {
    pelanggan: customer,
    page_size: TNMD140PV2.PAGE_SIZE,
    max_pages: TNMD140PV2.MAX_PAGES_PER_CUSTOMER,
    jumlah_page: pages.length,
    total_raw: all.length,
    jumlah_transaksi_aktif: activeCount,
    total_piutang: totalPiutang,
    duplicate_count: duplicateCount,
    complete: complete,
    stopped_by_max_pages: stoppedByMaxPages,
    pages: pages,
    status: complete && duplicateCount === 0 ? 'PASS' : 'INCOMPLETE'
  };
}

function tnmd140pv2_emit_(label, output) {
  const json = JSON.stringify(output, null, 2);
  Logger.log(label + '\n' + json);
  console.log(label + '\n' + json);
  return output;
}

function tnmd140pv2_testFBR() {
  return tnmd140pv2_testCustomer_('FBR', 'tnmd140pv2_testFBR');
}

function tnmd140pv2_testRIMBAL() {
  return tnmd140pv2_testCustomer_('RIMBAL', 'tnmd140pv2_testRIMBAL');
}

function tnmd140pv2_testCustomer_(customer, testName) {
  const started = new Date().getTime();
  try {
    const result = tnmd140pv2_probeCustomer_(customer);
    const expected = customer === 'FBR' ? {
      jumlah_page: 4,
      total_raw: 238,
      jumlah_transaksi_aktif: 238,
      total_piutang: 203200000
    } : null;

    const checks = expected ? {
      page_count: result.jumlah_page === expected.jumlah_page,
      active_count: result.jumlah_transaksi_aktif === expected.jumlah_transaksi_aktif,
      total_piutang: result.total_piutang === expected.total_piutang,
      duplicate: result.duplicate_count === 0
    } : {
      complete: result.complete,
      duplicate: result.duplicate_count === 0
    };

    const pass = Object.keys(checks).every(function(key) { return checks[key]; });

    const outputResult = {
      api_version: TNMD140PV2.VERSION,
      customer: result,
      expected: expected,
      checks: checks,
      status: pass ? 'PASS' : 'FAIL'
    };

    return tnmd140pv2_emit_('TNMD v1.4.0 - CUSTOMER PROBE V2 - ' + customer, {
      success: true,
      test: testName,
      generated_at: tnmd140pv2_now_(),
      duration_ms: new Date().getTime() - started,
      result: outputResult
    });
  } catch (err) {
    return tnmd140pv2_emit_('TNMD v1.4.0 - CUSTOMER PROBE V2 - ' + customer, {
      success: false,
      test: testName,
      generated_at: tnmd140pv2_now_(),
      duration_ms: new Date().getTime() - started,
      error: err.message || String(err)
    });
  }
}

function tnmd140pv2_runSmallSet() {
  const started = new Date().getTime();
  const results = [];

  TNMD140PV2.CUSTOMERS.forEach(function(customer) {
    const item = tnmd140pv2_testCustomer_(customer, 'tnmd140pv2_test_' + customer);
    results.push(item);
    if (TNMD140PV2.STOP_ON_ERROR && !item.success) return;
  });

  const pass = results.every(function(item) {
    return item.success && item.result && item.result.status === 'PASS';
  });

  return tnmd140pv2_emit_('TNMD v1.4.0 - CUSTOMER PROBE V2 - SMALL SET', {
    success: pass,
    test: 'tnmd140pv2_runSmallSet',
    generated_at: tnmd140pv2_now_(),
    duration_ms: new Date().getTime() - started,
    customers: TNMD140PV2.CUSTOMERS,
    status: pass ? 'PASS' : 'FAIL',
    tests: results.map(function(item) {
      return {
        test: item.test,
        success: item.success,
        status: item.result ? item.result.status : null,
        error: item.error || null
      };
    })
  });
}
