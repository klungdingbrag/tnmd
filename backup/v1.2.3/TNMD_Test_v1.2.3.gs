/**
 * ============================================================
 * TNMD v1.2.3 - VALIDATION TEST SUITE
 * ============================================================
 * TEST SAJA - BUKAN CODE PRODUK / BUKAN DEPLOYMENT
 *
 * Tujuan:
 * 1. Memastikan koneksi SID berjalan.
 * 2. Memastikan mapping 14 customer cabang benar.
 * 3. Memastikan pagination customer FBR mengambil seluruh data.
 * 4. Memastikan total pagination FBR = baseline dashboard Rp203.200.000.
 *
 * FILE INI STANDALONE.
 * Tidak memakai CONFIG, requestSid_, CUSTOMER_CABANG, escapeSql_,
 * atau fungsi lain dari Code.gs utama.
 *
 * Penting:
 * - SQL selalu dikirim sebagai SATU BARIS.
 * - Pagination berhenti berdasarkan jumlah DATA RAW, bukan jumlah
 *   transaksi yang masih mempunyai piutang.
 * - Ini penting karena satu halaman dapat berisi transaksi piutang = 0.
 * ============================================================
 */

const TNMD123_TEST = {
  API_URL: 'https://sidretail.id/api',
  PAGE_SIZE: 100,
  MAX_OFFSET: 100000,
  CUSTOMER: 'FBR',
  EXPECTED_PIUTANG: 203200000,
  EXPECTED_PAGES: 4,
  CUSTOMER_CABANG: [
    'FBR', 'RIMBAL', 'KUKUH', 'TB BEJA', 'BARBEX2', 'HENDRA', 'ITHENG',
    'KURNIA', 'MARTO', 'RHD', 'SUMA', '____2204024', '____2207004', '____2509014'
  ]
};

function tnmd123_json_(name, fn) {
  const started = Date.now();
  let output;
  try {
    output = {
      success: true,
      test: name,
      generated_at: new Date().toISOString(),
      duration_ms: 0,
      result: fn()
    };
  } catch (err) {
    output = {
      success: false,
      test: name,
      generated_at: new Date().toISOString(),
      duration_ms: 0,
      error: err && err.message ? err.message : String(err)
    };
  }
  output.duration_ms = Date.now() - started;
  const json = JSON.stringify(output, null, 2);
  Logger.log(json);
  console.log(json);
  return output;
}

function tnmd123_apiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  if (!key || !String(key).trim()) {
    throw new Error('SID_API_KEY belum ditemukan di Script Properties.');
  }
  return String(key).trim();
}

function tnmd123_trxCode_() {
  const stamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMddHHmmssSSS'
  );
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return 'TNMD' + stamp + random;
}

function tnmd123_quote_(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

function tnmd123_url_(sql, trx) {
  return [
    TNMD123_TEST.API_URL,
    encodeURIComponent(tnmd123_apiKey_()),
    encodeURIComponent(trx),
    encodeURIComponent(String(sql).trim().replace(/\s+/g, ' '))
  ].join('/');
}

function tnmd123_request_(sql) {
  const cleanSql = String(sql || '').trim().replace(/\s+/g, ' ');
  if (!cleanSql) throw new Error('SQL tidak boleh kosong.');

  const trx = tnmd123_trxCode_();
  let response;
  try {
    response = UrlFetchApp.fetch(tnmd123_url_(cleanSql, trx), {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json' }
    });
  } catch (err) {
    throw new Error('Gagal menghubungi SID Retail API: ' + err.message);
  }

  const status = response.getResponseCode();
  const text = response.getContentText();

  if (status < 200 || status >= 300) {
    throw new Error(
      'SID RETAIL API ERROR\nHTTP Status: ' + status +
      '\nSQL: ' + cleanSql +
      '\nResponse: ' + text.substring(0, 1500)
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (err) {
    throw new Error(
      'SID Retail mengembalikan response bukan JSON.\nHTTP Status: ' +
      status + '\nSQL: ' + cleanSql + '\nResponse: ' + text.substring(0, 1500)
    );
  }

  if (parsed && parsed.status === 'error') {
    throw new Error(
      'SID Retail SQL ERROR\nSQL: ' + cleanSql +
      '\nResponse: ' + JSON.stringify(parsed)
    );
  }

  return { kode_trx: trx, response: parsed };
}

function tnmd123_data_(result) {
  const response = result && result.response;
  if (response && Array.isArray(response.data)) return response.data;
  if (response && response.sid_response && Array.isArray(response.sid_response.data)) {
    return response.sid_response.data;
  }
  if (response && Array.isArray(response.result)) return response.result;
  if (response && response.sid_response && Array.isArray(response.sid_response.result)) {
    return response.sid_response.result;
  }
  return [];
}

function tnmd123_money_(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(String(value).trim().replace(/,/g, '')) || 0;
}

function tnmd123_customer_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function tnmd123_isCabang_(value) {
  const customer = tnmd123_customer_(value);
  return TNMD123_TEST.CUSTOMER_CABANG.some(function(item) {
    return tnmd123_customer_(item) === customer;
  });
}

function tnmd123_customerSql_(customer, offset) {
  const target = tnmd123_customer_(customer);
  const safeOffset = Number(offset);
  if (!target) throw new Error('Customer wajib diisi.');
  if (!Number.isInteger(safeOffset) || safeOffset < 0) {
    throw new Error('Offset tidak valid.');
  }

  // Satu baris: SID sebelumnya bermasalah dengan SQL multiline.
  return 'SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan=' +
    tnmd123_quote_(target) +
    ' LIMIT ' + TNMD123_TEST.PAGE_SIZE +
    ' OFFSET ' + safeOffset;
}

function tnmd123_customerPage_(customer, offset) {
  const result = tnmd123_request_(tnmd123_customerSql_(customer, offset));
  const raw = tnmd123_data_(result);
  const active = raw.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || customer,
      jenis: row.jenis || '',
      piutang: tnmd123_money_(row.piutang)
    };
  }).filter(function(row) {
    return row.piutang > 0;
  });

  return {
    offset: offset,
    raw_count: raw.length,
    active_count: active.length,
    total_piutang: active.reduce(function(sum, row) {
      return sum + row.piutang;
    }, 0),
    first_code: raw.length ? raw[0].kode : null,
    last_code: raw.length ? raw[raw.length - 1].kode : null,
    data: active
  };
}

