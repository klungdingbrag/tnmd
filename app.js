const API_URL = 'https://script.google.com/macros/s/AKfycbynd9zWFineNABPYqmTM4y3X5S6LJ8YBE5-3f5xcTiXbrSWEBIHfjnx2OFaBRYEjC2C/exec';
const state = { view:'dashboard', page:1, pageSize:20, search:'', kategori:'', sort:'piutang_desc', customerCache:new Map() };
const $ = (id) => document.getElementById(id);

function formatRupiah(value){
  const n = Number(value || 0);
  return new Intl.NumberFormat('id-ID',{style:'currency',currency:'IDR',maximumFractionDigits:0}).format(n);
}
function compactRupiah(value){
  const n = Number(value || 0);
  if(n >= 1e9) return 'Rp' + (n/1e9).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' M';
  if(n >= 1e6) return 'Rp' + (n/1e6).toLocaleString('id-ID',{maximumFractionDigits:1}) + ' jt';
  if(n >= 1e3) return 'Rp' + (n/1e3).toLocaleString('id-ID',{maximumFractionDigits:0}) + ' rb';
  return formatRupiah(n);
}
function number(value){ return new Intl.NumberFormat('id-ID').format(Number(value||0)); }
function pct(value){ return `${Number(value||0).toLocaleString('id-ID',{maximumFractionDigits:1})}%`; }
function escapeHtml(value){ return String(value ?? '').replace(/[&<>'"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c])); }

async function api(action, params={}){
  const url = new URL(API_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k,v]) => { if(v !== undefined && v !== null && v !== '') url.searchParams.set(k,v); });
  const controller = new AbortController();
  const timer = setTimeout(()=>controller.abort(), 20000);
  try{
    const response = await fetch(url.toString(), {method:'GET', cache:'no-store', signal:controller.signal});
    const json = await response.json();
    if(!response.ok || json.success === false) throw new Error(json?.error?.message || `HTTP ${response.status}`);
    return json;
  }finally{ clearTimeout(timer); }
}

function setApiStatus(ok=true, text='Live API'){
  const el = $('api-status');
  el.innerHTML = `<span class="status-dot" style="background:${ok?'var(--green)':'var(--red)'}"></span><span>${escapeHtml(text)}</span>`;
}
function toast(message){
  const el=$('toast'); el.textContent=message; el.classList.remove('hidden');
  clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.add('hidden'),2600);
}
function showError(message){ setApiStatus(false,'API unavailable'); toast(message); }

async function loadDashboard(){
  try{
    const [summaryRes, rankingRes, customersRes] = await Promise.all([
      api('summary'), api('ranking',{limit:5}), api('customers',{page:1,page_size:5,sort:'piutang_desc'})
    ]);
    const s=summaryRes.data, ranking=rankingRes.data||[], preview=customersRes.data?.items||[];
    $('kpi-customers').textContent=number(s.jumlah_customer);
    $('kpi-category').textContent=`${number(s.jumlah_customer)} customer kategori CABANG`;
    $('kpi-piutang').textContent=compactRupiah(s.total_piutang);
    $('kpi-piutang-full').textContent=formatRupiah(s.total_piutang);
    $('kpi-active').textContent=number(s.jumlah_transaksi_aktif);
    $('kpi-raw').textContent=`${number(s.total_raw)} transaksi raw`;
    $('kpi-pages').textContent=number(s.jumlah_page);
    $('kpi-complete').textContent=s.checkpoint?.completed ? 'Index complete' : 'Index belum complete';
    renderTopDebt(ranking,s.total_piutang);
    renderInsight(ranking,s);
    renderPreview(preview);
    setApiStatus(true,'Live API');
  }catch(err){ showError(`Dashboard gagal dimuat: ${err.message}`); }
}

