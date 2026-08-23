/**
 * TNMD v1.4.0 - Customer Web API
 *
 * HTTP read-only adapter for Customer API v1.4.0.
 *
 * Contract:
 *   ?action=summary
 *   ?action=customers
 *   ?action=customer&kode=FBR
 *   ?action=ranking&limit=10
 *   ?action=branch&kategori=CABANG
 *
 * This layer MUST NOT query SID Retail or modify Customer Index V2.
 */

const TNMD140WEBAPI = {
  API_VERSION: '1.4.0',
  LAYER: 'web-api',
  READ_ONLY: true
};

function tnmd140webapi_json_(payload) {
  return ContentService
    .createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function tnmd140webapi_success_(action, data, meta) {
  return {
    success: true,
    api_version: TNMD140WEBAPI.API_VERSION,
    layer: TNMD140WEBAPI.LAYER,
    read_only: true,
    action: action,
    data: data,
    meta: meta || {}
  };
}

function tnmd140webapi_error_(action, code, message, details) {
  return {
    success: false,
    api_version: TNMD140WEBAPI.API_VERSION,
    layer: TNMD140WEBAPI.LAYER,
    read_only: true,
    action: action || null,
    error: {
      code: code,
      message: message,
      details: details || null
    },
    meta: {}
  };
}

function tnmd140webapi_route_(params) {
  const action = String((params && params.action) || 'summary').trim().toLowerCase();

  switch (action) {
    case 'summary':
      return tnmd140webapi_success_('summary', tnmd140api_getCustomerSummary(), {
        generated_at: new Date().toISOString()
      });

    case 'customers':
    case 'customer-list':
      return tnmd140webapi_success_('customers', tnmd140api_getCustomerList(), {
        count: tnmd140api_getCustomerList().length,
        generated_at: new Date().toISOString()
      });

    case 'customer': {
      const kode = String((params && (params.kode || params.pelanggan)) || '').trim();
      if (!kode) return tnmd140webapi_error_('customer', 'MISSING_CUSTOMER', 'Parameter kode atau pelanggan wajib diisi.');
      return tnmd140webapi_success_('customer', tnmd140api_getCustomerDetail(kode), {
        generated_at: new Date().toISOString()
      });
    }

    case 'ranking': {
      const rawLimit = Number((params && params.limit) || 10);
      const limit = isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 10;
      return tnmd140webapi_success_('ranking', tnmd140api_getCustomerRanking(limit), {
        limit: limit,
        generated_at: new Date().toISOString()
      });
    }

    case 'branch': {
      const kategori = String((params && params.kategori) || 'CABANG').trim();
      return tnmd140webapi_success_('branch', tnmd140api_getBranchSummary(kategori), {
        kategori: kategori.toUpperCase(),
        generated_at: new Date().toISOString()
      });
    }

    default:
      return tnmd140webapi_error_('unknown', 'UNKNOWN_ACTION', 'Action tidak dikenal.', {
        action: action,
        allowed_actions: ['summary', 'customers', 'customer', 'ranking', 'branch']
      });
  }
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    const response = tnmd140webapi_route_(params);
    return tnmd140webapi_json_(response);
  } catch (err) {
    return tnmd140webapi_json_(tnmd140webapi_error_(
      (e && e.parameter && e.parameter.action) || null,
      'INTERNAL_ERROR',
      err && err.message ? err.message : String(err)
    ));
  }
}

function tnmd140webapi_testRoute_(params, expectedAction) {
  const started = new Date().getTime();
  try {
    const response = tnmd140webapi_route_(params || {});
    const pass = response && response.success === true && response.action === expectedAction;
    return {
      success: pass,
      test: 'tnmd140webapi_testRoute_' + expectedAction,
      duration_ms: new Date().getTime() - started,
      response: response,
      status: pass ? 'PASS' : 'FAIL'
    };
  } catch (err) {
    return {
      success: false,
      test: 'tnmd140webapi_testRoute_' + expectedAction,
      duration_ms: new Date().getTime() - started,
      error: err && err.message ? err.message : String(err),
      status: 'FAIL'
    };
  }
}

function tnmd140webapi_testSummary() { return tnmd140webapi_testRoute_({action:'summary'}, 'summary'); }
function tnmd140webapi_testCustomers() { return tnmd140webapi_testRoute_({action:'customers'}, 'customers'); }
function tnmd140webapi_testCustomer() { return tnmd140webapi_testRoute_({action:'customer', kode:'FBR'}, 'customer'); }
function tnmd140webapi_testRanking() { return tnmd140webapi_testRoute_({action:'ranking', limit:'10'}, 'ranking'); }
function tnmd140webapi_testBranch() { return tnmd140webapi_testRoute_({action:'branch', kategori:'CABANG'}, 'branch'); }

function tnmd140webapi_testMissingCustomer() {
  const response = tnmd140webapi_route_({action:'customer'});
  const pass = response.success === false && response.error && response.error.code === 'MISSING_CUSTOMER';
  return {success:pass,test:'tnmd140webapi_testMissingCustomer',response:response,status:pass?'PASS':'FAIL'};
}

function tnmd140webapi_testUnknownAction() {
  const response = tnmd140webapi_route_({action:'__invalid__'});
  const pass = response.success === false && response.error && response.error.code === 'UNKNOWN_ACTION';
  return {success:pass,test:'tnmd140webapi_testUnknownAction',response:response,status:pass?'PASS':'FAIL'};
}

function tnmd140webapi_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd140webapi_testSummary(),
    tnmd140webapi_testCustomers(),
    tnmd140webapi_testCustomer(),
    tnmd140webapi_testRanking(),
    tnmd140webapi_testBranch(),
    tnmd140webapi_testMissingCustomer(),
    tnmd140webapi_testUnknownAction()
  ];
  const pass = tests.every(function(t){ return t.success === true && t.status === 'PASS'; });
  return {
    success: pass,
    api_version: TNMD140WEBAPI.API_VERSION,
    layer: TNMD140WEBAPI.LAYER,
    read_only: true,
    test: 'tnmd140webapi_runAllTests',
    generated_at: new Date().toISOString(),
    duration_ms: new Date().getTime() - started,
    status: pass ? 'PASS' : 'FAIL',
    tests: tests.map(function(t){
      return {test:t.test, success:t.success, status:t.status, error:t.error || null};
    })
  };
}

function tnmd140webapi_runAllTests_JSON() {
  const result = tnmd140webapi_runAllTests();
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
