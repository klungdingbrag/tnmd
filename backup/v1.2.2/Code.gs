/**
 * TNMD API GATEWAY v1.2.2
 * TB NUSANTARA MANAGEMENT DASHBOARD
 *
 * v1.2.2 = v1.2.1 + standardized JSON test output.
 * Keep production/dashboard logic from v1.2.1 unchanged.
 *
 * IMPORTANT:
 * Replace the existing test functions in GAS with this block if you are
 * testing an existing v1.2.1 Code.gs. The helpers below are self-contained.
 */

function runTest_(testName, callback) {
  const started = Date.now();
  let output;

  try {
    const result = callback();
    output = {
      success: true,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      result: result === undefined ? null : result
    };
  } catch (error) {
    output = {
      success: false,
      test: testName,
      generated_at: new Date().toISOString(),
      duration_ms: Date.now() - started,
      error: error && error.message ? error.message : String(error)
    };
  }

  const json = JSON.stringify(output, null, 2);
  Logger.log(json);
  console.log(json);
  return output;
}

/**
 * Test 1: koneksi dasar ke SID Retail.
 */
function testSidConnection() {
  return runTest_('testSidConnection', function() {
    const response = requestSid_('SELECT 1 AS sid_test');
    return {
      kode_trx: response.kode_trx,
      sid_status: response.sid_response && response.sid_response.status,
      data: extractSidData_(response)
    };
  });
}

/**
 * Test 2: validasi konfigurasi customer CABANG.
 */
function testCustomerMapping() {
  return runTest_('testCustomerMapping', function() {
    const checks = CUSTOMER_CABANG.map(function(pelanggan) {
      return {
        pelanggan: pelanggan,
        kategori: isCustomerCabang_(pelanggan) ? 'CABANG' : 'NON-CABANG'
      };
    });

    return {
      jumlah_konfigurasi: CUSTOMER_CABANG.length,
      checks: checks,
      semua_cabang: checks.every(function(item) {
        return item.kategori === 'CABANG';
      })
    };
  });
}

/**
 * Test 3: pagination customer.
 * FBR dipakai sebagai baseline yang sudah kita validasi sebelumnya:
 * expected total piutang aktif = Rp203.200.000.
 *
 * Test ini tidak menganggap jumlah record mentah sebagai jumlah transaksi
 * aktif. Ia mengambil seluruh halaman dan menghitung hanya piutang > 0.
 */
function testCustomerPagination() {
  return runTest_('testCustomerPagination', function() {
    const pelanggan = 'FBR';
    const expectedPiutang = 203200000;
    const pageSize = CONFIG.PIUTANG_PAGE_SIZE;
    let offset = 0;
    let pages = [];
    let allData = [];

    while (true) {
      const page = getPiutangCustomerPage_(pelanggan, offset, pageSize);
      pages.push({
        offset: page.offset,
        jumlah_data: page.jumlah_data,
        jumlah_piutang: page.jumlah_piutang,
        total_piutang: page.total_piutang,
        transaksi_pertama: page.transaksi_pertama,
        transaksi_terakhir: page.transaksi_terakhir
      });
      allData = allData.concat(page.data || []);

      if (page.jumlah_data < pageSize) break;
      offset += pageSize;

      if (offset > CONFIG.MAX_PAGINATION_OFFSET) {
        throw new Error('Pagination melewati safety limit.');
      }
    }

    const duplicateKode = [];
    const seen = {};
    allData.forEach(function(row) {
      const kode = String(row.kode || '').trim();
      if (!kode) return;
      if (seen[kode]) duplicateKode.push(kode);
      seen[kode] = true;
    });

    const jumlahTransaksiAktif = allData.filter(function(row) {
      return Number(row.piutang) > 0;
    }).length;

    const totalPiutang = allData.reduce(function(total, row) {
      return total + (Number(row.piutang) || 0);
    }, 0);

    const selisihPiutang = totalPiutang - expectedPiutang;
    const status = selisihPiutang === 0 && duplicateKode.length === 0 ? 'PASS' : 'FAIL';

    return {
      pelanggan: pelanggan,
      jumlah_page: pages.length,
      total_raw: allData.length,
      jumlah_transaksi_aktif: jumlahTransaksiAktif,
      total_piutang: totalPiutang,
      expected_piutang: expectedPiutang,
      selisih_piutang: selisihPiutang,
      duplicate_count: duplicateKode.length,
      duplicate_kode: duplicateKode,
      pages: pages,
      status: status
    };
  });
}
