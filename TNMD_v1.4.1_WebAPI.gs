/**
 * TNMD v1.4.1 - Customer Web API
 *
 * UI-ready HTTP read-only adapter over Customer Index V2.
 * Adds customer list search/filter/sort/pagination without touching SID.
 *
 * Contract:
 *   ?action=summary
 *   ?action=customers&page=1&page_size=20
 *   ?action=customers&search=FBR
 *   ?action=customers&kategori=CABANG
 *   ?action=customers&sort=piutang_desc
 *   ?action=customer&kode=FBR
 *   ?action=ranking&limit=10
 *   ?action=branch&kategori=CABANG
 */

const TNMD141WEBAPI = {
  API_VERSION: '1.4.1',
  LAYER: 'web-api',
  READ_ONLY: true
};

function tnmd141webapi_json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload, null, 2))
    .setMimeType(ContentService.MimeType.JSON);
}

function tnmd141webapi_success_(action, data, meta) {
  return {
    success: true,
    api_version: TNMD141WEBAPI.API_VERSION,
    layer: TNMD141WEBAPI.LAYER,
    read_only: true,
    action: action,
    data: data,
    meta: meta || {}
  };
}

function tnmd141webapi_error_(action, code, message, details) {
  return {
    success: false,
    api_version: TNMD141WEBAPI.API_VERSION,
    layer: TNMD141WEBAPI.LAYER,
    read_only: true,
    action: action || null,
    error: { code: code, message: message, details: details || null },
    meta: {}
  };
}

function tnmd141webapi_route_(params) {
  const action = String((params && params.action) || 'summary').trim().toLowerCase();

  switch (action) {
    case 'summary':
      return tnmd141webapi_success_('summary', tnmd140api_getCustomerSummary(), {
        generated_at: new Date().toISOString()
      });

    case 'customers':
    case 'customer-list': {
      if (typeof tnmd141q_getCustomers !== 'function') {
        return tnmd141webapi_error_('customers', 'QUERY_LAYER_UNAVAILABLE', 'TNMD v1.4.1 Customer Query Layer tidak ditemukan.');
      }
      const data = tnmd141q_getCustomers(params || {});
      return tnmd141webapi_success_('customers', data, {
        generated_at: new Date().toISOString()
      });
    }

    case 'customer': {
      const kode = String((params && (params.kode || params.pelanggan)) || '').trim();
      if (!kode) return tnmd141webapi_error_('customer', 'MISSING_CUSTOMER', 'Parameter kode atau pelanggan wajib diisi.');
      try {
        return tnmd141webapi_success_('customer', tnmd140api_getCustomerDetail(kode), {
          generated_at: new Date().toISOString()
        });
      } catch (err) {
        return tnmd141webapi_error_('customer', 'CUSTOMER_NOT_FOUND', err.message || String(err));
      }
    }

    case 'ranking': {
      const rawLimit = Number((params && params.limit) || 10);
      const limit = isFinite(rawLimit) ? Math.max(1, Math.min(100, Math.floor(rawLimit))) : 10;
      return tnmd141webapi_success_('ranking', tnmd140api_getCustomerRanking(limit), {
        limit: limit,
        generated_at: new Date().toISOString()
      });
    }

    case 'branch': {
      const kategori = String((params && params.kategori) || 'CABANG').trim();
      return tnmd141webapi_success_('branch', tnmd140api_getBranchSummary(kategori), {
        kategori: kategori.toUpperCase(),
        generated_at: new Date().toISOString()
      });
    }

    default:
      return tnmd141webapi_error_('unknown', 'UNKNOWN_ACTION', 'Action tidak dikenal.', {
        action: action,
        allowed_actions: ['summary', 'customers', 'customer', 'ranking', 'branch']
      });
  }
}

function doGet(e) {
  try {
    const params = (e && e.parameter) ? e.parameter : {};
    return tnmd141webapi_json_(tnmd141webapi_route_(params));
  } catch (err) {
    return tnmd141webapi_json_(tnmd141webapi_error_(
      (e && e.parameter && e.parameter.action) || null,
      'INTERNAL_ERROR',
      err && err.message ? err.message : String(err)
    ));
  }
}

function tnmd141webapi_test_(params, expectedAction) {
  const started = new Date().getTime();
  try {
    const response = tnmd141webapi_route_(params || {});
    const pass = response && response.success === true && response.action === expectedAction;
    return { success: pass, test: 'tnmd141webapi_test_' + expectedAction, duration_ms: new Date().getTime() - started, response: response, status: pass ? 'PASS' : 'FAIL' };
  } catch (err) {
    return { success: false, test: 'tnmd141webapi_test_' + expectedAction, duration_ms: new Date().getTime() - started, error: err.message || String(err), status: 'FAIL' };
  }
}

function tnmd141webapi_testSummary() { return tnmd141webapi_test_({action:'summary'}, 'summary'); }
function tnmd141webapi_testCustomers() { return tnmd141webapi_test_({action:'customers', page:'1', page_size:'20'}, 'customers'); }
function tnmd141webapi_testCustomer() { return tnmd141webapi_test_({action:'customer', kode:'FBR'}, 'customer'); }
function tnmd141webapi_testRanking() { return tnmd141webapi_test_({action:'ranking', limit:'10'}, 'ranking'); }
function tnmd141webapi_testBranch() { return tnmd141webapi_test_({action:'branch', kategori:'CABANG'}, 'branch'); }
function tnmd141webapi_testSearch() { return tnmd141webapi_test_({action:'customers', search:'FBR'}, 'customers'); }
function tnmd141webapi_testPagination() { return tnmd141webapi_test_({action:'customers', page:'2', page_size:'5'}, 'customers'); }

function tnmd141webapi_testMissingCustomer() {
  const response = tnmd141webapi_route_({action:'customer'});
  const pass = response.success === false && response.error && response.error.code === 'MISSING_CUSTOMER';
  return {success:pass, test:'tnmd141webapi_testMissingCustomer', response:response, status:pass?'PASS':'FAIL'};
}

function tnmd141webapi_testUnknownAction() {
  const response = tnmd141webapi_route_({action:'xyz'});
  const pass = response.success === false && response.error && response.error.code === 'UNKNOWN_ACTION';
  return {success:pass, test:'tnmd141webapi_testUnknownAction', response:response, status:pass?'PASS':'FAIL'};
}

function tnmd141webapi_runAllTests() {
  const started = new Date().getTime();
  const tests = [
    tnmd141webapi_testSummary(),
    tnmd141webapi_testCustomers(),
    tnmd141webapi_testCustomer(),
    tnmd141webapi_testRanking(),
    tnmd141webapi_testBranch(),
    tnmd141webapi_testSearch(),
    tnmd141webapi_testPagination(),
    tnmd141webapi_testMissingCustomer(),
    tnmd141webapi_testUnknownAction()
  ];
  const pass = tests.every(function(t){ return t.success === true && t.status === 'PASS'; });
  return {
    success: pass,
    api_version: TNMD141WEBAPI.API_VERSION,
    layer: TNMD141WEBAPI.LAYER,
    read_only: true,
    test: 'tnmd141webapi_runAllTests',
    generated_at: new Date().toISOString(),
    duration_ms: new Date().getTime() - started,
    status: pass ? 'PASS' : 'FAIL',
    tests: tests.map(function(t){ return {test:t.test, success:t.success, status:t.status, error:t.error || null}; })
  };
}

function tnmd141webapi_runAllTests_JSON() {
  const result = tnmd141webapi_runAllTests();
  Logger.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return result;
}
