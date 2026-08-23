/**
 * ============================================================
 * TNMD API GATEWAY v1.2
 * TB NUSANTARA MANAGEMENT DASHBOARD
 * ============================================================
 * MODE: READ ONLY
 * Source: user-provided TNMD API GATEWAY v1.2
 * ============================================================
 */

const CONFIG = {
  SID_API_URL: 'https://sidretail.id/api',
  PIUTANG_PAGE_SIZE: 100,
  TOP_CUSTOMER_LIMIT: 20,
  MAX_PAGINATION_OFFSET: 100000
};

const CUSTOMER_CABANG = [
  'FBR','RIMBAL','KUKUH','TB BEJA','BARBEX2','HENDRA','ITHENG',
  'KURNIA','MARTO','RHD','SUMA','____2204024','____2207004','____2509014'
];

const KATEGORI_PIUTANG = ['TOKO','CABANG','PARTAI','LAIN'];

function doGet() {
  return HtmlService.createHtmlOutputFromFile('index')
    .setTitle('TNMD - TB Nusantara Management Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function getApiKey_() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  if (!apiKey) throw new Error('SID_API_KEY belum ditemukan.\n\nBuka Project Settings → Script Properties lalu tambahkan:\nSID_API_KEY = API KEY SID Retail');
  return apiKey.trim();
}

function generateTransactionCode_() {
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyyMMddHHmmssSSS');
  const random = Math.floor(Math.random() * 1000000).toString().padStart(6, '0');
  return 'TNMD' + timestamp + random;
}

function createSidUrl_(sql, kodeTrx) {
  return [CONFIG.SID_API_URL, encodeURIComponent(getApiKey_()), encodeURIComponent(kodeTrx), encodeURIComponent(sql)].join('/');
}

function requestSid_(sql) {
  if (!sql || !String(sql).trim()) throw new Error('SQL tidak boleh kosong.');
  const kodeTrx = generateTransactionCode_();
  const url = createSidUrl_(sql, kodeTrx);
  let response;
  try {
    response = UrlFetchApp.fetch(url, {method:'get', muteHttpExceptions:true, followRedirects:true, headers:{Accept:'application/json'}});
  } catch (error) {
    throw new Error('Gagal menghubungi SID Retail API.\n\n' + error.message);
  }
  const httpCode = response.getResponseCode();
  const responseText = response.getContentText();
  if (httpCode < 200 || httpCode >= 300) {
    let preview = responseText || '';
    if (preview.length > 1500) preview = preview.substring(0,1500) + '\n...';
    throw new Error('SID RETAIL API ERROR\n\nHTTP Status: ' + httpCode + '\n\nSQL:\n' + sql + '\n\nResponse:\n' + preview);
  }
  let sidResponse;
  try { sidResponse = JSON.parse(responseText); }
  catch (error) {
    throw new Error('SID Retail mengembalikan response bukan JSON.\n\nHTTP Status: ' + httpCode + '\n\nSQL:\n' + sql + '\n\n' + responseText.substring(0,1500));
  }
  if (sidResponse && sidResponse.status === 'error') return {success:false, kode_trx:kodeTrx, message:sidResponse.result || 'SID Retail mengembalikan error.', sid_response:sidResponse};
  return {success:true, kode_trx:kodeTrx, message:null, sid_response:sidResponse};
}

function buildResponse_(moduleName, sql, response) {
  return {success:response && response.success === true, module:moduleName, sql:sql, kode_trx:response ? response.kode_trx : null, message:response ? response.message : null, result:response ? response.sid_response : null};
}

function extractSidData_(response) {
  if (!response || !response.sid_response || !Array.isArray(response.sid_response.data)) return [];
  return response.sid_response.data;
}

function normalizeCustomer_(value) { return String(value || '').trim().toUpperCase(); }

function parseMoney_(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(String(value).trim().replace(/,/g,'')) || 0;
}

function sqlQuote_(value) { return "'" + String(value).replace(/'/g,"''") + "'"; }

function getCustomerCabangSqlList_() { return CUSTOMER_CABANG.map(sqlQuote_).join(','); }

function isCustomerCabang_(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);
  return CUSTOMER_CABANG.some(function(item) { return normalizeCustomer_(item) === customer; });
}

function createPiutangSummary_() {
  return {TOKO:{jumlah_transaksi:0,total_piutang:0},CABANG:{jumlah_transaksi:0,total_piutang:0},PARTAI:{jumlah_transaksi:0,total_piutang:0},LAIN:{jumlah_transaksi:0,total_piutang:0}};
}

function jenisToKategori_(jenis) {
  switch (String(jenis || '').trim().toUpperCase()) {
    case 'PENJUALAN TOKO': return 'TOKO';
    case 'PENJUALAN CABANG': return 'CABANG';
    case 'PENJUALAN PARTAI': return 'PARTAI';
    case 'PENJUALAN LAIN': return 'LAIN';
    default: return 'LAIN';
  }
}

function getKategoriPiutang_(pelanggan, jenisSid) {
  if (isCustomerCabang_(pelanggan)) return 'CABANG';
  return jenisToKategori_(jenisSid);
}

function normalizePiutangSummary_(data) {
  const result = createPiutangSummary_();
  data.forEach(function(row) {
    const kategori = jenisToKategori_(row.jenis);
    result[kategori].jumlah_transaksi += parseMoney_(row.jumlah_transaksi);
    result[kategori].total_piutang += parseMoney_(row.total_piutang);
  });
  return result;
}

function sumSummaryField_(summary, field) {
  return KATEGORI_PIUTANG.reduce(function(total, kategori) { return total + (summary[kategori][field] || 0); }, 0);
}

function getPiutangSummaryByJenis_() {
  const sql = 'SELECT jenis, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang FROM penjualan WHERE piutang > 0 GROUP BY jenis';
  const response = requestSid_(sql);
  return normalizePiutangSummary_(extractSidData_(response));
}

function getCustomerCabangBreakdown_() {
  const branchList = getCustomerCabangSqlList_();
  const sql = 'SELECT jenis, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang FROM penjualan WHERE piutang > 0 AND pelanggan IN (' + branchList + ') GROUP BY jenis';
  const response = requestSid_(sql);
  return normalizePiutangSummary_(extractSidData_(response));
}

function getPiutangSummaryBusiness_() {
  const baseline = getPiutangSummaryByJenis_();
  const branchBreakdown = getCustomerCabangBreakdown_();
  const result = createPiutangSummary_();
  KATEGORI_PIUTANG.forEach(function(kategori) {
    result[kategori] = {jumlah_transaksi:baseline[kategori].jumlah_transaksi,total_piutang:baseline[kategori].total_piutang};
  });
  KATEGORI_PIUTANG.forEach(function(kategori) {
    if (kategori === 'CABANG') return;
    const jumlah = branchBreakdown[kategori].jumlah_transaksi;
    const total = branchBreakdown[kategori].total_piutang;
    result[kategori].jumlah_transaksi -= jumlah;
    result[kategori].total_piutang -= total;
    result.CABANG.jumlah_transaksi += jumlah;
    result.CABANG.total_piutang += total;
  });
  return {summary:result, baseline_sid:baseline, customer_cabang:branchBreakdown};
}

function getPiutangCabangBusiness_() {
  const breakdown = getCustomerCabangBreakdown_();
  return {jumlah_transaksi:sumSummaryField_(breakdown,'jumlah_transaksi'),total_piutang:sumSummaryField_(breakdown,'total_piutang')};
}

function getJumlahPelangganPiutang_() {
  const sql = 'SELECT COUNT(DISTINCT pelanggan) AS jumlah_pelanggan FROM penjualan WHERE piutang > 0';
  const response = requestSid_(sql);
  const data = extractSidData_(response);
  return data.length ? parseMoney_(data[0].jumlah_pelanggan) : 0;
}

function getTopPiutangCustomer_() {
  const sql = 'SELECT pelanggan, COUNT(*) AS jumlah_transaksi, SUM(piutang) AS total_piutang FROM penjualan WHERE piutang > 0 GROUP BY pelanggan ORDER BY SUM(piutang) DESC LIMIT ' + CONFIG.TOP_CUSTOMER_LIMIT;
  const response = requestSid_(sql);
  const data = extractSidData_(response);
  return data.map(function(row) {
    const pelanggan = normalizeCustomer_(row.pelanggan);
    return {pelanggan:pelanggan,kategori:isCustomerCabang_(pelanggan) ? 'CABANG' : 'NON-CABANG',jumlah_transaksi:parseMoney_(row.jumlah_transaksi),total_piutang:parseMoney_(row.total_piutang)};
  });
}

function getDashboardPiutang() {
  const business = getPiutangSummaryBusiness_();
  const summaryBusiness = business.summary;
  const summaryJenis = business.baseline_sid;
  const cabangBreakdown = business.customer_cabang;
  const cabangBusiness = {jumlah_transaksi:sumSummaryField_(cabangBreakdown,'jumlah_transaksi'),total_piutang:sumSummaryField_(cabangBreakdown,'total_piutang')};
  const jumlahPelanggan = getJumlahPelangganPiutang_();
  const topCustomer = getTopPiutangCustomer_();
  const totalTransaksi = sumSummaryField_(summaryBusiness,'jumlah_transaksi');
  const totalPiutang = sumSummaryField_(summaryBusiness,'total_piutang');
  const baselineTransaksi = sumSummaryField_(summaryJenis,'jumlah_transaksi');
  const baselinePiutang = sumSummaryField_(summaryJenis,'total_piutang');
  const selisihTransaksi = totalTransaksi - baselineTransaksi;
  const selisihPiutang = totalPiutang - baselinePiutang;
  return {
    success:true,
    generated_at:new Date().toISOString(),
    total:{transaksi:totalTransaksi,piutang:totalPiutang,jumlah_customer:jumlahPelanggan},
    kategori:summaryBusiness,
    top_customer:topCustomer,
    audit:{baseline_sid:{transaksi:baselineTransaksi,piutang:baselinePiutang},final_dashboard:{transaksi:totalTransaksi,piutang:totalPiutang},selisih:{transaksi:selisihTransaksi,piutang:selisihPiutang},summary_jenis_sid:summaryJenis,customer_cabang:cabangBreakdown,piutang_cabang_mapping:cabangBusiness},
    konfigurasi_cabang:CUSTOMER_CABANG
  };
}

function getPiutangCustomerPage_(pelanggan, offset, pageSize) {
  const customer = normalizeCustomer_(pelanggan);
  if (!customer) throw new Error('Kode pelanggan wajib diisi.');
  const limit = Number(pageSize || CONFIG.PIUTANG_PAGE_SIZE);
  if (limit < 1 || limit > 100) throw new Error('pageSize harus antara 1 sampai 100.');
  const safeOffset = Math.max(0, Number(offset) || 0);
  const sql = 'SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan=' + sqlQuote_(customer) + ' LIMIT ' + limit + ' OFFSET ' + safeOffset;
  const response = requestSid_(sql);
  const rawData = extractSidData_(response);
  const active = rawData.map(function(row) { return {kode:row.kode || '',tanggal:row.tanggal || '',pelanggan:row.pelanggan || customer,jenis:row.jenis || '',piutang:parseMoney_(row.piutang)}; }).filter(function(row) { return row.piutang > 0; });
  return {success:true,pelanggan:customer,offset:safeOffset,page_size:limit,jumlah_data:rawData.length,jumlah_piutang:active.length,total_piutang:active.reduce(function(total,row){return total+row.piutang;},0),transaksi_pertama:rawData.length ? rawData[0].kode : null,transaksi_terakhir:rawData.length ? rawData[rawData.length-1].kode : null,data:active};
}

function getPiutangCustomer_(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);
  if (!customer) throw new Error('Kode pelanggan wajib diisi.');
  const pageSize = CONFIG.PIUTANG_PAGE_SIZE;
  let offset = 0;
  const semuaTransaksi = [];
  const halaman = [];
  while (true) {
    const page = getPiutangCustomerPage_(customer,offset,pageSize);
    halaman.push({offset:page.offset,jumlah_data:page.jumlah_data,jumlah_piutang:page.jumlah_piutang,total_piutang:page.total_piutang,transaksi_pertama:page.transaksi_pertama,transaksi_terakhir:page.transaksi_terakhir});
    semuaTransaksi.push.apply(semuaTransaksi,page.data);
    if (page.jumlah_data < pageSize) break;
    offset += pageSize;
    if (offset > CONFIG.MAX_PAGINATION_OFFSET) throw new Error('Pagination berhenti karena melewati safety limit ' + CONFIG.MAX_PAGINATION_OFFSET + ' record.');
  }
  const totalPiutang = semuaTransaksi.reduce(function(total,row){return total+row.piutang;},0);
  const kategoriMap = {};
  semuaTransaksi.forEach(function(row) {
    const kategori = getKategoriPiutang_(row.pelanggan,row.jenis);
    if (!kategoriMap[kategori]) kategoriMap[kategori] = {jumlah_transaksi:0,total_piutang:0};
    kategoriMap[kategori].jumlah_transaksi++;
    kategoriMap[kategori].total_piutang += row.piutang;
  });
  return {success:true,pelanggan:customer,kategori:isCustomerCabang_(customer) ? 'CABANG' : null,summary:{jumlah_transaksi:semuaTransaksi.length,total_piutang:totalPiutang},kategori_detail:kategoriMap,pagination:{page_size:pageSize,jumlah_halaman:halaman.length,jumlah_record_raw:halaman.reduce(function(total,page){return total+page.jumlah_data;},0)},halaman:halaman,transaksi:semuaTransaksi};
}

function getPiutangCustomer(pelanggan) { return getPiutangCustomer_(pelanggan); }
function getPiutangCustomerPage(pelanggan,offset) { return getPiutangCustomerPage_(pelanggan,offset,CONFIG.PIUTANG_PAGE_SIZE); }

function getCustomerByKode(kode) {
  const customer = normalizeCustomer_(kode);
  const sql = 'SELECT kode,nama,telp,saldo_piutang,saldo_tabungan,max_piutang,saldo_hutang FROM pelanggan WHERE kode=' + sqlQuote_(customer) + ' LIMIT 1';
  const response = requestSid_(sql);
  const data = extractSidData_(response);
  return {success:true,pelanggan:customer,ditemukan:data.length > 0,data:data.length ? data[0] : null};
}

function getPelangganPiutangMaster() {
  const sql = 'SELECT kode,nama,telp,saldo_piutang,max_piutang FROM pelanggan WHERE saldo_piutang > 0 ORDER BY saldo_piutang DESC LIMIT 100';
  return buildResponse_('pelanggan_piutang_master',sql,requestSid_(sql));
}

function getBarang() { const sql='SELECT kode,nama FROM barang'; return buildResponse_('barang',sql,requestSid_(sql)); }
function getBarangSample() { const sql='SELECT * FROM barang LIMIT 1'; return buildResponse_('barang_sample',sql,requestSid_(sql)); }
function getPelanggan() { const sql='SELECT kode,nama,telp,saldo_piutang,saldo_tabungan,max_piutang FROM pelanggan'; return buildResponse_('pelanggan',sql,requestSid_(sql)); }
function getPelangganSample() { const sql='SELECT * FROM pelanggan LIMIT 1'; return buildResponse_('pelanggan_sample',sql,requestSid_(sql)); }
function getPiutangSample() { const sql='SELECT * FROM piutang LIMIT 1'; return buildResponse_('piutang_sample',sql,requestSid_(sql)); }
function getTabunganSample() { const sql='SELECT * FROM tabungan LIMIT 1'; return buildResponse_('tabungan_sample',sql,requestSid_(sql)); }
function getPenjualanSample() { const sql='SELECT * FROM penjualan LIMIT 1'; return buildResponse_('penjualan_sample',sql,requestSid_(sql)); }
function getPenjualanLimit100() { const sql='SELECT * FROM penjualan LIMIT 100'; return buildResponse_('penjualan_limit100',sql,requestSid_(sql)); }

function checkConfiguration() {
  const apiKey = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  return {success:true,mode:'READ ONLY',apiConfigured:!!apiKey,api:CONFIG.SID_API_URL,piutangPageSize:CONFIG.PIUTANG_PAGE_SIZE,topCustomerLimit:CONFIG.TOP_CUSTOMER_LIMIT,transactionCode:'AUTO UNIQUE',jumlahCustomerCabang:CUSTOMER_CABANG.length};
}

function testDashboardPiutang() { const result=getDashboardPiutang(); console.log(JSON.stringify(result,null,2)); return result; }
function testPiutangFBR() { const result=getPiutangCustomer_('FBR'); console.log(JSON.stringify({pelanggan:result.pelanggan,jumlah_halaman:result.pagination.jumlah_halaman,jumlah_record_raw:result.pagination.jumlah_record_raw,jumlah_transaksi_piutang:result.summary.jumlah_transaksi,total_piutang:result.summary.total_piutang},null,2)); return result; }
function testPiutangFBRPage0() { return getPiutangCustomerPage_('FBR',0,100); }
function testPiutangFBRPage100() { return getPiutangCustomerPage_('FBR',100,100); }
function testPiutangFBRPage200() { return getPiutangCustomerPage_('FBR',200,100); }
function testPiutangFBRPage300() { return getPiutangCustomerPage_('FBR',300,100); }
function testPiutangSummaryJenis() { const result=getPiutangSummaryByJenis_(); console.log(JSON.stringify(result,null,2)); return result; }
function testPiutangCabangBusiness() { const result=getPiutangCabangBusiness_(); console.log(JSON.stringify(result,null,2)); return result; }
function testTopPiutangCustomer() { const result=getTopPiutangCustomer_(); console.log(JSON.stringify(result,null,2)); return result; }
function testJumlahPelangganPiutang() { const result=getJumlahPelangganPiutang_(); console.log(result); return result; }
function testCustomer2209025() { return getCustomerByKode('2209025'); }
function testCustomer2103002() { return getCustomerByKode('2103002'); }
function testPiutangCustomer2103002() { return getPiutangCustomer_('2103002'); }
function testConfiguration() { return checkConfiguration(); }

function testPiutangReconciliation() {
  const result=getDashboardPiutang();
  const audit=result.audit;
  const ok=audit.selisih.transaksi === 0 && audit.selisih.piutang === 0;
  const output={ok:ok,selisih_transaksi:audit.selisih.transaksi,selisih_piutang:audit.selisih.piutang};
  console.log(JSON.stringify(output,null,2));
  if (!ok) throw new Error('RECONCILIATION GAGAL.\nSelisih transaksi=' + audit.selisih.transaksi + '\nSelisih piutang=' + audit.selisih.piutang);
  return {success:true,message:'Reconciliation OK. Selisih = 0.',audit:audit};
}

function testPenjualanKode(kode) {
  if (!kode) throw new Error('Masukkan kode transaksi.');
  const sql='SELECT kode,tanggal,pelanggan,subtotal,jumlah,bayar,kembali,piutang,lunas,status,jenis FROM penjualan WHERE kode=' + sqlQuote_(kode) + ' LIMIT 1';
  return buildResponse_('penjualan_kode',sql,requestSid_(sql));
}

/* END OF FILE */