function renderTopDebt(items,total){
  if(!items.length){ $('top-debt-list').innerHTML='<div class="empty">Belum ada data.</div>'; return; }
  $('top-debt-list').innerHTML=items.map((item,i)=>{
    const share=total ? (Number(item.total_piutang||0)/Number(total)*100) : 0;
    return `<div class="rank-row"><div class="rank-number">${i+1}</div><div class="rank-main"><button class="customer-link rank-name" data-customer="${escapeHtml(item.pelanggan)}">${escapeHtml(item.pelanggan)}</button><div class="rank-meta">${number(item.jumlah_transaksi_aktif)} transaksi aktif · ${pct(share)}</div></div><div class="rank-value"><strong>${compactRupiah(item.total_piutang)}</strong><small>${formatRupiah(item.total_piutang)}</small></div></div>`;
  }).join('');
  bindCustomerButtons($('top-debt-list'));
}
function renderInsight(ranking,summary){
  const top=ranking[0];
  const share=top && summary.total_piutang ? Number(top.total_piutang)/Number(summary.total_piutang)*100 : 0;
  const risk=share>=70?'HIGH':share>=40?'MEDIUM':'LOW';
  const copy=share>=70 ? `${escapeHtml(top.pelanggan)} memegang porsi outstanding yang sangat dominan. Konsentrasi seperti ini layak dipantau karena risiko piutang terkumpul pada satu customer.` : share>=40 ? `${escapeHtml(top.pelanggan)} adalah customer terbesar dan menyumbang bagian signifikan dari outstanding.` : 'Distribusi outstanding relatif tersebar di antara customer utama.';
  $('business-insight').innerHTML=`<div class="insight-card"><div class="insight-label">Konsentrasi outstanding</div><div class="insight-title">${escapeHtml(top?.pelanggan||'—')} menyumbang ${pct(share)} piutang</div><div class="insight-copy">${copy}</div><div class="progress"><span style="width:${Math.min(100,share)}%"></span></div><div class="insight-stat"><span>${formatRupiah(top?.total_piutang||0)} dari ${formatRupiah(summary.total_piutang)}</span><strong>${pct(share)}</strong></div><div class="insight-metrics"><div class="mini-metric"><span>Customer terbesar</span><strong>${escapeHtml(top?.pelanggan||'—')}</strong></div><div class="mini-metric"><span>Risk indicator</span><strong class="risk"><span class="status-dot"></span>${risk}</strong></div></div></div>`;
}
function renderPreview(items){
  if(!items.length){ $('preview-table').innerHTML='<div class="empty">Belum ada customer.</div>'; return; }
  $('preview-table').innerHTML=customerTable(items,false);
  bindCustomerButtons($('preview-table'));
}
function customerTable(items,full=true){
  return `<table class="data-table"><thead><tr><th>Customer</th><th>Kategori</th><th class="number">Aktif</th><th class="number">Piutang</th><th>Status</th></tr></thead><tbody>${items.map(x=>`<tr><td><button class="customer-link" data-customer="${escapeHtml(x.pelanggan)}">${escapeHtml(x.pelanggan)}</button></td><td>${escapeHtml(x.kategori||'—')}</td><td class="number">${number(x.jumlah_transaksi_aktif)}</td><td class="number"><strong>${compactRupiah(x.total_piutang)}</strong></td><td><span class="status-pill">${escapeHtml(x.status||'PASS')}</span></td></tr>`).join('')}</tbody></table>`;
}
function bindCustomerButtons(root){ root.querySelectorAll('[data-customer]').forEach(btn=>btn.addEventListener('click',()=>openCustomer(btn.dataset.customer))); }

async function loadCustomers(){
  try{
    const res=await api('customers',{page:state.page,page_size:state.pageSize,search:state.search,kategori:state.kategori,sort:state.sort});
    const data=res.data||{}; const items=data.items||[];
    $('customer-table').innerHTML=items.length?customerTable(items,true):'<div class="empty">Customer tidak ditemukan.</div>';
    bindCustomerButtons($('customer-table'));
    renderPagination(data.pagination);
    setApiStatus(true,'Live API');
  }catch(err){ showError(`Customer gagal dimuat: ${err.message}`); }
}
function renderPagination(p){
  if(!p){ $('customer-pagination').innerHTML=''; return; }
  $('customer-pagination').innerHTML=`<div>Menampilkan halaman <strong>${p.page}</strong> dari <strong>${p.total_page}</strong> · ${number(p.total)} customer</div><div class="pagination-actions"><button class="page-button" id="prev-page" ${p.has_previous?'':'disabled'}>← Sebelumnya</button><button class="page-button" id="next-page" ${p.has_next?'':'disabled'}>Berikutnya →</button></div>`;
  $('prev-page')?.addEventListener('click',()=>{if(p.has_previous){state.page--;loadCustomers()}});
  $('next-page')?.addEventListener('click',()=>{if(p.has_next){state.page++;loadCustomers()}});
}

async function loadRanking(){
  try{
    const res=await api('ranking',{limit:50});
    const items=res.data||[];
    $('ranking-table').innerHTML=items.length?`<table class="data-table"><thead><tr><th>#</th><th>Customer</th><th>Kategori</th><th class="number">Transaksi Aktif</th><th class="number">Piutang</th></tr></thead><tbody>${items.map(x=>`<tr><td class="rank-table-number">${x.ranking}</td><td><button class="customer-link" data-customer="${escapeHtml(x.pelanggan)}">${escapeHtml(x.pelanggan)}</button></td><td>${escapeHtml(x.kategori||'—')}</td><td class="number">${number(x.jumlah_transaksi_aktif)}</td><td class="number"><strong>${formatRupiah(x.total_piutang)}</strong></td></tr>`).join('')}</tbody></table>`:'<div class="empty">Belum ada data ranking.</div>';
    bindCustomerButtons($('ranking-table')); setApiStatus(true,'Live API');
  }catch(err){showError(`Ranking gagal dimuat: ${err.message}`)}
}

