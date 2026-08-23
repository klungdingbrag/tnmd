/**
 * TNMD v1.4.0 - Raw Response Diagnostic
 * Branch: dev/v1.4
 *
 * Purpose: inspect the exact object returned by requestSid_() without
 * assuming response.data or any other response shape.
 * Diagnostic only. Does not modify v1.3.2 or the v1.4 Customer Index.
 */

const TNMD140RAW = {
  VERSION: '1.4.0-RAW-DIAGNOSTIC',
  SAMPLE_LIMIT: 10
};

function tnmd140raw_now_() {
  return new Date().toISOString();
}

function tnmd140raw_log_(label, value) {
  const json = JSON.stringify(value, function(key, value) {
    if (typeof value === 'undefined') return '[undefined]';
    if (typeof value === 'function') return '[function]';
    return value;
  }, 2);
  Logger.log(label + '\n' + json);
  return value;
}

function tnmd140raw_keys_(obj) {
  if (!obj || typeof obj !== 'object') return [];
  try { return Object.keys(obj); } catch (e) { return []; }
}

function tnmd140raw_describe_(response) {
  const type = Array.isArray(response) ? 'array' : typeof response;
  const keys = tnmd140raw_keys_(response);
  const description = {
    typeof_response: typeof response,
    response_type: type,
    is_array: Array.isArray(response),
    object_keys: keys
  };

  if (response && typeof response === 'object') {
    keys.forEach(function(key) {
      let value;
      try { value = response[key]; } catch (e) { value = '[read error]'; }
      description[key] = {
        typeof_value: typeof value,
        is_array: Array.isArray(value),
        value: value
      };
    });
  } else {
    description.value = response;
  }

  return description;
}

function tnmd140raw_testFBR() {
  const started = new Date().getTime();
  let output;

  try {
    if (typeof requestSid_ !== 'function') {
      throw new Error('requestSid_ is not defined. Load the TNMD core first.');
    }

    const sql = `
      SELECT kode,tanggal,pelanggan,jenis,piutang
      FROM penjualan
      WHERE pelanggan='FBR'
      LIMIT 100 OFFSET 0
    `;

    const response = requestSid_(sql);

    output = {
      success: true,
      test: 'tnmd140raw_testFBR',
      generated_at: tnmd140raw_now_(),
      duration_ms: new Date().getTime() - started,
      sql: sql,
      raw: tnmd140raw_describe_(response)
    };
  } catch (err) {
    output = {
      success: false,
      test: 'tnmd140raw_testFBR',
      generated_at: tnmd140raw_now_(),
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }

  return tnmd140raw_log_('TNMD v1.4.0 - RAW RESPONSE FBR', output);
}

function tnmd140raw_testSimple() {
  const started = new Date().getTime();
  let output;

  try {
    if (typeof requestSid_ !== 'function') {
      throw new Error('requestSid_ is not defined. Load the TNMD core first.');
    }

    const sql = `SELECT 1 AS sid_test`;
    const response = requestSid_(sql);

    output = {
      success: true,
      test: 'tnmd140raw_testSimple',
      generated_at: tnmd140raw_now_(),
      duration_ms: new Date().getTime() - started,
      sql: sql,
      raw: tnmd140raw_describe_(response)
    };
  } catch (err) {
    output = {
      success: false,
      test: 'tnmd140raw_testSimple',
      generated_at: tnmd140raw_now_(),
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }

  return tnmd140raw_log_('TNMD v1.4.0 - RAW RESPONSE SIMPLE', output);
}
