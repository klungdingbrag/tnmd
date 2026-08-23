/**
 * ============================================================
 * TNMD v1.2.2 - SELF CONTAINED TEST SUITE
 * ============================================================
 * File ini sengaja STANDALONE.
 * Tidak bergantung pada CONFIG, CUSTOMER_CABANG, requestSid_,
 * escapeSql_, atau fungsi lain dari Code.gs.
 *
 * Cara pakai:
 * 1. Tambahkan file ini ke Google Apps Script.
 * 2. Pastikan Script Properties memiliki SID_API_KEY.
 * 3. Jalankan testSidConnection().
 * 4. Jalankan testCustomerMapping().
 * 5. Jalankan testCustomerPagination().
 *
 * Catatan:
 * - Jangan menyalin test block v1.2.2 lama sekaligus.
 * - Jika ada fungsi test dengan nama sama, hapus versi lama.
 * ============================================================
 */

const TNMD_TEST_CONFIG = {
  SID_API_URL: 'https://sidretail.id/api',
  PAGE_SIZE: 100,
  MAX_OFFSET: 100000,
  EXPECTED_FBR_PIUTANG: 203200000
};

const TNMD_TEST_CUSTOMER_CABANG = [
  'FBR', 'RIMBAL', 'KUKUH', 'TB BEJA', 'BARBEX2', 'HENDRA', 'ITHENG',
  'KURNIA', 'MARTO', 'RHD', 'SUMA', '____2204024', '____2207004', '____2509014'
];

function tnmdTestJson_(testName, callback) {
  const started = Date.now();
  let output;

  try {
    output = {
      success: true,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: 0,
      result: callback()
    };
  } catch (error) {
    output = {
      success: false,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: 0,
      error: error && error.message ? error.message : String(error)
    };
  }

  output.duration_ms = Date.now() - started;
  const json = JSON.stringify(output, null, 2);
  Logger.log(json);
  console.log(json);
  return output;
}

function tnmdTestApiKey_() {
  const key = PropertiesService.getScriptProperties().getProperty('SID_API_KEY');
  if (!key || !String(key).trim()) {
    throw new Error('SID_API_KEY belum ditemukan di Script Properties.');
  }
  return String(key).trim();
}

function tnmdTestTransactionCode_() {
  const timestamp = Utilities.formatDate(
    new Date(),
    Session.getScriptTimeZone(),
    'yyyyMMddHHmmssSSS'
  );
  const random = Math.floor(Math.random() * 1000000)
    .toString()
    .padStart(6, '0');
  return 'TNMD' + timestamp + random;
}

function tnmdTestSqlQuote_(value) {
  return "'" + String(value == null ? '' : value).replace(/'/g, "''") + "'";
}

function tnmdTestBuildUrl_(sql, kodeTrx) {
  const cleanSql = String(sql).trim().replace(/\s+/g, ' ');
  return [
    TNMD_TEST_CONFIG.SID_API_URL,
    encodeURIComponent(tnmdTestApiKey_()),
    encodeURIComponent(kodeTrx),
    encodeURIComponent(cleanSql)
  ].join('/');
}

function tnmdTestRequestSid_(sql) {
  const cleanSql = String(sql || '').trim().replace(/\s+/g, ' ');
  if (!cleanSql) throw new Error('SQL tidak boleh kosong.');

  const kodeTrx = tnmdTestTransactionCode_();
  const url = tnmdTestBuildUrl_(cleanSql, kodeTrx);
  let response;

  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: { Accept: 'application/json' }
    });
  } catch (error) {
    throw new Error('Gagal menghubungi SID Retail API: ' + error.message);
  }

  const httpCode = response.getResponseCode();
  const text = response.getContentText();

  if (httpCode < 200 || httpCode >= 300) {
    throw new Error(
      'SID RETAIL API ERROR\nHTTP Status: ' + httpCode +
      '\nSQL: ' + cleanSql +
      '\nResponse: ' + text.substring(0, 1500)
    );
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(
      'SID Retail mengembalikan response bukan JSON.\nHTTP Status: ' +
      httpCode + '\nSQL: ' + cleanSql + '\nResponse: ' + text.substring(0, 1500)
    );
  }

  if (parsed && parsed.status === 'error') {
    throw new Error(
      'SID Retail SQL ERROR\nSQL: ' + cleanSql +
      '\nResponse: ' + JSON.stringify(parsed)
    );
  }

  return {
    kode_trx: kodeTrx,
    response: parsed
  };
}

function tnmdTestData_(sidResult) {
  const data = sidResult && sidResult.response && sidResult.response.data;
  if (Array.isArray(data)) return data;

  if (sidResult && sidResult.response && Array.isArray(sidResult.response.result)) {
    return sidResult.response.result;
  }

  return [];
}

function tnmdTestNormalizeCustomer_(value) {
  return String(value == null ? '' : value).trim().toUpperCase();
}

