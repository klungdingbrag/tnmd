/**
 * TNMD v1.4.0 - Customer Probe
 *
 * Diagnostic only. Does NOT replace v1.3.2 or the v1.4.0 engine.
 * Purpose: prove that the stable v1.3.2 customer-ledger pattern works
 * for another configured customer before designing Customer Index v1.4.
 */

const TNMD140P = {
  VERSION: '1.4.0-customer-probe',
  PAGE_SIZE: 100,
  CUSTOMER: 'RIMBAL'
};

function tnmd140p_now_() { return new Date().toISOString(); }
function tnmd140p_num_(v) {
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(String(v).replace(/,/g, '').trim());
  return isNaN(n) ? 0 : n;
}
function tnmd140p_escape_(v) { return String(v == null ? '' : v).replace(/'/g, "''"); }

function tnmd140p_rows_(response) {
  if (Array.isArray(response)) return response;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) return response.sid_response.data;
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

function tnmd140p_query_(offset) {
  if (typeof requestSid_ !== 'function') throw new Error('requestSid_ is not defined. Load the TNMD core first.');
  offset = Math.max(0, Number(offset) || 0);
  const sql = `SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan='${tnmd140p_escape_(TNMD140P.CUSTOMER)}' ORDER BY tanggal,kode LIMIT ${TNMD140P.PAGE_SIZE} OFFSET ${offset}`;
  const started = new Date().getTime();
  const response = requestSid_(sql);
  const rows = tnmd140p_rows_(response).map(function(r) {
    return { kode: r.kode || '', tanggal: r.tanggal || '', pelanggan: r.pelanggan || TNMD140P.CUSTOMER, jenis: r.jenis || '', piutang: tnmd140p_num_(r.piutang) };
  });
  return { sql: sql, duration_ms: new Date().getTime() - started, row_count: rows.length, rows: rows };
}

function tnmd140p_emit_(label, output) {
  const json = JSON.stringify(output, null, 2);
  Logger.log(label + '\n' + json);
  console.log(label + '\n' + json);
  return output;
}

function tnmd140p_testCustomerPage() {
  const started = new Date().getTime();
  try {
    const q = tnmd140p_query_(0);
    const active = q.rows.filter(function(r) { return r.piutang > 0; });
    const result = {
      api_version: TNMD140P.VERSION,
      pelanggan: TNMD140P.CUSTOMER,
      page: 1,
      page_size: TNMD140P.PAGE_SIZE,
      raw_count: q.row_count,
      active_count: active.length,
      total_piutang_page: active.reduce(function(s, r) { return s + r.piutang; }, 0),
      transaksi_pertama: q.rows.length ? q.rows[0].kode : null,
      transaksi_terakhir: q.rows.length ? q.rows[q.rows.length - 1].kode : null,
      sql: q.sql,
      status: q.row_count > 0 ? 'PASS' : 'FAIL'
    };
    return tnmd140p_emit_('TNMD v1.4.0 - CUSTOMER PROBE PAGE', { success: true, test: 'tnmd140p_testCustomerPage', generated_at: tnmd140p_now_(), duration_ms: new Date().getTime() - started, result: result });
  } catch (err) {
    return tnmd140p_emit_('TNMD v1.4.0 - CUSTOMER PROBE PAGE', { success: false, test: 'tnmd140p_testCustomerPage', generated_at: tnmd140p_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) });
  }
}

function tnmd140p_testCustomerTwoPages() {
  const started = new Date().getTime();
  try {
    const p1 = tnmd140p_query_(0);
    const p2 = tnmd140p_query_(TNMD140P.PAGE_SIZE);
    const codes = {};
    let duplicate = 0;
    p1.rows.concat(p2.rows).forEach(function(r) { if (r.kode && codes[r.kode]) duplicate++; if (r.kode) codes[r.kode] = true; });
    const result = {
      api_version: TNMD140P.VERSION,
      pelanggan: TNMD140P.CUSTOMER,
      page_size: TNMD140P.PAGE_SIZE,
      page1_count: p1.row_count,
      page2_count: p2.row_count,
      page1_first: p1.rows.length ? p1.rows[0].kode : null,
      page1_last: p1.rows.length ? p1.rows[p1.rows.length - 1].kode : null,
      page2_first: p2.rows.length ? p2.rows[0].kode : null,
      page2_last: p2.rows.length ? p2.rows[p2.rows.length - 1].kode : null,
      duplicate_count: duplicate,
      checks: { page1_has_data: p1.row_count > 0, page2_query_stable: p2.row_count >= 0, duplicate: duplicate === 0 },
      status: (p1.row_count > 0 && duplicate === 0) ? 'PASS' : 'FAIL'
    };
    return tnmd140p_emit_('TNMD v1.4.0 - CUSTOMER PROBE TWO PAGES', { success: true, test: 'tnmd140p_testCustomerTwoPages', generated_at: tnmd140p_now_(), duration_ms: new Date().getTime() - started, result: result });
  } catch (err) {
    return tnmd140p_emit_('TNMD v1.4.0 - CUSTOMER PROBE TWO PAGES', { success: false, test: 'tnmd140p_testCustomerTwoPages', generated_at: tnmd140p_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) });
  }
}
