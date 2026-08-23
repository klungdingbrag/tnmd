/**
 * TNMD v1.4.0 - Customer Index Audit
 *
 * Read-only audit for the Customer Index V2 already stored by
 * TNMD_v1.4.0_CustomerIndexV2.
 *
 * Does NOT call SID Retail.
 * Does NOT modify or reset the V2 index/checkpoint.
 *
 * Required dependency:
 *   TNMD_v1.4.0_CustomerIndexV2.gs
 */

const TNMD140IA = {
  API_VERSION: '1.4.0-customer-index-audit',
  EXPECTED_CUSTOMERS: 14
};

function tnmd140ia_now_() {
  return new Date().toISOString();
}

function tnmd140ia_loadIndex_() {
  if (typeof TNMD140IV2 !== 'undefined' &&
      TNMD140IV2 &&
      typeof tnmd140iv2_readState_ === 'function') {
    return tnmd140iv2_readState_();
  }
  throw new Error('TNMD v1.4 Customer Index V2 tidak tersedia. Pastikan TNMD_v1.4.0_CustomerIndexV2.gs sudah dimuat.');
}

function tnmd140ia_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const n = Number(String(value).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}

function tnmd140ia_emit_(label, output) {
  const json = JSON.stringify(output, null, 2);
  Logger.log(label + '\n' + json);
  console.log(label + '\n' + json);
  return output;
}

function tnmd140ia_buildAudit_() {
  const saved = tnmd140ia_loadIndex_();
  const index = saved.index || {};
  const state = saved.state || {};
  const names = Object.keys(index);

  let totalRaw = 0;
  let totalActive = 0;
  let totalPiutang = 0;
  let totalPages = 0;
  let passCount = 0;
  let completeCount = 0;
  let duplicateFreeCount = 0;
  let stoppedByMaxPagesCount = 0;
  const failures = [];
  const customers = [];

  names.forEach(function(name) {
    const item = index[name] || {};
    const raw = tnmd140ia_num_(item.total_raw);
    const active = tnmd140ia_num_(item.jumlah_transaksi_aktif);
    const piutang = tnmd140ia_num_(item.total_piutang);
    const pages = tnmd140ia_num_(item.jumlah_page);
    const duplicateCount = tnmd140ia_num_(item.duplicate_count);
    const complete = item.complete === true;
    const stopped = item.stopped_by_max_pages === true;
    const pass = item.status === 'PASS';

    totalRaw += raw;
    totalActive += active;
    totalPiutang += piutang;
    totalPages += pages;

    if (pass) passCount++;
    if (complete) completeCount++;
    if (duplicateCount === 0) duplicateFreeCount++;
    if (stopped) stoppedByMaxPagesCount++;

    if (!pass || !complete || duplicateCount !== 0 || stopped) {
      failures.push({
        pelanggan: name,
        status: item.status || null,
        complete: complete,
        duplicate_count: duplicateCount,
        stopped_by_max_pages: stopped
      });
    }

    customers.push({
      pelanggan: name,
      kategori: item.kategori || null,
      jumlah_page: pages,
      total_raw: raw,
      jumlah_transaksi_aktif: active,
      total_piutang: piutang,
      duplicate_count: duplicateCount,
      complete: complete,
      status: item.status || null
    });
  });

  return {
    api_version: TNMD140IA.API_VERSION,
    checkpoint: {
      cursor: tnmd140ia_num_(state.cursor),
      total_customer: tnmd140ia_num_(state.total_customer),
      completed: state.completed === true,
      updated_at: state.updated_at || null
    },
    totals: {
      jumlah_customer: names.length,
      jumlah_page: totalPages,
      total_raw: totalRaw,
      jumlah_transaksi_aktif: totalActive,
      total_piutang: totalPiutang
    },
    quality: {
      pass_count: passCount,
      complete_count: completeCount,
      duplicate_free_count: duplicateFreeCount,
      stopped_by_max_pages_count: stoppedByMaxPagesCount,
      failure_count: failures.length
    },
    expected: {
      jumlah_customer: TNMD140IA.EXPECTED_CUSTOMERS
    },
    failures: failures,
    customers: customers
  };
}

