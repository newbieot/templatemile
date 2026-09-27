(() => {
  'use strict';

  const select = document.getElementById('corporateTemplate');
  const host = select?.closest('.template-picker-host');
  if (!select || !host || host.dataset.templatePickerReady === 'true') return;

  const options = Array.from(select.options).map(option => ({
    value: option.value,
    name: option.dataset.name || option.textContent.trim(),
    customerId: option.dataset.customerId || '',
    tariff: option.dataset.tariff || '',
    service: option.dataset.service || '',
    note: option.dataset.note || '',
    searchText: [option.textContent, option.dataset.name, option.dataset.customerId, option.dataset.tariff, option.dataset.service, option.dataset.note]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('id-ID')
  }));

  const create = (tag, className, text) => {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  };

  const trigger = create('button', 'template-picker__trigger');
  trigger.type = 'button';
  trigger.id = 'corporateTemplatePickerTrigger';
  trigger.setAttribute('aria-haspopup', 'dialog');
  trigger.setAttribute('aria-expanded', 'false');

  const triggerText = create('span', 'template-picker__trigger-text');
  const triggerName = create('strong', 'template-picker__trigger-name');
  const triggerMeta = create('small', 'template-picker__trigger-meta');
  triggerText.append(triggerName, triggerMeta);
  const triggerAction = create('span', 'template-picker__trigger-action', 'Cari');
  triggerAction.setAttribute('aria-hidden', 'true');
  trigger.append(triggerText, triggerAction);

  const panel = create('div', 'template-picker__panel');
  panel.id = 'corporateTemplatePickerPanel';
  panel.hidden = true;
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-labelledby', 'corporateTemplatePickerTitle');
  trigger.setAttribute('aria-controls', panel.id);

  const header = create('div', 'template-picker__header');
  const heading = create('div', 'template-picker__heading');
  const title = create('strong', '', 'Pilih template pelanggan');
  title.id = 'corporateTemplatePickerTitle';
  const subtitle = create('small', '', 'Cari nama, ID pelanggan, tarif, atau layanan.');
  heading.append(title, subtitle);
  const closeButton = create('button', 'template-picker__close', 'Tutup');
  closeButton.type = 'button';
  closeButton.setAttribute('aria-label', 'Tutup pemilih template pelanggan');
  header.append(heading, closeButton);

  const searchWrap = create('div', 'template-picker__search');
  const searchIcon = create('span', '', '⌕');
  searchIcon.setAttribute('aria-hidden', 'true');
  const search = create('input');
  search.type = 'search';
  search.id = 'corporateTemplateSearch';
  search.placeholder = 'Contoh: BRI, FINMUF, atau PKH';
  search.autocomplete = 'off';
  search.spellcheck = false;
  search.setAttribute('aria-label', 'Cari template pelanggan');
  searchWrap.append(searchIcon, search);

  const status = create('div', 'template-picker__status');
  status.setAttribute('aria-live', 'polite');
  const results = create('div', 'template-picker__results');
  results.setAttribute('role', 'listbox');
  results.setAttribute('aria-label', 'Daftar template pelanggan');
  const empty = create('div', 'template-picker__empty');
  empty.hidden = true;
  empty.append(
    create('strong', '', 'Template tidak ditemukan'),
    create('span', '', 'Coba nama atau ID pelanggan lain, atau pilih input manual.')
  );
  panel.append(header, searchWrap, status, results, empty);

  select.insertAdjacentElement('afterend', trigger);
  host.append(panel);
  host.classList.add('is-template-picker');
  host.dataset.templatePickerReady = 'true';
  select.classList.add('template-picker__native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');
  select.labels?.forEach(label => { label.htmlFor = trigger.id; });

  let isOpen = false;

  function selectedOption() {
    return options.find(option => option.value === select.value) || options[0];
  }

  function describe(option) {
    const details = [];
    if (option.customerId) details.push(option.customerId);
    if (option.tariff) details.push(`Tarif ${option.tariff}`);
    if (option.service) details.push(option.service);
    if (option.note) details.push(option.note);
    return details.join(' · ') || 'Isi data pelanggan sendiri';
  }

  function updateTrigger() {
    const option = selectedOption();
    triggerName.textContent = option.name;
    triggerMeta.textContent = describe(option);
  }

  function getResultButtons() {
    return Array.from(results.querySelectorAll('.template-picker__option'));
  }

  function choose(value) {
    if (select.value !== value) {
      select.value = value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
    }
    updateTrigger();
    closePicker(true);
  }

  function renderResults() {
    const query = search.value.trim().toLocaleLowerCase('id-ID');
    const matches = options.filter(option => !query || option.searchText.includes(query));
    results.replaceChildren();

    for (const option of matches) {
      const button = create('button', 'template-picker__option');
      button.type = 'button';
      button.dataset.value = option.value;
      button.setAttribute('role', 'option');
      button.setAttribute('aria-selected', String(option.value === select.value));
      if (option.value === select.value) button.classList.add('is-selected');

      const copy = create('span', 'template-picker__option-copy');
      copy.append(create('strong', '', option.name), create('small', '', option.customerId || 'Pelanggan baru'));
      const badges = create('span', 'template-picker__badges');
      if (option.service) badges.append(create('span', 'template-picker__badge template-picker__badge--service', option.service));
      if (option.tariff) badges.append(create('span', 'template-picker__badge', `Tarif ${option.tariff}`));
      else if (option.note.includes('Tarif Publish')) badges.append(create('span', 'template-picker__badge template-picker__badge--publish', 'Tarif Publish'));
      if (option.note.includes('Nama pengirim')) badges.append(create('span', 'template-picker__badge template-picker__badge--reference', 'Nama dari No Ref'));
      if (option.value === 'MANUAL') badges.append(create('span', 'template-picker__badge', 'Manual'));
      button.append(copy, badges);
      button.addEventListener('click', () => choose(option.value));
      results.append(button);
    }

    status.textContent = `${matches.length} template ditemukan`;
    empty.hidden = matches.length > 0;
    results.hidden = matches.length === 0;
  }

  function openPicker() {
    if (isOpen) return;
    isOpen = true;
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
    document.body.classList.add('template-picker-open');
    search.value = '';
    renderResults();
    requestAnimationFrame(() => search.focus({ preventScroll: true }));
  }

  function closePicker(restoreFocus = false) {
    if (!isOpen) return;
    isOpen = false;
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
    document.body.classList.remove('template-picker-open');
    if (restoreFocus) trigger.focus({ preventScroll: true });
  }

  trigger.addEventListener('click', openPicker);
  closeButton.addEventListener('click', () => closePicker(true));
  search.addEventListener('input', renderResults);
  search.addEventListener('keydown', event => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      getResultButtons()[0]?.focus();
    }
  });
  results.addEventListener('keydown', event => {
    const buttons = getResultButtons();
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const direction = event.key === 'ArrowDown' ? 1 : -1;
      buttons[(index + direction + buttons.length) % buttons.length]?.focus();
    } else if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      buttons[event.key === 'Home' ? 0 : buttons.length - 1]?.focus();
    }
  });
  select.addEventListener('change', () => {
    updateTrigger();
    if (isOpen) renderResults();
  });
  document.addEventListener('pointerdown', event => {
    if (isOpen && !host.contains(event.target)) closePicker(false);
  });
  document.addEventListener('keydown', event => {
    if (isOpen && event.key === 'Escape') {
      event.preventDefault();
      closePicker(true);
    }
  });

  updateTrigger();
})();
