/**
 * TNMD v1.4.0 - Customer Index V2
 *
 * Production-candidate engine built on the proven v1.3.2 customer-scoped
 * pagination pattern and v1.4.0 Probe V2 results.
 *
 * IMPORTANT
 * - This file is intentionally separate from v1.3.2 and the existing v1.4.0 files.
 * - It does NOT scan the whole penjualan table.
 * - It processes a bounded customer batch per execution.
 * - It stores checkpoint/index state in Script Properties so processing can resume.
 * - It does not use the unsupported date cursor/keyset approach.
 *
 * Required core dependency:
 *   requestSid_(sql)
 *
 * Optional dependency:
 *   CUSTOMER_CABANG
 */

const TNMD140IV2 = {
  VERSION: '1.4.0-customer-index-v2',
  PAGE_SIZE: 100,
  MAX_PAGES_PER_CUSTOMER: 10,
  DEFAULT_BATCH_SIZE: 5,
  PROP_CURSOR: 'TNMD140IV2_CURSOR',
  PROP_STATE: 'TNMD140IV2_STATE',
  PROP_INDEX: 'TNMD140IV2_INDEX',
  CUSTOMERS: ['FBR', 'RIMBAL', 'KUKUH', 'TB BEJA', 'BARBEX2']
};

function tnmd140iv2_now_() { return new Date().toISOString(); }

function tnmd140iv2_num_(value) {
  if (value === null || value === undefined || value === '') return 0;
  const s = String(value).replace(/,/g, '').trim();
  if (s === '.00' || s === '.0' || s === '.') return 0;
  const n = Number(s);
  return isNaN(n) ? 0 : n;
}

function tnmd140iv2_escape_(value) {
  return String(value == null ? '' : value).replace(/'/g, "''");
}

function tnmd140iv2_rows_(response) {
  if (Array.isArray(response)) return response;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) return response.sid_response.data;
  if (response && Array.isArray(response.data)) return response.data;
  return [];
}

function tnmd140iv2_customerList_() {
  if (typeof CUSTOMER_CABANG !== 'undefined' && Array.isArray(CUSTOMER_CABANG) && CUSTOMER_CABANG.length) {
    return CUSTOMER_CABANG.map(String).map(function(x) { return x.trim(); }).filter(Boolean);
  }
  return TNMD140IV2.CUSTOMERS.slice();
}

function tnmd140iv2_queryPage_(customer, offset) {
  if (typeof requestSid_ !== 'function') throw new Error('requestSid_ is not defined. Load the TNMD core first.');
  customer = String(customer || '').trim();
  offset = Math.max(0, Number(offset) || 0);
  const sql = `SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan='${tnmd140iv2_escape_(customer)}' ORDER BY tanggal,kode LIMIT ${TNMD140IV2.PAGE_SIZE} OFFSET ${offset}`;
  const started = new Date().getTime();
  const response = requestSid_(sql);
  const rows = tnmd140iv2_rows_(response).map(function(r) {
    return { kode: r.kode || '', tanggal: r.tanggal || '', pelanggan: r.pelanggan || customer, jenis: r.jenis || '', piutang: tnmd140iv2_num_(r.piutang) };
  });
  return { offset: offset, raw_count: rows.length, duration_ms: new Date().getTime() - started, rows: rows };
}

function tnmd140iv2_scanCustomer_(customer) {
  const pages = [];
  const all = [];
  let offset = 0;
  let complete = false;
  let stoppedByMaxPages = false;

  for (let pageNo = 1; pageNo <= TNMD140IV2.MAX_PAGES_PER_CUSTOMER; pageNo++) {
    const page = tnmd140iv2_queryPage_(customer, offset);
    pages.push({ page: pageNo, offset: offset, raw_count: page.raw_count, duration_ms: page.duration_ms });
    Array.prototype.push.apply(all, page.rows);
    if (page.raw_count < TNMD140IV2.PAGE_SIZE) { complete = true; break; }
    offset += TNMD140IV2.PAGE_SIZE;
    if (pageNo === TNMD140IV2.MAX_PAGES_PER_CUSTOMER) stoppedByMaxPages = true;
  }

  const seen = {};
  let duplicateCount = 0;
  let activeCount = 0;
  let totalPiutang = 0;
  all.forEach(function(r) {
    if (r.kode && seen[r.kode]) duplicateCount++;
    if (r.kode) seen[r.kode] = true;
    if (r.piutang > 0) { activeCount++; totalPiutang += r.piutang; }
  });

  const kategori = (typeof CUSTOMER_CABANG !== 'undefined' && Array.isArray(CUSTOMER_CABANG) && CUSTOMER_CABANG.indexOf(customer) !== -1) ? 'CABANG' : 'LAIN';
  return {
    pelanggan: customer,
    kategori: kategori,
    jumlah_page: pages.length,
    total_raw: all.length,
    jumlah_transaksi_aktif: activeCount,
    total_piutang: totalPiutang,
    duplicate_count: duplicateCount,
    complete: complete,
    stopped_by_max_pages: stoppedByMaxPages,
    pages: pages,
    status: complete && duplicateCount === 0 && !stoppedByMaxPages ? 'PASS' : 'FAIL'
  };
}

function tnmd140iv2_readState_() {
  const props = PropertiesService.getScriptProperties();
  let index = {};
  let state = { cursor: 0, total_customer: tnmd140iv2_customerList_().length, completed: false, updated_at: null };
  try { index = JSON.parse(props.getProperty(TNMD140IV2.PROP_INDEX) || '{}'); } catch (e) { index = {}; }
  try { state = Object.assign(state, JSON.parse(props.getProperty(TNMD140IV2.PROP_STATE) || '{}')); } catch (e) {}
  return { index: index, state: state };
}

