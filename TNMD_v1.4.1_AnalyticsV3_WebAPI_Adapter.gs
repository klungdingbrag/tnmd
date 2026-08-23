/**
 * TNMD v1.4.1 - Customer Analytics V3 Web API Adapter
 *
 * Purpose:
 * Bridge the already validated Customer Analytics V3 engine to the
 * existing read-only Web API without replacing the stable actions:
 *   summary, customers, customer, ranking, branch
 *
 * DEPENDENCY:
 *   - getCustomerAnalyticsV3()
 *
 * IMPORTANT:
 *   This file does not replace the existing doGet()/Web API router.
 *   Add the single dispatch block described at the bottom of this file
 *   to the active v1.4.1 Web API router.
 */

var TNMD141_ANALYTICS_V3_API = {
  VERSION: '1.4.1',
  ACTION: 'analytics',
  INDEX_VERSION: 'customer-analytics-v3'
};

function tnmd141webapi_getAnalyticsV3_() {
  if (typeof getCustomerAnalyticsV3 !== 'function') {
    throw new Error(
      'getCustomerAnalyticsV3 tidak ditemukan. Pastikan Customer Analytics V3 sudah dipasang.'
    );
  }

  var raw = getCustomerAnalyticsV3();

  // Keep the adapter tolerant of either of the two common engine shapes:
  //   { analytics: {...} }
  // or
  //   { ...analytics fields... }
  var analytics = raw && raw.analytics ? raw.analytics : raw;

  if (!analytics || typeof analytics !== 'object') {
    throw new Error('Customer Analytics V3 mengembalikan data yang tidak valid.');
  }

  return {
    success: true,
    api_version: TNMD141_ANALYTICS_V3_API.VERSION,
    index_version: TNMD141_ANALYTICS_V3_API.INDEX_VERSION,
    layer: 'web-api',
    read_only: true,
    action: TNMD141_ANALYTICS_V3_API.ACTION,
    analytics: analytics,
    meta: {
      generated_at: new Date().toISOString()
    }
  };
}

function tnmd141webapi_testAnalyticsV3_() {
  var started = new Date().getTime();

  try {
    var result = tnmd141webapi_getAnalyticsV3_();
    var a = result.analytics || {};

    var valid =
      result.success === true &&
      result.action === 'analytics' &&
      a &&
      typeof a === 'object';

    return {
      success: valid,
      test: 'tnmd141webapi_testAnalyticsV3',
      status: valid ? 'PASS' : 'FAIL',
      duration_ms: new Date().getTime() - started,
      checks: {
        success: result.success === true,
        action: result.action === 'analytics',
        analytics_object: a && typeof a === 'object'
      },
      summary: {
        jumlah_customer: Number(a.jumlah_customer || 0),
        jumlah_transaksi: Number(a.jumlah_transaksi || 0),
        total_piutang: Number(a.total_piutang || 0)
      }
    };
  } catch (err) {
    return {
      success: false,
      test: 'tnmd141webapi_testAnalyticsV3',
      status: 'FAIL',
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err)
    };
  }
}

/*
 * ============================================================
 * WEB API ROUTER INTEGRATION
 * ============================================================
 *
 * In the ACTIVE v1.4.1 Web API router, add this branch alongside
 * the existing summary/customers/customer/ranking/branch actions:
 *
 *   if (action === 'analytics') {
 *     return tnmd141webapi_getAnalyticsV3_();
 *   }
 *
 * Do NOT remove or modify the existing actions.
 *
 * Expected browser request:
 *   ?action=analytics
 *
 * Expected top-level response:
 *   success: true
 *   api_version: '1.4.1'
 *   action: 'analytics'
 *   read_only: true
 *   analytics: { ...Customer Analytics V3... }
 */
