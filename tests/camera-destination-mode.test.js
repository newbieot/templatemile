const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..');
const sessionId = 'CAM-12345678-1234-1234';
const jpeg = new Blob(['fixture'], { type: 'image/jpeg' });
const flush = () => new Promise(resolve => setImmediate(resolve));

function environment(mode = 'batam', session = null) {
  const elements = new Map();
  const listeners = {};
  const notifications = [];
  const saved = [];
  const calls = [];
  let stored = session;
  let serverBatch = null;
  const classList = { add() {}, remove() {}, toggle() {}, contains() { return false; } };
  const document = {
    title: 'Fixture', visibilityState: 'visible', body: { classList, dataset: {} },
    documentElement: { classList },
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, {
        id, value: '', type: 'text', checked: false, hidden: false, style: {}, dataset: {}, classList,
        textContent: '', children: [], addEventListener() {},
        dispatchEvent(event) {
          calls.push({ event: id, value: this.value });
          for (const listener of listeners[event.type] || []) listener({ type: event.type, target: this });
        }
      });
      return elements.get(id);
    },
    querySelector() { return null; }, querySelectorAll() { return []; },
    addEventListener(type, listener) { (listeners[type] ||= []).push(listener); }
  };
  const selector = document.getElementById('destinationMode');
  selector.type = 'select-one'; selector.value = mode;
  for (const [id, value] of Object.entries({ clientMode: 'KORPORAT', corporateTemplate: 'MANUAL', itemType: 'DOKUMEN', serviceCode: 'PKH', cn23PaymentMethod: 'CREDIT' })) document.getElementById(id).value = value;
  document.getElementById('useInsurance').type = 'checkbox';
  const core = { uploadedFilesManager: [], tempExtractedRows: [], updateInterface() {
    calls.push({ render: true, mode: selector.value, rows: core.uploadedFilesManager.flatMap(file => file.rows).length });
  } };
  const store = {
    async get() { return stored; }, async latestDraft() { return stored?.draft ? stored : null; },
    async save(value) { saved.push(value); stored = value; }, async remove() { stored = null; },
    async cleanup() {}
  };
  const location = { pathname: '/review', search: `?cameraSession=${sessionId}`, hash: '', assign(url) { calls.push({ navigation: url }); }, replace() {} };
  const shortTimeout = (fn, delay) => { if (delay <= 80) queueMicrotask(fn); return 1; };
  const window = {
    location, __mileCore: core, MileCameraStore: store, MileCameraCore: {},
    MileCameraPhoto: { fileExtension() { return 'jpg'; } },
    setTimeout: shortTimeout, clearTimeout() {}, addEventListener() {},
    showToast(message, type) { notifications.push({ message, type }); },
    history: { replaceState(_state, _title, url) { location.search = new URL(url, 'https://fixture.test').search; } }
  };
  const sandbox = {
    window, document, navigator: {}, console, Date, Blob, URL, URLSearchParams, Promise,
    setTimeout: shortTimeout, clearTimeout() {},
    Event: class { constructor(type) { this.type = type; } },
    File: class extends Blob { constructor(parts, name, options) { super(parts, options); this.name = name; } },
    sessionStorage: { getItem() { return ''; }, setItem() {} }, localStorage: { getItem() { return ''; }, setItem() {} },
    fetch: async (_url, options) => {
      if (options?.method === 'POST') {
        serverBatch = JSON.parse(options.body);
        return { json: async () => ({ ok: true }) };
      }
      return { json: async () => ({ ok: true, batch: serverBatch }) };
    }
  };
  vm.createContext(sandbox);
  function run(file, instrumentation = '') {
    let source = fs.readFileSync(path.join(root, file), 'utf8');
    if (instrumentation) {
      const end = source.lastIndexOf('})();');
      source = source.slice(0, end) + instrumentation + source.slice(end);
    }
    vm.runInContext(source, sandbox, { filename: file });
  }
  return { window, document, selector, core, saved, calls, notifications, run,
    get stored() { return stored; }, get serverBatch() { return serverBatch; }, set serverBatch(value) { serverBatch = value; } };
}