/** TEST 1 */
function tnmd123_testSidConnection() {
  return tnmd123_json_('tnmd123_testSidConnection', function() {
    const result = tnmd123_request_('SELECT 1 AS sid_test');
    return {
      kode_trx: result.kode_trx,
      sid_status: result.response && result.response.status,
      data: tnmd123_data_(result)
    };
  });
}

/** TEST 2 */
function tnmd123_testCustomerMapping() {
  return tnmd123_json_('tnmd123_testCustomerMapping', function() {
    const checks = TNMD123_TEST.CUSTOMER_CABANG.map(function(customer) {
      return {
        pelanggan: customer,
        kategori: tnmd123_isCabang_(customer) ? 'CABANG' : 'NON-CABANG'
      };
    });

    return {
      jumlah_konfigurasi: checks.length,
      checks: checks,
      semua_cabang: checks.every(function(item) {
        return item.kategori === 'CABANG';
      })
    };
  });
}

/** TEST 3 - PAGINATION FBR */
function tnmd123_testCustomerPagination() {
  return tnmd123_json_('tnmd123_testCustomerPagination', function() {
    const pages = [];
    const allData = [];
    let offset = 0;

    while (true) {
      const page = tnmd123_customerPage_(TNMD123_TEST.CUSTOMER, offset);

      pages.push({
        offset: page.offset,
        raw_count: page.raw_count,
        active_count: page.active_count,
        total_piutang: page.total_piutang,
        first_code: page.first_code,
        last_code: page.last_code
      });

      allData.push.apply(allData, page.data);

      // KRITIS: berhenti berdasarkan RAW DATA, bukan active_count.
      // Halaman bisa berisi piutang = 0 tetapi tetap harus dihitung.
      if (page.raw_count < TNMD123_TEST.PAGE_SIZE) break;

      offset += TNMD123_TEST.PAGE_SIZE;
      if (offset > TNMD123_TEST.MAX_OFFSET) {
        throw new Error('Pagination melewati safety limit.');
      }
    }

    const seen = {};
    const duplicateKode = [];
    allData.forEach(function(row) {
      const kode = String(row.kode || '').trim();
      if (!kode) return;
      if (seen[kode]) duplicateKode.push(kode);
      seen[kode] = true;
    });

    const totalPiutang = allData.reduce(function(sum, row) {
      return sum + row.piutang;
    }, 0);

    const selisih = totalPiutang - TNMD123_TEST.EXPECTED_PIUTANG;
    const pageCountOk = pages.length === TNMD123_TEST.EXPECTED_PAGES;
    const totalOk = selisih === 0;
    const duplicateOk = duplicateKode.length === 0;

    return {
      pelanggan: TNMD123_TEST.CUSTOMER,
      page_size: TNMD123_TEST.PAGE_SIZE,
      jumlah_page: pages.length,
      expected_page: TNMD123_TEST.EXPECTED_PAGES,
      total_raw_aktif: allData.length,
      total_piutang: totalPiutang,
      expected_piutang: TNMD123_TEST.EXPECTED_PIUTANG,
      selisih_piutang: selisih,
      duplicate_count: duplicateKode.length,
      duplicate_kode: duplicateKode,
      pages: pages,
      checks: {
        page_count: pageCountOk,
        total_piutang: totalOk,
        duplicate: duplicateOk
      },
      status: pageCountOk && totalOk && duplicateOk ? 'PASS' : 'FAIL'
    };
  });
}

/** TEST 4 - SEMUA TEST UTAMA */
function tnmd123_runAllTests() {
  const results = [
    tnmd123_testSidConnection(),
    tnmd123_testCustomerMapping(),
    tnmd123_testCustomerPagination()
  ];

  const passed = results.every(function(item) {
    return item && item.success === true && (!item.result || item.result.status !== 'FAIL');
  });

  const output = {
    success: passed,
    test: 'tnmd123_runAllTests',
    generated_at: new Date().toISOString(),
    status: passed ? 'PASS' : 'FAIL',
    tests: results.map(function(item) {
      return {
        test: item.test,
        success: item.success,
        status: item.result && item.result.status ? item.result.status : null,
        error: item.error || null
      };
    })
  };

  const json = JSON.stringify(output, null, 2);
  Logger.log(json);
  console.log(json);
  return output;
}
