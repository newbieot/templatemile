'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function api(crypto=require('node:crypto').webcrypto) {
  const context={crypto,chrome:{runtime:{}}};vm.createContext(context);
  vm.runInContext(fs.readFileSync('extensions/mile-cn23/compat.js','utf8'),context);
  return {C:context.MileCN23Compat,chrome:context.chrome};
}
test('old callback APIs are awaited until the callback and invoked exactly once',async()=>{
  const {C}=api();let calls=0,release;
  const owner={value:42,get(key,callback){calls++;assert.equal(this,owner);assert.equal(key,'queue');release=()=>callback({value:this.value});}};
  let resolved=false;const result=C.call(owner,'get','queue').then(value=>{resolved=true;return value;});
  await Promise.resolve();assert.equal(resolved,false);assert.equal(calls,1);
  release();assert.deepEqual(await result,{value:42});assert.equal(calls,1);
});
test('Chrome callback lastError becomes a rejection instead of silent queue corruption',async()=>{
  const {C,chrome}=api();
  const owner={get(_key,callback){chrome.runtime.lastError={message:'Storage unavailable'};callback();delete chrome.runtime.lastError;}};
  await assert.rejects(C.call(owner,'get','queue'),/Storage unavailable/);
});
test('Chrome missing receivers reject so navigation can retry instead of hanging',async()=>{
  const {C,chrome}=api();
  const owner={sendMessage(_tab,_message,callback){chrome.runtime.lastError={message:'Receiving end does not exist'};callback();delete chrome.runtime.lastError;}};
  await assert.rejects(C.call(owner,'sendMessage',7,{}),/Receiving end does not exist/);
});
test('callback and Promise completion cannot cause a second API call or a second result',async()=>{
  const {C}=api();let calls=0;
  const owner={get(callback){calls++;callback('first');return Promise.resolve('later');}};
  assert.equal(await C.call(owner,'get'),'first');assert.equal(calls,1);
});
test('secure UUID fallback works without randomUUID on Chrome 88',()=>{
  const crypto=require('node:crypto').webcrypto;
  const {C}=api({getRandomValues:array=>crypto.getRandomValues(array)});
  const ids=Array.from({length:1000},()=>C.uuid());assert.equal(new Set(ids).size,1000);
  assert.ok(ids.every(id=>/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id)));
});
test('manifest supports Chrome 109+ and loads compatibility helpers before consumers',()=>{
  const m=JSON.parse(fs.readFileSync('extensions/mile-cn23/manifest.json','utf8'));
  assert.equal(m.minimum_chrome_version,'109');assert.equal(m.manifest_version,3);
  const files=m.content_scripts[0].js;
  for(const name of ['ui.js','form.js'])assert.ok(files.indexOf('compat.js')<files.indexOf(name));
  assert.match(fs.readFileSync('extensions/mile-cn23/background.js','utf8'),/importScripts\('compat.js','queue.js'\)/);
});
