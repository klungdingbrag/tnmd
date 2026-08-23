/**
 * TNMD v1.4.0 - Customer API
 *
 * READ-ONLY application layer over the frozen Customer Index V2.
 *
 * The V2 engine stores its index/checkpoint in Script Properties through
 * tnmd140iv2_readState_(). The API therefore reads that state through the
 * V2 accessor instead of assuming undocumented global variables.
 *
 * IMPORTANT:
 * - Does NOT query SID Retail.
 * - Does NOT modify or reset the Customer Index.
 * - Does NOT modify the V2 checkpoint.
 * - Keep this file separate from the frozen V2 engine.
 */

const TNMD140API = {
  API_VERSION: '1.4.0',
  LAYER: 'customer-api',
  READ_ONLY: true
};

function tnmd140api_now_() { return new Date().toISOString(); }

function tnmd140api_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

/** Read the frozen V2 state. No SID call and no write operation. */
function tnmd140api_getState_() {
  if (typeof tnmd140iv2_readState_ !== 'function') {
    throw new Error('tnmd140iv2_readState_ tidak ditemukan. Muat TNMD_v1.4.0_CustomerIndexV2.gs terlebih dahulu.');
  }
  const saved = tnmd140iv2_readState_();
  if (!saved || typeof saved !== 'object') {
    throw new Error('State Customer Index V2 tidak valid.');
  }
  return {
    index: saved.index && typeof saved.index === 'object' ? saved.index : {},
    state: saved.state && typeof saved.state === 'object' ? saved.state : {}
  };
}

function tnmd140api_getIndex_() {
  return tnmd140api_getState_().index;
}

function tnmd140api_getCheckpoint_() {
  return tnmd140api_getState_().state;
}

