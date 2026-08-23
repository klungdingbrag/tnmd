const API_BASE = 'https://script.google.com/macros/s/AKfycbynd9zWFineNABPYqmTM4y3X5S6LJ8YBE5-3f5xcTiXbrSWEBIHfjnx2OFaBRYEjC2C/exec';
const API_VERSION = '1.4.1';
const state = { page: 1, pageSize: 10, search: '', kategori: '', sort: 'piutang_desc', summary: null, ranking: [] };

const $ = (selector) => document.querySelector(selector);
const money = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value) => new Intl.NumberFormat('id-ID').format(Number(value || 0));
const compactMoney = (value) => {
  const n = Number(value || 0);
  if (n >= 1e9) return `Rp${(n / 1e9).toFixed(1).replace('.', ',')} M`; 
  if (n >= 1e6) return `Rp${(n / 1e6).toFixed(1).replace('.', ',')} jt`;
  if (n >= 1e3) return `Rp${(n / 1e3).toFixed(0)} rb`;
  return money(n);
};

function apiUrl(action, params = {}) {
  const url = new URL(API_BASE);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) url.searchParams.set(key, value);
  });
  return url.toString();
}

async function api(action, params = {}) {
  const response = await fetch(apiUrl(action, params), { headers: { Accept: 'application/json' } });
  const payload = await response.json();
  if (!payload.success) throw new Error(payload.error?.message || 'API request gagal');
  if (payload.api_version !== API_VERSION) throw new Error(`API version tidak sesuai: ${payload.api_version}`);
  return payload;
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderKpis(summary) {
  const d = summary.data;
  $('#kpiGrid').innerHTML = `
    <article class="kpi-card"><span class="kpi-label">Total Customer</span><strong class="kpi-value">${number(d.jumlah_customer)}</strong><span class="kpi-meta">${number(d.kategori?.CABANG?.jumlah_customer || 0)} kategori CABANG</span></article>
    <article class="kpi-card"><span class="kpi-label">Piutang Aktif</span><strong class="kpi-value">${compactMoney(d.total_piutang)}</strong><span class="kpi-meta">${money(d.total_piutang)}</span></article>
    <article class="kpi-card"><span class="kpi-label">Transaksi Aktif</span><strong class="kpi-value">${number(d.jumlah_transaksi_aktif)}</strong><span class="kpi-meta">${number(d.total_raw)} transaksi raw</span></article>
    <article class="kpi-card"><span class="kpi-label">Data Pages</span><strong class="kpi-value">${number(d.jumlah_page)}</strong><span class="kpi-meta">Index complete</span></article>`;
}

function renderRanking(items, totalPiutang) {
  const top = items.slice(0, 5);
  $('#rankingList').innerHTML = top.map((item, index) => {
    const share = totalPiutang ? (Number(item.total_piutang) / totalPiutang) * 100 : 0;
    return `<div class="rank-row"><span class="rank-number">${index + 1}</span><div><div class="rank-name">${escapeHtml(item.pelanggan)}</div><div class="rank-sub">${number(item.jumlah_transaksi_aktif)} transaksi aktif · ${share.toFixed(1)}%</div></div><div class="rank-value">${compactMoney(item.total_piutang)}<div class="rank-share">${money(item.total_piutang)}</div></div></div>`;
  }).join('') || '<div class="table-state">Belum ada data ranking.</div>';
}

function renderInsight(summary, ranking) {
  const total = Number(summary.data.total_piutang || 0);
  const top = Number(ranking[0]?.total_piutang || 0);
  const share = total ? (top / total) * 100 : 0;
  const customer = ranking[0]?.pelanggan || '—';
  $('#insightContent').innerHTML = `<div class="insight-box"><div class="insight-title">${escapeHtml(customer)} menyumbang ${share.toFixed(1)}% piutang</div><div class="insight-text">Konsentrasi piutang perlu diperhatikan karena customer terbesar memegang porsi outstanding yang dominan.</div><div class="progress"><span style="width:${Math.min(share,100)}%"></span></div><div class="insight-text">${money(top)} dari ${money(total)}</div></div>`;
}

function renderCustomers(payload) {
  const { items, pagination } = payload.data;
  const body = $('#customerTableBody');
  if (!items.length) {
    body.innerHTML = '<tr><td colspan="5" class="table-state">Customer tidak ditemukan.</td></tr>';
  } else {
    body.innerHTML = items.map(item => `<tr><td><button class="customer-link" data-customer="${encodeURIComponent(item.pelanggan)}">${escapeHtml(item.pelanggan)}</button></td><td>${escapeHtml(item.kategori || '—')}</td><td>${number(item.jumlah_transaksi_aktif)}</td><td class="money">${money(item.total_piutang)}</td><td><span class="status-pill">${escapeHtml(item.status || 'PASS')}</span></td></tr>`).join('');
    body.querySelectorAll('.customer-link').forEach(button => button.addEventListener('click', () => openCustomer(decodeURIComponent(button.dataset.customer))));
  }
  renderPagination(pagination);
}

function renderPagination(p) {
  const buttons = [];
  buttons.push(`<button class="page-button" data-page="${p.page - 1}" ${p.has_previous ? '' : 'disabled'}>‹</button>`);
  for (let i = 1; i <= p.total_page; i++) {
    if (p.total_page > 7 && Math.abs(i - p.page) > 2 && i !== 1 && i !== p.total_page) continue;
    buttons.push(`<button class="page-button ${i === p.page ? 'active' : ''}" data-page="${i}">${i}</button>`);
  }
  buttons.push(`<button class="page-button" data-page="${p.page + 1}" ${p.has_next ? '' : 'disabled'}>›</button>`);
  $('#pagination').innerHTML = buttons.join('');
  $('#pagination').querySelectorAll('.page-button:not(:disabled)').forEach(btn => btn.addEventListener('click', () => { state.page = Number(btn.dataset.page); loadCustomers(); }));
}

async function loadSummaryAndRanking() {
  const [summary, ranking] = await Promise.all([api('summary'), api('ranking', { limit: 10 })]);
  state.summary = summary;
  state.ranking = ranking.data;
  renderKpis(summary);
  renderRanking(ranking.data, summary.data.total_piutang);
  renderInsight(summary, ranking.data);
}

async function loadCustomers() {
  $('#customerTableBody').innerHTML = '<tr><td colspan="5" class="table-state">Memuat data...</td></tr>';
  try {
    const payload = await api('customers', { page: state.page, page_size: state.pageSize, search: state.search, kategori: state.kategori, sort: state.sort });
    renderCustomers(payload);
  } catch (error) {
    $('#customerTableBody').innerHTML = `<tr><td colspan="5" class="table-state">Gagal memuat data: ${escapeHtml(error.message)}</td></tr>`;
    showToast('Gagal memuat customer');
  }
}

async function openCustomer(customer) {
  const drawer = $('#customerDrawer');
  const backdrop = $('#drawerBackdrop');
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  backdrop.hidden = false;
  $('#drawerCustomer').textContent = customer;
  $('#drawerBody').innerHTML = '<div class="loading-block"></div>';
  try {
    const payload = await api('customer', { kode: customer });
    const d = payload.data;
    $('#drawerBody').innerHTML = `<div class="detail-grid"><div class="detail-card"><span class="detail-label">Piutang Aktif</span><strong class="detail-value">${money(d.total_piutang)}</strong></div><div class="detail-card"><span class="detail-label">Transaksi Aktif</span><strong class="detail-value">${number(d.jumlah_transaksi_aktif)}</strong></div><div class="detail-card"><span class="detail-label">Raw Transaction</span><strong class="detail-value">${number(d.total_raw)}</strong></div><div class="detail-card"><span class="detail-label">Data Pages</span><strong class="detail-value">${number(d.jumlah_page)}</strong></div></div><div class="insight-box" style="margin-top:14px"><div class="insight-title">Status Index</div><div class="insight-text">${d.complete ? 'Data customer lengkap dan bebas duplikasi.' : 'Data customer belum lengkap.'}</div></div>`;
  } catch (error) {
    $('#drawerBody').innerHTML = `<div class="table-state">${escapeHtml(error.message)}</div>`;
  }
}

function closeCustomer() {
  const drawer = $('#customerDrawer');
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  $('#drawerBackdrop').hidden = true;
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[char]));
}

function setup() {
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.toggle('open'));
  $('#closeDrawer').addEventListener('click', closeCustomer);
  $('#drawerBackdrop').addEventListener('click', closeCustomer);
  $('#refreshButton').addEventListener('click', async () => { showToast('Memperbarui data...'); await Promise.all([loadSummaryAndRanking(), loadCustomers()]); showToast('Data diperbarui'); });
  let searchTimer;
  $('#searchInput').addEventListener('input', event => { clearTimeout(searchTimer); state.search = event.target.value.trim(); state.page = 1; searchTimer = setTimeout(loadCustomers, 280); });
  $('#sortSelect').addEventListener('change', event => { state.sort = event.target.value; state.page = 1; loadCustomers(); });
  $('#categorySelect').addEventListener('change', event => { state.kategori = event.target.value; state.page = 1; loadCustomers(); });
  window.addEventListener('hashchange', () => document.querySelector(location.hash)?.scrollIntoView({ behavior: 'smooth' }));
  Promise.all([loadSummaryAndRanking(), loadCustomers()]).catch(error => showToast(error.message));
}

document.addEventListener('DOMContentLoaded', setup);
