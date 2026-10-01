(() => {
  'use strict';
  if (!MileCN23.receiptId(location.href)) return;
  let sent = false;
  async function inspect() {
    if (sent) return;
    const section = document.getElementById('section-to-print');
    if (!section?.innerText.trim()) return;
    const text = section.innerText;
    const codes = [...new Set(text.match(/\b[A-Z]\d{10,20}\b/g) || [])];
    const transactionCode = text.match(/Kode\s*Transaksi\s*:\s*(\d+)/i)?.[1];
    if (codes.length !== 1 || !transactionCode) return;
    sent = true;
    try { await chrome.runtime.sendMessage({ type:'RECEIPT', evidence:{ code:codes[0], transactionCode, text } }); } catch (_) { sent = false; }
  }
  const observer = new MutationObserver(() => { void inspect(); });
  observer.observe(document.documentElement, { subtree:true, childList:true, characterData:true });
  void inspect();
})();