function tnmd140iv2_saveState_(index, state) {
  const props = PropertiesService.getScriptProperties();
  props.setProperty(TNMD140IV2.PROP_INDEX, JSON.stringify(index));
  props.setProperty(TNMD140IV2.PROP_STATE, JSON.stringify(state));
  props.setProperty(TNMD140IV2.PROP_CURSOR, String(state.cursor));
}

function tnmd140iv2_emit_(label, output) {
  const json = JSON.stringify(output, null, 2);
  Logger.log(label + '\n' + json);
  console.log(label + '\n' + json);
  return output;
}

/** Process the next bounded customer batch. Default: 5 customers. */
function tnmd140iv2_runBatch(batchSize) {
  const started = new Date().getTime();
  batchSize = Math.max(1, Math.min(20, Number(batchSize) || TNMD140IV2.DEFAULT_BATCH_SIZE));
  const customers = tnmd140iv2_customerList_();
  const saved = tnmd140iv2_readState_();
  const index = saved.index;
  let cursor = Math.max(0, Number(saved.state.cursor) || 0);
  const processed = [];
  const errors = [];

  for (let i = 0; i < batchSize && cursor < customers.length; i++, cursor++) {
    const customer = customers[cursor];
    try {
      const result = tnmd140iv2_scanCustomer_(customer);
      index[customer] = Object.assign({}, result, { indexed_at: tnmd140iv2_now_() });
      processed.push({ pelanggan: customer, status: result.status, jumlah_page: result.jumlah_page, total_raw: result.total_raw, active: result.jumlah_transaksi_aktif, piutang: result.total_piutang, duration_ms: result.pages.reduce(function(s, p) { return s + p.duration_ms; }, 0) });
      if (result.status !== 'PASS') errors.push({ pelanggan: customer, error: 'Pagination incomplete or duplicate detected.' });
    } catch (err) {
      errors.push({ pelanggan: customer, error: err.message || String(err) });
      index[customer] = { pelanggan: customer, status: 'ERROR', error: err.message || String(err), indexed_at: tnmd140iv2_now_() };
      cursor++;
      break;
    }
  }

  const completed = cursor >= customers.length;
  const state = { cursor: cursor, total_customer: customers.length, completed: completed, updated_at: tnmd140iv2_now_() };
  tnmd140iv2_saveState_(index, state);

  return tnmd140iv2_emit_('TNMD v1.4.0 - CUSTOMER INDEX V2 - BATCH', {
    success: errors.length === 0,
    test: 'tnmd140iv2_runBatch',
    generated_at: tnmd140iv2_now_(),
    duration_ms: new Date().getTime() - started,
    batch_size: batchSize,
    processed_count: processed.length,
    processed: processed,
    errors: errors,
    checkpoint: state,
    status: errors.length === 0 ? 'PASS' : 'PARTIAL'
  });
}

function tnmd140iv2_getIndex() {
  const saved = tnmd140iv2_readState_();
  return tnmd140iv2_emit_('TNMD v1.4.0 - CUSTOMER INDEX V2 - GET INDEX', {
    success: true,
    test: 'tnmd140iv2_getIndex',
    generated_at: tnmd140iv2_now_(),
    checkpoint: saved.state,
    customer_count_indexed: Object.keys(saved.index).length,
    index: saved.index
  });
}

function tnmd140iv2_getCustomer(customer) {
  const saved = tnmd140iv2_readState_();
  customer = String(customer || '').trim();
  const item = saved.index[customer] || null;
  return tnmd140iv2_emit_('TNMD v1.4.0 - CUSTOMER INDEX V2 - GET CUSTOMER', {
    success: !!item,
    test: 'tnmd140iv2_getCustomer',
    generated_at: tnmd140iv2_now_(),
    pelanggan: customer,
    data: item
  });
}

/** Reset only this v2 index state. Does not touch v1.3.2 or other versions. */
function tnmd140iv2_reset() {
  const props = PropertiesService.getScriptProperties();
  props.deleteProperty(TNMD140IV2.PROP_CURSOR);
  props.deleteProperty(TNMD140IV2.PROP_STATE);
  props.deleteProperty(TNMD140IV2.PROP_INDEX);
  return tnmd140iv2_emit_('TNMD v1.4.0 - CUSTOMER INDEX V2 - RESET', { success: true, test: 'tnmd140iv2_reset', generated_at: tnmd140iv2_now_(), status: 'RESET' });
}

function tnmd140iv2_testEngine() {
  const started = new Date().getTime();
  try {
    const result = tnmd140iv2_scanCustomer_('FBR');
    const checks = { complete: result.complete, duplicate: result.duplicate_count === 0, expected_pages: result.jumlah_page === 4, expected_active: result.jumlah_transaksi_aktif === 238, expected_piutang: result.total_piutang === 203200000 };
    const pass = Object.keys(checks).every(function(k) { return checks[k]; });
    return tnmd140iv2_emit_('TNMD v1.4.0 - CUSTOMER INDEX V2 - ENGINE TEST', { success: pass, test: 'tnmd140iv2_testEngine', generated_at: tnmd140iv2_now_(), duration_ms: new Date().getTime() - started, result: { customer: result, checks: checks, status: pass ? 'PASS' : 'FAIL' } });
  } catch (err) {
    return tnmd140iv2_emit_('TNMD v1.4.0 - CUSTOMER INDEX V2 - ENGINE TEST', { success: false, test: 'tnmd140iv2_testEngine', generated_at: tnmd140iv2_now_(), duration_ms: new Date().getTime() - started, error: err.message || String(err) });
  }
}