function tnmd140api_envelope_(test, fn) {
  const started = new Date().getTime();
  try {
    return {
      success: true,
      api_version: TNMD140API.API_VERSION,
      layer: TNMD140API.LAYER,
      read_only: true,
      test: test,
      generated_at: tnmd140api_now_(),
      duration_ms: new Date().getTime() - started,
      result: fn()
    };
  } catch (err) {
    return {
      success: false,
      api_version: TNMD140API.API_VERSION,
      layer: TNMD140API.LAYER,
      read_only: true,
      test: test,
      generated_at: tnmd140api_now_(),
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }
}

function tnmd140api_normalizeCustomer_(name, item) {
  item = item || {};
  return {
    pelanggan: item.pelanggan || name,
    kategori: item.kategori || 'LAIN',
    jumlah_page: tnmd140api_num_(item.jumlah_page),
    total_raw: tnmd140api_num_(item.total_raw),
    jumlah_transaksi_aktif: tnmd140api_num_(item.jumlah_transaksi_aktif),
    total_piutang: tnmd140api_num_(item.total_piutang),
    duplicate_count: tnmd140api_num_(item.duplicate_count),
    complete: item.complete === true,
    stopped_by_max_pages: item.stopped_by_max_pages === true,
    status: item.status || null
  };
}

function tnmd140api_getCustomerList() {
  const index = tnmd140api_getIndex_();
  return Object.keys(index).sort().map(function(name) {
    return tnmd140api_normalizeCustomer_(name, index[name]);
  });
}

function tnmd140api_getCustomerSummary() {
  const customers = tnmd140api_getCustomerList();
  const totals = customers.reduce(function(acc, item) {
    acc.jumlah_page += item.jumlah_page;
    acc.total_raw += item.total_raw;
    acc.jumlah_transaksi_aktif += item.jumlah_transaksi_aktif;
    acc.total_piutang += item.total_piutang;
    return acc;
  }, { jumlah_page: 0, total_raw: 0, jumlah_transaksi_aktif: 0, total_piutang: 0 });

  const kategori = {};
  customers.forEach(function(item) {
    if (!kategori[item.kategori]) {
      kategori[item.kategori] = {
        jumlah_customer: 0,
        total_raw: 0,
        jumlah_transaksi_aktif: 0,
        total_piutang: 0
      };
    }
    kategori[item.kategori].jumlah_customer++;
    kategori[item.kategori].total_raw += item.total_raw;
    kategori[item.kategori].jumlah_transaksi_aktif += item.jumlah_transaksi_aktif;
    kategori[item.kategori].total_piutang += item.total_piutang;
  });

  const checkpoint = tnmd140api_getCheckpoint_();
  return {
    jumlah_customer: customers.length,
    jumlah_page: totals.jumlah_page,
    total_raw: totals.total_raw,
    jumlah_transaksi_aktif: totals.jumlah_transaksi_aktif,
    total_piutang: totals.total_piutang,
    kategori: kategori,
    checkpoint: {
      cursor: tnmd140api_num_(checkpoint.cursor),
      total_customer: tnmd140api_num_(checkpoint.total_customer),
      completed: checkpoint.completed === true,
      updated_at: checkpoint.updated_at || null
    }
  };
}

function tnmd140api_getCustomerDetail(customer) {
  const requested = String(customer || '').trim();
  if (!requested) throw new Error('Parameter customer/pelanggan wajib diisi.');

  const index = tnmd140api_getIndex_();
  let key = requested;
  if (!Object.prototype.hasOwnProperty.call(index, key)) {
    const upper = requested.toUpperCase();
    const match = Object.keys(index).find(function(name) {
      return String(name).toUpperCase() === upper;
    });
    if (match) key = match;
  }

  if (!Object.prototype.hasOwnProperty.call(index, key)) {
    throw new Error('Customer tidak ditemukan di Customer Index V2: ' + requested);
  }
  return tnmd140api_normalizeCustomer_(key, index[key]);
}

function tnmd140api_getCustomerRanking(limit) {
  limit = Math.max(1, Math.floor(tnmd140api_num_(limit) || 10));
  const customers = tnmd140api_getCustomerList();
  customers.sort(function(a, b) {
    if (b.total_piutang !== a.total_piutang) return b.total_piutang - a.total_piutang;
    return a.pelanggan.localeCompare(b.pelanggan);
  });
  return customers.slice(0, limit).map(function(item, i) {
    return {
      ranking: i + 1,
      pelanggan: item.pelanggan,
      kategori: item.kategori,
      jumlah_transaksi_aktif: item.jumlah_transaksi_aktif,
      total_piutang: item.total_piutang
    };
  });
}

function tnmd140api_getBranchSummary(kategori) {
  kategori = String(kategori || 'CABANG').trim().toUpperCase();
  const customers = tnmd140api_getCustomerList().filter(function(item) {
    return String(item.kategori).toUpperCase() === kategori;
  });
  return {
    kategori: kategori,
    jumlah_customer: customers.length,
    jumlah_page: customers.reduce(function(sum, x) { return sum + x.jumlah_page; }, 0),
    total_raw: customers.reduce(function(sum, x) { return sum + x.total_raw; }, 0),
    jumlah_transaksi_aktif: customers.reduce(function(sum, x) { return sum + x.jumlah_transaksi_aktif; }, 0),
    total_piutang: customers.reduce(function(sum, x) { return sum + x.total_piutang; }, 0),
    customers: customers
  };
}

function tnmd140api_testCustomerList() {
  return tnmd140api_envelope_('tnmd140api_testCustomerList', function() {
    const data = tnmd140api_getCustomerList();
    const valid = data.length === 14 && data.every(function(x) {
      return x.status === 'PASS' && x.complete === true && x.duplicate_count === 0;
    });
    return {
      count: data.length,
      first: data.length ? data[0] : null,
      last: data.length ? data[data.length - 1] : null,
      valid: valid,
      status: valid ? 'PASS' : 'FAIL'
    };
  });
}

function tnmd140api_testCustomerSummary() {
  return tnmd140api_envelope_('tnmd140api_testCustomerSummary', function() {
    const summary = tnmd140api_getCustomerSummary();
    const checks = {
      customer_count: summary.jumlah_customer === 14,
      page_count: summary.jumlah_page === 21,
      raw_count: summary.total_raw === 945,
      active_count: summary.jumlah_transaksi_aktif === 281,
      total_piutang: summary.total_piutang === 241442000,
      checkpoint_completed: summary.checkpoint.completed === true
    };
    const pass = Object.keys(checks).every(function(k) { return checks[k]; });
    return {
      summary: summary,
      expected: {
        jumlah_customer: 14,
        jumlah_page: 21,
        total_raw: 945,
        jumlah_transaksi_aktif: 281,
        total_piutang: 241442000
      },
      checks: checks,
      status: pass ? 'PASS' : 'FAIL'
    };
  });
}

function tnmd140api_testCustomerDetail() {
  return tnmd140api_envelope_('tnmd140api_testCustomerDetail', function() {
    const fbr = tnmd140api_getCustomerDetail('FBR');
    const checks = {
      customer: fbr.pelanggan === 'FBR',
      kategori: fbr.kategori === 'CABANG',
      page_count: fbr.jumlah_page === 4,
      raw_count: fbr.total_raw === 347,
      active_count: fbr.jumlah_transaksi_aktif === 238,
      total_piutang: fbr.total_piutang === 203200000,
      complete: fbr.complete === true,
      duplicate: fbr.duplicate_count === 0
    };
    const pass = Object.keys(checks).every(function(k) { return checks[k]; });
    return { customer: fbr, checks: checks, status: pass ? 'PASS' : 'FAIL' };
  });
}

function tnmd140api_testRanking() {
  return tnmd140api_envelope_('tnmd140api_testRanking', function() {
    const ranking = tnmd140api_getCustomerRanking(14);
    const checks = {
      count: ranking.length === 14,
      descending: ranking.every(function(item, i) {
        return i === 0 || ranking[i - 1].total_piutang >= item.total_piutang;
      }),
      top_customer_present: ranking.length > 0 && ranking[0].pelanggan !== ''
    };
    const pass = Object.keys(checks).every(function(k) { return checks[k]; });
    return { ranking: ranking, checks: checks, status: pass ? 'PASS' : 'FAIL' };
  });
}

function tnmd140api_testBranchSummary() {
  return tnmd140api_envelope_('tnmd140api_testBranchSummary', function() {
    const summary = tnmd140api_getBranchSummary('CABANG');
    const checks = {
      customer_count: summary.jumlah_customer === 14,
      page_count: summary.jumlah_page === 21,
      raw_count: summary.total_raw === 945,
      active_count: summary.jumlah_transaksi_aktif === 281,
      total_piutang: summary.total_piutang === 241442000
    };
    const pass = Object.keys(checks).every(function(k) { return checks[k]; });
    return { summary: summary, checks: checks, status: pass ? 'PASS' : 'FAIL' };
  });
}

function tnmd140api_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd140api_testCustomerList(),
    tnmd140api_testCustomerSummary(),
    tnmd140api_testCustomerDetail(),
    tnmd140api_testRanking(),
    tnmd140api_testBranchSummary()
  ];
  const status = tests.every(function(item) {
    return item.success && item.result && item.result.status === 'PASS';
  }) ? 'PASS' : 'FAIL';
  return {
    success: status === 'PASS',
    api_version: TNMD140API.API_VERSION,
    layer: TNMD140API.LAYER,
    read_only: true,
    test: 'tnmd140api_runAllTests',
    generated_at: tnmd140api_now_(),
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

function tnmd140api_runAllTests_JSON() {
  const result = tnmd140api_runAllTests();
  Logger.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return result;
}
