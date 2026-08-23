/**
 * TNMD v1.4.1 - Customer Query Layer
 *
 * Read-only query/presentation layer over the frozen Customer Index V2.
 * Does not query SID Retail and does not mutate the index.
 *
 * Supported customer-list parameters:
 *   search       partial case-insensitive customer-name search
 *   kategori     exact category filter
 *   sort         piutang_desc | piutang_asc | transaksi_desc | nama_asc
 *   page         1-based page number
 *   page_size    1..100 (default 20)
 */

const TNMD141QUERY = {
  API_VERSION: '1.4.1',
  LAYER: 'customer-query',
  READ_ONLY: true,
  DEFAULT_PAGE_SIZE: 20,
  MAX_PAGE_SIZE: 100
};

function tnmd141q_num_(value, fallback) {
  const n = Number(value);
  return isFinite(n) ? n : fallback;
}

function tnmd141q_normalize_(params) {
  params = params || {};
  const search = String(params.search || '').trim();
  const kategori = String(params.kategori || '').trim();
  const sortRaw = String(params.sort || 'piutang_desc').trim().toLowerCase();
  const allowedSorts = ['piutang_desc', 'piutang_asc', 'transaksi_desc', 'nama_asc'];
  const sort = allowedSorts.indexOf(sortRaw) >= 0 ? sortRaw : 'piutang_desc';
  const rawPageSize = Math.floor(tnmd141q_num_(params.page_size, TNMD141QUERY.DEFAULT_PAGE_SIZE));
  const pageSize = Math.max(1, Math.min(TNMD141QUERY.MAX_PAGE_SIZE, rawPageSize));
  const rawPage = Math.floor(tnmd141q_num_(params.page, 1));
  const page = Math.max(1, rawPage);
  return { search, kategori, sort, page, page_size: pageSize };
}

function tnmd141q_filterSort_(params) {
  const p = tnmd141q_normalize_(params);
  let items = tnmd140api_getCustomerList();

  if (p.search) {
    const needle = p.search.toUpperCase();
    items = items.filter(function(item) {
      return String(item.pelanggan || '').toUpperCase().indexOf(needle) >= 0;
    });
  }

  if (p.kategori) {
    const wanted = p.kategori.toUpperCase();
    items = items.filter(function(item) {
      return String(item.kategori || '').toUpperCase() === wanted;
    });
  }

  items.sort(function(a, b) {
    switch (p.sort) {
      case 'piutang_asc':
        return a.total_piutang - b.total_piutang || a.pelanggan.localeCompare(b.pelanggan);
      case 'transaksi_desc':
        return b.jumlah_transaksi_aktif - a.jumlah_transaksi_aktif || b.total_piutang - a.total_piutang || a.pelanggan.localeCompare(b.pelanggan);
      case 'nama_asc':
        return a.pelanggan.localeCompare(b.pelanggan);
      case 'piutang_desc':
      default:
        return b.total_piutang - a.total_piutang || a.pelanggan.localeCompare(b.pelanggan);
    }
  });

  return { params: p, items: items };
}

function tnmd141q_getCustomers(params) {
  const result = tnmd141q_filterSort_(params);
  const p = result.params;
  const items = result.items;
  const total = items.length;
  const totalPage = Math.max(1, Math.ceil(total / p.page_size));
  const page = Math.min(p.page, totalPage);
  const start = (page - 1) * p.page_size;
  const data = items.slice(start, start + p.page_size);

  return {
    items: data,
    pagination: {
      page: page,
      page_size: p.page_size,
      total: total,
      total_page: totalPage,
      has_previous: page > 1,
      has_next: page < totalPage
    },
    filters: {
      search: p.search,
      kategori: p.kategori,
      sort: p.sort
    }
  };
}

function tnmd141q_testDefault() {
  const result = tnmd141q_getCustomers({});
  const pass = result.items.length <= 20 && result.pagination.page === 1 && result.pagination.page_size === 20 && result.pagination.total === 14 && result.pagination.total_page === 1;
  return { success: pass, test: 'tnmd141q_testDefault', result: result, status: pass ? 'PASS' : 'FAIL' };
}

function tnmd141q_testSearchFBR() {
  const result = tnmd141q_getCustomers({search:'FBR'});
  const pass = result.pagination.total === 1 && result.items.length === 1 && result.items[0].pelanggan === 'FBR';
  return { success: pass, test: 'tnmd141q_testSearchFBR', result: result, status: pass ? 'PASS' : 'FAIL' };
}

function tnmd141q_testPagination() {
  const result = tnmd141q_getCustomers({page:1, page_size:5});
  const pass = result.pagination.total === 14 && result.pagination.total_page === 3 && result.items.length === 5 && result.pagination.has_next === true;
  return { success: pass, test: 'tnmd141q_testPagination', result: result, status: pass ? 'PASS' : 'FAIL' };
}

function tnmd141q_testCategory() {
  const result = tnmd141q_getCustomers({kategori:'CABANG'});
  const pass = result.pagination.total === 14 && result.items.every(function(x){ return x.kategori === 'CABANG'; });
  return { success: pass, test: 'tnmd141q_testCategory', result: result, status: pass ? 'PASS' : 'FAIL' };
}

function tnmd141q_testSort() {
  const result = tnmd141q_getCustomers({sort:'piutang_desc', page_size:100});
  const pass = result.items.length === 14 && result.items[0].pelanggan === 'FBR' && result.items.every(function(x, i){ return i === 0 || result.items[i-1].total_piutang >= x.total_piutang; });
  return { success: pass, test: 'tnmd141q_testSort', result: result, status: pass ? 'PASS' : 'FAIL' };
}

function tnmd141q_runAllTests() {
  const tests = [tnmd141q_testDefault(), tnmd141q_testSearchFBR(), tnmd141q_testPagination(), tnmd141q_testCategory(), tnmd141q_testSort()];
  const pass = tests.every(function(x){ return x.success && x.status === 'PASS'; });
  return {
    success: pass,
    api_version: TNMD141QUERY.API_VERSION,
    layer: TNMD141QUERY.LAYER,
    read_only: true,
    test: 'tnmd141q_runAllTests',
    generated_at: new Date().toISOString(),
    status: pass ? 'PASS' : 'FAIL',
    tests: tests.map(function(x){ return {test:x.test, success:x.success, status:x.status}; })
  };
}

function tnmd141q_runAllTests_JSON() {
  const result = tnmd141q_runAllTests();
  Logger.log(JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result, null, 2));
  return result;
}
