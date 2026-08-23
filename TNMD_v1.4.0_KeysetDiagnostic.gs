/**
 * TNMD v1.4.0 - Keyset Pagination Diagnostic
 * Branch: dev/v1.4
 *
 * Diagnostic only. Read-only. Does not replace v1.3.2 or v1.4.0.
 * Required core: requestSid_(sql)
 */

const TNMD140K = {
  VERSION: '1.4.0-keyset-diagnostic',
  PAGE_SIZE: 100,
  CUSTOMER: 'FBR'
};

function tnmd140k_now_() { return new Date().toISOString(); }
function tnmd140k_escapeSql_(value) { return String(value == null ? '' : value).replace(/'/g, "''"); }

function tnmd140k_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const s = String(value).trim().replace(/,/g, '');
  if (s === '.00' || s === '.0' || s === '.') return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function tnmd140k_requireCore_() {
  if (typeof requestSid_ !== 'function') throw new Error('requestSid_ is not defined. Load the TNMD core first.');
}

function tnmd140k_rows_(response) {
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

function tnmd140k_query_(sql, label) {
  tnmd140k_requireCore_();
  const started = new Date().getTime();
  const response = requestSid_(sql);
  const rows = tnmd140k_rows_(response);
  if (!rows.length && response && response.sid_response && response.sid_response.status === 'success' && Number(response.sid_response.count) > 0) {
    throw new Error('SID reported rows but parser extracted none: ' + label);
  }
  return {
    label: label,
    duration_ms: new Date().getTime() - started,
    row_count: rows.length,
    rows: rows.map(function(row) {
      return { kode: row.kode || '', tanggal: row.tanggal || '', pelanggan: row.pelanggan || '', jenis: row.jenis || '', piutang: tnmd140k_num_(row.piutang) };
    })
  };
}

function tnmd140k_emit_(label, output) {
  const json = JSON.stringify(output, null, 2);
  Logger.log(label + '\n' + json);
  console.log(label + '\n' + json);
  return output;
}

function tnmd140k_testOrderBy() {
  const started = new Date().getTime();
  let output;
  try {
    const sql = `
      SELECT kode,tanggal,pelanggan,jenis,piutang
      FROM penjualan
      WHERE pelanggan='${tnmd140k_escapeSql_(TNMD140K.CUSTOMER)}'
      ORDER BY tanggal,kode
      LIMIT ${TNMD140K.PAGE_SIZE}
    `;
    const q = tnmd140k_query_(sql, 'ORDER BY tanggal,kode');
    output = {
      success: true,
      test: 'tnmd140k_testOrderBy',
      generated_at: tnmd140k_now_(),
      duration_ms: new Date().getTime() - started,
      result: {
        sql: sql,
        row_count: q.row_count,
        first: q.rows.length ? q.rows[0] : null,
        last: q.rows.length ? q.rows[q.rows.length - 1] : null,
        status: q.row_count === TNMD140K.PAGE_SIZE ? 'PASS' : 'FAIL'
      }
    };
  } catch (err) {
    output = { success: false, test: 'tnmd140k_testOrderBy', generated_at: tnmd140k_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140k_emit_('TNMD v1.4.0 - TEST ORDER BY', output);
}

function tnmd140k_testCursorCondition() {
  const started = new Date().getTime();
  let output;
  try {
    const baseSql = `
      SELECT kode,tanggal,pelanggan,jenis,piutang
      FROM penjualan
      WHERE pelanggan='${tnmd140k_escapeSql_(TNMD140K.CUSTOMER)}'
      ORDER BY tanggal,kode
      LIMIT ${TNMD140K.PAGE_SIZE}
    `;
    const first = tnmd140k_query_(baseSql, 'cursor-first-page');
    if (!first.rows.length) throw new Error('First keyset page returned 0 rows.');
    const last = first.rows[first.rows.length - 1];
    const cursorSql = `
      SELECT kode,tanggal,pelanggan,jenis,piutang
      FROM penjualan
      WHERE pelanggan='${tnmd140k_escapeSql_(TNMD140K.CUSTOMER)}'
        AND (tanggal > '${tnmd140k_escapeSql_(last.tanggal)}' OR (tanggal = '${tnmd140k_escapeSql_(last.tanggal)}' AND kode > '${tnmd140k_escapeSql_(last.kode)}'))
      ORDER BY tanggal,kode
      LIMIT ${TNMD140K.PAGE_SIZE}
    `;
    const second = tnmd140k_query_(cursorSql, 'cursor-second-page');
    const firstCodes = {};
    first.rows.forEach(function(row) { if (row.kode) firstCodes[row.kode] = true; });
    const duplicates = second.rows.filter(function(row) { return row.kode && firstCodes[row.kode]; }).map(function(row) { return row.kode; });
    output = {
      success: true,
      test: 'tnmd140k_testCursorCondition',
      generated_at: tnmd140k_now_(),
      duration_ms: new Date().getTime() - started,
      result: {
        first_page_count: first.row_count,
        second_page_count: second.row_count,
        cursor: { tanggal: last.tanggal, kode: last.kode },
        second_first: second.rows.length ? second.rows[0] : null,
        duplicate_count: duplicates.length,
        duplicate_kode: duplicates,
        status: second.row_count > 0 && duplicates.length === 0 ? 'PASS' : 'FAIL'
      }
    };
  } catch (err) {
    output = { success: false, test: 'tnmd140k_testCursorCondition', generated_at: tnmd140k_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140k_emit_('TNMD v1.4.0 - TEST CURSOR CONDITION', output);
}

function tnmd140k_testThreePages() {
  const started = new Date().getTime();
  let output;
  try {
    let cursorDate = null;
    let cursorCode = null;
    const seen = {};
    const pages = [];
    let duplicateCount = 0;

    for (let pageNo = 1; pageNo <= 3; pageNo++) {
      const cursor = cursorDate === null ? '' : `
        AND (tanggal > '${tnmd140k_escapeSql_(cursorDate)}'
          OR (tanggal = '${tnmd140k_escapeSql_(cursorDate)}' AND kode > '${tnmd140k_escapeSql_(cursorCode)}'))`;
      const sql = `
        SELECT kode,tanggal,pelanggan,jenis,piutang
        FROM penjualan
        WHERE pelanggan='${tnmd140k_escapeSql_(TNMD140K.CUSTOMER)}'
        ${cursor}
        ORDER BY tanggal,kode
        LIMIT ${TNMD140K.PAGE_SIZE}
      `;
      const q = tnmd140k_query_(sql, 'keyset-page-' + pageNo);
      q.rows.forEach(function(row) { if (row.kode && seen[row.kode]) duplicateCount++; if (row.kode) seen[row.kode] = true; });
      pages.push({ page: pageNo, count: q.row_count, first_code: q.rows.length ? q.rows[0].kode : null, last_code: q.rows.length ? q.rows[q.rows.length - 1].kode : null, last_date: q.rows.length ? q.rows[q.rows.length - 1].tanggal : null, duration_ms: q.duration_ms });
      if (q.row_count === 0) break;
      const last = q.rows[q.rows.length - 1];
      cursorDate = last.tanggal;
      cursorCode = last.kode;
      if (q.row_count < TNMD140K.PAGE_SIZE) break;
    }

    output = {
      success: true,
      test: 'tnmd140k_testThreePages',
      generated_at: tnmd140k_now_(),
      duration_ms: new Date().getTime() - started,
      result: { customer: TNMD140K.CUSTOMER, pages: pages, unique_codes: Object.keys(seen).length, duplicate_count: duplicateCount, status: pages.length >= 2 && duplicateCount === 0 ? 'PASS' : 'FAIL' }
    };
  } catch (err) {
    output = { success: false, test: 'tnmd140k_testThreePages', generated_at: tnmd140k_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140k_emit_('TNMD v1.4.0 - TEST THREE PAGES', output);
}

function tnmd140k_runAllTests() {
  const started = new Date().getTime();
  const tests = [tnmd140k_testOrderBy(), tnmd140k_testCursorCondition(), tnmd140k_testThreePages()];
  const status = tests.every(function(item) { return item.success && item.result && item.result.status === 'PASS'; }) ? 'PASS' : 'FAIL';
  const output = {
    success: status === 'PASS',
    test: 'tnmd140k_runAllTests',
    generated_at: tnmd140k_now_(),
    duration_ms: new Date().getTime() - started,
    status: status,
    tests: tests.map(function(item) { return { test: item.test, success: item.success, status: item.result ? item.result.status || null : null, error: item.error || null }; })
  };
  return tnmd140k_emit_('TNMD v1.4.0 - KEYSET DIAGNOSTIC ALL TESTS', output);
}