async function captureSnapshots() {
  for (const requested of ['', 'batam', 'cn23', 'mixed']) {
    const env = environment('batam');
    env.window.location.search = requested ? `?destinationMode=${requested}` : '';
    env.run('assets/js/camera.js', 'updateBatchUi = () => {}; restoreLatestDraft = async () => false; window.bindCameraFixture = bind;');
    env.window.bindCameraFixture();
    assert.equal(env.selector.value, requested || 'mixed', 'New web captures support both destinations; explicit choices are respected.');
  }
  for (const mode of ['batam', 'cn23', 'mixed']) {
    const env = environment(mode);
    env.run('assets/js/camera.js', `
      updateBatchUi = () => {}; exitCameraFullscreen = () => {};
      updateProcessingStatus = () => {}; showHudToast = () => {};
      setFinishDisabled = () => {}; setCaptureDisabled = () => {};
      window.cameraFixture = { persistDraftSnapshot, finishCapturing, restoreLatestDraft,
        seed() { sessionId = '${sessionId}'; sessionStartedAt = new Date().toISOString();
          captures = [{ captureId: 'capture-1', blob: window.fixturePhoto, width: 10, height: 10, sequence: 1 }]; },
        reset() { sessionId = ''; captures = []; finalizingBatch = false; } };
    `);
    env.window.fixturePhoto = jpeg;
    env.window.cameraFixture.seed();
    await env.window.cameraFixture.persistDraftSnapshot();
    assert.equal(env.saved[0].destinationMode, mode);
    assert.equal(env.saved[0].form.destinationMode, mode);
    assert.equal(env.saved[0].draftCaptures[0].blob, jpeg);
    await env.window.cameraFixture.finishCapturing();
    assert.equal(env.stored.destinationMode, mode);
    assert.equal(env.stored.form.destinationMode, mode);
    assert.equal(env.stored.images.length, 1);
    assert.equal(env.stored.images[0].blob, jpeg);
  }
  for (const savedMode of ['mixed', undefined]) {
    const draft = { id: sessionId, draft: true, createdAt: Date.now(), draftCaptures: [{ blob: jpeg, captureId: 'restored' }], destinationMode: savedMode };
    const env = environment('cn23', draft);
    env.run('assets/js/camera.js', 'updateBatchUi = () => {}; toast = () => {}; window.restoreFixture = restoreLatestDraft;');
    assert.equal(await env.window.restoreFixture(), true);
    assert.equal(env.selector.value, savedMode || 'batam', 'Legacy camera drafts must restore Batam, not inherit the current selector.');
  }
}

async function importProfiles() {
  for (const input of ['images', 'pdfBlob', 'streamedRows']) {
    for (const mode of ['cn23', 'mixed', undefined]) {
      const session = { id: sessionId, createdAt: Date.now(), captureCount: 1, destinationMode: mode };
      session[input] = input === 'images' ? [{ blob: jpeg }] : input === 'pdfBlob' ? jpeg : [{ name: 'RECIPIENT', address: 'PENGALIHAN KERITANG', noSurat: 'ROW-REF' }];
      const env = environment('mixed', session);
      const extractionModes = [];
      const extract = async () => {
        extractionModes.push(env.selector.value);
        env.core.uploadedFilesManager.push({ rows: [{ name: 'RECIPIENT', noSurat: 'ROW-REF' }] });
        return { status: 'SUCCESS' };
      };
      env.window.MileAI = { processCameraImages: extract, processPDFFile: extract };
      env.window.MileCameraSync = { async saveBatchResults() { extractionModes.push(env.selector.value); } };
      env.run('assets/js/camera-import-v2.js', 'window.importFixture = importCameraBatch;');
      await env.window.importFixture();
      assert.equal(env.selector.value, mode || 'batam');
      assert.ok(extractionModes.length > 0);
      assert.ok(extractionModes.every(value => value === (mode || 'batam')), 'Mode must be restored before extraction, render and sync.');
      assert.equal(env.core.uploadedFilesManager[0].rows[0].noSurat, 'ROW-REF');
      assert.equal(env.notifications.some(item => item.type === 'error'), false);
    }
  }
  const env = environment('batam', { id: sessionId, createdAt: Date.now(), captureCount: 1, images: [{ blob: jpeg }] });
  env.window.MileAI = { async processCameraImages() { return { status: 'FAILED' }; }, async processPDFFile() {} };
  env.run('assets/js/camera-import-v2.js', 'window.importFixture = importCameraBatch;');
  await env.window.importFixture();
  env.selector.value = 'mixed'; env.selector.dispatchEvent(new Event('change'));
  await flush();
  assert.equal(env.stored.destinationMode, 'mixed', 'Explicit profile changes must survive retry after failed extraction.');
  assert.equal(env.stored.images.length, 1);
}

