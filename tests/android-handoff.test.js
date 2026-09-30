const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const script = fs.readFileSync('android/app/src/main/assets/native-handoff.js', 'utf8');
async function run(options={}) {
  const saved=[];
  const fetched=[];
  const sandbox={ location: {origin:options.origin || 'https://mile.posnew.com',pathname:'/camera'}, Date, String, setTimeout, Blob,
    sessionStorage: {setItem(){}},
    fetch:async url=>{fetched.push(url);return {ok:!options.failed,blob:async()=>new Blob([options.oversize ? new Uint8Array(120001) : 'jpeg-bytes'],{type:'image/jpeg'})};},
    MileCameraStore:{save:async data=>{if(options.quota)throw new Error('Storage full');saved.push(data);}}
  };
  sandbox.window=sandbox;
  vm.createContext(sandbox);
  const manifest={id:'CAM-test',startedAt:new Date().toISOString(),deviceName:'QA',photos:Array.from({length:7},(_,i)=>({url:'/native/'+i,sequence:i+1,width:options.badDimensions ? 2048 : 1280,height:720}))};
  await vm.runInContext(script+'('+JSON.stringify(manifest)+')',sandbox);
  return {saved,fetched,state:sandbox.__mileNativeTransfer};
}
(async()=>{
  const success=await run(); assert.equal(success.saved[0].images.length,7); assert.equal(success.saved[0].aiModel,'gemini-3.8-flash'); assert.equal(success.state.state,'done'); assert.equal(success.saved[0].images[0].blob.type,'image/jpeg'); assert.equal('url' in success.saved[0].images[0],false);
  const badPhoto=await run({failed:true}); assert.equal(badPhoto.state.state,'error'); assert.equal(badPhoto.saved.length,0);
  const tooLarge=await run({oversize:true}); assert.equal(tooLarge.state.state,'error'); assert.equal(tooLarge.saved.length,0);
  const tooWide=await run({badDimensions:true}); assert.equal(tooWide.state.state,'error'); assert.equal(tooWide.saved.length,0);
  const quota=await run({quota:true}); assert.equal(quota.state.state,'error'); assert.equal(quota.saved.length,0);
  const badOrigin=await run({origin:'https://example.com'}); assert.equal(badOrigin.state.state,'error'); assert.equal(badOrigin.fetched.length,0);
  console.log('PASS Android handoff: 7 photos, original JPEG, Gemini default, failed image, storage failure, untrusted origin');
})().catch(e=>{console.error(e);process.exitCode=1;});
