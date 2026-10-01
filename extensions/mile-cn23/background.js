'use strict';
importScripts('queue.js');
const Q=MileCN23;
const KEY='mileCn23Queue';
let chain=Promise.resolve();
const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
const blank=()=>({version:1,rows:[],running:false,active:null,error:'',seenReceipts:[],completedQueueIds:[],options:{autoAdvance:false,autoSubmit:false,maxCost:0}});
async function read(){return (await chrome.storage.local.get(KEY))[KEY]||blank();}
async function save(s){await chrome.storage.local.set({[KEY]:s});return s;}
async function mileTabs(){return chrome.tabs.query({url:'https://expos.mile.app/*'});}
function checkPanel(sender){if(sender.id!==chrome.runtime.id||!sender.url?.startsWith(chrome.runtime.getURL('panel.html')))throw new Error('Perintah harus berasal dari panel ekstensi.');}
function checkActive(s,m,sender){if(!s.active||s.active.token!==m.token||sender.tab?.id!==s.tabId)throw new Error('Pesan bukan dari kiriman atau tab aktif.');}
async function start(s){
  if(s.active)throw new Error('Masih ada kiriman aktif. Selesaikan atau periksa hasilnya dahulu.');
  const tab=await chrome.tabs.get(s.tabId).catch(()=>null);
  if(!tab?.url || new URL(tab.url).origin!=='https://expos.mile.app' || new URL(tab.url).pathname!=='/new-transaction-custom')throw new Error('Buka form Transaksi CN23 pada tab Mile yang dipilih.');
  const row=s.rows.find(r=>r.status==='ready');
  if(!row){s.running=false;return save(s);}
  const receiptTabs=await chrome.tabs.query({url:'https://apiexpos.mile.app/api/v2/print-data*'});
  const baseline=receiptTabs.map(t=>Q.receiptId(t.url)).filter(Boolean);
  row.status='filling';row.error='';
  s.active={id:row.id,token:crypto.randomUUID(),startedAt:Date.now(),baseline,phase:'filling'};
  s.running=true;s.error='';await save(s);
  try { const ack=await chrome.tabs.sendMessage(s.tabId,{type:'CN23_FILL',token:s.active.token,row:row.data,options:s.options}); if(!ack?.accepted)throw new Error(ack?.error||'Form belum siap menerima antrean.'); }
  catch(error){row.status='error';row.error=error.message;s.error=error.message;s.running=false;s.active=null;await save(s);}
  return s;
}
async function command(m,sender){
  const s=await read();
  const panelTypes=['GET','IMPORT','RUN','PAUSE','RETRY','MANUAL_RECEIPT','CLEAR','TABS','OPEN_MILE'];
  if(panelTypes.includes(m.type))checkPanel(sender);
  if(m.type==='GET'){if(Q.recoverInterrupted(s))await save(s);return s;}
  if(m.type==='TABS')return mileTabs();
  if(m.type==='OPEN_MILE'){const tab=await chrome.tabs.create({url:Q.FORM_URL});return {tabId:tab.id};}
  if(m.type==='IMPORT'){
    if(s.active)throw new Error('Antrean masih memiliki kiriman aktif atau hasil belum pasti. Periksa dahulu sebelum mengganti file.');
    if(s.rows.some(r=>!['done','ready'].includes(r.status)))throw new Error('Periksa kiriman bermasalah di antrean lama sebelum mengganti file.');
    if(s.rows.some(r=>r.status==='done'))throw new Error('Ekspor hasil dan hapus antrean selesai terlebih dahulu.');
    const rows=Q.validateRows(m.rows);
    if(rows.some(row=>(s.completedQueueIds||[]).includes(row.id)))throw new Error('Ada ID kiriman yang sudah selesai di Chrome ini. Jangan impor ulang antrean yang telah dikirim.');
    const next={...blank(),batchId:String(m.batchId),fileName:String(m.fileName),rows,seenReceipts:s.seenReceipts||[],completedQueueIds:s.completedQueueIds||[]};
    return save(next);
  }
  if(m.type==='RUN'){
    const opts=m.options||{};
    if(opts.autoSubmit&&(!Number.isFinite(Number(opts.maxCost))||Number(opts.maxCost)<=0))throw new Error('Isi batas biaya per kiriman untuk Selesai otomatis.');
    s.tabId=Number(m.tabId);s.options={autoAdvance:Boolean(opts.autoAdvance),autoSubmit:Boolean(opts.autoSubmit),maxCost:Number(opts.maxCost)||0};
    if(s.rows.some(r=>r.status==='unknown'))throw new Error('Ada hasil belum pasti. Verifikasi resinya sebelum melanjutkan.');
    return start(s);
  }
  if(m.type==='PAUSE'){
    s.running=false;await save(s);
    if(s.active)await chrome.tabs.sendMessage(s.tabId,{type:'CN23_PAUSE',token:s.active.token}).catch(()=>{});
    return s;
  }
  if(m.type==='RETRY'){
    if(s.active)throw new Error('Masih ada kiriman aktif. Jangan isi ulang.');
    const r=s.rows.find(r=>r.id===m.id);if(!r||r.status!=='error')throw new Error('Hanya pengisian yang gagal sebelum submit boleh dicoba ulang.');
    r.status='ready';r.error='';return save(s);
  }
  if(m.type==='MANUAL_RECEIPT'){
    const r=s.rows.find(r=>r.id===m.id);
    if(!r||!['unknown','awaiting_receipt','review'].includes(r.status))throw new Error('Kiriman tidak sedang menunggu pemeriksaan resi.');
    if(s.active && s.active.id!==r.id)throw new Error('Periksa kiriman yang sedang aktif dahulu.');
    if(!/^[A-Z]\d{10,20}$/.test(m.code||'')||!Q.receiptId(m.url)||s.seenReceipts.includes(Q.receiptId(m.url)))throw new Error('Nomor resi/tautan resi tidak valid atau sudah dipakai.');
    r.status='done';r.error='';r.receipt={code:m.code,url:m.url,id:Q.receiptId(m.url),verified:'OPERATOR',at:Date.now()};
    s.seenReceipts.push(r.receipt.id);(s.completedQueueIds||=[]).push(r.id);s.active=null;s.running=false;s.error='';return save(s);
  }
  if(m.type==='CLEAR'){
    if(s.active||s.rows.some(r=>['filling','review','awaiting_receipt','unknown'].includes(r.status)))throw new Error('Kiriman aktif/hasil belum pasti tidak dapat dihapus.');
    return save({...blank(),seenReceipts:s.seenReceipts||[],completedQueueIds:s.completedQueueIds||[]});
  }
  if(m.type==='PROGRESS'){checkActive(s,m,sender);s.active.phase=String(m.phase);if(sender.documentId)s.active.documentId=sender.documentId;return save(s);}
  if(m.type==='FILLED'){
    checkActive(s,m,sender);const r=s.rows.find(r=>r.id===s.active.id);r.status='review';s.active.phase='payment_ready';s.active.startedAt=Date.now();if(sender.documentId)s.active.documentId=sender.documentId;return save(s);
  }
  if(m.type==='SUBMIT_INTENT'){
    checkActive(s,m,sender);
    if(s.active.submittedAt)throw new Error('Submit sudah dicatat; jangan ulangi Selesai.');
    const r=s.rows.find(r=>r.id===s.active.id);
    if(r.status!=='review')throw new Error('Pengisian belum siap diperiksa/dikirim.');
    r.status='awaiting_receipt';s.active.phase='awaiting_receipt';s.active.submittedAt=Date.now();s.active.startedAt=Date.now();return save(s);
  }
  if(m.type==='FORM_ERROR'){
    checkActive(s,m,sender);const r=s.rows.find(r=>r.id===s.active.id);
    r.status=s.active.submittedAt?'unknown':'error';r.error=String(m.error).slice(0,1000);s.error=r.error;s.running=false;
    if(!s.active.submittedAt)s.active=null;return save(s);
  }
  if(m.type==='RECEIPT'){
    const id=Q.receiptId(sender.tab?.url);
    if(!id||!s.active?.submittedAt||s.seenReceipts.includes(id)||s.active.baseline.includes(id))return {ignored:true};
    if(sender.tab.id!==s.tabId&&sender.tab.openerTabId!==s.tabId)return {ignored:true};
    const r=s.rows.find(r=>r.id===s.active.id);
    if(!Q.receiptMatches(r.data,m.evidence)){
      r.status='unknown';r.error='Resi baru belum cocok dengan nama, wilayah, dan referensi kiriman aktif. Periksa di Mile.';s.error=r.error;s.running=false;return save(s);
    }
    r.status='done';r.error='';r.receipt={id,code:m.evidence.code,transactionCode:m.evidence.transactionCode,url:sender.tab.url,verified:'COCOK RESI',at:Date.now()};
    s.seenReceipts.push(id);(s.completedQueueIds||=[]).push(r.id);s.active=null;s.error='';await save(s);
    await chrome.tabs.sendMessage(s.tabId,{type:'CN23_FINISHED'}).catch(()=>{});
    if(s.running&&s.options.autoAdvance){s.waitingNewForm=true;await save(s);await chrome.tabs.update(s.tabId,{url:Q.FORM_URL});return s;}
    s.running=false;return save(s);
  }
  if(m.type==='FORM_READY'){
    if(sender.tab?.id===s.tabId&&s.active?.documentId&&sender.documentId&&s.active.documentId!==sender.documentId){
      const r=s.rows.find(row=>row.id===s.active.id);r.status=s.active.submittedAt?'unknown':'error';r.error=s.active.submittedAt?'Halaman dimuat ulang setelah submit. Periksa resi; jangan kirim ulang.':'Form dimuat ulang sebelum Selesai. Periksa transaksi dan buka form kosong untuk mencoba pengisian kembali.';
      s.error=r.error;s.running=false;if(!s.active.submittedAt)s.active=null;return save(s);
    }
    if(sender.tab?.id===s.tabId&&s.waitingNewForm&&s.running&&!s.active){delete s.waitingNewForm;return start(s);}
    return {ignored:true};
  }
  throw new Error('Perintah tidak dikenal.');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  if(!m||typeof m.type!=='string')return false;
  serial(()=>command(m,sender)).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));return true;
});
chrome.action.onClicked.addListener(()=>{
  const url=chrome.runtime.getURL('panel.html');
  chrome.tabs.query({url}).then(tabs=>tabs.length?chrome.tabs.update(tabs[0].id,{active:true}):chrome.tabs.create({url})).catch(()=>{});
});
chrome.alarms.onAlarm.addListener(alarm=>{
  if(alarm.name==='cn23-watch')void serial(async()=>{const s=await read();if(Q.recoverInterrupted(s))await save(s);});
});
chrome.runtime.onInstalled.addListener(()=>{
  void chrome.storage.local.setAccessLevel({accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});
  void chrome.alarms.create('cn23-watch',{periodInMinutes:1});
});
chrome.runtime.onStartup.addListener(()=>{
  void chrome.alarms.create('cn23-watch',{periodInMinutes:1});
  void serial(async()=>{const s=await read();if(s.active){s.active.startedAt=0;s.active.phase='interrupted';if(Q.recoverInterrupted(s))await save(s);}});
});
