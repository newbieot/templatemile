'use strict';
importScripts('compat.js','queue.js');
const Q=MileCN23, C=MileCN23Compat, KEY='mileCn23Queue';
let chain=Promise.resolve();
const serial=fn=>{const p=chain.then(fn);chain=p.catch(()=>{});return p;};
const blank=()=>({version:5,helperVersion:Q.VERSION,rows:[],running:false,active:null,error:'',options:{autoAdvance:true,autoSubmit:true,maxCost:0}});
async function save(s){await C.call(chrome.storage.local,'set',{[KEY]:s});return s;}
async function read(){
  const old=(await C.call(chrome.storage.local,'get',KEY))[KEY];
  // User requested removal of the previous Excel cache and receipt records.
  if(!old||old.version!==5)return save({...blank(),tabId:old?.tabId,panelOpen:true});
  return old;
}
function checkPanel(sender){if(sender.id!==chrome.runtime.id||!sender.tab?.id||!sender.url?.startsWith('https://expos.mile.app/'))throw new Error('Gunakan menu ekstensi pada tab Mile.');}
function checkActive(s,m,sender){if(!s.active||s.active.token!==m.token||sender.tab?.id!==s.tabId)throw new Error('Pesan bukan dari kiriman aktif.');}
async function start(s){
  if(s.active)throw new Error('Masih ada kiriman aktif.');
  const tab=await C.call(chrome.tabs,'get',s.tabId).catch(()=>null);
  if(tab?.url!==Q.FORM_URL)throw new Error('Buka form Transaksi CN23 pada tab Mile.');
  const row=s.rows.find(r=>r.status==='ready');if(!row)return finishBatch(s);
  row.status='filling';row.error='';
  s.active={id:row.id,token:C.uuid(),startedAt:Date.now(),phase:'filling'};
  s.running=true;s.error='';s.panelOpen=true;s.formReady=false;delete s.completedAt;delete s.completionDismissedAt;delete s.waitingNewForm;delete s.formWait;
  await save(s);
  try{
    const ack=await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_FILL',token:s.active.token,row:row.data,options:s.options});
    if(!ack?.accepted)throw new Error(ack?.error||'Form belum siap menerima antrean.');
    s.active.formId=ack.formId;s.active.pageId=ack.pageId;await save(s);
  }catch(error){row.status='error';row.error=error.message;s.error=error.message;s.running=false;s.active=null;await save(s);}
  return s;
}
async function finishBatch(s){
  s.running=false;s.active=null;s.completedAt=s.completedAt||Date.now();delete s.waitingNewForm;delete s.formWait;
  await save(s);
  await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_BATCH_DONE',total:s.rows.length,completedAt:s.completedAt}).catch(()=>{});
  if(chrome.action.setBadgeText)await C.call(chrome.action,'setBadgeText',{tabId:s.tabId,text:'OK'});
  return s;
}
function freshForm(s,probe){
  if(probe?.version!==Q.VERSION||!probe.ready||!probe.blank||probe.path!=='/new-transaction-custom')return false;
  if(probe.busy&&!(probe.submitted&&probe.token===s.active?.token))return false;
  return !s.active||Boolean(probe.formId&&probe.formId!==s.active.formId);
}
async function resumeWaiting(s){
  if(!s.running||!s.waitingNewForm||s.active)return s;
  const tab=await C.call(chrome.tabs,'get',s.tabId).catch(()=>null);if(tab?.url!==Q.FORM_URL)return s;
  const probe=await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_PROBE'}).catch(()=>null);
  if(freshForm(s,probe)){s.formReady=true;return start(s);}
  s.formWait=probe?.missing?.length?'Menunggu kolom '+probe.missing.join(', '):'Menunggu form CN23 kosong siap';return save(s);
}
async function advance(s,via,formAlreadyReady=false){
  if(!s.active?.submittedAt)return s;
  const row=s.rows.find(r=>r.id===s.active.id);
  row.status='done';row.error='';row.confirmation={via,at:Date.now()};
  s.active=null;s.error='';s.formReady=formAlreadyReady;
  s.waitingNewForm=Boolean(s.running&&s.rows.some(r=>r.status==='ready'));
  await save(s); // Persist the next cursor BEFORE navigation destroys this document.
  await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_FINISHED'}).catch(()=>{});
  if(!s.running)return s;
  if(!s.waitingNewForm)await finishBatch(s);
  const tab=await C.call(chrome.tabs,'get',s.tabId).catch(()=>null);
  if(tab?.url!==Q.FORM_URL)await C.call(chrome.tabs,'update',s.tabId,{url:Q.FORM_URL,active:true});
  else if(s.waitingNewForm)await resumeWaiting(s);
  return s;
}
async function inspectNavigation(s,url){
  if(url==='https://expos.mile.app/transaction-list'&&s.active?.submittedAt)return advance(s,'MILE_TRANSACTION_LIST');
  if(url===Q.FORM_URL&&s.active?.submittedAt){
    const probe=await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_PROBE'}).catch(()=>null);
    if(freshForm(s,probe))return advance(s,'NEW_CN23_FORM',true);
  }
  return resumeWaiting(s);
}
async function command(m,sender){
  let s=await read();
  if(['GET','IMPORT','RUN','PAUSE','RESET','PANEL_VISIBILITY','DISMISS_COMPLETION'].includes(m.type))checkPanel(sender);
  if(m.type==='RECEIPT'||m.type==='RECEIPT_STATUS')return {ignored:true}; // Ignore stale scripts; never inspect print tabs.
  if(m.type==='PAGE_READY'){
    if(sender.tab?.id!==s.tabId)return {ignored:true};
    s=await inspectNavigation(s,sender.tab.url);
    const openPanel=Boolean(s.resetPanel||s.panelOpen||s.running||s.active||s.waitingNewForm);s.resetPanel=false;await save(s);
    return {openPanel,tabId:s.tabId,running:s.running,completedAt:s.completedAt,completionDismissedAt:s.completionDismissedAt,total:s.rows.length,done:s.rows.filter(r=>r.status==='done').length};
  }
  if(m.type==='DISMISS_COMPLETION'){
    if(sender.tab.id!==s.tabId||!s.completedAt||m.completedAt!==s.completedAt)return {ignored:true};
    s.completionDismissedAt=Date.now();return save(s);
  }
  if(m.type==='PANEL_VISIBILITY'){s.panelOpen=Boolean(m.open);return save(s);}
  if(m.type==='GET'){
    const tab=await C.call(chrome.tabs,'get',s.tabId).catch(()=>null);s=await inspectNavigation(s,tab?.url);
    if(Q.recoverInterrupted(s))await save(s);return s;
  }
  if(m.type==='IMPORT'){
    if(s.active||s.running||s.rows.some(r=>!['ready','done'].includes(r.status))||(s.rows.some(r=>r.status==='done')&&s.rows.some(r=>r.status!=='done')))throw new Error('Klik Reset untuk mengganti antrean lama.');
    return save({...blank(),panelOpen:true,tabId:sender.tab.id,batchId:String(m.batchId),fileName:String(m.fileName),rows:Q.validateRows(m.rows)});
  }
  if(m.type==='RESET'){
    const next={...blank(),tabId:s.tabId||sender.tab.id,resetPanel:Boolean(s.active),panelOpen:true};
    await save(next); // Revokes the old token and clears ALL Excel and legacy records.
    await C.call(chrome.tabs,'sendMessage',next.tabId,{type:'CN23_RESET',token:s.active?.token}).catch(()=>{});
    if(s.active)await C.call(chrome.tabs,'update',next.tabId,{url:Q.FORM_URL,active:true});return next;
  }
  if(m.type==='RUN'){
    s.tabId=sender.tab.id;s.options={autoAdvance:true,autoSubmit:true,maxCost:0};
    if(s.active?.submittedAt){s.running=true;s.error='';await save(s);return inspectNavigation(s,(await C.call(chrome.tabs,'get',s.tabId)).url);}
    if(s.active)throw new Error('Masih ada kiriman aktif.');
    s.rows.filter(r=>r.status==='error').forEach(r=>{r.status='ready';r.error='';});
    if(s.rows.some(r=>r.status==='unknown'))throw new Error('Klik Reset; periksa transaksi yang belum pasti di daftar transaksi Mile.');
    if(!s.rows.some(r=>r.status==='ready'))throw new Error('Tidak ada kiriman baru untuk diproses.');
    s.running=true;s.panelOpen=true;s.error='';s.waitingNewForm=true;await save(s);
    const probe=await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_PROBE'}).catch(()=>null);
    if(freshForm(s,probe))return start(s);
    const tab=await C.call(chrome.tabs,'get',s.tabId);
    if(tab.url!==Q.FORM_URL||(probe?.ready&&probe.blank===false))await C.call(chrome.tabs,'update',s.tabId,{url:Q.FORM_URL,active:true});
    return resumeWaiting(s);
  }
  if(m.type==='PAUSE'){s.running=false;await save(s);if(s.active)await C.call(chrome.tabs,'sendMessage',s.tabId,{type:'CN23_PAUSE',token:s.active.token}).catch(()=>{});return s;}
  if(m.type==='PROGRESS'){
    checkActive(s,m,sender);
    if(m.customerResolved){
      const row=s.rows.find(r=>r.id===s.active.id);
      if(row.data.customer_mode!=='KORPORAT'||s.active.phase!=='customer_loading')throw new Error('Pelanggan belum dimuat.');
      for(const key of ['sender_name','sender_phone','sender_address']){const value=String(m.customerResolved[key]||'').trim();if(!value||value.length>1000)throw new Error('Data pengirim pelanggan belum lengkap.');row.data[key]=value;}
    }
    s.active.phase=String(m.phase);if(sender.documentId)s.active.documentId=sender.documentId;return save(s);
  }
  if(m.type==='FILLED'){checkActive(s,m,sender);s.rows.find(r=>r.id===s.active.id).status='review';s.active.phase='payment_ready';s.active.startedAt=Date.now();if(sender.documentId)s.active.documentId=sender.documentId;return save(s);}
  if(m.type==='SUBMIT_INTENT'){
    checkActive(s,m,sender);if(s.active.submittedAt)throw new Error('Selesai sudah ditekan; jangan kirim ulang.');
    const row=s.rows.find(r=>r.id===s.active.id);if(row.status!=='review')throw new Error('Pengisian belum selesai.');
    row.status='awaiting_navigation';s.active.phase='awaiting_navigation';s.active.submittedAt=Date.now();s.active.startedAt=Date.now();return save(s);
  }
  if(m.type==='FORM_ERROR'){checkActive(s,m,sender);const row=s.rows.find(r=>r.id===s.active.id);row.status=s.active.submittedAt?'unknown':'error';row.error=String(m.error).slice(0,1000);s.error=row.error;s.running=false;if(!s.active.submittedAt)s.active=null;return save(s);}
  if(m.type==='FORM_READY'){
    if(sender.tab?.id!==s.tabId||!freshForm(s,m))return {ignored:true};
    if(s.active?.submittedAt)return advance(s,'NEW_CN23_FORM',true);
    if(s.active)return {ignored:true};
    s.formReady=true;if(s.running&&s.waitingNewForm)return start(s);return save(s);
  }
  throw new Error('Perintah tidak dikenal.');
}
chrome.runtime.onMessage.addListener((m,sender,respond)=>{if(!m||typeof m.type!=='string')return false;serial(()=>command(m,sender)).then(data=>respond({ok:true,data}),error=>respond({ok:false,error:error.message}));return true;});
chrome.action.onClicked.addListener(tab=>{void serial(async()=>{
  if(!tab?.url?.startsWith('https://expos.mile.app/')){await C.call(chrome.action,'setBadgeText',{text:'MILE'});await C.call(chrome.action,'setTitle',{title:'Buka tab Mile yang sudah login.'});return;}
  const ack=await C.call(chrome.tabs,'sendMessage',tab.id,{type:'CN23_PANEL_TOGGLE',tabId:tab.id}).catch(()=>null);
  if(!ack?.accepted){await C.call(chrome.action,'setBadgeText',{tabId:tab.id,text:'↻'});await C.call(chrome.action,'setTitle',{tabId:tab.id,title:'Muat ulang tab Mile untuk memakai ekstensi terbaru.'});}
  else await C.call(chrome.action,'setBadgeText',{tabId:tab.id,text:''});
});});
chrome.tabs.onUpdated?.addListener((id,change,tab)=>{if(!change.url&&change.status!=='complete')return;void serial(async()=>{const s=await read();if(id===s.tabId)await inspectNavigation(s,change.url||tab.url);});});
chrome.alarms.onAlarm.addListener(alarm=>{if(alarm.name==='cn23-watch')void serial(async()=>{let s=await read();const tab=await C.call(chrome.tabs,'get',s.tabId).catch(()=>null);s=await inspectNavigation(s,tab?.url);if(Q.recoverInterrupted(s))await save(s);});});
chrome.runtime.onInstalled.addListener(()=>{if(typeof chrome.storage.local.setAccessLevel==='function')void C.call(chrome.storage.local,'setAccessLevel',{accessLevel:'TRUSTED_CONTEXTS'}).catch(()=>{});void chrome.alarms.create('cn23-watch',{periodInMinutes:1});void serial(read);});
chrome.runtime.onStartup.addListener(()=>{void chrome.alarms.create('cn23-watch',{periodInMinutes:1});});