function tnmdTestMoney_(value) {
  if (value === null || value === undefined || value === '') return 0;
  return Number(String(value).trim().replace(/,/g, '')) || 0;
}

function tnmdTestIsCabang_(customer) {
  const target = tnmdTestNormalizeCustomer_(customer);
  return TNMD_TEST_CUSTOMER_CABANG.some(function(item) {
    return tnmdTestNormalizeCustomer_(item) === target;
  });
}

function tnmdTestBuildCustomerSql_(customer, limit, offset) {
  const target = tnmdTestNormalizeCustomer_(customer);
  const safeLimit = Number(limit);
  const safeOffset = Number(offset);

  if (!target) throw new Error('Kode pelanggan wajib diisi.');
  if (!Number.isInteger(safeLimit) || safeLimit < 1 || safeLimit > 100) {
    throw new Error('LIMIT harus 1 sampai 100.');
  }
  if (!Number.isInteger(safeOffset) || safeOffset < 0) {
    throw new Error('OFFSET tidak valid.');
  }

  // WAJIB satu baris. SID sebelumnya gagal ketika SQL multiline.
  return 'SELECT kode,tanggal,pelanggan,jenis,piutang FROM penjualan WHERE pelanggan=' +
    tnmdTestSqlQuote_(target) + ' LIMIT ' + safeLimit + ' OFFSET ' + safeOffset;
}

function tnmdTestCustomerPage_(customer, offset) {
  const sql = tnmdTestBuildCustomerSql_(
    customer,
    TNMD_TEST_CONFIG.PAGE_SIZE,
    offset
  );

  const sid = tnmdTestRequestSid_(sql);
  const raw = tnmdTestData_(sid);

  const data = raw.map(function(row) {
    return {
      kode: row.kode || '',
      tanggal: row.tanggal || '',
      pelanggan: row.pelanggan || customer,
      jenis: row.jenis || '',
      piutang: tnmdTestMoney_(row.piutang)
    };
  }).filter(function(row) {
    return row.piutang > 0;
  });

  return {
    offset: offset,
    jumlah_data_raw: raw.length,
    jumlah_piutang: data.length,
    total_piutang: data.reduce(function(sum, row) {
      return sum + row.piutang;
    }, 0),
    transaksi_pertama: data.length ? data[0].kode : null,
    transaksi_terakhir: data.length ? data[data.length - 1].kode : null,
    data: data
  };
}

function testSidConnection() {
  return tnmdTestJson_('testSidConnection', function() {
    const sid = tnmdTestRequestSid_('SELECT 1 AS sid_test');
    return {
      kode_trx: sid.kode_trx,
      sid_status: sid.response && sid.response.status,
      data: tnmdTestData_(sid)
    };
  });
}

function testCustomerMapping() {
  return tnmdTestJson_('testCustomerMapping', function() {
    const checks = TNMD_TEST_CUSTOMER_CABANG.map(function(customer) {
      return {
        pelanggan: customer,
        kategori: tnmdTestIsCabang_(customer) ? 'CABANG' : 'NON-CABANG'
      };
    });

    return {
      jumlah_konfigurasi: TNMD_TEST_CUSTOMER_CABANG.length,
      checks: checks,
      semua_cabang: checks.every(function(item) {
        return item.kategori === 'CABANG';
      })
    };
  });
}

function testCustomerPagination() {
  return tnmdTestJson_('testCustomerPagination', function() {
    const customer = 'FBR';
    const pages = [];
    const allData = [];
    let offset = 0;

    while (true) {
      const page = tnmdTestCustomerPage_(customer, offset);
      pages.push({
        offset: page.offset,
        jumlah_data_raw: page.jumlah_data_raw,
        jumlah_piutang: page.jumlah_piutang,
        total_piutang: page.total_piutang,
        transaksi_pertama: page.transaksi_pertama,
        transaksi_terakhir: page.transaksi_terakhir
      });
      allData.push.apply(allData, page.data);

      if (page.jumlah_data_raw < TNMD_TEST_CONFIG.PAGE_SIZE) break;

      offset += TNMD_TEST_CONFIG.PAGE_SIZE;
      if (offset > TNMD_TEST_CONFIG.MAX_OFFSET) {
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

    const selisih = totalPiutang - TNMD_TEST_CONFIG.EXPECTED_FBR_PIUTANG;

    return {
      pelanggan: customer,
      jumlah_page: pages.length,
      total_raw: allData.length,
      jumlah_transaksi_aktif: allData.length,
      total_piutang: totalPiutang,
      expected_piutang: TNMD_TEST_CONFIG.EXPECTED_FBR_PIUTANG,
      selisih_piutang: selisih,
      duplicate_count: duplicateKode.length,
      duplicate_kode: duplicateKode,
      pages: pages,
      status: selisih === 0 && duplicateKode.length === 0 ? 'PASS' : 'FAIL'
    };
  });
}