function tnmd140ia_testIntegrity() {
  const started = new Date().getTime();
  try {
    const audit = tnmd140ia_buildAudit_();
    const checks = {
      customer_count: audit.totals.jumlah_customer === TNMD140IA.EXPECTED_CUSTOMERS,
      checkpoint_cursor: audit.checkpoint.cursor === TNMD140IA.EXPECTED_CUSTOMERS,
      checkpoint_total: audit.checkpoint.total_customer === TNMD140IA.EXPECTED_CUSTOMERS,
      checkpoint_completed: audit.checkpoint.completed === true,
      all_pass: audit.quality.pass_count === TNMD140IA.EXPECTED_CUSTOMERS,
      all_complete: audit.quality.complete_count === TNMD140IA.EXPECTED_CUSTOMERS,
      all_duplicate_free: audit.quality.duplicate_free_count === TNMD140IA.EXPECTED_CUSTOMERS,
      no_max_page_stop: audit.quality.stopped_by_max_pages_count === 0,
      no_failures: audit.quality.failure_count === 0
    };
    const pass = Object.keys(checks).every(function(key) { return checks[key]; });

    return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - INTEGRITY', {
      success: pass,
      test: 'tnmd140ia_testIntegrity',
      generated_at: tnmd140ia_now_(),
      duration_ms: new Date().getTime() - started,
      result: {
        totals: audit.totals,
        checkpoint: audit.checkpoint,
        quality: audit.quality,
        expected: audit.expected,
        checks: checks,
        failures: audit.failures,
        status: pass ? 'PASS' : 'FAIL'
      }
    });
  } catch (err) {
    return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - INTEGRITY', {
      success: false,
      test: 'tnmd140ia_testIntegrity',
      generated_at: tnmd140ia_now_(),
      duration_ms: new Date().getTime() - started,
      error: err.message || String(err)
    });
  }
}

function tnmd140ia_testAggregate() {
  const started = new Date().getTime();
  try {
    const audit = tnmd140ia_buildAudit_();
    const category = {};

    audit.customers.forEach(function(item) {
      const key = item.kategori || 'LAIN';
      if (!category[key]) category[key] = { jumlah_customer: 0, total_raw: 0, jumlah_transaksi_aktif: 0, total_piutang: 0 };
      category[key].jumlah_customer++;
      category[key].total_raw += item.total_raw;
      category[key].jumlah_transaksi_aktif += item.jumlah_transaksi_aktif;
      category[key].total_piutang += item.total_piutang;
    });

    const checks = {
      customer_count_matches: audit.totals.jumlah_customer === audit.expected.jumlah_customer,
      aggregate_customer_count_positive: audit.totals.jumlah_customer > 0,
      aggregate_raw_nonnegative: audit.totals.total_raw >= audit.totals.jumlah_transaksi_aktif,
      aggregate_active_nonnegative: audit.totals.jumlah_transaksi_aktif >= 0,
      aggregate_piutang_nonnegative: audit.totals.total_piutang >= 0
    };
    const pass = Object.keys(checks).every(function(key) { return checks[key]; });

    return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - AGGREGATE', {
      success: pass,
      test: 'tnmd140ia_testAggregate',
      generated_at: tnmd140ia_now_(),
      duration_ms: new Date().getTime() - started,
      result: {
        totals: audit.totals,
        kategori: category,
        checks: checks,
        status: pass ? 'PASS' : 'FAIL'
      }
    });
  } catch (err) {
    return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - AGGREGATE', {
      success: false,
      test: 'tnmd140ia_testAggregate',
      generated_at: tnmd140ia_now_(),
      duration_ms: new Date().getTime() - started,
      error: err.message || String(err)
    });
  }
}

function tnmd140ia_testSummary() {
  const started = new Date().getTime();
  try {
    const audit = tnmd140ia_buildAudit_();
    const pass = audit.quality.failure_count === 0 && audit.checkpoint.completed === true;
    return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - SUMMARY', {
      success: pass,
      test: 'tnmd140ia_testSummary',
      generated_at: tnmd140ia_now_(),
      duration_ms: new Date().getTime() - started,
      result: {
        checkpoint: audit.checkpoint,
        totals: audit.totals,
        quality: audit.quality,
        status: pass ? 'PASS' : 'FAIL'
      }
    });
  } catch (err) {
    return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - SUMMARY', {
      success: false,
      test: 'tnmd140ia_testSummary',
      generated_at: tnmd140ia_now_(),
      duration_ms: new Date().getTime() - started,
      error: err.message || String(err)
    });
  }
}

function tnmd140ia_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd140ia_testIntegrity(),
    tnmd140ia_testAggregate(),
    tnmd140ia_testSummary()
  ];
  const pass = tests.every(function(item) {
    return item && item.success && item.result && item.result.status === 'PASS';
  });

  return tnmd140ia_emit_('TNMD v1.4.0 - CUSTOMER INDEX AUDIT - ALL TESTS', {
    success: pass,
    test: 'tnmd140ia_runAllTests',
    generated_at: tnmd140ia_now_(),
    duration_ms: new Date().getTime() - started,
    status: pass ? 'PASS' : 'FAIL',
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
