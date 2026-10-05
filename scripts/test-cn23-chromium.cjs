/* Optional integration check against an isolated Chromium with the real extension.
 * Route interception serves a local fixture. This never creates a Mile transaction.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {chromium}=require(require.resolve('playwright',{paths:[process.env.RUNTIME_NODE_MODULES]}));
const ROOT=path.resolve(__dirname,'..'),OUT=path.join(ROOT,'.wrangler/chrome-compat-028');
const Q=require('../extensions/mile-cn23/queue.js'),XLSX=require('../extensions/mile-cn23/vendor/xlsx.full.min.js');
const milestone=process.argv[2]||'109',port=Number(process.argv[3]||9109);
const sample=(i,payment)=>({...Q.defaults,queue_id:'COMPAT-'+i,recipient_name:'PENERIMA '+i,recipient_phone:'0',recipient_address:'PENGALIHAN KERITANG',recipient_postcode:'29274',recipient_district:'KERITANG',recipient_village:'PENGALIHAN',recipient_city:'INDRAGIRI HILIR',recipient_province:'RIAU',sender_name:'PENGIRIM EXCEL',sender_phone:'0',sender_address:'BATAM',customer_mode:i===1?'RITEL':'KORPORAT',customer_code:i===1?'':'ACME',payment_method:payment,service_code:'PE',ref_no:'REF-'+i});
const rows=[sample(1,'CASH'),sample(2,'INVOICE'),sample(3,'CREDIT')];
const workbook=XLSX.utils.book_new();XLSX.utils.book_append_sheet(workbook,XLSX.utils.json_to_sheet(rows),'CN23_ANTREAN');
const workbookPath=path.join(OUT,'compat-queue-'+milestone+'.xlsx');fs.mkdirSync(OUT,{recursive:true});
fs.writeFileSync(workbookPath,new Uint8Array(XLSX.write(workbook,{type:'array',bookType:'xlsx'})));
const source=fs.readFileSync(path.join(ROOT,'tests/helpers/cn23-form-fixture.cjs'),'utf8');
const mount=source.slice(source.indexOf('  function mount(next={}) {'),source.indexOf('\n  mount();'));
assert.ok(mount.includes("select('COD'"));
const fixtureScript=`
const w=window,d=document;
let count=Number(localStorage.getItem('compat-count')||'0');
let filled=false,postal=count===1?'29276':'29274',zone='29274',regionOptions=null,
serviceOptions=['PKH','PEK - Produk lain','PE - Pos Express'],corporate=count>0,
payment='CREDIT',lateReference=count>0,transitionPayment=true,
submits=0,paymentOpens=0,enters=0;
const assert={equal(a,b,message){if(a!==b)throw new Error(message);}};
const onSubmit=()=>{
  const field=id=>Array.from(d.querySelectorAll('#'+id)).find(e=>!e.closest('[hidden]'));
  const list=JSON.parse(localStorage.getItem('compat-submits')||'[]');
  list.push({recipient:field('namapenerima').value,ref:field('ref_no').value,
    service:field('service').value,payment:d.querySelector('.select-payment input').value,
    sender:field('namapengirim').value,enters,postcode:d.querySelector('[placeholder="KODE POS"]').value});
  localStorage.setItem('compat-submits',JSON.stringify(list));
  localStorage.setItem('compat-count',String(count+1));
  location.href='https://expos.mile.app/transaction-list';
};
${mount}
mount();
`;
const html='<!doctype html><html><head><meta charset="utf-8"><style>body{font:14px Arial}input,textarea,button{margin:5px}li{padding:5px}.el-dialog{border:1px solid black;padding:20px}</style></head><body><script>'+fixtureScript+'</script></body></html>';
async function wait(fn,description,timeout=60000){const end=Date.now()+timeout;while(Date.now()<end){const value=await fn();if(value)return value;await new Promise(r=>setTimeout(r,100));}throw new Error('Timeout: '+description);}
let testBrowser;
async function main(){
  const browser=await wait(()=>chromium.connectOverCDP('http://127.0.0.1:'+port).catch(()=>null),'isolated browser startup',30000);
  testBrowser=browser;
  const context=browser.contexts()[0];
  // This browser uses a private test profile. Remove leftover fixture tabs so
  // panel activation and file upload always address the page under test.
  const page=await context.newPage();
  for(const existing of context.pages())if(existing!==page)await existing.close();
  const errors=[];
  await context.route('https://expos.mile.app/**',route=>route.fulfill({status:200,contentType:'text/html',body:route.request().url().endsWith('/new-transaction-custom')?html:'<!doctype html><body>Daftar Transaksi Uji</body>'}));
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(Q.FORM_URL);await page.evaluate(()=>localStorage.clear());await page.reload();
  const worker=await wait(()=>context.serviceWorkers().find(w=>w.url().endsWith('/background.js')),'extension service worker');
  const manifest=await worker.evaluate(()=>chrome.runtime.getManifest());
  assert.equal(manifest.version,Q.VERSION);assert.ok(Number(manifest.minimum_chrome_version)<=Number(milestone));
  await worker.evaluate(()=>new Promise(resolve=>chrome.storage.local.clear(resolve)));
  const tab=await worker.evaluate(()=>new Promise(resolve=>chrome.tabs.query({url:'https://expos.mile.app/*'},tabs=>resolve(tabs[0]))));
  const activated=await worker.evaluate(tabId=>new Promise(resolve=>chrome.tabs.sendMessage(tabId,{type:'CN23_PANEL_TOGGLE',tabId},resolve)),tab.id);
  assert.equal(activated.accepted,true);
  const cdp=await context.newCDPSession(page);
  async function element(id){
    const doc=await cdp.send('DOM.getDocument',{depth:-1,pierce:true});
    function search(node){const attrs=node.attributes||[];for(let i=0;i<attrs.length;i+=2)if(attrs[i]==='id'&&attrs[i+1]===id)return node;
      for(const child of [...(node.children||[]),...(node.shadowRoots||[])]){const found=search(child);if(found)return found;}}
    return search(doc.root);
  }
  const file=await wait(()=>element('file'),'upload menu');
  await wait(async()=>{
    const upload=await element('upload');
    return upload&&!((upload.attributes||[]).includes('disabled'));
  },'upload enabled after panel initialization');
  await cdp.send('DOM.setFileInputFiles',{files:[workbookPath],backendNodeId:file.backendNodeId});
  // Legacy CDP does not consistently dispatch chooser events for a closed
  // shadow root. Reproduce the events emitted by a real file picker.
  const fileObject=await cdp.send('DOM.resolveNode',{backendNodeId:file.backendNodeId});
  await cdp.send('Runtime.callFunctionOn',{objectId:fileObject.object.objectId,functionDeclaration:'function(){this.dispatchEvent(new Event("input",{bubbles:true}));this.dispatchEvent(new Event("change",{bubbles:true}))}'});
  const getState=()=>worker.evaluate(()=>new Promise(resolve=>chrome.storage.local.get('mileCn23Queue',value=>resolve(value.mileCn23Queue))));
  await wait(async()=>{const s=await getState();return s?.fileName===path.basename(workbookPath)&&s.rows.length===3;},'Excel imported');
  const start=await wait(async()=>{
    const button=await element('start');
    return button&&!((button.attributes||[]).includes('disabled'))?button:null;
  },'Start enabled after workbook import');
  const object=await cdp.send('DOM.resolveNode',{backendNodeId:start.backendNodeId});
  await cdp.send('Runtime.callFunctionOn',{objectId:object.object.objectId,functionDeclaration:'function(){this.click()}'});
  const state=await wait(async()=>{const s=await getState();if(s?.error)throw new Error(s.error);return s?.completedAt?s:null;},'three real extension transactions');
  assert.equal(state.rows.length,3);assert.ok(state.rows.every(row=>row.status==='done'));
  assert.equal(state.active,null);assert.equal(state.running,false);
  const submitted=await wait(()=>page.evaluate(()=>JSON.parse(localStorage.getItem('compat-submits')||'[]')).catch(()=>null),'completed submissions after final navigation');
  assert.equal(submitted.length,3);
  submitted.forEach((s,i)=>{
    assert.equal(s.recipient,rows[i].recipient_name);assert.equal(s.ref,rows[i].ref_no);
    assert.equal(s.service,'PE - Pos Express');assert.equal(s.payment,['Cash','Invoice','CREDIT'][i]);
    assert.equal(s.sender,i===0?'PENGIRIM EXCEL':'PELANGGAN RESMI');assert.equal(s.enters,i===0?0:1);
    assert.equal(s.postcode,i===1?'29276':'29274');
  });
  assert.deepEqual(errors,[]);
  const result={browser:browser.version(),manifest:manifest.version,minimumChrome:manifest.minimum_chrome_version,milestone,shipments:3,submissions:submitted,pageErrors:errors,productionTransactions:false};
  fs.writeFileSync(path.join(OUT,'result-chromium-'+milestone+'.json'),JSON.stringify(result,null,2));
  await wait(async()=>{try {await page.screenshot({path:path.join(OUT,'chromium-'+milestone+'-finished.png'),fullPage:true});return true;}catch{return false;}},'final page screenshot');
  console.log(JSON.stringify(result));
  await browser.close();
}
main().catch(async error=>{console.error(error.stack);await testBrowser?.close();process.exitCode=1;});
