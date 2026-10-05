'use strict';
const fs=require('node:fs'),vm=require('node:vm');
function loadWorker(context) {
  context.importScripts=(...files)=>{
    for(const file of files) vm.runInContext(fs.readFileSync('extensions/mile-cn23/'+file,'utf8'),context,{filename:file});
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync('extensions/mile-cn23/background.js','utf8'),context,{filename:'background.js'});
}
function callbackOnly(chrome,{omitAccessLevel=false}={}) {
  if(omitAccessLevel) delete chrome.storage?.local?.setAccessLevel;
  for(const [owner,methods] of [[chrome.runtime,['sendMessage']],[chrome.storage?.local,['get','set','setAccessLevel']],[chrome.tabs,['get','update','sendMessage']],[chrome.action,['setBadgeText','setTitle']]]) {
    for(const method of methods) {
      if(typeof owner?.[method]!=='function') continue;
      const original=owner[method];
      owner[method]=function(...args) {
        const callback=args.pop();
        if(typeof callback!=='function') throw new Error('Older Chrome requires a callback: '+method);
        Promise.resolve().then(()=>original.apply(this,args)).then(value=>callback(value),error=>{
          chrome.runtime.lastError={message:error.message};
          try {callback();} finally {delete chrome.runtime.lastError;}
        });
        return undefined;
      };
    }
  }
}
module.exports={loadWorker,callbackOnly};
