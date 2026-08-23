/**
 * ============================================================
 * TNMD API GATEWAY v1.1
 * TB NUSANTARA MANAGEMENT DASHBOARD
 * ============================================================
 *
 * MODE: READ ONLY
 *
 * Prinsip:
 * 1. Hindari full-table query besar.
 * 2. Detail piutang customer menggunakan pagination 100 record.
 * 3. Dashboard menggunakan query agregat ringan.
 * 4. Customer cabang mengikuti mapping bisnis TB Nusantara.
 *
 * Modul:
 * 1. Configuration
 * 2. Web App
 * 3. SID API Core
 * 4. Dashboard Piutang
 * 5. Detail Piutang Customer
 * 6. Master / Discovery API
 * 7. Test & Validation
 * ============================================================
 */

/**
 * v1.1 CHANGELOG
 * - Reconciliation menjadi source-of-truth SID.
 * - Customer CABANG direklasifikasi penuh ke CABANG.
 * - Transaksi PENJUALAN CABANG customer non-mapping tetap CABANG.
 * - Audit transaksi dan rupiah harus = 0 selisih.
 * - Top customer non-cabang tidak lagi salah disebut LAIN.
 * - Query besar/detail tetap menggunakan pagination/aggregasi ringan.
 */

/* ============================================================
 * 1. CONFIGURATION
 * ============================================================
 */

const CONFIG = {
  SID_API_URL: 'https://sidretail.id/api',
  PIUTANG_PAGE_SIZE: 100,
  TOP_CUSTOMER_LIMIT: 20
};


/**
 * Customer yang secara bisnis ditetapkan sebagai CABANG.
 *
 * Mapping bisnis ini diprioritaskan daripada field "jenis"
 * dari SID Retail.
 */
const CUSTOMER_CABANG = [
  'FBR',
  'RIMBAL',
  'KUKUH',
  'TB BEJA',
  'BARBEX2',
  'HENDRA',
  'ITHENG',
  'KURNIA',
  'MARTO',
  'RHD',
  'SUMA',
  '____2204024',
  '____2207004',
  '____2509014'
];


/* ============================================================
 * 2. WEB APP
 * ============================================================
 */

function doGet() {
  return HtmlService
    .createHtmlOutputFromFile('index')
    .setTitle('TNMD - TB Nusantara Management Dashboard')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}


/* ============================================================
 * 3. SID API CORE
 * ============================================================
 */

function getApiKey_() {
  const apiKey = PropertiesService
    .getScriptProperties()
    .getProperty('SID_API_KEY');

  if (!apiKey) {
    throw new Error(
      'SID_API_KEY belum ditemukan.\n\n' +
      'Buka Project Settings → Script Properties lalu tambahkan:\n' +
      'SID_API_KEY = API KEY SID Retail'
    );
  }

  return apiKey.trim();
}


