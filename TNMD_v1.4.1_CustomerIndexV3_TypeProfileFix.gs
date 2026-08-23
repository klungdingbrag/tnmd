/*
 * TNMD v1.4.1 - Customer Index V3 Type Profile Fix
 *
 * Replace the existing tnmd141v3_getCustomerTypeProfile_() function
 * in TNMD_v1.4.1_CustomerIndexV3.gs with the implementation below.
 *
 * Reason:
 * The previous implementation used a large SID GROUP BY query:
 *   SELECT pelanggan, jenis, COUNT(*), SUM(piutang)
 *   FROM penjualan ... GROUP BY pelanggan, jenis
 *
 * That query can fail at the SID endpoint with "Address unavailable".
 * The fix fetches the relevant transaction rows and aggregates locally.
 */

function tnmd141v3_getCustomerTypeProfile_() {

  var sql =
    'SELECT pelanggan, jenis, piutang ' +
    'FROM penjualan ' +
    'WHERE piutang > 0 ' +
    'LIMIT ' +
    TNMD141V3_CONFIG.DETAIL_LIMIT;

  var response = requestSid_(sql);
  var rows = extractSidData_(response);
  var grouped = {};

  rows.forEach(function(row) {

    var pelanggan = tnmd141v3_normalize_(row.pelanggan);
    var jenis = tnmd141v3_normalize_(row.jenis);
    var piutang = tnmd141v3_money_(row.piutang);

    if (!pelanggan) return;

    if (!jenis) {
      jenis = TNMD141V3_CONFIG.TYPE_LAIN;
    }

    var key = pelanggan + '||' + jenis;

    if (!grouped[key]) {
      grouped[key] = {
        pelanggan: pelanggan,
        jenis: jenis,
        jumlah_transaksi: 0,
        total_piutang: 0
      };
    }

    grouped[key].jumlah_transaksi += 1;
    grouped[key].total_piutang += piutang;
  });

  return Object.keys(grouped)
    .map(function(key) {
      return grouped[key];
    })
    .sort(function(a, b) {
      if (a.pelanggan < b.pelanggan) return -1;
      if (a.pelanggan > b.pelanggan) return 1;
      return b.total_piutang - a.total_piutang;
    });
}

/*
 * After replacing the function, run in this order:
 *
 * 1. buildCustomerIndexV3
 * 2. auditCustomerIndexV3
 * 3. testCustomerIndexV3Profile
 * 4. testCustomerAnalyticsV3
 * 5. testCustomerAnalyticsV3Reconciliation
 */
