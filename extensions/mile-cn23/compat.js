/* Chrome 88+ supports Manifest V3, but several APIs gained Promises later. */
(function(root) {
  'use strict';
  function call(owner, method, ...args) {
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (error, value) => {
        if (settled) return;
        settled = true;
        if (error) reject(new Error(error.message || String(error)));
        else resolve(value);
      };
      const callback = value => {
        // lastError only exists while Chrome is invoking this callback.
        const error = root.chrome.runtime.lastError;
        finish(error, value);
      };
      try {
        // Invoke once, with a callback accepted by both older and newer Chrome.
        const result = owner[method](...args, callback);
        if (result && typeof result.then === 'function') {
          result.then(value => finish(null, value), error => finish(error));
        }
      } catch (error) { finish(error); }
    });
  }
  function uuid() {
    if (typeof root.crypto.randomUUID === 'function') return root.crypto.randomUUID();
    const bytes = root.crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
  }
  root.MileCN23Compat = Object.freeze({call, uuid});
})(typeof globalThis !== 'undefined' ? globalThis : this);