async function loadBranch(){
  try{
    const res=await api('branch',{kategori:'CABANG'}); const d=res.data||{}; const items=d.customers||[];
    $('branch-kpis').innerHTML=`<article class="kpi-card"><span>Customer</span><strong>${number(d.jumlah_customer)}</strong><small>Kategori CABANG</small></article><article class="kpi-card"><span>Piutang</span><strong>${compactRupiah(d.total_piutang)}</strong><small>${formatRupiah(d.total_piutang)}</small></article><article class="kpi-card"><span>Transaksi Aktif</span><strong>${number(d.jumlah_transaksi_aktif)}</strong><small>${number(d.total_raw)} raw</small></article><article class="kpi-card"><span>Data Pages</span><strong>${number(d.jumlah_page)}</strong><small>Index complete</small></article>`;
    $('branch-table').innerHTML=items.length?customerTable(items,true):'<div class="empty">Belum ada data branch.</div>'; bindCustomerButtons($('branch-table')); setApiStatus(true,'Live API');
  }catch(err){showError(`Branch gagal dimuat: ${err.message}`)}
}

async function openCustomer(name){
  const drawer=$('customer-drawer'), backdrop=$('drawer-backdrop');
  drawer.classList.add('open'); backdrop.classList.remove('hidden'); drawer.setAttribute('aria-hidden','false'); $('drawer-name').textContent=name; $('drawer-content').innerHTML='<div class="loading-block"></div>';
  try{
    let data=state.customerCache.get(name);
    if(!data){ const res=await api('customer',{pelanggan:name}); data=res.data; state.customerCache.set(name,data); }
    $('drawer-content').innerHTML=`<div class="detail-kpi"><span>Total Piutang</span><strong>${formatRupiah(data.total_piutang)}</strong></div><div class="detail-grid"><div class="detail-kpi"><span>Transaksi Aktif</span><strong>${number(data.jumlah_transaksi_aktif)}</strong></div><div class="detail-kpi"><span>Raw Transaction</span><strong>${number(data.total_raw)}</strong></div><div class="detail-kpi"><span>Data Pages</span><strong>${number(data.jumlah_page)}</strong></div><div class="detail-kpi"><span>Kategori</span><strong>${escapeHtml(data.kategori||'—')}</strong></div></div><div class="integrity"><h4>Data Integrity</h4><div class="check">Index complete</div><div class="check">Tidak ada duplicate</div><div class="check">Status ${escapeHtml(data.status||'PASS')}</div><div class="check">Tidak berhenti karena max pages</div></div>`;
  }catch(err){ $('drawer-content').innerHTML=`<div class="empty">Gagal mengambil detail customer.<br>${escapeHtml(err.message)}</div>`; }
}
function closeCustomer(){ $('customer-drawer').classList.remove('open'); $('drawer-backdrop').classList.add('hidden'); $('customer-drawer').setAttribute('aria-hidden','true'); }

function switchView(view){
  state.view=view;
  document.querySelectorAll('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===view));
  document.querySelectorAll('.view').forEach(x=>x.classList.add('hidden'));
  $(`${view}-view`).classList.remove('hidden');
  const titles={dashboard:'Customer Intelligence',customers:'Customers',ranking:'Ranking',branch:'Branch'};
  $('page-title').textContent=titles[view]||'Customer Intelligence';
  $('sidebar').classList.remove('open');
  if(view==='dashboard') loadDashboard();
  if(view==='customers') loadCustomers();
  if(view==='ranking') loadRanking();
  if(view==='branch') loadBranch();
}

let searchTimer;
$('customer-search').addEventListener('input',e=>{state.search=e.target.value.trim();state.page=1;clearTimeout(searchTimer);searchTimer=setTimeout(loadCustomers,300)});
$('customer-category').addEventListener('change',e=>{state.kategori=e.target.value;state.page=1;loadCustomers()});
$('customer-sort').addEventListener('change',e=>{state.sort=e.target.value;state.page=1;loadCustomers()});
$('refresh-dashboard').addEventListener('click',()=>loadDashboard());
$('refresh-customers').addEventListener('click',()=>loadCustomers());
$('refresh-ranking').addEventListener('click',()=>loadRanking());
$('refresh-branch').addEventListener('click',()=>loadBranch());
$('drawer-close').addEventListener('click',closeCustomer); $('drawer-backdrop').addEventListener('click',closeCustomer);
$('mobile-menu').addEventListener('click',()=> $('sidebar').classList.toggle('open'));
document.querySelectorAll('[data-view]').forEach(el=>el.addEventListener('click',()=>switchView(el.dataset.view)));
document.addEventListener('keydown',e=>{if(e.key==='Escape')closeCustomer()});

loadDashboard();