async function cloudProfilesAndReview() {
  const address = 'PENGALIHAN KERITANG';
  const recipient = { name: 'RECIPIENT', address, noSurat: 'ROW-REF', outsideBatam: true,
    _rowId: 'stable-row', _nationalPostcodeQuery: '', _printedPostcode: '29274', postcodeSource: 'label',
    _confirmedNationalPostcode: { sourceKey: `${address}\n`, selected: { postcode: '29274', city: 'INDRAGIRI HILIR' } },
    aiReviewFields: ['alamat_penerima'], needsVerification: true, _aiReviewHydrated: true,
    _reviewState: { address: { pending: false } } };
  for (const mode of ['batam', 'cn23', 'mixed']) {
    const env = environment(mode);
    env.core.uploadedFilesManager.push({ rows: [structuredClone(recipient)] });
    env.run('assets/js/camera-sync.js');
    await env.window.MileCameraSync.saveBatchResults(sessionId, 1, Date.now(), 'Fixture', 2);
    assert.equal(env.serverBatch.reviewCount, 0, 'A reviewed destination must not retain the original AI warning in summaries.');
    assert.equal(env.serverBatch.cleanCount, mode === 'batam' ? 0 : 1, 'Confirmed outside destinations count as ready only in national modes.');
    assert.equal(env.serverBatch.outsideBatamCount, 1, 'The outside flag remains informational.');
    env.selector.value = 'batam'; env.core.uploadedFilesManager.length = 0;
    await env.window.MileCameraSync.loadBatchToDesktop(sessionId);
    assert.equal(env.selector.value, mode);
    assert.equal(env.document.getElementById('cn23PaymentMethod').value, 'CREDIT');
    const arrived = env.core.uploadedFilesManager[0].rows[0];
    assert.equal(arrived._rowId, recipient._rowId);
    assert.equal(arrived._confirmedNationalPostcode.sourceKey, recipient._confirmedNationalPostcode.sourceKey);
    assert.equal(arrived._printedPostcode, '29274');
    assert.equal(arrived.noSurat, 'ROW-REF');
    assert.equal(env.calls.findLast(call => call.render)?.mode, mode);
  }
  const env = environment('mixed');
  env.run('assets/js/camera-sync.js');
  env.serverBatch = { rows: [recipient], form: { clientMode: 'KORPORAT', itemType: 'DOKUMEN' } };
  await env.window.MileCameraSync.loadBatchToDesktop(sessionId);
  assert.equal(env.selector.value, 'batam', 'Cloud batches without a profile must retain legacy Batam behavior.');
  for (const mode of ['cn23', 'mixed']) {
    const staleEnv = environment(mode);
    const stale = structuredClone(recipient);
    stale.address = 'SUKAMAJU';
    staleEnv.core.uploadedFilesManager.push({ rows: [stale] });
    staleEnv.run('assets/js/camera-sync.js');
    await staleEnv.window.MileCameraSync.saveBatchResults(sessionId, 1, Date.now(), 'Fixture', 2);
    assert.equal(staleEnv.serverBatch.cleanCount, 0, 'A selected region for an older address cannot make the edited destination ready.');
    assert.equal(staleEnv.serverBatch.reviewCount, 0, 'Destination calculation does not require operator text correction.');
    assert.equal(staleEnv.serverBatch.reviewFieldCount, 0);
    assert.equal(staleEnv.serverBatch.destinationPendingCount, 1, 'The stale cache still awaits system recalculation.');
    assert.equal(staleEnv.serverBatch.rows.length, 1, 'Pending destinations remain in the persisted batch.');
  }
}

async function importFreshAndroidPhotos() {
  const now = Date.now();
  for (const createdAt of [now - 10 * 86400000, 0, undefined]) {
    const session = { id: sessionId, createdAt, startedAt: new Date(now - 10 * 86400000).toISOString(),
      finishedAt: new Date(now).toISOString(), captureCount: 1, destinationMode: 'mixed',
      images: [{ blob: jpeg, source: 'android-camerax', timestamp: new Date(now).toISOString() }] };
    const env = environment('batam', session);
    let processed = 0;
    env.window.MileAI = {
      async processCameraImages(images) {
        processed++;
        assert.equal(images[0].blob, jpeg, 'The fresh original Android photo must reach AI unchanged.');
        env.core.uploadedFilesManager.push({ rows: [{ name: 'FRESH CAPTURE' }] });
        return { status: 'SUCCESS' };
      }, async processPDFFile() {}
    };
    env.run('assets/js/camera-import-v2.js', 'window.importFixture = importCameraBatch;');
    await env.window.importFixture();
    assert.equal(processed, 1, 'A draft clock must not reject a just-captured Android photo.');
    assert.equal(env.selector.value, 'mixed');
    assert.equal(env.notifications.some(item => /kedaluwarsa|capture ulang/i.test(item.message)), false);
    assert.equal(env.stored, null, 'Successful extraction may clear the temporary copy.');
  }
  const session = { id: sessionId, createdAt: now - 10 * 86400000, captureCount: 1,
    images: [{ blob: jpeg, source: 'android-camerax', timestamp: new Date(now).toISOString() }] };
  const env = environment('batam', session);
  env.window.MileAI = { async processCameraImages() { return { status: 'FAILED', error: 'Koneksi terputus' }; }, async processPDFFile() {} };
  env.run('assets/js/camera-import-v2.js', 'window.importFixture = importCameraBatch;');
  await env.window.importFixture();
  assert.equal(env.stored.images[0].blob, jpeg, 'AI failure must preserve a fresh photo with an older draft timestamp for retry.');
  assert.equal(env.notifications.some(item => /kedaluwarsa|capture ulang/i.test(item.message)), false);
}

(async () => {
  await captureSnapshots();
  await importProfiles();
  await importFreshAndroidPhotos();
  await cloudProfilesAndReview();
  for (const file of ['app.html', 'beta.html', 'review.html', 'camera.html']) {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, file === 'camera.html' ? /value="mixed" selected/ : /value="batam" selected/);
    assert.match(html, /value="cn23"/); assert.match(html, /value="mixed"/);
    if (file !== 'camera.html') {
      assert.equal((html.match(/id="exportButton"/g) || []).length, 1);
      assert.doesNotMatch(html, /id="export(?:Batam|Cn23)Button"/);
    }
  }
  console.log('PASS camera-destination-mode: capture snapshots, three import paths, retry mode, cloud roundtrip, legacy fallback and single export control');
})().catch(error => { console.error(error); process.exitCode = 1; });
