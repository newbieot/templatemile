const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'assets/js/ai-pdf-beta-r2.js'), 'utf8');
const cameraHtml = fs.readFileSync(path.join(root, 'camera.html'), 'utf8');
const cameraRuntime = fs.readFileSync(path.join(root, 'assets/js/camera.js'), 'utf8');
const reviewHtml = fs.readFileSync(path.join(root, 'review.html'), 'utf8');

const values = {
  aiModel: 'gemini-3.8-flash',
  aiAccuracyMode: 'auto',
  aiSpeedPreset: 'fast',
  aiPagesPerRequest: '4',
  aiConcurrency: '5',
  aiNetworkMode: 'unstable'
};
const elements = new Map();
const element = id => {
  if (!elements.has(id)) {
    elements.set(id, {
      value: values[id] || '',
      checked: false,
      disabled: false,
      hidden: false,
      style: {},
      dataset: {},
      classList: { add() {}, remove() {}, toggle() {} },
      addEventListener() {},
      setAttribute() {},
      removeAttribute() {},
      focus() {}
    });
  }
  return elements.get(id);
};

const sandbox = {
  console,
  Intl,
  Date,
  Math,
  JSON,
  Map,
  Set,
  Headers,
  Response,
  Blob,
  AbortController,
  DOMException,
  TextEncoder,
  performance,
  navigator: { onLine: true },
  document: {
    body: { classList: { contains(name) { return name === 'camera-mode'; } } },
    addEventListener() {},
    getElementById(id) { return element(id); },
    querySelectorAll() { return []; }
  },
  localStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} },
  alert() {},
  setTimeout,
  clearTimeout,
  setInterval,
  clearInterval
};
sandbox.window = sandbox;
const requests=[];
sandbox.document.body.dataset={};
sandbox.__mileCore={uploadedFilesManager:[],getDestinationMode(){return 'batam';},cleanArtifacts:value=>String(value || '').toUpperCase(),resolveZipCode:()=> '29444',updateInterface(){},processNextInQueue(){}};
sandbox.fetch=async()=>({ok:true,json:async()=>({ok:true,cosmosConfigured:true,firebaseConfigured:true,sessionConfigured:true,serverSideGate:true})});
sandbox.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(buffer=>{this.result='data:image/jpeg;base64,'+Buffer.from(buffer).toString('base64');this.onload();});}};
sandbox.XMLHttpRequest=class{
 constructor(){this.upload={};}open(){}setRequestHeader(){}getResponseHeader(name){return name==='content-type'?'application/json':'';}
 send(raw){const body=JSON.parse(raw).body,images=body.messages[1].content.filter(part=>part.type==='image_url');requests.push(images.map(part=>part.image_url.url));
 const recipient=(page)=>({page,nama_penerima:'PENERIMA FOTO '+page,alamat_penerima:'JL MERDEKA '+page+' BATAM 29444',confidence:0.95});
 let rows;
 if(images.length===4)rows=[recipient(1),recipient(2)];
 else if(images.length===2)rows=[{page:3,nama_penerima:'',alamat_penerima:''},{page:4,nama_penerima:'PERLU DICEK',alamat_penerima:'PERLU DICEK'}];
 else{const page=Buffer.from(images[0].image_url.url.split(',')[1],'base64')[0];rows=[{...recipient(page),page:1}];}
 this.responseText=JSON.stringify({choices:[{message:{content:JSON.stringify({rows})}}],usage:{prompt_tokens:100,completion_tokens:100}});this.status=200;this.statusText='OK';setTimeout(()=>this.onload(),0);
 }
};
vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: 'ai-pdf-beta-r2.js' });


(async()=>{
  const images=Array.from({length:4},(_,i)=>({blob:new Blob([new Uint8Array([i+1])],{type:'image/jpeg'}),fileName:(i+1)+'.jpg'}));
  const metrics=await sandbox.MileAI.processCameraImages(images);
  assert.equal(metrics.status,'SUCCESS',metrics.message);assert.equal(metrics.totalRows,4);assert.equal(metrics.recoveryAttempts,2);
  const rows=sandbox.__mileCore.uploadedFilesManager[0].rows;
  assert.deepEqual(Array.from(rows,row=>row.sourcePage),[1,2,3,4]);assert.deepEqual(Array.from(rows,row=>row.name),[1,2,3,4].map(page=>'PENERIMA FOTO '+page));
  assert.deepEqual(requests.map(images=>images.length),[4,2,1,1]);assert.equal(requests[2][0],requests[0][2]);assert.equal(requests[3][0],requests[0][3]);
  assert.equal(rows.some(row=>row.aiExtractionFailed),false);console.log('PASS actual camera pipeline: four original photos, partial batch, blank audit, isolated original JPEG retries, complete ordered recipients');
})().catch(error=>{console.error(error);process.exitCode=1;});
