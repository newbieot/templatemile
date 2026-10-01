'use strict';
importScripts('queue.js');
const Q=MileCN23;
const KEY='mileCn23Queue';
let chain=Promise.resolve();
const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
const blank=()=>({version:2,rows:[],running:false,active:null,error:'',seenReceipts:[],completedQueueIds:[],options:{autoAdvance:true,autoSubmit:true,maxCost:0}});
async function read(){return (await chrome.storage.local.get(KEY))[KEY]||blank();}
async function save(s){await chrome.storage.local.set({[KEY]:s});return s;}
async function mileTabs(){return chrome.tabs.query({url:'https://expos.mile.app/*'});}
function checkPanel(sender){
  const embedded=sender.tab?.id&&sender.url?.startsWith('https://expos.mile.app/');
  if(sender.id!==chrome.runtime.id||(!embedded&&sender.url?.split('?')[0]!==chrome.runtime.getURL('panel.html')))throw new Error('Perintah harus berasal dari menu ekstensi pada Mile.');
}
function checkActive(s,m,sender){if(!s.active||s.active.token!==m.token||sender.tab?.id!==s.tabId)throw new Error('Pesan bukan dari kiriman atau tab aktif.');}
async function start(s){
  if(s.active)throw new Error('Masih ada kiriman aktif. Selesaikan atau periksa hasilnya dahulu.');
  const tab=await chrome.tabs.get(s.tabId).catch(()=>null);
  if(!tab?.url || new URL(tab.url).origin!=='https://expos.mile.app' || new URL(tab.url).pathname!=='/new-transaction-custom')throw new Error('Buka form Transaksi CN23 pada tab Mile yang dipilih.');
  const row=s.rows.find(r=>r.status==='ready');
  if(!row)return finishBatch(s);
  const receiptTabs=await chrome.tabs.query({url:'https://apiexpos.mile.app/api/v2/print-data*'});
  const baseline=receiptTabs.map(t=>Q.receiptId(t.url)).filter(Boolean);
  row.status='filling';row.error='';
  s.active={id:row.id,token:crypto.randomUUID(),startedAt:Date.now(),baseline,phase:'filling'};
  s.running=true;s.error='';s.formReady=false;s.formReturnExpected=false;delete s.completedAt;await save(s);
  try { const ack=await chrome.tabs.sendMessage(s.tabId,{type:'CN23_FILL',token:s.active.token,row:row.data,options:s.options}); if(!ack?.accepted)throw new Error(ack?.error||'Form belum siap menerima antrean.'); }
  catch(error){row.status='error';row.error=error.message;s.error=error.message;s.running=false;s.active=null;await save(s);}
  return s;
}
async function finishBatch(s){
  s.running=false;s.active=null;s.completedAt=s.completedAt||Date.now();delete s.waitingNewForm;
  await save(s);
  await chrome.tabs.sendMessage(s.tabId,{type:'CN23_BATCH_DONE',total:s.rows.length}).catch(()=>{});
  if(!s.formReady)await chrome.tabs.update(s.tabId,{url:Q.FORM_URL});
  if(chrome.action.setBadgeText)await chrome.action.setBadgeText({tabId:s.tabId,text:'OK'});
  return s;
}
async function returnFromList(s,url){
  if(!url||new URL(url).origin!=='https://expos.mile.app'||new URL(url).pathname!=='/transaction-list'||(!s.active?.submittedAt&&!(s.running&&s.waitingNewForm)&&!(s.completedAt&&Date.now()-s.completedAt<30000)))return false;
  s.formReturnExpected=true;s.formReady=false;await save(s);
  await chrome.tabs.update(s.tabId,{url:Q.FORM_URL});return true;
}
async function command(m,sender){
  const s=await read();
  const panelTypes=['GET','IMPORT','RUN','PAUSE','RETRY','MANUAL_RECEIPT','CLEAR','TABS','OPEN_MILE'];
  if(panelTypes.includes(m.type))checkPanel(sender);
  if(m.type==='PAGE_READY'){
    if(sender.tab?.id!==s.tabId)return {ignored:true};
    await returnFromList(s,sender.tab.url);
    return {running:s.running,completedAt:s.completedAt,total:s.rows.length,done:s.rows.filter(r=>r.status==='done').length,error:s.error};
  }
  if(m.type==='GET'){if(Q.recoverInterrupted(s))await save(s);return s;}
  if(m.type==='TABS')return mileTabs();
  if(m.type==='OPEN_MILE'){const tab=await chrome.tabs.create({url:Q.FORM_URL});return {tabId:tab.id};}
  if(m.type==='IMPORT'){
    if(s.active)throw new Error('Antrean masih memiliki kiriman aktif atau hasil belum pasti. Periksa dahulu sebelum mengganti file.');
    if(s.rows.some(r=>!['done','ready'].includes(r.status)))throw new Error('Periksa kiriman bermasalah di antrean lama sebelum mengganti file.');
    if(s.rows.some(r=>r.status==='done')&&s.rows.some(r=>r.status!=='done'))throw new Error('Selesaikan antrean lama sebelum mengganti file.');
    const rows=Q.validateRows(m.rows);
    if(rows.some(row=>(s.completedQueueIds||[]).includes(row.id)))throw new Error('Ada ID kiriman yang sudah selesai di Chrome ini. Jangan impor ulang antrean yang telah dikirim.');
    const next={...blank(),batchId:String(m.batchId),fileName:String(m.fileName),rows,seenReceipts:s.seenReceipts||[],completedQueueIds:s.completedQueueIds||[],history:[...(s.history||[]),...(s.rows.length&&s.rows.every(r=>r.status==='done')?[{fileName:s.fileName,batchId:s.batchId,completedAt:s.completedAt,rows:s.rows.map(r=>({id:r.id,name:r.data.recipient_name,receipt:r.receipt}))}]:[])].slice(-5)};
    return save(next);
  }
  if(m.type==='RUN'){
    s.tabId=Number(sender.tab?.id||m.tabId);s.options={autoAdvance:true,autoSubmit:true,maxCost:0};
    if(s.rows.some(r=>r.status==='unknown'))throw new Error('Ada hasil belum pasti. Verifikasi resinya sebelum melanjutkan.');
    if(!s.active&&s.rows.some(r=>r.status==='error')){
      s.rows.filter(r=>r.status==='error').forEach(r=>{r.status='ready';r.error='';});
      s.running=true;s.error='';s.waitingNewForm=true;await save(s);await chrome.tabs.update(s.tabId,{url:Q.FORM_URL});return s;
    }
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
  if(m.type==='PROGRESS'){
    checkActive(s,m,sender);
    if(m.customerResolved){
      const row=s.rows.find(r=>r.id===s.active.id);
      if(row.data.customer_mode!=='KORPORAT'||s.active.phase!=='customer_loading')throw new Error('Pelanggan belum dimuat.');
      for(const key of ['sender_name','sender_phone','sender_address']){
        const value=String(m.customerResolved[key]||'').trim();if(!value||value.length>1000)throw new Error('Data pengirim pelanggan belum lengkap.');row.data[key]=value;
      }
    }
    s.active.phase=String(m.phase);if(sender.documentId)s.active.documentId=sender.documentId;return save(s);
  }
  if(m.type==='FILLED'){
    checkActive(s,m,sender);const r=s.rows.find(r=>r.id===s.active.id);r.status='review';s.active.phase='payment_ready';s.active.startedAt=Date.now();if(sender.documentId)s.active.documentId=sender.documentId;return save(s);
  }
  if(m.type==='SUBMIT_INTENT'){
    checkActive(s,m,sender);
    if(s.active.submittedAt)throw new Error('Submit sudah dicatat; jangan ulangi Selesai.');
    const r=s.rows.find(r=>r.id===s.active.id);
    if(r.status!=='review')throw new Error('Pengisian belum siap diperiksa/dikirim.');
    s.freshReceiptTabs={};r.status='awaiting_receipt';s.active.phase='awaiting_receipt';s.active.submittedAt=Date.now();s.active.startedAt=Date.now();return save(s);
  }
  if(m.type==='FORM_ERROR'){
    checkActive(s,m,sender);const r=s.rows.find(r=>r.id===s.active.id);
    r.status=s.active.submittedAt?'unknown':'error';r.error=String(m.error).slice(0,1000);s.error=r.error;s.running=false;
    if(!s.active.submittedAt)s.active=null;return save(s);
  }
  if(m.type==='RECEIPT'){
    const id=Q.receiptId(sender.tab?.url);
    if(!id||!s.active?.submittedAt||s.seenReceipts.includes(id)||s.active.baseline.includes(id))return {ignored:true};
    if(sender.tab.id!==s.tabId&&sender.tab.openerTabId!==s.tabId){
      const fresh=s.freshReceiptTabs?.[sender.tab.id];
      if(sender.tab.openerTabId!=null||!fresh||fresh<s.active.submittedAt)return {ignored:true};
    }
    const r=s.rows.find(r=>r.id===s.active.id);
    if(!Q.receiptMatches(r.data,m.evidence)){
      r.status='unknown';r.error='Resi baru belum cocok dengan nama, wilayah, dan referensi kiriman aktif. Periksa di Mile.';s.error=r.error;s.running=false;return save(s);
    }
    r.status='done';r.error='';r.receipt={id,code:m.evidence.code,transactionCode:m.evidence.transactionCode,url:sender.tab.url,verified:'COCOK RESI',at:Date.now()};
    s.seenReceipts.push(id);(s.completedQueueIds||=[]).push(r.id);s.active=null;s.error='';await save(s);
    await chrome.tabs.sendMessage(s.tabId,{type:'CN23_FINISHED'}).catch(()=>{});
    if(s.running){
      if(!s.rows.some(row=>row.status==='ready')){await finishBatch(s);return {...s,receiptAccepted:true};}
      s.waitingNewForm=true;await save(s);
      const tab=await chrome.tabs.get(s.tabId).catch(()=>null);
      if(s.formReady&&tab?.url===Q.FORM_URL){delete s.waitingNewForm;await start(s);}
      else await chrome.tabs.update(s.tabId,{url:Q.FORM_URL});
      return {...s,receiptAccepted:true};
    }
    s.running=false;await save(s);return {...s,receiptAccepted:true};
  }
  if(m.type==='FORM_READY'){
    if(sender.tab?.id!==s.tabId)return {ignored:true};
    if(s.active?.submittedAt&&s.formReturnExpected){s.formReady=true;return save(s);}
    if(s.active?.documentId&&sender.documentId&&s.active.documentId!==sender.documentId){
      const r=s.rows.find(row=>row.id===s.active.id);r.status=s.active.submittedAt?'unknown':'error';r.error=s.active.submittedAt?'Halaman dimuat ulang setelah submit. Periksa resi; jangan kirim ulang.':'Form dimuat ulang sebelum Selesai. Buka form kosong untuk mencoba pengisian kembali.';
      s.error=r.error;s.running=false;if(!s.active.submittedAt)s.active=null;return save(s);
    }
    s.formReady=true;
    if(s.waitingNewForm&&s.running&&!s.active){delete s.waitingNewForm;return start(s);}
    return save(s);
  }
  throw new Error('Perintah tidak dikenal.');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{
  if(!m||typeof m.type!=='string')return false;
  serial(()=>command(m,sender)).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));return true;
});
chrome.action.onClicked.addListener(tab=>{
  void serial(async()=>{
    if(!tab?.url?.startsWith('https://expos.mile.app/')){
      await chrome.action.setBadgeText({text:'MILE'});await chrome.action.setTitle({title:'Buka tab Mile yang sudah login, lalu klik ikon ini.'});return;
    }
    const ack=await chrome.tabs.sendMessage(tab.id,{type:'CN23_PANEL_TOGGLE',tabId:tab.id}).catch(()=>null);
    if(!ack?.accepted){await chrome.action.setBadgeText({tabId:tab.id,text:'↻'});await chrome.action.setTitle({tabId:tab.id,title:'Simpan pekerjaan lalu muat ulang tab Mile untuk memakai ekstensi terbaru.'});}
    else await chrome.action.setBadgeText({tabId:tab.id,text:''});
  });
});
chrome.tabs.onCreated?.addListener(tab=>{
  void serial(async()=>{const s=await read();if(s.active?.submittedAt){(s.freshReceiptTabs||={})[tab.id]=Date.now();await save(s);}});
});
chrome.tabs.onUpdated?.addListener((id,change,tab)=>{
  if(!change.url)return;
  void serial(async()=>{const s=await read();if(id===s.tabId)await returnFromList(s,change.url||tab.url);});
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