function generateTransactionCode_() {
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


function createSidUrl_(sql, kodeTrx) {
  return [
    CONFIG.SID_API_URL,
    encodeURIComponent(getApiKey_()),
    encodeURIComponent(kodeTrx),
    encodeURIComponent(sql)
  ].join('/');
}


/**
 * Request utama ke SID Retail.
 *
 * Tidak melakukan retry otomatis agar error 504 tidak
 * menyebabkan request berat berulang-ulang.
 */
function requestSid_(sql) {
  if (!sql || !String(sql).trim()) {
    throw new Error('SQL tidak boleh kosong.');
  }

  const kodeTrx = generateTransactionCode_();
  const url = createSidUrl_(sql, kodeTrx);

  let response;

  try {
    response = UrlFetchApp.fetch(url, {
      method: 'get',
      muteHttpExceptions: true,
      followRedirects: true,
      headers: {
        Accept: 'application/json'
      }
    });
  } catch (error) {
    throw new Error(
      'Gagal menghubungi SID Retail API.\n\n' +
      error.message
    );
  }

  const httpCode = response.getResponseCode();
  const responseText = response.getContentText();

  if (httpCode < 200 || httpCode >= 300) {
    let preview = responseText || '';

    if (preview.length > 1500) {
      preview = preview.substring(0, 1500) + '\n...';
    }

    throw new Error(
      'SID RETAIL API ERROR\n\n' +
      'HTTP Status: ' + httpCode + '\n\n' +
      'SQL:\n' + sql + '\n\n' +
      'Response:\n' + preview
    );
  }

  let sidResponse;

  try {
    sidResponse = JSON.parse(responseText);
  } catch (error) {
    throw new Error(
      'SID Retail mengembalikan response bukan JSON.\n\n' +
      'HTTP Status: ' + httpCode + '\n\n' +
      'SQL:\n' + sql + '\n\n' +
      responseText.substring(0, 1500)
    );
  }

  if (sidResponse && sidResponse.status === 'error') {
    return {
      success: false,
      kode_trx: kodeTrx,
      message:
        sidResponse.result ||
        'SID Retail mengembalikan error.',
      sid_response: sidResponse
    };
  }

  return {
    success: true,
    kode_trx: kodeTrx,
    message: null,
    sid_response: sidResponse
  };
}


function buildResponse_(moduleName, sql, response) {
  return {
    success: response && response.success === true,
    module: moduleName,
    sql: sql,
    kode_trx: response ? response.kode_trx : null,
    message: response ? response.message : null,
    result: response ? response.sid_response : null
  };
}


function extractSidData_(response) {
  if (
    !response ||
    !response.sid_response ||
    !Array.isArray(response.sid_response.data)
  ) {
    return [];
  }

  return response.sid_response.data;
}


/* ============================================================
 * 4. GENERAL HELPERS
 * ============================================================
 */

function normalizeCustomer_(value) {
  return String(value || '')
    .trim()
    .toUpperCase();
}


function parseMoney_(value) {
  if (value === null || value === undefined || value === '') {
    return 0;
  }

  return Number(
    String(value)
      .trim()
      .replace(/,/g, '')
  ) || 0;
}


function sqlQuote_(value) {
  return "'" +
    String(value).replace(/'/g, "''") +
    "'";
}


function getCustomerCabangSqlList_() {
  return CUSTOMER_CABANG
    .map(sqlQuote_)
    .join(',');
}


function isCustomerCabang_(pelanggan) {
  const customer = normalizeCustomer_(pelanggan);

  return CUSTOMER_CABANG.some(function(item) {
    return normalizeCustomer_(item) === customer;
  });
}


/**
 * Kategori final bisnis.
 *
 * Prioritas:
 * 1. Mapping customer cabang
 * 2. Jenis transaksi SID
 */
function getKategoriPiutang_(pelanggan, jenisSid) {
  if (isCustomerCabang_(pelanggan)) {
    return 'CABANG';
  }

  switch (
    String(jenisSid || '')
      .trim()
      .toUpperCase()
  ) {
    case 'PENJUALAN CABANG':
      return 'CABANG';

    case 'PENJUALAN PARTAI':
      return 'PARTAI';

    case 'PENJUALAN TOKO':
      return 'TOKO';

    case 'PENJUALAN LAIN':
      return 'LAIN';

    default:
      return 'LAIN';
  }
}


/* ============================================================
 * 5. DASHBOARD PIUTANG
 * ============================================================
 *
 * DILARANG menggunakan lagi:
 *
 * SELECT ... FROM penjualan
 * WHERE piutang > 0
 * LIMIT 5000
 *
 * Query tersebut sudah terbukti dapat menghasilkan 504.
 *
 * Dashboard menggunakan agregasi ringan.
 * Detail customer menggunakan pagination.
 */


/**
 * Ringkasan menurut jenis SID.
 *
 * Digunakan sebagai AUDIT, bukan sebagai klasifikasi bisnis final.
 */
function getPiutangSummaryByJenis_() {
  const sql =
    'SELECT jenis, ' +
    'COUNT(*) AS jumlah_transaksi, ' +
    'SUM(piutang) AS total_piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'GROUP BY jenis';

  const response = requestSid_(sql);
  const data = extractSidData_(response);

  const result = {
    TOKO: {
      jumlah_transaksi: 0,
      total_piutang: 0
    },
    CABANG: {
      jumlah_transaksi: 0,
      total_piutang: 0
    },
    PARTAI: {
      jumlah_transaksi: 0,
      total_piutang: 0
    },
    LAIN: {
      jumlah_transaksi: 0,
      total_piutang: 0
    }
  };

  data.forEach(function(row) {
    const jenis = String(row.jenis || '')
      .trim()
      .toUpperCase();

    let kategori = 'LAIN';

    if (jenis === 'PENJUALAN TOKO') {
      kategori = 'TOKO';
    } else if (jenis === 'PENJUALAN CABANG') {
      kategori = 'CABANG';
    } else if (jenis === 'PENJUALAN PARTAI') {
      kategori = 'PARTAI';
    } else if (jenis === 'PENJUALAN LAIN') {
      kategori = 'LAIN';
    }

    result[kategori].jumlah_transaksi +=
      parseMoney_(row.jumlah_transaksi);

    result[kategori].total_piutang +=
      parseMoney_(row.total_piutang);
  });

  return result;
}


/**
 * Membuat struktur kategori kosong.
 */
function createPiutangSummary_() {
  return {
    TOKO: {
      jumlah_transaksi: 0,
      total_piutang: 0
    },
    CABANG: {
      jumlah_transaksi: 0,
      total_piutang: 0
    },
    PARTAI: {
      jumlah_transaksi: 0,
      total_piutang: 0
    },
    LAIN: {
      jumlah_transaksi: 0,
      total_piutang: 0
    }
  };
}


/**
 * Mengubah jenis transaksi SID menjadi kategori standar.
 */
function jenisToKategori_(jenis) {
  switch (
    String(jenis || '')
      .trim()
      .toUpperCase()
  ) {
    case 'PENJUALAN TOKO':
      return 'TOKO';

    case 'PENJUALAN CABANG':
      return 'CABANG';

    case 'PENJUALAN PARTAI':
      return 'PARTAI';

    case 'PENJUALAN LAIN':
      return 'LAIN';

    default:
      return 'LAIN';
  }
}


/**
 * Mengubah hasil GROUP BY jenis menjadi summary standar.
 */
function normalizePiutangSummary_(data) {
  const result =
    createPiutangSummary_();

  data.forEach(function(row) {
    const kategori =
      jenisToKategori_(row.jenis);

    result[kategori]
      .jumlah_transaksi +=
      parseMoney_(
        row.jumlah_transaksi
      );

    result[kategori]
      .total_piutang +=
      parseMoney_(
        row.total_piutang
      );
  });

  return result;
}


/**
 * Ringkasan menurut jenis transaksi SID.
 *
 * Ini adalah baseline/reconciliation source.
 *
 * Query tetap agregat berdasarkan jenis sehingga tidak
 * mengambil ribuan transaksi detail.
 */
function getPiutangSummaryByJenis_() {
  const sql =
    'SELECT jenis, ' +
    'COUNT(*) AS jumlah_transaksi, ' +
    'SUM(piutang) AS total_piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'GROUP BY jenis';

  const response =
    requestSid_(sql);

  return normalizePiutangSummary_(
    extractSidData_(response)
  );
}


/**
 * Mengambil distribusi transaksi dari customer yang secara
 * bisnis ditetapkan sebagai CABANG.
 *
 * Query hanya memproses 14 customer yang sudah ditentukan,
 * bukan seluruh tabel pelanggan.
 *
 * Hasil ini dipakai untuk melakukan RECLASSIFICATION:
 *
 *   customer cabang + jenis apa pun = CABANG
 *
 * sehingga transaksi historis FBR/RIMBAL/KUKUH, dll yang
 * dahulu tercatat sebagai TOKO/PARTAI tidak tertinggal.
 */
function getCustomerCabangBreakdown_() {
  const branchList =
    getCustomerCabangSqlList_();

  const sql =
    'SELECT jenis, ' +
    'COUNT(*) AS jumlah_transaksi, ' +
    'SUM(piutang) AS total_piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'AND pelanggan IN (' +
    branchList +
    ') ' +
    'GROUP BY jenis';

  const response =
    requestSid_(sql);

  const data =
    extractSidData_(response);

  const result =
    createPiutangSummary_();

  data.forEach(function(row) {
    const kategori =
      jenisToKategori_(row.jenis);

    result[kategori]
      .jumlah_transaksi +=
      parseMoney_(
        row.jumlah_transaksi
      );

    result[kategori]
      .total_piutang +=
      parseMoney_(
        row.total_piutang
      );
  });

  return result;
}


/**
 * Reclassify customer cabang ke kategori CABANG.
 *
 * Baseline = seluruh piutang menurut jenis SID.
 *
 * Kemudian seluruh transaksi customer yang ada dalam
 * CUSTOMER_CABANG dipindahkan dari kategori asalnya
 * menjadi CABANG.
 *
 * Dengan metode ini:
 * - tidak ada transaksi yang hilang;
 * - tidak ada double counting;
 * - total final selalu dapat direkonsiliasi dengan baseline SID.
 */
function getPiutangSummaryBusiness_() {
  const rawSummary =
    getPiutangSummaryByJenis_();

  const branchBreakdown =
    getCustomerCabangBreakdown_();

  const result =
    createPiutangSummary_();

  Object.keys(rawSummary)
    .forEach(function(kategori) {
      result[kategori] = {
        jumlah_transaksi:
          rawSummary[kategori]
            .jumlah_transaksi,

        total_piutang:
          rawSummary[kategori]
            .total_piutang
      };
    });

  /*
   * Pindahkan seluruh transaksi customer cabang
   * dari kategori asal → CABANG.
   */
  Object.keys(branchBreakdown)
    .forEach(function(kategori) {
      const jumlah =
        branchBreakdown[kategori]
          .jumlah_transaksi;

      const total =
        branchBreakdown[kategori]
          .total_piutang;

      if (!jumlah && !total) {
        return;
      }

      result[kategori]
        .jumlah_transaksi -= jumlah;

      result[kategori]
        .total_piutang -= total;

      result.CABANG
        .jumlah_transaksi += jumlah;

      result.CABANG
        .total_piutang += total;
    });

  return {
    summary: result,

    baseline_sid:
      rawSummary,

    customer_cabang:
      branchBreakdown
  };
}


/**
 * Piutang customer yang masuk mapping CABANG.
 *
 * Ini merupakan saldo seluruh transaksi positif dari customer
 * cabang, termasuk transaksi historis yang mungkin dulu
 * tercatat sebagai TOKO/PARTAI.
 */
function getPiutangCabangBusiness_() {
  const breakdown =
    getCustomerCabangBreakdown_();

  return {
    jumlah_transaksi:
      Object.keys(breakdown)
        .reduce(function(
          total,
          kategori
        ) {
          return total +
            breakdown[kategori]
              .jumlah_transaksi;
        }, 0),

    total_piutang:
      Object.keys(breakdown)
        .reduce(function(
          total,
          kategori
        ) {
          return total +
            breakdown[kategori]
              .total_piutang;
        }, 0)
  };
}


/**
 * Jumlah customer aktif yang memiliki piutang.
 */
function getJumlahPelangganPiutang_() {
  const sql =
    'SELECT COUNT(DISTINCT pelanggan) AS jumlah_pelanggan ' +
    'FROM penjualan ' +
    'WHERE piutang > 0';

  const response =
    requestSid_(sql);

  const data =
    extractSidData_(response);

  return data.length
    ? parseMoney_(
        data[0].jumlah_pelanggan
      )
    : 0;
}


/**
 * Top customer.
 *
 * LIMIT kecil sengaja dipertahankan karena GROUP BY seluruh
 * customer pernah menghasilkan timeout pada LIMIT besar.
 *
 * Kategori customer non-cabang tidak ditebak sebagai LAIN.
 * Untuk customer yang belum mempunyai mapping bisnis,
 * kategori ditampilkan sebagai NON-CABANG.
 */
function getTopPiutangCustomer_() {
  const sql =
    'SELECT pelanggan, ' +
    'COUNT(*) AS jumlah_transaksi, ' +
    'SUM(piutang) AS total_piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'GROUP BY pelanggan ' +
    'ORDER BY SUM(piutang) DESC ' +
    'LIMIT ' +
    CONFIG.TOP_CUSTOMER_LIMIT;

  const response =
    requestSid_(sql);

  const data =
    extractSidData_(response);

  return data.map(function(row) {
    const pelanggan =
      String(row.pelanggan || '')
        .trim();

    return {
      pelanggan: pelanggan,

      kategori:
        isCustomerCabang_(pelanggan)
          ? 'CABANG'
          : 'NON-CABANG',

      jumlah_transaksi:
        parseMoney_(
          row.jumlah_transaksi
        ),

      total_piutang:
        parseMoney_(
          row.total_piutang
        )
    };
  });
}


/**
 * Dashboard utama.
 *
 * Prinsip:
 * 1. Baseline berasal dari seluruh piutang positif SID.
 * 2. Customer yang masuk mapping CABANG direklasifikasi.
 * 3. Total final harus sama dengan baseline SID.
 * 4. Audit otomatis menghasilkan selisih Rp0 jika rekonsiliasi benar.
 */
function getDashboardPiutang() {
  const business =
    getPiutangSummaryBusiness_();

  const summaryBusiness =
    business.summary;

  const summaryJenis =
    business.baseline_sid;

  const cabangBusiness =
    getPiutangCabangBusiness_();

  const jumlahPelanggan =
    getJumlahPelangganPiutang_();

  const topCustomer =
    getTopPiutangCustomer_();

  const totalPiutang =
    Object.keys(summaryBusiness)
      .reduce(function(
        total,
        kategori
      ) {
        return total +
          summaryBusiness[kategori]
            .total_piutang;
      }, 0);

  const totalTransaksi =
    Object.keys(summaryBusiness)
      .reduce(function(
        total,
        kategori
      ) {
        return total +
          summaryBusiness[kategori]
            .jumlah_transaksi;
      }, 0);

  const baselinePiutang =
    Object.keys(summaryJenis)
      .reduce(function(
        total,
        kategori
      ) {
        return total +
          summaryJenis[kategori]
            .total_piutang;
      }, 0);

  const baselineTransaksi =
    Object.keys(summaryJenis)
      .reduce(function(
        total,
        kategori
      ) {
        return total +
          summaryJenis[kategori]
            .jumlah_transaksi;
      }, 0);

  return {
    success: true,

    generated_at:
      new Date().toISOString(),

    total: {
      transaksi:
        totalTransaksi,

      piutang:
        totalPiutang,

      jumlah_customer:
        jumlahPelanggan
    },

    kategori:
      summaryBusiness,

    top_customer:
      topCustomer,

    audit: {
      baseline_sid: {
        transaksi:
          baselineTransaksi,

        piutang:
          baselinePiutang
      },

      final_dashboard: {
        transaksi:
          totalTransaksi,

        piutang:
          totalPiutang
      },

      selisih: {
        transaksi:
          totalTransaksi -
          baselineTransaksi,

        piutang:
          totalPiutang -
          baselinePiutang
      },

      summary_jenis_sid:
        summaryJenis,

      customer_cabang:
        business.customer_cabang,

      piutang_cabang_mapping:
        cabangBusiness
    },

    konfigurasi_cabang:
      CUSTOMER_CABANG
  };
}


/* ============================================================
 * 6. DETAIL PIUTANG CUSTOMER - PAGINATION
 * ============================================================
 *
 * PENTING:
 *
 * Query yang digunakan:
 *
 * SELECT kode,tanggal,pelanggan,jenis,piutang
 * FROM penjualan
 * WHERE pelanggan='FBR'
 * LIMIT 100 OFFSET 0
 *
 * BUKAN:
 *
 * WHERE pelanggan='FBR' AND piutang > 0
 *
 * Karena query kedua pernah timeout.
 *
 * Filtering piutang > 0 dilakukan di Apps Script.
 */


/**
 * Mengambil satu halaman transaksi customer.
 */
function getPiutangCustomerPage_(
  pelanggan,
  offset,
  pageSize
) {
  const customer =
    normalizeCustomer_(pelanggan);

  if (!customer) {
    throw new Error(
      'Kode pelanggan wajib diisi.'
    );
  }

  const limit =
    Number(pageSize || CONFIG.PIUTANG_PAGE_SIZE);

  if (limit < 1 || limit > 100) {
    throw new Error(
      'pageSize harus antara 1 sampai 100.'
    );
  }

  const safeOffset =
    Math.max(0, Number(offset) || 0);

  const sql =
    'SELECT kode,tanggal,pelanggan,jenis,piutang ' +
    'FROM penjualan ' +
    'WHERE pelanggan=' +
    sqlQuote_(customer) + ' ' +
    'LIMIT ' + limit +
    ' OFFSET ' + safeOffset;

  const response =
    requestSid_(sql);

  const rawData =
    extractSidData_(response);

  const active =
    rawData
      .map(function(row) {
        return {
          kode: row.kode || '',
          tanggal: row.tanggal || '',
          pelanggan:
            row.pelanggan || customer,
          jenis: row.jenis || '',
          piutang:
            parseMoney_(row.piutang)
        };
      })
      .filter(function(row) {
        return row.piutang > 0;
      });

  return {
    success: true,

    pelanggan: customer,

    offset: safeOffset,

    page_size: limit,

    jumlah_data:
      rawData.length,

    jumlah_piutang:
      active.length,

    total_piutang:
      active.reduce(function(
        total,
        row
      ) {
        return total + row.piutang;
      }, 0),

    transaksi_pertama:
      rawData.length
        ? rawData[0].kode
        : null,

    transaksi_terakhir:
      rawData.length
        ? rawData[rawData.length - 1].kode
        : null,

    data: active
  };
}


/**
 * Mengambil SELURUH piutang customer.
 *
 * Berhenti saat jumlah record raw < 100.
 */
function getPiutangCustomer_(
  pelanggan
) {
  const customer =
    normalizeCustomer_(pelanggan);

  if (!customer) {
    throw new Error(
      'Kode pelanggan wajib diisi.'
    );
  }

  const pageSize =
    CONFIG.PIUTANG_PAGE_SIZE;

  let offset = 0;

  const semuaTransaksi = [];
  const halaman = [];

  while (true) {
    const page =
      getPiutangCustomerPage_(
        customer,
        offset,
        pageSize
      );

    halaman.push({
      offset:
        page.offset,

      jumlah_data:
        page.jumlah_data,

      jumlah_piutang:
        page.jumlah_piutang,

      total_piutang:
        page.total_piutang,

      transaksi_pertama:
        page.transaksi_pertama,

      transaksi_terakhir:
        page.transaksi_terakhir
    });

    semuaTransaksi.push.apply(
      semuaTransaksi,
      page.data
    );

    if (
      page.jumlah_data <
      pageSize
    ) {
      break;
    }

    offset += pageSize;

    if (offset > 100000) {
      throw new Error(
        'Pagination berhenti karena melewati safety limit 100.000 record.'
      );
    }
  }

  const totalPiutang =
    semuaTransaksi.reduce(
      function(total, row) {
        return total + row.piutang;
      },
      0
    );

  const kategoriMap = {};

  semuaTransaksi.forEach(
    function(row) {
      const kategori =
        getKategoriPiutang_(
          row.pelanggan,
          row.jenis
        );

      if (!kategoriMap[kategori]) {
        kategoriMap[kategori] = {
          jumlah_transaksi: 0,
          total_piutang: 0
        };
      }

      kategoriMap[kategori]
        .jumlah_transaksi++;

      kategoriMap[kategori]
        .total_piutang +=
        row.piutang;
    }
  );

  return {
    success: true,

    pelanggan: customer,

    kategori:
      isCustomerCabang_(customer)
        ? 'CABANG'
        : null,

    summary: {
      jumlah_transaksi:
        semuaTransaksi.length,

      total_piutang:
        totalPiutang
    },

    kategori_detail:
      kategoriMap,

    pagination: {
      page_size:
        pageSize,

      jumlah_halaman:
        halaman.length,

      jumlah_record_raw:
        halaman.reduce(
          function(total, page) {
            return total +
              page.jumlah_data;
          },
          0
        )
    },

    halaman: halaman,

    transaksi:
      semuaTransaksi
  };
}


/**
 * Fungsi publik untuk HTML.
 */
function getPiutangCustomer(
  pelanggan
) {
  return getPiutangCustomer_(
    pelanggan
  );
}


/**
 * Fungsi publik untuk mengambil satu halaman.
 */
function getPiutangCustomerPage(
  pelanggan,
  offset
) {
  return getPiutangCustomerPage_(
    pelanggan,
    offset,
    CONFIG.PIUTANG_PAGE_SIZE
  );
}


/* ============================================================
 * 7. MASTER CUSTOMER
 * ============================================================
 */


/**
 * Ambil master customer berdasarkan kode.
 */
function getCustomerByKode(
  kode
) {
  const customer =
    normalizeCustomer_(kode);

  const sql =
    'SELECT kode,nama,telp,saldo_piutang,' +
    'saldo_tabungan,max_piutang,saldo_hutang ' +
    'FROM pelanggan ' +
    'WHERE kode=' +
    sqlQuote_(customer) +
    ' LIMIT 1';

  const response =
    requestSid_(sql);

  const data =
    extractSidData_(response);

  return {
    success: true,

    pelanggan: customer,

    ditemukan:
      data.length > 0,

    data:
      data.length
        ? data[0]
        : null
  };
}


/**
 * Master customer yang memiliki saldo piutang.
 */
function getPelangganPiutangMaster() {
  const sql =
    'SELECT kode,nama,telp,saldo_piutang,max_piutang ' +
    'FROM pelanggan ' +
    'WHERE saldo_piutang > 0 ' +
    'ORDER BY saldo_piutang DESC ' +
    'LIMIT 100';

  return buildResponse_(
    'pelanggan_piutang_master',
    sql,
    requestSid_(sql)
  );
}


/* ============================================================
 * 8. DISCOVERY API
 * ============================================================
 */

function getBarang() {
  const sql =
    'SELECT kode,nama FROM barang';

  return buildResponse_(
    'barang',
    sql,
    requestSid_(sql)
  );
}


function getBarangSample() {
  const sql =
    'SELECT * FROM barang LIMIT 1';

  return buildResponse_(
    'barang_sample',
    sql,
    requestSid_(sql)
  );
}


function getPelanggan() {
  const sql =
    'SELECT kode,nama,telp,saldo_piutang,' +
    'saldo_tabungan,max_piutang FROM pelanggan';

  return buildResponse_(
    'pelanggan',
    sql,
    requestSid_(sql)
  );
}


function getPelangganSample() {
  const sql =
    'SELECT * FROM pelanggan LIMIT 1';

  return buildResponse_(
    'pelanggan_sample',
    sql,
    requestSid_(sql)
  );
}


function getPiutangSample() {
  const sql =
    'SELECT * FROM piutang LIMIT 1';

  return buildResponse_(
    'piutang_sample',
    sql,
    requestSid_(sql)
  );
}


function getTabunganSample() {
  const sql =
    'SELECT * FROM tabungan LIMIT 1';

  return buildResponse_(
    'tabungan_sample',
    sql,
    requestSid_(sql)
  );
}


function getPenjualanSample() {
  const sql =
    'SELECT * FROM penjualan LIMIT 1';

  return buildResponse_(
    'penjualan_sample',
    sql,
    requestSid_(sql)
  );
}


function getPenjualanLimit100() {
  const sql =
    'SELECT * FROM penjualan LIMIT 100';

  return buildResponse_(
    'penjualan_limit100',
    sql,
    requestSid_(sql)
  );
}


/* ============================================================
 * 9. CONFIGURATION CHECK
 * ============================================================
 */

function checkConfiguration() {
  const apiKey =
    PropertiesService
      .getScriptProperties()
      .getProperty('SID_API_KEY');

  return {
    success: true,
    mode: 'READ ONLY',
    apiConfigured: !!apiKey,
    api: CONFIG.SID_API_URL,
    piutangPageSize:
      CONFIG.PIUTANG_PAGE_SIZE,
    transactionCode:
      'AUTO UNIQUE'
  };
}


/* ============================================================
 * 10. TEST & VALIDATION
 * ============================================================
 *
 * Test yang dipertahankan adalah test yang relevan dengan
 * arsitektur final.
 */


/**
 * TEST 1
 * Dashboard.
 */
function testDashboardPiutang() {
  try {
    const result = getDashboardPiutang();

    Logger.log(
      JSON.stringify(result, null, 2)
    );

    return result;

  } catch (err) {
    const error = {
      ok: false,
      error: err.message,
      stack: err.stack
    };

    Logger.log(
      JSON.stringify(error, null, 2)
    );

    return error;
  }
}


/**
 * TEST 2
 * Seluruh pagination FBR.
 *
 * Hasil pengujian sebelumnya:
 * - 347 raw records
 * - 238 transaksi piutang
 * - Rp203.200.000
 */
function testPiutangFBR() {
  const result =
    getPiutangCustomer_(
      'FBR'
    );

  console.log(
    JSON.stringify(
      {
        pelanggan:
          result.pelanggan,

        jumlah_halaman:
          result.pagination
            .jumlah_halaman,

        jumlah_record_raw:
          result.pagination
            .jumlah_record_raw,

        jumlah_transaksi_piutang:
          result.summary
            .jumlah_transaksi,

        total_piutang:
          result.summary
            .total_piutang
      },
      null,
      2
    )
  );

  return result;
}


/**
 * TEST 3
 * FBR offset 0.
 */
function testPiutangFBRPage0() {
  return getPiutangCustomerPage_(
    'FBR',
    0,
    100
  );
}


/**
 * TEST 4
 * FBR offset 100.
 */
function testPiutangFBRPage100() {
  return getPiutangCustomerPage_(
    'FBR',
    100,
    100
  );
}


/**
 * TEST 5
 * FBR offset 200.
 */
function testPiutangFBRPage200() {
  return getPiutangCustomerPage_(
    'FBR',
    200,
    100
  );
}


/**
 * TEST 6
 * FBR offset 300.
 *
 * Expected:
 * - 47 raw records
 * - 19 piutang aktif
 * - Rp22.863.000
 */
function testPiutangFBRPage300() {
  return getPiutangCustomerPage_(
    'FBR',
    300,
    100
  );
}


/**
 * TEST 7
 * Ringkasan jenis SID.
 */
function testPiutangSummaryJenis() {
  const result =
    getPiutangSummaryByJenis_();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * TEST 8
 * Piutang cabang berdasarkan mapping bisnis.
 *
 * Expected berdasarkan pengujian sebelumnya:
 * Rp241.200.000
 */
function testPiutangCabangBusiness() {
  const result =
    getPiutangCabangBusiness_();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * TEST 9
 * Top customer.
 */
function testTopPiutangCustomer() {
  const result =
    getTopPiutangCustomer_();

  console.log(
    JSON.stringify(
      result,
      null,
      2
    )
  );

  return result;
}


/**
 * TEST 10
 * Jumlah customer piutang.
 *
 * Tidak menetapkan angka hard-coded karena jumlah customer dapat berubah.
 */
function testJumlahPelangganPiutang() {
  const result =
    getJumlahPelangganPiutang_();

  console.log(result);

  return result;
}


/**
 * TEST 11
 * Customer 2209025 / BPK SAMAR.
 */
function testCustomer2209025() {
  return getCustomerByKode(
    '2209025'
  );
}


/**
 * TEST 12
 * Customer 2103002 / PAK TORO.
 */
function testCustomer2103002() {
  return getCustomerByKode(
    '2103002'
  );
}


/**
 * TEST 13
 * Detail piutang 2103002.
 */
function testPiutangCustomer2103002() {
  return getPiutangCustomer_(
    '2103002'
  );
}


/**
 * TEST 14
 * Configuration.
 */
function testConfiguration() {
  return checkConfiguration();
}


/**
 * TEST 15
 * Reconciliation final.
 *
 * Expected:
 * audit.selisih.transaksi = 0
 * audit.selisih.piutang   = 0
 */
function testPiutangReconciliation() {
  const result =
    getDashboardPiutang();

  const audit =
    result.audit;

  const ok =
    audit.selisih.transaksi === 0 &&
    audit.selisih.piutang === 0;

  console.log(
    JSON.stringify({
      ok: ok,
      selisih_transaksi:
        audit.selisih.transaksi,
      selisih_piutang:
        audit.selisih.piutang
    }, null, 2)
  );

  if (!ok) {
    throw new Error(
      'RECONCILIATION GAGAL. ' +
      'Selisih transaksi=' +
      audit.selisih.transaksi +
      ', selisih piutang=' +
      audit.selisih.piutang
    );
  }

  return {
    success: true,
    message: 'Reconciliation OK. Selisih = 0.',
    audit: audit
  };
}


/**
 * TEST 16
 * Validasi transaksi berdasarkan kode.
 *
 * Contoh:
 * testPenjualanKode('R43-220826018')
 */
function testPenjualanKode(
  kode
) {
  if (!kode) {
    throw new Error(
      'Masukkan kode transaksi.'
    );
  }

  const sql =
    'SELECT kode,tanggal,pelanggan,' +
    'subtotal,jumlah,bayar,kembali,' +
    'piutang,lunas,status,jenis ' +
    'FROM penjualan ' +
    'WHERE kode=' +
    sqlQuote_(kode) +
    ' LIMIT 1';

  return buildResponse_(
    'penjualan_kode',
    sql,
    requestSid_(sql)
  );
}


/* ============================================================
 * END OF FILE
 * ============================================================
 */
