/**
 * TNMD v1.4.0 - SQL Condition Compatibility Diagnostic
 *
 * Diagnostic only. Read-only. Does NOT replace v1.3.2 or v1.4.0.
 *
 * Purpose:
 *   Identify which SQL predicate causes SID Retail to reject the keyset
 *   cursor query. We already proved ORDER BY tanggal,kode works.
 *
 * Required core dependency:
 *   requestSid_(sql)
 *
 * Run tests individually first, then tnmd140c_runAllTests.
 */

const TNMD140C = {
  VERSION: '1.4.0-sql-condition-diagnostic',
  PAGE_SIZE: 10,
  CUSTOMER: 'FBR',
  CURSOR_DATE: '09/02/2023',
  CURSOR_CODE: 'R43-090223034'
};

function tnmd140c_now_() { return new Date().toISOString(); }
function tnmd140c_escape_(value) { return String(value == null ? '' : value).replace(/'/g, "''"); }

function tnmd140c_requireCore_() {
  if (typeof requestSid_ !== 'function') throw new Error('requestSid_ is not defined. Load the TNMD core first.');
}

function tnmd140c_rows_(response) {
  if (Array.isArray(response)) return response;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) return response.sid_response.data;
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

function tnmd140c_runQuery_(name, condition) {
  tnmd140c_requireCore_();
  const sql = `SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan='${tnmd140c_escape_(TNMD140C.CUSTOMER)}' ${condition} ORDER BY tanggal,kode LIMIT ${TNMD140C.PAGE_SIZE}`;
  const started = new Date().getTime();
  const response = requestSid_(sql);
  const rows = tnmd140c_rows_(response);
  return {
    name: name,
    success: true,
    duration_ms: new Date().getTime() - started,
    sql: sql,
    response_type: typeof response,
    row_count: rows.length,
    sample_rows: rows.slice(0, 3),
    sid_status: response && response.sid_response ? response.sid_response.status : null
  };
}

function tnmd140c_emit_(label, output) {
  const json = JSON.stringify(output, null, 2);
  Logger.log(label + '\n' + json);
  console.log(label + '\n' + json);
  return output;
}

function tnmd140c_testBase() {
  const started = new Date().getTime();
  let output;
  try {
    output = { success: true, test: 'tnmd140c_testBase', generated_at: tnmd140c_now_(), duration_ms: 0, result: tnmd140c_runQuery_('base', '') };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testBase', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL BASE', output);
}

function tnmd140c_testDateGreater() {
  const started = new Date().getTime();
  let output;
  try {
    const condition = `AND tanggal > '${tnmd140c_escape_(TNMD140C.CURSOR_DATE)}'`;
    output = { success: true, test: 'tnmd140c_testDateGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, result: tnmd140c_runQuery_('tanggal_greater', condition) };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testDateGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL DATE GREATER', output);
}

function tnmd140c_testDateEqual() {
  const started = new Date().getTime();
  let output;
  try {
    const condition = `AND tanggal = '${tnmd140c_escape_(TNMD140C.CURSOR_DATE)}'`;
    output = { success: true, test: 'tnmd140c_testDateEqual', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, result: tnmd140c_runQuery_('tanggal_equal', condition) };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testDateEqual', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL DATE EQUAL', output);
}

function tnmd140c_testCodeGreater() {
  const started = new Date().getTime();
  let output;
  try {
    const condition = `AND kode > '${tnmd140c_escape_(TNMD140C.CURSOR_CODE)}'`;
    output = { success: true, test: 'tnmd140c_testCodeGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, result: tnmd140c_runQuery_('kode_greater', condition) };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testCodeGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL CODE GREATER', output);
}

function tnmd140c_testDateGreaterAndCodeGreater() {
  const started = new Date().getTime();
  let output;
  try {
    const condition = `AND tanggal > '${tnmd140c_escape_(TNMD140C.CURSOR_DATE)}' AND kode > '${tnmd140c_escape_(TNMD140C.CURSOR_CODE)}'`;
    output = { success: true, test: 'tnmd140c_testDateGreaterAndCodeGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, result: tnmd140c_runQuery_('date_and_code_greater', condition) };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testDateGreaterAndCodeGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL DATE AND CODE', output);
}

function tnmd140c_testDateEqualAndCodeGreater() {
  const started = new Date().getTime();
  let output;
  try {
    const condition = `AND tanggal = '${tnmd140c_escape_(TNMD140C.CURSOR_DATE)}' AND kode > '${tnmd140c_escape_(TNMD140C.CURSOR_CODE)}'`;
    output = { success: true, test: 'tnmd140c_testDateEqualAndCodeGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, result: tnmd140c_runQuery_('date_equal_and_code_greater', condition) };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testDateEqualAndCodeGreater', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL DATE EQUAL AND CODE', output);
}

function tnmd140c_testCombinedOr() {
  const started = new Date().getTime();
  let output;
  try {
    const condition = `AND (tanggal > '${tnmd140c_escape_(TNMD140C.CURSOR_DATE)}' OR (tanggal = '${tnmd140c_escape_(TNMD140C.CURSOR_DATE)}' AND kode > '${tnmd140c_escape_(TNMD140C.CURSOR_CODE)}'))`;
    output = { success: true, test: 'tnmd140c_testCombinedOr', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, result: tnmd140c_runQuery_('combined_or', condition) };
  } catch (err) {
    output = { success: false, test: 'tnmd140c_testCombinedOr', generated_at: tnmd140c_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) };
  }
  return tnmd140c_emit_('TNMD v1.4.0 - SQL COMBINED OR', output);
}

function tnmd140c_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd140c_testBase(),
    tnmd140c_testDateGreater(),
    tnmd140c_testDateEqual(),
    tnmd140c_testCodeGreater(),
    tnmd140c_testDateGreaterAndCodeGreater(),
    tnmd140c_testDateEqualAndCodeGreater(),
    tnmd140c_testCombinedOr()
  ];
  const output = {
    success: tests.every(function(t) { return t.success; }),
    test: 'tnmd140c_runAllTests',
    generated_at: tnmd140c_now_(),
    duration_ms: new Date().getTime() - started,
    tests: tests.map(function(t) { return { test: t.test, success: t.success, error: t.error || null, row_count: t.result && t.result.result ? t.result.result.row_count : null }; })
  };
  return tnmd140c_emit_('TNMD v1.4.0 - SQL CONDITION DIAGNOSTIC ALL TESTS', output);
}
