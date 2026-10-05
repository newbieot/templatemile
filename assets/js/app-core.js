
        let uploadedFilesManager = [];
        let fileProcessQueue = [];
        let currentWorkbook = null;
        let currentFileName = "";
        let currentHeaders = [];
        let tempExtractedRows = []; 
        let globalHeaderRowIndex = 0; // Menyimpan baris di mana header sebenarnya berada
        let rowIdentityCounter = 0;
        let nationalPostcodeLoadPromise = null;
        let nationalPostcodeLoadError = '';

        function getDestinationMode(options = {}) {
            const value = options.destinationMode ?? document.getElementById('destinationMode')?.value;
            return ['cn23', 'mixed'].includes(value) ? value : 'batam';
        }

        function isCn23Mode(options = {}) {
            return ['cn23', 'mixed'].includes(getDestinationMode(options));
        }

        async function refreshNationalPostcodes() {
            if (!window.MilePostalNational?.load) {
                nationalPostcodeLoadError = 'Modul kode pos nasional belum tersedia. Muat ulang halaman.';
                return false;
            }
            if (!nationalPostcodeLoadPromise) {
                nationalPostcodeLoadPromise = window.MilePostalNational.load()
                    .then(() => { nationalPostcodeLoadError = ''; return true; })
                    .catch(error => {
                        nationalPostcodeLoadError = error?.message || 'Database kode pos nasional gagal dimuat.';
                        return false;
                    })
                    .finally(() => { nationalPostcodeLoadPromise = null; });
            }
            return nationalPostcodeLoadPromise;
        }

        function getNationalPostcodeMatch(row) {
            const address = String(row.address || '');
            const query = String(row._nationalPostcodeQuery || '');
            const sourceKey = `${address}\n${query}`;
            const confirmed = row._confirmedNationalPostcode;
            if (confirmed?.sourceKey === sourceKey && confirmed.selected) {
                return { status: 'matched', postcode: confirmed.selected.postcode, candidates: [confirmed.selected], selected: confirmed.selected, confirmed: true };
            }
            if (confirmed) delete row._confirmedNationalPostcode;
            if (!window.MilePostalNational?.isLoaded?.()) {
                return { status: 'unavailable', postcode: '', candidates: [], selected: null };
            }
            // row.zip dapat berasal dari fallback 29411 pada batch Batam lama.
            // Hanya kode yang tercetak pada label atau dicari petugas menjadi petunjuk.
            const printedZip = row._printedPostcode || (row.postcodeSource === 'label' ? row.zip : '');
            const queryZip = query.match(/\b\d{5}\b/)?.[0] || '';
            const lookupKey = `${sourceKey}\n${queryZip || printedZip}`;
            const matcherVersion = window.MilePostalNational.matcherVersion;
            if (row._nationalPostcodeMatch?.lookupKey !== lookupKey || row._nationalPostcodeMatch?.matcherVersion !== matcherVersion) {
                row._nationalPostcodeMatch = { ...window.MilePostalNational.match(`${address} ${query}`, queryZip || printedZip), lookupKey, matcherVersion };
            }
            return row._nationalPostcodeMatch;
        }

        function applyDestinationMode() {
            const cn23 = isCn23Mode();
            const mixed = getDestinationMode() === 'mixed';
            const mode = document.getElementById('clientMode')?.value;
            const itemInput = document.getElementById('itemType');
            if (cn23 && itemInput) { itemInput.value = 'DOKUMEN'; itemInput.disabled = true; }
            const settings = document.getElementById('cn23Settings');
            if (settings) settings.hidden = !cn23;
            const paymentGroup = document.getElementById('cn23PaymentMethodGroup');
            if (paymentGroup) paymentGroup.hidden = mode !== 'KORPORAT';
            const exportButton = document.getElementById('exportButton');
            if (exportButton) {
                if (!exportButton.dataset.batamMarkupSaved) {
                    exportButton.dataset.batamLabel = exportButton.textContent;
                    exportButton.dataset.batamMarkup = exportButton.innerHTML;
                    exportButton.dataset.batamMarkupSaved = 'true';
                }
                if (cn23) {
                    exportButton.textContent = 'Ekspor Antrean CN23';
                    exportButton.dataset.cn23LabelApplied = 'true';
                } else if (exportButton.dataset.cn23LabelApplied) {
                    exportButton.innerHTML = exportButton.dataset.batamMarkup;
                    delete exportButton.dataset.cn23LabelApplied;
                }
                exportButton.hidden = mixed;
                exportButton.style.display = mixed ? 'none' : '';
            }
            const exportBatamButton = document.getElementById('exportBatamButton');
            const exportCn23Button = document.getElementById('exportCn23Button');
            if (exportBatamButton) { exportBatamButton.hidden = !mixed; exportBatamButton.style.display = mixed ? '' : 'none'; }
            if (exportCn23Button) { exportCn23Button.hidden = !mixed; exportCn23Button.style.display = mixed ? '' : 'none'; }
            document.querySelectorAll('a[href^="/camera"]').forEach(link => {
                if (/^\/camera(?:\?|$)/.test(link.getAttribute('href') || '')) link.setAttribute('href', `/camera?destinationMode=${getDestinationMode()}`);
            });
        }

        async function handleDestinationModeChange() {
            const cn23 = isCn23Mode();
            const itemInput = document.getElementById('itemType');
            if (!cn23 && itemInput) {
                const preset = getCorporateTemplatePreset(document.getElementById('corporateTemplate')?.value);
                itemInput.disabled = document.getElementById('clientMode')?.value === 'PINDAH' || Boolean(preset?.lockItemType);
            }
            applyDestinationMode();
            updateInterface();
            if (cn23 && await refreshNationalPostcodes()) updateInterface();
            else if (cn23) updateInterface();
        }

        window.getDestinationMode = getDestinationMode;
        window.isCn23Mode = isCn23Mode;
        window.handleDestinationModeChange = handleDestinationModeChange;

        // ================= DATABASE BATAM =================
        const batamKelurahanMapping = [
            { keyword: 'TELUK TERING', code: '29411' }, { keyword: 'SUNGAI PANAS', code: '29412' },
            { keyword: 'BALOI PERMAI', code: '29413' }, { keyword: 'TAMAN BALOI', code: '29413' },
            { keyword: 'BELIAN', code: '29414' }, { keyword: 'SUKAJADI', code: '29415' },
            { keyword: 'BATU BESAR', code: '29416' }, { keyword: 'NGENANG', code: '29416' },
            { keyword: 'KABIL', code: '29417' }, { keyword: 'SAMBAU', code: '29419' },
            { keyword: 'TANJUNG SENGKUANG', code: '29421' }, { keyword: 'BATU MERAH', code: '29422' },
            { keyword: 'SUNGAI JODOH', code: '29423' }, { keyword: 'KAMPUNG SERAYA', code: '29424' },
            { keyword: 'SADAI', code: '29426' }, { keyword: 'BENGKONG INDAH', code: '29427' },
            { keyword: 'BENGKONG LAUT', code: '29428' }, { keyword: 'TANJUNG BUNTUNG', code: '29429' },
            { keyword: 'BATU SELICIN', code: '29431' }, { keyword: 'KAMPUNG PELITA', code: '29433' },
            { keyword: 'LUBUK BAJA KOTA', code: '29434' }, { keyword: 'TANJUNG UMA', code: '29435' },
            { keyword: 'BALOI INDAH', code: '29436' }, { keyword: 'BULIANG', code: '29441' },
            { keyword: 'KIBING', code: '29442' }, { keyword: 'BUKIT TEMPAYAN', code: '29443' },
            { keyword: 'TANJUNG UNCANG', code: '29444' }, { keyword: 'TANJUNG RIAU', code: '29445' },
            { keyword: 'TIBAN LAMA', code: '29445' }, { keyword: 'TIBAN INDAH', code: '29446' },
            { keyword: 'PATAM LESTARI', code: '29447' }, { keyword: 'TANJUNG PINGGIR', code: '29448' },
            { keyword: 'SUNGAI HARAPAN', code: '29448' }, { keyword: 'TIBAN BARU', code: '29449' },
            { keyword: 'SAGULUNG KOTA', code: '29451' }, { keyword: 'TEMBESI', code: '29452' },
            { keyword: 'SUNGAI BINTI', code: '29453' }, { keyword: 'SUNGAI LEKOP', code: '29454' },
            { keyword: 'SUNGAI LANGKAI', code: '29455' }, { keyword: 'SUNGAI PELUNGGUT', code: '29456' },
            { keyword: 'DURIANGKANG', code: '29461' }, { keyword: 'MANGSANG', code: '29462' },
            { keyword: 'MUKA KUNING', code: '29463' }, { keyword: 'TANJUNG PIAYU', code: '29464' },
            { keyword: 'BULANG LINTANG', code: '29471' }, { keyword: 'PULAU BULUH', code: '29472' },
            { keyword: 'PANTAI GELAM', code: '29473' }, { keyword: 'BATU LEGONG', code: '29474' },
            { keyword: 'TEMOYONG', code: '29475' }, { keyword: 'PULAU SETOKOK', code: '29476' },
            { keyword: 'SEMBULANG', code: '29481' }, { keyword: 'REMPANG CATE', code: '29482' },
            { keyword: 'SUBANG MAS', code: '29483' }, { keyword: 'AIR RAJA', code: '29483' },
            { keyword: 'GALANG BARU', code: '29484' }, { keyword: 'SIJANTUNG', code: '29485' },
            { keyword: 'KARAS', code: '29486' }, { keyword: 'PULAU ABANG', code: '29487' },
            { keyword: 'TANJUNG SARI', code: '29491' }, { keyword: 'PEMPING', code: '29492' },
            { keyword: 'KASU', code: '29493' }, { keyword: 'PECONG', code: '29494' },
            { keyword: 'SEKANAK RAYA', code: '29495' }, { keyword: 'PULAU TERUNG', code: '29496' }
        ];

        const batamKecamatanMapping = [
            { keyword: 'BATAM KOTA', code: '29411' }, { keyword: 'NONGSA', code: '29416' },
            { keyword: 'BATU AMPAR', code: '29421' }, { keyword: 'BENGKONG', code: '29426' },
            { keyword: 'LUBUK BAJA', code: '29431' }, { keyword: 'BATU AJI', code: '29441' },
            { keyword: 'BATUAJI', code: '29441' }, { keyword: 'SEKUPANG', code: '29445' },
            { keyword: 'SAGULUNG', code: '29451' }, { keyword: 'SEI BEDUK', code: '29461' },
            { keyword: 'BULANG', code: '29471' }, { keyword: 'GALANG', code: '29481' },
            { keyword: 'BELAKANG PADANG', code: '29491' }
        ];

        // ================= DATABASE TANJUNG PINANG (Khusus MENSA) =================
        const tpiKelurahanMapping = [
            { keyword: 'TANJUNG PINANG TIMUR', code: '29122' }, { keyword: 'TANJUNG PINANG BARAT', code: '29113' },
            { keyword: 'TANJUNG PINANG KOTA', code: '29111' }, { keyword: 'TANJUNG AYUN SAKTI', code: '29124' },
            { keyword: 'BATU IX (SEMBILAN)', code: '29125' }, { keyword: 'BATU IX', code: '29125' },
            { keyword: 'BATU 9', code: '29125' }, { keyword: 'BATU SEMBILAN', code: '29125' },
            { keyword: 'MELAYU KOTA PIRING', code: '29123' }, { keyword: 'TANJUNG UNGGAT', code: '29122' },
            { keyword: 'KAMPUNG BULANG', code: '29122' }, { keyword: 'PINANG KENCANA', code: '29122' },
            { keyword: 'KAMPUNG BUGIS', code: '29115' }, { keyword: 'BUKIT CERMIN', code: '29111' },
            { keyword: 'KAMPUNG BARU', code: '29113' }, { keyword: 'SENGGARANG', code: '29111' },
            { keyword: 'PENYENGAT', code: '29114' }, { keyword: 'SEI JANG', code: '29124' },
            { keyword: 'AIR RAJA', code: '29122' }, { keyword: 'KEMBOJA', code: '29112' },
            { keyword: 'DOMPAK', code: '29124' }
        ];

        const tpiKecamatanMapping = [
            { keyword: 'TANJUNG PINANG BARAT', code: '29111' }, { keyword: 'TANJUNG PINANG TIMUR', code: '29122' },
            { keyword: 'TANJUNG PINANG KOTA', code: '29115' }, { keyword: 'BUKIT BESTARI', code: '29124' }
        ];


        // ================= TEMPLATE PELANGGAN KORPORAT =================
        // Single source of truth: ID pelanggan preset WAJIB berasal dari konfigurasi ini,
        // bukan dari input tersembunyi. Ini mencegah kiriman invoice jatuh menjadi ritel
        // apabila field UI ter-reset/kosong sebelum ekspor.
        const corporateTemplatePresets = Object.freeze({
            PN_BATAM: Object.freeze({ customerId: 'LNMAPN01294A', senderName: 'PENGADILAN NEGERI BATAM', tariffCode: '897924', lockTariff: true, defaultItemType: 'DOKUMEN', senderNameFromReference: true }),
            MENSA: Object.freeze({ customerId: 'DAGMBS01294A', senderName: 'MENSA BINA SUKSES BATAM', tariffCode: '914556', lockTariff: true, destinationZoneCode: '29100' }),
            TOYOTA: Object.freeze({ customerId: 'FINTOYOTA02294A', senderName: 'PT TOYOTA ASTRA FINANCE' }),
            JACCS_MPM: Object.freeze({ customerId: 'FINMPMJKT04120A', senderName: 'PT JACCS MPM FINANCE INDONESIA', tariffCode: '868523', lockTariff: true, defaultServiceCode: 'PKH' }),
            POLRES: Object.freeze({ customerId: 'LNPOLRES01294A', senderName: 'SATLANTAS POLRESTA BARELANG POLDA KEPULAUAN RIAU' }),
            BNI: Object.freeze({ customerId: 'BANKBNIBTAM02294A', senderName: 'BANK BNI BATAM', tariffCode: '907675', lockTariff: true }),
            BTN: Object.freeze({ customerId: 'BANKBTNBTAM02294A', senderName: 'BANK TABUNGAN NEGARA BATAM', tariffCode: '876577', lockTariff: true }),
            ASTRA: Object.freeze({ customerId: 'INDASTRADAI01294A', senderName: 'ASTRA DAIHATSU MOTOR BATAM' }),
            BRI_NAGOYA: Object.freeze({ customerId: 'BANKBRI01294A', senderName: 'BANK BRI NAGOYA', lockSenderName: true, publishTariff: true }),
            FIF_GROUP: Object.freeze({ customerId: 'FINFIF02294A', senderName: 'PT FIF GROUP', lockSenderName: true, publishTariff: true }),
            MEGACENTRAL: Object.freeze({ customerId: 'FINMEGACENT02110B', senderName: 'PT MEGACENTRAL FINANCE CAB BATAM', lockSenderName: true, publishTariff: true }),
            MANDIRI_UTAMA: Object.freeze({ customerId: 'FINMUF02120A', senderName: 'PT MANDIRI UTAMA FINANCE', lockSenderName: true, tariffCode: '884916', lockTariff: true, defaultServiceCode: 'PKH', lockService: true }),
            ASTRA_SEDAYA: Object.freeze({ customerId: 'FINSEDAYA02294A', senderName: 'PT ASTRA SEDAYA FINANCE', lockSenderName: true, publishTariff: true }),
            RS_GRAHA_HERMINE: Object.freeze({ customerId: 'KESRSGHBTAM01294A', senderName: 'RUMAH SAKIT GRAHA HERMINE BATAM', lockSenderName: true, publishTariff: true }),
            OJK: Object.freeze({ customerId: 'LNOJK02294A', senderName: 'OTORITAS JASA KEUANGAN BATAM', publishTariff: true, senderNameFromReference: true }),
            BP_BATAM: Object.freeze({ customerId: 'LNBPBATAM02294A', senderName: 'BP BATAM' }),
            BSN_BATAM: Object.freeze({
                customerId: 'FINBSN01294A',
                senderName: 'BANK SYARIAH NASIONAL KC BATAM',
                lockSenderName: true,
                tariffCode: '915616',
                lockTariff: true,
                defaultServiceCode: 'PKH',
                lockService: true,
                defaultItemType: 'DOKUMEN',
                lockItemType: true
            })
        });

        function getCorporateTemplatePreset(template) {
            return corporateTemplatePresets[template] || null;
        }

        function resolveCorporateCustomerId(template, manualValue = '') {
            const preset = getCorporateTemplatePreset(template);
            if (preset) return String(preset.customerId || '').trim().toUpperCase();
            return cleanArtifacts(manualValue).toUpperCase();
        }

        function assertPresetCustomerIds() {
            for (const [template, preset] of Object.entries(corporateTemplatePresets)) {
                if (!preset.customerId || !String(preset.customerId).trim()) {
                    throw new Error(`Konfigurasi fatal: ID Pelanggan template ${template} kosong.`);
                }
                if ((preset.lockSenderName || preset.senderNameFromReference) && !String(preset.senderName || '').trim()) {
                    throw new Error(`Konfigurasi fatal: Nama Pelanggan template ${template} kosong.`);
                }
                if (preset.publishTariff && preset.lockTariff) {
                    throw new Error(`Konfigurasi fatal: template ${template} tidak boleh memakai Tarif Publish dan tarif terkunci sekaligus.`);
                }
                if (preset.lockTariff && !String(preset.tariffCode || '').trim()) {
                    throw new Error(`Konfigurasi fatal: Kode Tarif template ${template} kosong.`);
                }
                if (preset.lockService && !String(preset.defaultServiceCode || '').trim()) {
                    throw new Error(`Konfigurasi fatal: Kode Layanan template ${template} kosong.`);
                }
                if (preset.lockItemType && !String(preset.defaultItemType || '').trim()) {
                    throw new Error(`Konfigurasi fatal: Jenis Kiriman template ${template} kosong.`);
                }
            }
        }
        assertPresetCustomerIds();


        // ================= ATURAN LAYANAN PN BATAM =================
        // Kalender resmi 2026: libur nasional dan cuti bersama.
        const pnBatamClosedDates2026 = Object.freeze({
            "2026-01-01": "Tahun Baru 2026 Masehi",
            "2026-01-16": "Isra Mikraj Nabi Muhammad SAW",
            "2026-02-16": "Cuti Bersama Tahun Baru Imlek",
            "2026-02-17": "Tahun Baru Imlek 2577 Kongzili",
            "2026-03-18": "Cuti Bersama Hari Suci Nyepi",
            "2026-03-19": "Hari Suci Nyepi",
            "2026-03-20": "Cuti Bersama Idulfitri",
            "2026-03-21": "Hari Raya Idulfitri 1447 H",
            "2026-03-22": "Hari Raya Idulfitri 1447 H",
            "2026-03-23": "Cuti Bersama Idulfitri",
            "2026-03-24": "Cuti Bersama Idulfitri",
            "2026-04-03": "Wafat Yesus Kristus",
            "2026-04-05": "Kebangkitan Yesus Kristus (Paskah)",
            "2026-05-01": "Hari Buruh Internasional",
            "2026-05-14": "Kenaikan Yesus Kristus",
            "2026-05-15": "Cuti Bersama Kenaikan Yesus Kristus",
            "2026-05-27": "Hari Raya Iduladha 1447 H",
            "2026-05-28": "Cuti Bersama Iduladha",
            "2026-05-31": "Hari Raya Waisak 2570 BE",
            "2026-06-01": "Hari Lahir Pancasila",
            "2026-06-16": "1 Muharam 1448 H",
            "2026-08-17": "Hari Proklamasi Kemerdekaan",
            "2026-08-25": "Maulid Nabi Muhammad SAW",
            "2026-12-24": "Cuti Bersama Kelahiran Yesus Kristus",
            "2026-12-25": "Kelahiran Yesus Kristus"
        });

        function getBatamIsoDate(date = new Date()) {
            const formatter = new Intl.DateTimeFormat('en-CA', {
                timeZone: 'Asia/Jakarta',
                year: 'numeric', month: '2-digit', day: '2-digit'
            });
            const parts = Object.fromEntries(formatter.formatToParts(date).map(part => [part.type, part.value]));
            return `${parts.year}-${parts.month}-${parts.day}`;
        }

        function shiftIsoDate(isoDate, days) {
            const [year, month, day] = isoDate.split('-').map(Number);
            const date = new Date(Date.UTC(year, month - 1, day + days, 12));
            return date.toISOString().slice(0, 10);
        }

        function getIsoDayOfWeek(isoDate) {
            const [year, month, day] = isoDate.split('-').map(Number);
            return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
        }

        function formatIndonesianDate(isoDate) {
            const [year, month, day] = isoDate.split('-').map(Number);
            return new Intl.DateTimeFormat('id-ID', {
                timeZone: 'Asia/Jakarta', weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
            }).format(new Date(Date.UTC(year, month - 1, day, 5)));
        }

        function getPNBatamServiceRecommendation(date = new Date()) {
            const isoDate = getBatamIsoDate(date);
            const holidayName = pnBatamClosedDates2026[isoDate];
            if (holidayName) {
                return { code: 'PKH', isoDate, reason: `${formatIndonesianDate(isoDate)} merupakan ${holidayName}.` };
            }

            const tomorrowIso = shiftIsoDate(isoDate, 1);
            const tomorrowHoliday = pnBatamClosedDates2026[tomorrowIso];
            if (tomorrowHoliday) {
                return { code: 'PKH', isoDate, reason: `H-1 ${tomorrowHoliday} (${formatIndonesianDate(tomorrowIso)}).` };
            }

            const dayOfWeek = getIsoDayOfWeek(isoDate);
            if (dayOfWeek === 5) {
                return { code: 'PKH', isoDate, reason: 'Hari Jumat menggunakan layanan PKH.' };
            }
            if (dayOfWeek === 0 || dayOfWeek === 6) {
                return { code: 'PKH', isoDate, reason: 'Akhir pekan menggunakan layanan PKH.' };
            }
            return { code: 'PE', isoDate, reason: 'Hari Senin–Kamis normal menggunakan layanan PE.' };
        }

        function applyPNBatamServiceDefault() {
            const template = document.getElementById('corporateTemplate')?.value;
            const mode = document.getElementById('clientMode')?.value;
            const serviceSelect = document.getElementById('serviceCode');
            const hint = document.getElementById('serviceCodeHint');
            if (!serviceSelect || !hint) return;

            if (mode === 'KORPORAT' && template === 'PN_BATAM') {
                const recommendation = getPNBatamServiceRecommendation();
                serviceSelect.value = recommendation.code;
                hint.hidden = false;
                hint.innerHTML = `<strong>Otomatis: ${recommendation.code}</strong> · ${recommendation.reason} Tetap dapat diganti manual.`;
            } else {
                hint.hidden = true;
                hint.textContent = '';
            }
        }

        window.getPNBatamServiceRecommendation = getPNBatamServiceRecommendation;
        window.__mileCore = {
            get uploadedFilesManager() { return uploadedFilesManager; },
            get currentFileName() { return currentFileName; },
            set tempExtractedRows(value) { tempExtractedRows = value; },
            get tempExtractedRows() { return tempExtractedRows; },
            getZipCodeFromAddress,
            resolveZipCode,
            getDestinationMode,
            isCn23Mode,
            applyDestinationMode,
            handleDestinationModeChange,
            refreshNationalPostcodes,
            getNationalPostcodeMatch,
            getShipmentRoute,
            buildCn23QueueRows,
            isClearlyBatamAddress,
            cleanArtifacts,
            cleanRecipientName,
            cleanAddressArtifacts,
            splitRecipientAndAddress,
            cleanReference,
            cleanPhoneNumber,
            sanitizeExcelText,
            sanitizeExcelRowValues,
            hasForbiddenExcelCharacters,
            updateInterface: () => updateInterface(),
            processNextInQueue: () => processNextInQueue(),
            showWeightModal: () => showWeightModal()
        };


        document.addEventListener("DOMContentLoaded", () => {
            handleModeChange();
            document.getElementById('resultTable')?.addEventListener('input', event => {
                const context = syncManagedRowFromInput(event.target);
                if (isCn23Mode() && context?.field === 'address') refreshNationalRowReview(context.row, context.tr);
            });
            document.getElementById('destinationMode')?.addEventListener('change', handleDestinationModeChange);
            document.getElementById('exportBatamButton')?.addEventListener('click', downloadLocalExcel);
            document.getElementById('exportCn23Button')?.addEventListener('click', downloadCn23Excel);
            document.getElementById('resultTable')?.addEventListener('change', event => {
                const target = event.target;
                if (target.matches?.('.national-postcode-query')) {
                    const tr = target.closest('tr[data-file-id][data-row-id]');
                    const row = findManagedRow(tr?.dataset.fileId, tr?.dataset.rowId)?.row;
                    if (row) { row._nationalPostcodeQuery = target.value; delete row._confirmedNationalPostcode; setTimeout(() => refreshNationalRowReview(row, tr), 0); }
                } else if (target.matches?.('.national-postcode-choice')) {
                    const tr = target.closest('tr[data-file-id][data-row-id]');
                    const row = findManagedRow(tr?.dataset.fileId, tr?.dataset.rowId)?.row;
                    const match = row ? getNationalPostcodeMatch(row) : null;
                    const candidate = match?.candidates?.[Number(target.value)];
                    if (row && target.value !== '' && candidate) {
                        row._confirmedNationalPostcode = { sourceKey: `${String(row.address || '')}\n${String(row._nationalPostcodeQuery || '')}`, selected: { ...candidate } };
                        row.zip = candidate.postcode;
                        setTimeout(() => refreshNationalRowReview(row, tr), 0);
                    }
                } else if (isCn23Mode() && target.matches?.('.val-address')) {
                    const context = syncManagedRowFromInput(target);
                    if (context) refreshNationalRowReview(context.row, context.tr);
                }
            });
            if (isCn23Mode()) handleDestinationModeChange();
        });

        // MANAJEMEN UI BERDASARKAN MODE (KORPORAT, RITEL, PINDAH)
        function handleModeChange() {
            const mode = document.getElementById('clientMode').value;
            const wrapTemplate = document.getElementById('wrapTemplate');
            const cardPengirim = document.getElementById('cardDataPengirim');
            const wrapCustId = document.getElementById('wrapCustomerId');
            const wrapSName = document.getElementById('wrapSenderName');
            const wrapSPhone = document.getElementById('wrapSenderPhone');
            const wrapSAddr = document.getElementById('wrapSenderAddress');
            const wrapTariff = document.getElementById('wrapTariffCode');
            const wrapItemType = document.getElementById('wrapItemType');
            const tariffInput = document.getElementById('tariffCode');
            const itemInput = document.getElementById('itemType');
            const serviceSelect = document.getElementById('serviceCode');
            const cbInsurance = document.getElementById('useInsurance');
            const wrapPindahDest = document.getElementById('wrapPindahDest');

            // Reset Disabled Status for Safety
            itemInput.disabled = false;
            serviceSelect.disabled = false;
            cbInsurance.disabled = false;

            if (mode === 'KORPORAT') {
                wrapTemplate.style.display = 'block';
                wrapTariff.style.display = 'block';
                wrapSPhone.style.display = 'none';
                wrapSAddr.style.display = 'none';
                wrapItemType.classList.add('full-width');
                wrapPindahDest.style.display = 'none';
                
                handleTemplateChange(); 
            } 
            else if (mode === 'RITEL') {
                wrapTemplate.style.display = 'none';
                cardPengirim.style.display = 'block'; 
                wrapCustId.style.display = 'none';
                wrapSName.style.display = 'block';
                wrapSPhone.style.display = 'block';
                wrapSAddr.style.display = 'block';
                wrapTariff.style.display = 'none'; 
                wrapItemType.classList.remove('full-width');
                wrapItemType.style.gridColumn = 'span 2';
                wrapPindahDest.style.display = 'none';

                tariffInput.value = "";
                tariffInput.readOnly = false;
            }
            else if (mode === 'PINDAH') {
                wrapTemplate.style.display = 'none';
                cardPengirim.style.display = 'block'; 
                wrapCustId.style.display = 'block';
                wrapSName.style.display = 'block';
                wrapSPhone.style.display = 'block';
                wrapSAddr.style.display = 'block';
                wrapTariff.style.display = 'block'; 
                wrapItemType.classList.add('full-width');
                wrapPindahDest.style.display = 'block';

                tariffInput.value = "";
                tariffInput.readOnly = false;
                
                // Wajib Paket & Wajib Asuransi
                itemInput.value = 'PAKET';
                itemInput.disabled = true;
                cbInsurance.checked = true;
                cbInsurance.disabled = true;
            }

            applyPNBatamServiceDefault();
            if (!isCn23Mode()) uploadedFilesManager = [];
            applyDestinationMode();
            updateInterface();
        }

        // LOGIKA PENYEMBUNYIAN KARTU PENGIRIM BERDASARKAN TEMPLATE
        function handleTemplateChange() {
            const template = document.getElementById('corporateTemplate').value;
            const mode = document.getElementById('clientMode').value;
            const cardPengirim = document.getElementById('cardDataPengirim');
            const wrapSName = document.getElementById('wrapSenderName');
            const wrapSPhone = document.getElementById('wrapSenderPhone');
            const wrapSAddr = document.getElementById('wrapSenderAddress');
            const wrapCustId = document.getElementById('wrapCustomerId');
            const custIdInput = document.getElementById('customerId');
            const sNameInput = document.getElementById('senderName');
            const tariffInput = document.getElementById('tariffCode');
            const itemInput = document.getElementById('itemType');
            const serviceSelect = document.getElementById('serviceCode');

            if (mode !== 'KORPORAT') return;

            custIdInput.readOnly = false;
            sNameInput.readOnly = false;
            sNameInput.required = false;
            sNameInput.placeholder = 'Nama perusahaan atau pengirim';
            tariffInput.readOnly = false;
            serviceSelect.disabled = false;
            itemInput.disabled = false;
            wrapSPhone.style.display = 'none';
            wrapSAddr.style.display = 'none';

            if (template === 'MANUAL') {
                cardPengirim.style.display = 'block';
                wrapSName.style.display = 'block';
                wrapCustId.style.display = 'block';
                custIdInput.value = '';
                sNameInput.value = '';
                tariffInput.value = '';
            } else {
                const preset = getCorporateTemplatePreset(template);
                if (!preset) {
                    alert('Template pelanggan tidak dikenali. Pilih ulang template sebelum melanjutkan.');
                    document.getElementById('corporateTemplate').value = 'MANUAL';
                    handleTemplateChange();
                    return;
                }

                // ID pelanggan preset ditampilkan sebagai konfirmasi, tetapi sumber ekspor tetap konfigurasi preset.
                custIdInput.value = preset.customerId;
                custIdInput.readOnly = true;
                sNameInput.value = preset.senderName || '';
                tariffInput.value = preset.tariffCode || '';
                tariffInput.readOnly = Boolean(preset.lockTariff || preset.publishTariff);
                if (preset.defaultServiceCode) serviceSelect.value = preset.defaultServiceCode;
                if (preset.defaultItemType) itemInput.value = preset.defaultItemType;
                serviceSelect.disabled = Boolean(preset.lockService);
                itemInput.disabled = Boolean(preset.lockItemType);
                sNameInput.readOnly = Boolean(preset.lockSenderName || preset.senderNameFromReference);
                cardPengirim.style.display = 'none';
                sNameInput.placeholder = 'Nama perusahaan atau pengirim';
            }

            applyPNBatamServiceDefault();
            applyDestinationMode();
            // Perbarui tampilan dan data kode pos otomatis sesuai database dua tingkat.
            updateInterface();
        }

        const dropzone = document.getElementById('dropzone');
        ['dragenter', 'dragover'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.add('dragover'); }));
        ['dragleave', 'drop'].forEach(e => dropzone.addEventListener(e, ev => { ev.preventDefault(); dropzone.classList.remove('dragover'); }));
        dropzone.addEventListener('drop', e => handleFileSelection(e.dataTransfer.files));

        function handleFileSelection(files) {
            for (let file of files) {
                if (!uploadedFilesManager.some(f => f.name === file.name)) {
                    fileProcessQueue.push(file);
                }
            }
            document.getElementById('excelInput').value = "";
            processNextInQueue();
        }

        function processNextInQueue() {
            if (fileProcessQueue.length === 0) return; 

            const file = fileProcessQueue.shift();
            currentFileName = file.name;
            const fileExt = String(file.name || '').split('.').pop().toLowerCase();

            if (fileExt === 'pdf') {
                if (window.MileAI && typeof window.MileAI.processPDFFile === 'function') {
                    window.MileAI.processPDFFile(file);
                } else {
                    alert('Modul ekstraksi PDF belum siap. Muat ulang halaman lalu coba lagi.');
                    processNextInQueue();
                }
                return;
            }

            const reader = new FileReader();
            reader.onload = function(e) {
                currentWorkbook = XLSX.read(new Uint8Array(e.target.result), {type: 'array'});
                
                const firstSheetName = currentWorkbook.SheetNames[0];
                const worksheet = currentWorkbook.Sheets[firstSheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

                currentHeaders = [];
                globalHeaderRowIndex = 0;
                
                // --- SMART HEADER DETECTION (Deteksi Judul walau nyelip di baris ke-2 atau seterusnya) ---
                let maxScore = 0;
                const headerKeywords = ['nama', 'name', 'alamat', 'address', 'penerima', 'hp', 'telp', 'phone', 'no', 'ref', 'surat', 'deskripsi', 'awb', 'berat', 'weight', 'destination', 'origin'];

                for (let r = 0; r < Math.min(jsonData.length, 15); r++) {
                    let row = jsonData[r];
                    if (!row || row.length === 0) continue;

                    let score = 0;
                    row.forEach(cell => {
                        if (typeof cell === 'string') {
                            let cellLower = cell.toLowerCase().trim();
                            if (headerKeywords.some(kw => cellLower.includes(kw))) {
                                score++;
                            }
                        }
                    });

                    // Jika baris ini memiliki lebih banyak kecocokan keyword header, set sebagai Header baris utama
                    if (score > maxScore) {
                        maxScore = score;
                        globalHeaderRowIndex = r;
                        currentHeaders = row;
                    }
                }

                // Jika kata kunci benar-benar tidak ada, cari baris dengan kolom isi terbanyak sebagai fallback
                if (maxScore === 0) {
                    let maxCols = 0;
                    for (let r = 0; r < Math.min(jsonData.length, 10); r++) {
                        if (jsonData[r] && jsonData[r].length > maxCols) {
                            maxCols = jsonData[r].length;
                            globalHeaderRowIndex = r;
                            currentHeaders = jsonData[r];
                        }
                    }
                }
                // --- END SMART HEADER DETECTION ---

                // AI SMART BYPASS: JIKA FILE YANG DIUPLOAD ADALAH EXCEL MILEAPP HASIL EXPORT
                let isMileApp = currentHeaders.some(h => String(h).toLowerCase().trim() === 'destination_data_customer_name');
                
                if (isMileApp) {
                    // Gunakan range untuk memastikan data diambil mulai dari header row yang sebenarnya
                    const mileAppJsonData = XLSX.utils.sheet_to_json(worksheet, { range: globalHeaderRowIndex });
                    processMileAppFormat(mileAppJsonData); 
                } else {
                    showMappingModal(currentHeaders);
                }
            };
            reader.readAsArrayBuffer(file);
        }

        // FUNGSI KHUSUS UNTUK MEMBACA FILE EXCEL MILE APP (AUTO-DETECT)
        function processMileAppFormat(jsonData) {
            const templateVal = document.getElementById('corporateTemplate').value;
            const mode = document.getElementById('clientMode').value;
            let extractedRows = [];

            jsonData.forEach(row => {
                let rRef = row['ref_no'] || row['koli_data_koli_description'] || "";
                let rName = row['destination_data_customer_name'] || "";
                let rPhone = row['destination_data_customer_phone'] || "0";
                let rZip = row['destination_data_customer_zip_code'] || "";
                let rAddress = row['destination_data_customer_address'] || "";
                
                let wRaw = row['koli_data_koli_weight'];
                let rAct = wRaw !== undefined ? parseFloat(String(wRaw).replace(',', '.')) : 0.2;
                if(isNaN(rAct)) rAct = 0.2;

                let pRaw = row['koli_data_koli_width'];
                let rP = pRaw !== undefined ? parseFloat(String(pRaw).replace(',', '.')) : 10;
                if(isNaN(rP)) rP = 10;

                let lRaw = row['koli_data_koli_length'];
                let rL = lRaw !== undefined ? parseFloat(String(lRaw).replace(',', '.')) : 10;
                if(isNaN(rL)) rL = 10;

                let tRaw = row['koli_data_koli_height'];
                let rT = tRaw !== undefined ? parseFloat(String(tRaw).replace(',', '.')) : 10;
                if(isNaN(rT)) rT = 10;

                let vol = (rP * rL * rT) / 6000;
                let rCw = Math.max(rAct, vol).toFixed(2);
                
                let rIns = parseFloat(row['harga_barang']) || 0;

                if (rName || rAddress) {
                    const recipient = splitRecipientAndAddress(rName, rAddress);
                    extractedRows.push({
                        noSurat: /^(?:245\s+BATAM|CABANG|CARRIAGE)$/i.test(cleanReference(rRef)) ? "" : cleanReference(rRef),
                        name: recipient.name,
                        phone: cleanPhoneNumber(rPhone),
                        zip: cleanArtifacts(rZip),
                        _printedPostcode: isCn23Mode() ? String(rZip || '').trim() : '',
                        postcodeSource: isCn23Mode() && rZip ? 'label' : '',
                        address: recipient.address,
                        cw: rCw,
                        act: rAct, p: rP, l: rL, t: rT,
                        insHarga: rIns
                    });
                }
            });

            if (extractedRows.length === 0) {
                alert(`Gagal membaca data dari file Mile App "${currentFileName}".`);
                processNextInQueue();
                return;
            }

            // Aktifkan centang asuransi jika ada data harga barang
            let hasInsurance = extractedRows.some(r => r.insHarga > 0);
            if(hasInsurance && mode !== 'PINDAH' && !isCn23Mode()) {
                document.getElementById('useInsurance').checked = true;
            }

            uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: extractedRows });
            updateInterface();
            processNextInQueue();
        }

        function showMappingModal(headers) {
            document.getElementById('mappingFileName').innerText = "📍 File: " + currentFileName + " (Header Terdeteksi di Baris " + (globalHeaderRowIndex + 1) + ")";
            
            // Kosongkan form ketik custom setiap kali modal terbuka
            document.getElementById('customRef').value = "";

            const selects = ['mapName', 'mapAddress', 'mapPhone', 'mapRef', 'mapWeight', 'mapP', 'mapL', 'mapT'];
            selects.forEach(id => {
                const el = document.getElementById(id);
                el.innerHTML = '<option value="-1">-- KOSONG / ABAIKAN --</option>';
                headers.forEach((h, index) => {
                    let val = h ? String(h).trim() : `Kolom ${index + 1}`;
                    el.innerHTML += `<option value="${index}">${val}</option>`;
                });
            });

            headers.forEach((h, index) => {
                if(!h) return;
                let text = String(h).toUpperCase().trim();
                
                if (text.includes('NAMA') || text.includes('PEMILIK') || text.includes('PENERIMA')) {
                    if(document.getElementById('mapName').value == "-1") document.getElementById('mapName').value = index;
                }
                if (text.includes('ALAMAT') || text.includes('ADDRESS')) {
                    if(document.getElementById('mapAddress').value == "-1") document.getElementById('mapAddress').value = index;
                }
                if (text.includes('HP') || text.includes('TELP') || text.includes('PHONE')) {
                    if(document.getElementById('mapPhone').value == "-1") document.getElementById('mapPhone').value = index;
                }
                if (text.includes('SURAT') || text.includes('REF') || text.includes('DESKRIPSI') || text.includes('TNKB') || text.includes('PLAT') || text.includes('AWB')) {
                    if(document.getElementById('mapRef').value == "-1") document.getElementById('mapRef').value = index;
                }
                if (text === 'BERAT' || text === 'KG' || text === 'WEIGHT' || text === 'BERAT AKTUAL' || text.includes('BERAT')) {
                    if(document.getElementById('mapWeight').value == "-1") document.getElementById('mapWeight').value = index;
                }
                if (text === 'P' || text === 'PANJANG' || text === 'LENGTH') {
                    if(document.getElementById('mapP').value == "-1") document.getElementById('mapP').value = index;
                }
                if (text === 'L' || text === 'LEBAR' || text === 'WIDTH') {
                    if(document.getElementById('mapL').value == "-1") document.getElementById('mapL').value = index;
                }
                if (text === 'T' || text === 'TINGGI' || text === 'HEIGHT') {
                    if(document.getElementById('mapT').value == "-1") document.getElementById('mapT').value = index;
                }
            });

            document.getElementById('mappingModal').style.display = 'flex';
        }

        function skipCurrentMapping() {
            document.getElementById('mappingModal').style.display = 'none';
            processNextInQueue();
        }

        function applyMappingAndProcess() {
            document.getElementById('mappingModal').style.display = 'none';
            const templateVal = document.getElementById('corporateTemplate').value;
            const mode = document.getElementById('clientMode').value;

            const idxName = parseInt(document.getElementById('mapName').value);
            const idxAddr = parseInt(document.getElementById('mapAddress').value);
            const idxPhone = parseInt(document.getElementById('mapPhone').value);
            const idxRef = parseInt(document.getElementById('mapRef').value);
            const customRefVal = document.getElementById('customRef').value.trim().toUpperCase();
            
            const idxWeight = parseInt(document.getElementById('mapWeight').value);
            const idxP = parseInt(document.getElementById('mapP').value);
            const idxL = parseInt(document.getElementById('mapL').value);
            const idxT = parseInt(document.getElementById('mapT').value);

            let extractedRows = [];

            currentWorkbook.SheetNames.forEach((sheetName, sheetIndex) => {
                const worksheet = currentWorkbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(worksheet, {header: 1});

                // Mulai membaca dari baris SETELAH header row agar tidak menangkap judul utama/header
                let startIndex = (sheetIndex === 0) ? (globalHeaderRowIndex + 1) : 1;

                if (jsonData.length > 0) {
                    for (let i = startIndex; i < jsonData.length; i++) { 
                        let row = jsonData[i];
                        if (!row || row.length === 0) continue;

                        // Tambahan proteksi bila baris tersebut mirip sekali dengan header (misalnya sheet lain formatnya beda tipis)
                        if (
                            (idxName !== -1 && String(row[idxName]).toUpperCase() === String(currentHeaders[idxName]).toUpperCase()) ||
                            (idxAddr !== -1 && String(row[idxAddr]).toUpperCase() === String(currentHeaders[idxAddr]).toUpperCase())
                        ) {
                            continue;
                        }

                        let rawName = idxName !== -1 ? row[idxName] : "";
                        let rawAddr = idxAddr !== -1 ? row[idxAddr] : "";
                        let rawPhone = idxPhone !== -1 ? row[idxPhone] : "0";
                        // Menimpa nilai mapping Ref jika user mengetik di kotak custom text
                        let rawRef = customRefVal !== "" ? customRefVal : (idxRef !== -1 ? row[idxRef] : "");
                        
                        let rawWeight = idxWeight !== -1 ? row[idxWeight] : "";
                        let rawP = idxP !== -1 ? row[idxP] : "";
                        let rawL = idxL !== -1 ? row[idxL] : "";
                        let rawT = idxT !== -1 ? row[idxT] : "";

                        const recipient = splitRecipientAndAddress(rawName, rawAddr);
                        let cleanName = recipient.name;
                        let cleanAddr = recipient.address;
                        let cleanPhone = cleanPhoneNumber(rawPhone);
                        let cleanRef = cleanReference(rawRef);
                        let targetZipCode = getZipCodeFromAddress(cleanAddr, templateVal);
                        
                        let parsedW = parseFloat(String(rawWeight).replace(',', '.')) || "";
                        let parsedP = parseFloat(String(rawP).replace(',', '.')) || "";
                        let parsedL = parseFloat(String(rawL).replace(',', '.')) || "";
                        let parsedT = parseFloat(String(rawT).replace(',', '.')) || "";

                        if (!cleanName && !cleanAddr && !cleanRef) continue;

                        extractedRows.push({ 
                            noSurat: cleanRef, 
                            name: cleanName, 
                            phone: cleanPhone, 
                            zip: targetZipCode, 
                            address: cleanAddr,
                            act: parsedW, p: parsedP, l: parsedL, t: parsedT
                        });
                    }
                }
            });
            
            if (extractedRows.length === 0) {
                alert(`Gagal menemukan data di file "${currentFileName}".`);
                processNextInQueue();
                return;
            }

            const itemType = document.getElementById('itemType').value;
            if (itemType === 'PAKET') {
                tempExtractedRows = extractedRows;
                showWeightModal();
            } else {
                extractedRows.forEach(row => {
                    row.cw = "0.20"; row.p = isCn23Mode() ? 0 : 10; row.l = isCn23Mode() ? 0 : 10; row.t = isCn23Mode() ? 0 : 10; row.act = 0.2;
                    if (isCn23Mode()) row.insHarga = 20000;
                });
                uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: extractedRows });
                updateInterface();
                processNextInQueue(); 
            }
        }

        function showWeightModal() {
            const container = document.getElementById('weightListContainer');
            container.innerHTML = '';
            
            tempExtractedRows.forEach((row, index) => {
                container.innerHTML += `
                    <div class="weight-row">
                        <div class="weight-info">
                            <strong>${index+1}. ${row.name}</strong>
                            <span>${row.address}</span>
                        </div>
                        <div class="weight-calc-grid">
                            <div class="weight-input-group">
                                <label>Actual (Kg)</label>
                                <input type="number" step="0.1" min="0.2" class="w-act" data-index="${index}" value="${row.act || ''}" placeholder="1" oninput="calculateCW(${index})">
                            </div>
                            <div class="weight-input-group">
                                <label>Panjang (cm)</label>
                                <input type="number" class="w-p" data-index="${index}" value="${row.p || ''}" placeholder="10" oninput="calculateCW(${index})">
                            </div>
                            <div class="weight-input-group">
                                <label>Lebar (cm)</label>
                                <input type="number" class="w-l" data-index="${index}" value="${row.l || ''}" placeholder="10" oninput="calculateCW(${index})">
                            </div>
                            <div class="weight-input-group">
                                <label>Tinggi (cm)</label>
                                <input type="number" class="w-t" data-index="${index}" value="${row.t || ''}" placeholder="10" oninput="calculateCW(${index})">
                            </div>
                            <div class="cw-result">
                                <span style="font-size:0.6rem; color:#0277bd; font-weight:bold;">CHARGEABLE WEIGHT</span><br>
                                <span id="cw-text-${index}" style="font-size:1.1rem; font-weight:900; color:var(--pos-orange);">0.00 Kg</span>
                            </div>
                        </div>
                    </div>
                `;
            });

            document.getElementById('weightModal').style.display = 'flex';

            setTimeout(() => {
                tempExtractedRows.forEach((_, index) => calculateCW(index));
            }, 50);
        }

        function calculateCW(index) {
            const rowDiv = document.querySelector(`.w-act[data-index="${index}"]`).closest('.weight-row');
            const actStr = rowDiv.querySelector('.w-act').value.replace(',', '.');
            const act = parseFloat(actStr) || 0; 
            const p = parseFloat(rowDiv.querySelector('.w-p').value) || 0;
            const l = parseFloat(rowDiv.querySelector('.w-l').value) || 0;
            const t = parseFloat(rowDiv.querySelector('.w-t').value) || 0;
            
            const volumetric = (p * l * t) / 6000;
            const chargeableWeight = Math.max(act, volumetric);
            
            rowDiv.querySelector(`#cw-text-${index}`).innerText = chargeableWeight.toFixed(2) + " Kg";
        }

        function cancelWeightInput() {
            document.getElementById('weightModal').style.display = 'none';
            tempExtractedRows = [];
            processNextInQueue();
        }

        function saveWeightsAndProcess() {
            const actInputs = document.querySelectorAll('.w-act');
            actInputs.forEach(input => {
                const idx = input.getAttribute('data-index');
                const rowDiv = input.closest('.weight-row');
                
                const act = parseFloat(input.value.replace(',', '.')) || 0.2;
                const p = parseFloat(rowDiv.querySelector('.w-p').value) || 10;
                const l = parseFloat(rowDiv.querySelector('.w-l').value) || 10;
                const t = parseFloat(rowDiv.querySelector('.w-t').value) || 10;
                
                const vol = (p * l * t) / 6000;
                const cw = Math.max(act, vol);

                tempExtractedRows[idx].act = act;
                tempExtractedRows[idx].p = p;
                tempExtractedRows[idx].l = l;
                tempExtractedRows[idx].t = t;
                tempExtractedRows[idx].cw = cw.toFixed(2);
            });

            uploadedFilesManager.push({ id: Date.now(), name: currentFileName, rows: tempExtractedRows });
            
            tempExtractedRows = [];
            document.getElementById('weightModal').style.display = 'none';
            
            updateInterface();
            processNextInQueue();
        }

        // Nilai data Excel hanya boleh memuat huruf, angka, spasi, dan lima
        // karakter yang disetujui: titik, garis miring, tanda hubung, serta kurung.
        // Header schema Mile App tidak diproses karena nama kolomnya wajib tetap baku.
        const FORBIDDEN_EXCEL_CHARACTER_PATTERN = /[^\p{L}\p{N}\s./()\-]/gu;
        const FORBIDDEN_EXCEL_CHARACTER_TEST = /[^\p{L}\p{N}\s./()\-]/u;

        function sanitizeExcelText(value) {
            if (value === null || value === undefined) return "";
            return String(value)
                .normalize('NFKC')
                .replace(FORBIDDEN_EXCEL_CHARACTER_PATTERN, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function hasForbiddenExcelCharacters(value) {
            return typeof value === 'string' && FORBIDDEN_EXCEL_CHARACTER_TEST.test(value);
        }

        function sanitizeExcelRowValues(row) {
            return Object.fromEntries(Object.entries(row).map(([key, value]) => [
                key,
                typeof value === 'string' ? sanitizeExcelText(value) : value
            ]));
        }

        function cleanArtifacts(text) {
            if (!text) return "";
            const str = String(text).replace(/pdf\s*\+?\s*\d*/gi, '');
            return sanitizeExcelText(str).toUpperCase();
        }

        function isRecipientMachineCode(token) {
            const compact = String(token || '')
                .normalize('NFKC')
                .replace(/^[([{]+|[)\]},.;:]+$/g, '')
                .replace(/[\s/_.-]+/g, '');
            if (compact.length < 8) return false;
            return /\p{L}/u.test(compact) && /\d/u.test(compact) && (compact.match(/\d/g) || []).length >= 3;
        }

        function stripRecipientMachineCodes(text) {
            return String(text || '')
                .split(/\s+/)
                .filter(token => token && !isRecipientMachineCode(token))
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function cleanRecipientName(text) {
            return stripRecipientMachineCodes(cleanArtifacts(text)
                .replace(/^\s*(?:KEPADA\s+(?:YANG\s+TERHORMAT|YTH)|YTH|ATTN)\.?\s*[:,.\-]?\s*/i, '')
                .trim());
        }

        function cleanAddressArtifacts(text) {
            return cleanArtifacts(text)
                .replace(/\b0{5,}\b/g, ' ')
                .replace(/\s+/g, ' ')
                .trim();
        }

        function splitRecipientAndAddress(name, address) {
            const cleanName = cleanRecipientName(name);
            const cleanAddress = cleanAddressArtifacts(address);
            const match = /\b(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG|PASIR\s+PUTIH\s+RESIDENCE)\b/i.exec(cleanName);
            if (!match || match.index < 5) return { name: cleanName, address: cleanAddress };
            return {
                name: cleanName.slice(0, match.index).trim(),
                address: `${cleanName.slice(match.index).trim()} ${cleanAddress}`.replace(/\s+/g, ' ').trim()
            };
        }

        function cleanReference(text) { 
            if (!text) return "";
            const str = String(text).replace(/pdf\s*\+?\s*\d*/gi, '');
            return sanitizeExcelText(str).toUpperCase();
        }

        function cleanPhoneNumber(phone) {
            if (!phone) return "0";
            let str = String(phone).replace(/[^0-9]/g, ''); 
            str = str.replace(/^0+/, '0'); // Basmi Double Zero
            if (!str) return "0";
            if (str.startsWith('62')) { str = '0' + str.slice(2); }
            if (!str.startsWith('0')) { str = '0' + str; }
            return str;
        }

        function getZipCodeFromAddress(address, template, options = {}) {
            if (isCn23Mode(options)) {
                const match = window.MilePostalNational?.match?.(String(address || ''));
                return match?.status === 'matched' ? match.postcode : '';
            }
            const addrUpper = String(address).toUpperCase();

            let activeKelMapping = (template === 'MENSA') ? tpiKelurahanMapping : batamKelurahanMapping;
            let activeKecMapping = (template === 'MENSA') ? tpiKecamatanMapping : batamKecamatanMapping;
            let defaultZip = (template === 'MENSA') ? "29111" : "29411";

            let bestKelurahanCode = null;
            let highestKelIndex = -1;

            for (let item of activeKelMapping) {
                let matchIndex = addrUpper.lastIndexOf(item.keyword);
                if (matchIndex > -1 && matchIndex > highestKelIndex) {
                    highestKelIndex = matchIndex;
                    bestKelurahanCode = item.code;
                }
            }
            if (bestKelurahanCode) return bestKelurahanCode;

            let bestKecamatanCode = null;
            let highestKecIndex = -1;

            for (let item of activeKecMapping) {
                let matchIndex = addrUpper.lastIndexOf(item.keyword);
                if (matchIndex > -1 && matchIndex > highestKecIndex) {
                    highestKecIndex = matchIndex;
                    bestKecamatanCode = item.code;
                }
            }
            if (bestKecamatanCode) return bestKecamatanCode;

            return defaultZip;
        }

        function resolveZipCode(address, template, currentZip = '', options = {}) {
            if (isCn23Mode(options)) {
                const match = window.MilePostalNational?.match?.(String(address || ''), String(currentZip || '').trim());
                return match?.status === 'matched' ? match.postcode : '';
            }
            const addressText = String(address || '');
            const addressUpper = addressText.toUpperCase();

            // Tier 1: pertahankan kode pos yang benar-benar tercetak pada alamat.
            const printedZipCodes = addressText.match(/\b\d{5}\b/g) || [];
            const printedZip = printedZipCodes.find(code => /^(?:29|28)\d{3}$/.test(code)) || printedZipCodes[0];
            // Koreksi data lama: kode pos 29457 yang tercetak untuk Kelurahan Sadai
            // (Kecamatan Bengkong) harus diekspor sebagai kode resmi 29426.
            if (template !== 'MENSA' && printedZip === '29457' && /\bSADAI\b/.test(addressUpper)) return '29426';
            if (printedZip) return printedZip;

            // Tier 2: kelurahan → kecamatan → fallback kota dari database lokal.
            const mappedZip = getZipCodeFromAddress(address, template);
            return mappedZip || String(currentZip || '').trim() || (template === 'MENSA' ? '29111' : '29411');
        }

        function containsReviewMarker(value) {
            // Tanpa batas kata: hasil OCR dapat menempelkan penanda ke nomor/huruf,
            // misalnya "1070PERLU DICEK47" atau "PERLUDICEK".
            return /PERLU[\s._-]*(?:DI[\s._-]*)?CEK/i.test(String(value ?? ''));
        }

        function ensureRowIdentity(row) {
            if (!row._rowId) {
                rowIdentityCounter += 1;
                row._rowId = `row-${Date.now()}-${rowIdentityCounter}`;
            }
            return row._rowId;
        }

        function escapeAttribute(value) {
            return String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        }

        const reviewFieldKeys = Object.freeze([
            'noSurat', 'name', 'address', 'phone', 'cw', 'p', 'l', 't', 'insHarga'
        ]);

        const reviewFieldAliases = Object.freeze({
            nosurat: 'noSurat', no_surat: 'noSurat', nomor_surat: 'noSurat', reference: 'noSurat', referensi: 'noSurat', ref: 'noSurat',
            name: 'name', nama: 'name', nama_penerima: 'name', recipient_name: 'name',
            address: 'address', alamat: 'address', alamat_penerima: 'address', recipient_address: 'address',
            phone: 'phone', telepon: 'phone', telp: 'phone', nomor_hp: 'phone', no_hp: 'phone', whatsapp: 'phone', wa: 'phone',
            cw: 'cw', berat: 'cw', weight: 'cw',
            p: 'p', panjang: 'p', length: 'p',
            l: 'l', lebar: 'l', width: 'l',
            t: 't', tinggi: 't', height: 't',
            insharga: 'insHarga', ins_harga: 'insHarga', nilai_barang: 'insHarga', item_value: 'insHarga'
        });

        const reviewFieldNames = Object.freeze({
            noSurat: 'REF/SURAT', name: 'Nama', address: 'Alamat', phone: 'No. HP',
            cw: 'Berat', p: 'Panjang', l: 'Lebar', t: 'Tinggi', insHarga: 'Nilai Barang'
        });

        function normalizeReviewFieldKey(value) {
            const source = String(value ?? '').trim();
            if (!source) return '';
            if (reviewFieldKeys.includes(source)) return source;
            const normalized = source
                .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '_')
                .replace(/^_+|_+$/g, '');
            return reviewFieldAliases[normalized] || '';
        }

        function normalizeReviewFieldList(value) {
            const source = Array.isArray(value)
                ? value
                : (typeof value === 'string' ? value.split(/[,;|]/) : []);
            return Array.from(new Set(source.map(normalizeReviewFieldKey).filter(Boolean)));
        }

        function inferLegacyReviewFields(row) {
            const inferred = [];
            const add = field => { if (field && !inferred.includes(field)) inferred.push(field); };
            const name = String(row?.name || '');
            const address = String(row?.address || '');
            const noSurat = String(row?.noSurat || '');
            const administrativePattern = /\b(?:CABANG|CARRIAGE|TGL\s*TRANS|TGL\s*VALUTA|NO\s*DOKUMEN|URAIAN\s+MUTASI)\b/i;

            if (!name || /^\s*(?:KEPADA|YTH|ATTN)\b/i.test(name) || name.length > 72 || /\b(?:JL\.?|JALAN|RUKO|PERUM(?:AHAN)?|KOMP(?:LEK)?|KAVLING|GEDUNG)\b/i.test(name) || administrativePattern.test(name)) add('name');
            if (!address || administrativePattern.test(address)) add('address');
            if (administrativePattern.test(noSurat)) add('noSurat');

            const confidence = Number(row?.aiConfidence);
            if (Number.isFinite(confidence) && confidence < 0.82) {
                add('name');
                add('address');
            }

            // Batch lama hanya menyimpan needsVerification tanpa alasan field.
            // Tandai dua field utama agar keraguan tidak pernah berubah menjadi "bersih" secara diam-diam.
            if (!inferred.length) {
                add('name');
                add('address');
            }
            return inferred;
        }

        function hydrateAIReviewState(row) {
            if (row._aiReviewHydrated) return;
            const explicitFields = Array.from(new Set([
                ...normalizeReviewFieldList(row.aiReviewFields),
                ...normalizeReviewFieldList(row.reviewFields)
            ]));
            const fields = explicitFields.length
                ? explicitFields
                : (row.needsVerification ? inferLegacyReviewFields(row) : []);
            const sourcePage = Number(row.sourcePage || row.page || 0) || 0;
            const fallback = !explicitFields.length && Boolean(row.needsVerification);

            fields.forEach(field => {
                if (row._reviewState[field]) return;
                row._reviewState[field] = {
                    pending: true,
                    dirty: false,
                    originalValue: String(row[field] ?? ''),
                    source: fallback ? 'ai-row' : 'ai-field',
                    sourcePage,
                    reason: fallback
                        ? 'AI menandai baris ini perlu diperiksa, tetapi batch lama tidak menyimpan nama field yang spesifik.'
                        : `AI menandai ${reviewFieldNames[field] || field} sebagai bagian yang perlu diperiksa.`,
                    requiresChange: false
                };
            });
            row._aiReviewHydrated = true;
        }

        function getActiveReviewFieldKeys(row) {
            if (isCn23Mode()) {
                const fixedFields = ['p', 'l', 't', 'insHarga'];
                if (getDestinationMode() === 'mixed' && row && getShipmentRoute(row) === 'batam' && document.getElementById('useInsurance')?.checked) fixedFields.pop();
                return reviewFieldKeys.filter(field => !fixedFields.includes(field));
            }
            const isPackage = document.getElementById('itemType')?.value === 'PAKET';
            return isPackage
                ? reviewFieldKeys
                : reviewFieldKeys.filter(field => !['p', 'l', 't'].includes(field));
        }

        function ensureRowReviewState(row) {
            if (!row._reviewState || typeof row._reviewState !== 'object') {
                row._reviewState = {};
            }

            hydrateAIReviewState(row);

            // Rekonsiliasi setiap kali dipanggil. Dengan begitu, teks "perlu dicek"
            // tidak pernah dapat tersembunyi hanya karena status lama sempat ditandai selesai.
            reviewFieldKeys.forEach(field => {
                const currentValue = String(row[field] ?? '');
                const hasMarker = containsReviewMarker(currentValue);
                let state = row._reviewState[field];

                if (hasMarker && !state) {
                    state = row._reviewState[field] = {
                        pending: true,
                        dirty: false,
                        originalValue: currentValue,
                        source: 'text-marker',
                        reason: 'Teks masih mengandung penanda “PERLU DICEK”.',
                        requiresChange: true
                    };
                } else if (hasMarker && state && !state.pending) {
                    const previousResolvedValue = String(state.resolvedValue ?? state.originalValue ?? '');
                    state.pending = true;
                    state.dirty = currentValue.trim() !== previousResolvedValue.trim();
                    state.originalValue = previousResolvedValue || currentValue;
                    delete state.resolvedValue;
                }
                if (hasMarker && state) {
                    state.requiresChange = true;
                    state.reason = 'Teks masih mengandung penanda “PERLU DICEK”.';
                }
            });

            return row._reviewState;
        }

        function getFieldReviewState(row, field) {
            return ensureRowReviewState(row)[field] || null;
        }

        function isFieldReviewPending(row, field) {
            return Boolean(getFieldReviewState(row, field)?.pending);
        }

        function rowNeedsReview(row) {
            return getActiveReviewFieldKeys(row).some(field => isFieldReviewPending(row, field));
        }

        function pendingReviewFields(row) {
            return getActiveReviewFieldKeys(row).filter(field => isFieldReviewPending(row, field));
        }

        function reviewBadgeText(row, rowNumber) {
            const labels = pendingReviewFields(row).map(field => reviewFieldNames[field] || field);
            const sourcePage = Number(row?.sourcePage || row?.page || 0) || 0;
            return `No. ${rowNumber} · Periksa ${labels.join(', ') || 'data'}${sourcePage ? ` · Sumber ${sourcePage}` : ''}`;
        }

        function reviewBadgeTitle(row) {
            return pendingReviewFields(row)
                .map(field => getFieldReviewState(row, field)?.reason)
                .filter(Boolean)
                .join(' ');
        }

        function getPendingReviewCount() {
            return uploadedFilesManager.reduce((total, file) => total + file.rows.reduce((rowTotal, row) => {
                return rowTotal + getActiveReviewFieldKeys(row).filter(field => isFieldReviewPending(row, field)).length;
            }, 0), 0);
        }

        function findManagedRow(fileId, rowId) {
            const file = uploadedFilesManager.find(item => String(item.id) === String(fileId));
            if (!file) return null;
            const row = file.rows.find(item => ensureRowIdentity(item) === String(rowId));
            return row ? { file, row } : null;
        }

        const fieldClassMap = Object.freeze({
            'val-noSurat': 'noSurat',
            'val-name': 'name',
            'val-phone': 'phone',
            'val-cw': 'cw',
            'val-p': 'p',
            'val-l': 'l',
            'val-t': 't',
            'val-ins-harga': 'insHarga',
            'val-address': 'address'
        });

        function getManagedInputContext(input) {
            if (!(input instanceof HTMLInputElement)) return null;
            const tr = input.closest('tr[data-file-id][data-row-id]');
            if (!tr) return null;
            const managed = findManagedRow(tr.dataset.fileId, tr.dataset.rowId);
            if (!managed) return null;
            const matchedClass = Object.keys(fieldClassMap).find(className => input.classList.contains(className));
            if (!matchedClass) return null;
            return { ...managed, tr, field: fieldClassMap[matchedClass] };
        }

        function syncManagedRowFromInput(input) {
            const context = getManagedInputContext(input);
            if (!context) return null;

            const previousValue = String(context.row[context.field] ?? '');
            context.row[context.field] = input.value;
            if (context.field === 'address') {
                const template = document.getElementById('corporateTemplate')?.value || 'MANUAL';
                if (isCn23Mode()) {
                    if (previousValue !== input.value) {
                        delete context.row._confirmedNationalPostcode;
                        delete context.row._nationalPostcodeMatch;
                    }
                    const postalMatch = getNationalPostcodeMatch(context.row);
                    context.row.zip = postalMatch.status === 'matched' ? postalMatch.postcode : '';
                } else context.row.zip = resolveZipCode(input.value, template, context.row.zip);
                const outsideState = ensureOutsideBatamState(context.row);
                if (!isCn23Mode() && outsideState.detected && outsideState.resolution === 'corrected' && !isClearlyBatamAddress(input.value)) {
                    outsideState.pending = true;
                    outsideState.resolution = null;
                    context.row.outsideBatam = true;
                }
            }
            const states = ensureRowReviewState(context.row);
            let reviewState = states[context.field] || null;
            const currentValue = String(input.value ?? '');

            // Jika frasa penanda muncul atau masih tersisa, status wajib koreksi dibuka kembali.
            if (containsReviewMarker(currentValue)) {
                if (!reviewState) {
                    reviewState = states[context.field] = {
                        pending: true,
                        dirty: currentValue.trim() !== previousValue.trim(),
                        originalValue: previousValue || currentValue,
                        source: 'text-marker',
                        reason: 'Teks masih mengandung penanda “PERLU DICEK”.',
                        requiresChange: true
                    };
                } else {
                    reviewState.pending = true;
                    reviewState.requiresChange = true;
                    reviewState.reason = 'Teks masih mengandung penanda “PERLU DICEK”.';
                    delete reviewState.resolvedValue;
                }
            }

            if (reviewState?.pending) {
                const changed = currentValue.trim() !== String(reviewState.originalValue ?? '').trim();
                reviewState.dirty = changed;
                input.dataset.reviewPending = 'true';
                input.dataset.reviewOriginal = String(reviewState.originalValue ?? '');
                input.dataset.reviewDirty = String(changed);
                input.classList.toggle('is-review-dirty', changed);
            }
            return { ...context, reviewState };
        }

        function commitReviewCorrection(input) {
            const context = syncManagedRowFromInput(input);
            if (!context?.reviewState?.pending) {
                return { resolved: false, pending: false, reason: 'not-pending' };
            }

            const currentValue = String(input.value ?? '').trim();
            const originalValue = String(context.reviewState.originalValue ?? '').trim();
            const requiresChange = context.reviewState.requiresChange !== false;
            if (!currentValue) {
                context.reviewState.dirty = false;
                input.dataset.reviewDirty = 'false';
                input.classList.remove('is-review-dirty');
                return { resolved: false, pending: true, reason: 'empty' };
            }
            if (currentValue === originalValue && requiresChange) {
                context.reviewState.dirty = false;
                input.dataset.reviewDirty = 'false';
                input.classList.remove('is-review-dirty');
                return { resolved: false, pending: true, reason: 'unchanged' };
            }
            if (containsReviewMarker(currentValue)) {
                context.reviewState.pending = true;
                context.reviewState.dirty = true;
                input.dataset.reviewPending = 'true';
                input.dataset.reviewDirty = 'true';
                input.classList.add('needs-review-field', 'is-review-dirty');
                input.closest('td')?.classList.add('needs-review-cell');
                return { resolved: false, pending: true, reason: 'marker-remains' };
            }

            context.reviewState.pending = false;
            context.reviewState.dirty = false;
            context.reviewState.resolvedValue = input.value;
            input.dataset.reviewPending = 'false';
            input.dataset.reviewDirty = 'false';
            input.classList.remove('needs-review-field', 'is-review-dirty');
            input.closest('td')?.classList.remove('needs-review-cell');

            const rowStillPending = rowNeedsReview(context.row);
            context.tr.dataset.needsReview = String(rowStillPending);
            context.tr.classList.toggle('needs-review', rowStillPending);
            const badge = context.tr.querySelector('.review-row-badge');
            if (badge) {
                badge.hidden = !rowStillPending;
                badge.textContent = reviewBadgeText(context.row, context.tr.dataset.rowNumber || '?');
                badge.title = reviewBadgeTitle(context.row);
            }

            return { resolved: true, pending: false, reason: 'changed', rowStillPending };
        }

        function ensureOutsideBatamState(row) {
            if (!row._outsideBatamState || typeof row._outsideBatamState !== 'object') {
                row._outsideBatamState = {
                    detected: Boolean(row.outsideBatam),
                    pending: Boolean(row.outsideBatam),
                    resolution: null,
                    originalAddress: String(row.address || ''),
                    reason: String(row.outsideBatamReason || '')
                };
            } else if (row.outsideBatam && row._outsideBatamState.resolution !== 'keep') {
                row._outsideBatamState.detected = true;
                row._outsideBatamState.pending = true;
                row._outsideBatamState.reason ||= String(row.outsideBatamReason || '');
            }
            return row._outsideBatamState;
        }

        function isOutsideBatamPending(row) {
            if (isCn23Mode()) return false;
            return Boolean(ensureOutsideBatamState(row).pending);
        }

        function getPendingOutsideBatamCount() {
            return uploadedFilesManager.reduce((total, file) => total + file.rows.filter(isOutsideBatamPending).length, 0);
        }

        function normalizeAddressForComparison(address) {
            return String(address || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
        }

        function isClearlyBatamAddress(address) {
            const upper = String(address || '').toUpperCase();
            const printedZipCodes = upper.match(/\b\d{5}\b/g) || [];
            if (printedZipCodes.some(code => !/^294\d{2}$/.test(code))) return false;
            if (printedZipCodes.some(code => /^294\d{2}$/.test(code))) return true;
            if (/\b(?:KOTA\s+)?BATAM\b/.test(upper)) return true;
            return [...batamKelurahanMapping, ...batamKecamatanMapping]
                .some(item => upper.includes(item.keyword));
        }

        function keepOutsideBatamRow(fileId, rowId) {
            const managed = findManagedRow(fileId, rowId);
            if (!managed || !isOutsideBatamPending(managed.row)) return false;
            const state = ensureOutsideBatamState(managed.row);
            const address = String(managed.row.address || '').trim();
            const originalAddress = String(state.originalAddress || '').trim();

            if (!address) {
                window.alert('Alamat penerima wajib diisi sebelum koreksi dapat disimpan.');
                return false;
            }
            if (normalizeAddressForComparison(address) === normalizeAddressForComparison(originalAddress)) {
                window.alert('Alamat luar Kota Batam belum diperbaiki. Ubah alamatnya terlebih dahulu, lalu simpan koreksi.');
                return false;
            }
            if (!isClearlyBatamAddress(address)) {
                window.alert('Alamat hasil koreksi belum menunjukkan wilayah Kota Batam. Lengkapi nama wilayah Batam atau kode pos 294xx, atau hapus baris jika tujuan memang di luar Batam.');
                return false;
            }
            if (!window.confirm(`Simpan alamat yang sudah diperbaiki sebagai alamat Kota Batam?

${address || '(alamat kosong)'}

Pastikan nama wilayah dan kode posnya sudah benar.`)) return false;

            state.pending = false;
            state.resolution = 'corrected';
            state.resolvedAt = new Date().toISOString();
            state.correctedAddress = address;
            managed.row.outsideBatam = false;
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Koreksi alamat Kota Batam berhasil disimpan.', 'success');
            return true;
        }

        function deleteOutsideBatamRow(fileId, rowId) {
            const managed = findManagedRow(fileId, rowId);
            if (!managed || !isOutsideBatamPending(managed.row)) return false;
            const label = managed.row.name || managed.row.noSurat || 'baris ini';
            const address = String(managed.row.address || '').trim();
            if (!window.confirm(`Hapus data “${label}” karena alamat penerima memang di luar Kota Batam?

${address || '(alamat kosong)'}

Baris ini tidak akan ikut diekspor.`)) return false;

            managed.file.rows = managed.file.rows.filter(item => ensureRowIdentity(item) !== String(rowId));
            if (managed.file.rows.length === 0) {
                uploadedFilesManager = uploadedFilesManager.filter(item => String(item.id) !== String(fileId));
            }
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Baris alamat luar Kota Batam telah dihapus.', 'success');
            return true;
        }

        function getAiPdfManagedFiles() {
            return uploadedFilesManager.filter(file => file && (file.source === 'AI PDF' || /\.pdf$/i.test(String(file.name || ''))));
        }

        function updateBulkPdfReferenceEditor() {
            const editor = document.getElementById('bulkPdfReferenceEditor');
            const hint = document.getElementById('bulkPdfReferenceHint');
            if (!editor) return;
            const pdfFiles = getAiPdfManagedFiles();
            const rowTotal = pdfFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0);
            editor.hidden = rowTotal === 0;
            if (hint && rowTotal > 0) {
                hint.textContent = `Nilai akan diterapkan ke ${rowTotal} baris dari ${pdfFiles.length} PDF hasil AI.`;
            }
        }

        function setPdfReferenceForAllRows(rawValue) {
            const pdfFiles = getAiPdfManagedFiles();
            const rows = pdfFiles.flatMap(file => Array.isArray(file.rows) ? file.rows : []);
            if (!rows.length) {
                if (typeof window.showToast === 'function') window.showToast('Belum ada hasil PDF AI yang dapat diperbarui.', 'error');
                else alert('Belum ada hasil PDF AI yang dapat diperbarui.');
                return;
            }

            const value = cleanReference(rawValue);
            rows.forEach(row => {
                const states = ensureRowReviewState(row);
                row.noSurat = value;
                const state = states.noSurat;
                if (state?.pending) {
                    const corrected = Boolean(value.trim()) &&
                        !containsReviewMarker(value) &&
                        value.trim() !== String(state.originalValue || '').trim();
                    state.pending = !corrected;
                    state.dirty = corrected ? false : value.trim() !== String(state.originalValue || '').trim();
                    if (corrected) state.resolvedValue = value;
                    else delete state.resolvedValue;
                }
            });
            updateInterface();
            if (typeof window.showToast === 'function') {
                window.showToast(value ? `No Ref “${value}” diterapkan ke ${rows.length} baris PDF.` : `No Ref dikosongkan pada ${rows.length} baris PDF.`, 'success');
            }
        }

        function applyPdfReferenceToAllRows() {
            const input = document.getElementById('bulkPdfReferenceValue');
            const value = String(input?.value || '').trim();
            if (!value) {
                if (typeof window.showToast === 'function') window.showToast('Isi No Ref terlebih dahulu, atau gunakan tombol “Kosongkan semua”.', 'error');
                else alert('Isi No Ref terlebih dahulu.');
                input?.focus();
                return;
            }
            const pdfFiles = getAiPdfManagedFiles();
            const rowTotal = pdfFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0);
            if (!window.confirm(`Terapkan No Ref “${value.toUpperCase()}” ke seluruh ${rowTotal} baris hasil PDF?`)) return;
            setPdfReferenceForAllRows(value);
        }

        function clearPdfReferenceForAllRows() {
            const pdfFiles = getAiPdfManagedFiles();
            const rowTotal = pdfFiles.reduce((total, file) => total + (Array.isArray(file.rows) ? file.rows.length : 0), 0);
            if (!rowTotal) {
                if (typeof window.showToast === 'function') window.showToast('Belum ada hasil PDF AI yang dapat diperbarui.', 'error');
                return;
            }
            if (!window.confirm(`Kosongkan No Ref pada seluruh ${rowTotal} baris hasil PDF?`)) return;
            const input = document.getElementById('bulkPdfReferenceValue');
            if (input) input.value = '';
            setPdfReferenceForAllRows('');
        }

        window.applyPdfReferenceToAllRows = applyPdfReferenceToAllRows;
        window.clearPdfReferenceForAllRows = clearPdfReferenceForAllRows;

        function deleteFileFromQueue(id) {
            const file = uploadedFilesManager.find(item => String(item.id) === String(id));
            if (!file) return;
            if (!window.confirm(`Hapus berkas "${file.name}" beserta ${file.rows.length} baris datanya?`)) return;
            uploadedFilesManager = uploadedFilesManager.filter(item => String(item.id) !== String(id));
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Berkas dan seluruh barisnya telah dihapus.', 'success');
        }

        function deleteDataRow(fileId, rowId) {
            const managed = findManagedRow(fileId, rowId);
            if (!managed) return;
            const label = managed.row.name || managed.row.noSurat || 'baris ini';
            if (!window.confirm(`Hapus data "${label}" dari tabel?`)) return;

            managed.file.rows = managed.file.rows.filter(item => ensureRowIdentity(item) !== String(rowId));
            if (managed.file.rows.length === 0) {
                uploadedFilesManager = uploadedFilesManager.filter(item => String(item.id) !== String(fileId));
            }
            updateInterface();
            if (typeof window.showToast === 'function') window.showToast('Baris berhasil dihapus.', 'success');
        }

        window.containsReviewMarker = containsReviewMarker;
        window.commitReviewCorrection = commitReviewCorrection;
        window.syncManagedRowFromInput = syncManagedRowFromInput;
        window.getPendingReviewCount = getPendingReviewCount;
        window.getPendingOutsideBatamCount = getPendingOutsideBatamCount;
        window.keepOutsideBatamRow = keepOutsideBatamRow;
        window.deleteOutsideBatamRow = deleteOutsideBatamRow;
        window.deleteFileFromQueue = deleteFileFromQueue;
        window.deleteDataRow = deleteDataRow;

        function getShipmentRoute(row) {
            const match = getNationalPostcodeMatch(row);
            const region = match.selected || (match.status === 'matched' && match.candidates?.length === 1 ? match.candidates[0] : null);
            if (match.status !== 'matched' || !region) return 'pending';
            const city = String(region.city || '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim();
            if (!city) return 'pending';
            return /^(?:KOTA )?BATAM$/.test(city) ? 'batam' : 'cn23';
        }

        function renderNationalPostcodeReview(row) {
            const match = getNationalPostcodeMatch(row);
            const selected = match.selected || (match.status === 'matched' && match.candidates?.length === 1 ? match.candidates[0] : null);
            const ready = match.status === 'matched' && selected;
            row.zip = ready ? selected.postcode : '';
            const message = ready
                ? `${match.confirmed ? 'Pilihan petugas' : 'Kode pos otomatis'}: ${selected.postcode}`
                : match.status === 'ambiguous' ? 'Ada beberapa lokasi bernama sama. Periksa alamat penerima pada foto.'
                : match.status === 'unavailable' ? (nationalPostcodeLoadError || 'Memuat database kode pos nasional…')
                : 'Alamat belum cukup jelas untuk menentukan kode pos. Periksa tulisan pada foto.';
            const selectedLabel = ready ? `<small>${escapeAttribute(selected.label || `${selected.village} / ${selected.district} / ${selected.city} / ${selected.province}`)}</small>` : '';
            return `<td class="national-postcode-review" data-postcode-status="${ready ? 'matched' : escapeAttribute(match.status)}">
                ${getDestinationMode() === 'mixed' ? `<strong>${getShipmentRoute(row) === 'batam' ? 'Batam · Excel Mile' : getShipmentRoute(row) === 'cn23' ? 'Luar kota · Antrean CN23' : 'Tujuan perlu diperiksa'}</strong>` : ''}
                <span>${escapeAttribute(message)}</span>${selectedLabel}
                ${!ready ? '<small>Kode pos ditentukan otomatis dari alamat. Nama kota atau rincian alamat belum cukup terbaca.</small>' : ''}
            </td>`;
        }

        function refreshNationalRowReview(row, tr) {
            const postalCell = tr?.querySelector('.national-postcode-review');
            // Hanya kolom wilayah diganti. Editor alamat dan status pemeriksaan AI
            // tetap berada pada node yang sama agar fokus serta kursor tidak berpindah.
            if (postalCell) postalCell.outerHTML = renderNationalPostcodeReview(row);
            updateNationalRouteSummary();
        }

        function updateNationalRouteSummary() {
            const mixed = getDestinationMode() === 'mixed';
            const routeCounts = { batam: 0, cn23: 0, pending: 0 };
            if (mixed) uploadedFilesManager.forEach(file => file.rows.forEach(row => { routeCounts[getShipmentRoute(row)] += 1; }));
            const batamExportButton = document.getElementById('exportBatamButton');
            const cn23ExportButton = document.getElementById('exportCn23Button');
            if (batamExportButton) batamExportButton.disabled = !mixed || routeCounts.batam === 0 || routeCounts.pending > 0;
            if (cn23ExportButton) cn23ExportButton.disabled = !mixed || routeCounts.cn23 === 0 || routeCounts.pending > 0;
            [['batam', 'batamRoute'], ['cn23', 'cn23Route'], ['pending', 'pendingRoute']].forEach(([route, prefix]) => {
                const summary = document.getElementById(`${prefix}Summary`);
                const count = document.getElementById(`${prefix}Count`);
                if (summary) { summary.hidden = !mixed; summary.style.display = mixed ? '' : 'none'; }
                if (count) count.textContent = String(routeCounts[route]);
            });
        }

        function updateInterface() {
            applyDestinationMode();
            const cn23 = isCn23Mode();
            const mixed = getDestinationMode() === 'mixed';
            updateNationalRouteSummary();
            const exportHint = document.getElementById('exportFormatHint');
            if (exportHint) {
                if (!exportHint.dataset.batamText) exportHint.dataset.batamText = exportHint.textContent;
                exportHint.textContent = mixed
                    ? 'Dua file terpisah: Excel Mile untuk Batam dan Antrean CN23 untuk luar kota. Lengkapi semua tujuan sebelum ekspor. Kode pos mengikuti wilayah database nasional yang tampil di tabel.'
                    : cn23 ? 'Antrean CN23 dokumen untuk alat bantu entri. File ini bukan format unggah Excel Mile. Kode tujuan diperiksa nanti pada pilihan wilayah di Mile.' : exportHint.dataset.batamText;
            }
            const fileQueueDiv = document.getElementById('fileQueue');
            if (uploadedFilesManager.length === 0) {
                fileQueueDiv.innerHTML = `<div style="text-align: center; color: #888; font-size: 0.75rem; padding: 15px; font-style: italic;">Antrean kosong.</div>`;
            } else {
                fileQueueDiv.innerHTML = "";
                uploadedFilesManager.forEach(file => {
                    file.rows.forEach(row => {
                        ensureRowIdentity(row);
                        ensureRowReviewState(row);
                        ensureOutsideBatamState(row);
                    });
                    fileQueueDiv.innerHTML += `
                        <div class="file-item">
                            <span style="font-weight:600;">📄 ${escapeAttribute(file.name)} (${file.rows.length} Baris)</span>
                            <button class="btn-delete-file" type="button" data-action="delete-file" data-file-id="${escapeAttribute(file.id)}">Hapus</button>
                        </div>`;
                });
            }

            updateBulkPdfReferenceEditor();

            const useInsurance = document.getElementById('useInsurance').checked;
            const isPackage = document.getElementById('itemType')?.value === 'PAKET';
            const resultTable = document.getElementById('resultTable');
            resultTable?.classList.toggle('is-document-review', !isPackage);
            resultTable?.classList.toggle('is-package-review', isPackage);
            const thead = document.querySelector('#resultTable thead');
            thead.innerHTML = `
                <tr>
                    <th style="width: 3%; text-align: center;">NO</th>
                    <th class="weight-column-heading" style="width: 7%;">KG</th>
                    <th style="width: 20%;">NAMA PENERIMA</th>
                    <th style="width: 13%;">REF/SURAT</th>
                    <th style="width: 36%;">ALAMAT</th>
                    ${cn23 ? '<th>KODE POS / WILAYAH CN23</th>' : ''}
                    <th style="width: 10%;">NO HP</th>
                    ${isPackage ? '<th style="width: 8%;">PxLxT</th>' : ''}
                    ${useInsurance ? '<th style="width: 9%;">NILAI BRG(Rp)</th>' : ''}
                    <th class="action-column-heading" style="width: 8%; text-align:center;">AKSI</th>
                </tr>
            `;

            const tbody = document.querySelector('#resultTable tbody');
            tbody.innerHTML = '';
            let counter = 0;

            uploadedFilesManager.forEach(file => {
                file.rows.forEach(item => {
                    counter++;
                    const rowId = ensureRowIdentity(item);
                    ensureRowReviewState(item);
                    const outsideState = ensureOutsideBatamState(item);
                    const outsidePending = !cn23 && Boolean(outsideState.pending);
                    const tr = document.createElement('tr');
                    tr.dataset.fileId = String(file.id);
                    tr.dataset.rowId = rowId;
                    tr.dataset.rowNumber = String(counter);
                    if (item.aiExtractionFailed && !String(item.name || '').trim() && !String(item.address || '').trim()) {
                        tr.dataset.needsReview = 'true'; tr.className = 'needs-review';
                        const columnCount = 7 + (cn23 ? 1 : 0) + (isPackage ? 1 : 0) + (useInsurance ? 1 : 0);
                        const cell = document.createElement('td'); cell.colSpan = columnCount;
                        cell.textContent = `Foto ${Number(item.sourcePage) || counter} belum berhasil dibaca setelah percobaan ulang otomatis. Foto asli tetap tersimpan; coba proses kembali saat koneksi tersedia.`;
                        tr.append(cell); tbody.append(tr); return;
                    }
                    const needsReview = rowNeedsReview(item);
                    tr.dataset.needsReview = String(needsReview);
                    tr.classList.toggle('needs-review', needsReview);
                    tr.dataset.outsideBatamPending = String(outsidePending);
                    tr.classList.toggle('outside-batam', outsidePending);

                    const reviewClass = field => isFieldReviewPending(item, field) ? ' needs-review-field' : '';
                    const reviewAttributes = field => {
                        const state = getFieldReviewState(item, field);
                        const pending = Boolean(state?.pending);
                        const dirty = Boolean(state?.dirty);
                        const original = state?.originalValue ?? '';
                        const reason = state?.reason ?? '';
                        const sourcePage = Number(state?.sourcePage || item.sourcePage || item.page || 0) || 0;
                        const requiresChange = state?.requiresChange !== false;
                        return ` data-review-field="${field}" data-review-pending="${pending}" data-review-dirty="${dirty}" data-review-original="${escapeAttribute(original)}" data-review-reason="${escapeAttribute(reason)}" data-review-source-page="${sourcePage}" data-review-requires-change="${requiresChange}"${reason ? ` title="${escapeAttribute(reason)}"` : ''}`;
                    };
                    const cn23Item = cn23 && (!mixed || getShipmentRoute(item) !== 'batam');
                    let insValue = cn23Item ? 20000 : (item.insHarga !== undefined ? item.insHarga : 0);
                    let insColumn = useInsurance ? `<td><input type="number" class="table-input val-ins-harga${reviewClass('insHarga')}"${reviewAttributes('insHarga')} value="${escapeAttribute(insValue)}" ${cn23Item ? 'readonly title="Nilai deklarasi preset CN23 dokumen"' : ''} style="color:#2e7d32; font-weight:bold;"></td>` : ``;
                    let packageColumns = isPackage ? `
                        <td>
                            <div class="dim-box">
                                <input type="text" class="val-p${reviewClass('p')}"${reviewAttributes('p')} value="${escapeAttribute(item.p || 10)}">x
                                <input type="text" class="val-l${reviewClass('l')}"${reviewAttributes('l')} value="${escapeAttribute(item.l || 10)}">x
                                <input type="text" class="val-t${reviewClass('t')}"${reviewAttributes('t')} value="${escapeAttribute(item.t || 10)}">
                            </div>
                        </td>` : '';

                    tr.innerHTML = `
                        <td class="row-number-cell" style="text-align:center; font-weight:bold; color:var(--pos-orange);">${counter}</td>
                        <td class="row-weight-cell"><input type="text" inputmode="decimal" aria-label="Berat kiriman ${counter} dalam kg" class="table-input val-cw${reviewClass('cw')}"${reviewAttributes('cw')} style="font-weight:bold; color:#0277bd;" value="${escapeAttribute(item.cw ?? '0.20')}"></td>
                        <td><input type="text" class="table-input val-name${reviewClass('name')}"${reviewAttributes('name')} value="${escapeAttribute(item.name || '')}"></td>
                        <td><input type="text" class="table-input val-noSurat${reviewClass('noSurat')}"${reviewAttributes('noSurat')} value="${escapeAttribute(item.noSurat || '')}"></td>
                        <td><input type="text" class="table-input val-address${reviewClass('address')}"${reviewAttributes('address')} value="${escapeAttribute(item.address || '')}"></td>
                        ${cn23 ? renderNationalPostcodeReview(item) : ''}
                        <td><input type="text" class="table-input val-phone${reviewClass('phone')}"${reviewAttributes('phone')} value="${escapeAttribute(item.phone || '')}"></td>
                        ${packageColumns}
                        ${insColumn}
                        <td class="row-action-cell">
                            <span class="outside-batam-badge" ${outsidePending ? '' : 'hidden'} title="${escapeAttribute(outsideState.reason || 'AI mendeteksi alamat penerima di luar Kota Batam.')}">Alamat luar Kota Batam</span>
                            <span class="review-row-badge" ${needsReview ? '' : 'hidden'} title="${escapeAttribute(reviewBadgeTitle(item))}">${escapeAttribute(reviewBadgeText(item, counter))}</span>
                            <div class="outside-batam-row-actions" ${outsidePending ? '' : 'hidden'}>
                                <button class="outside-batam-keep-row" type="button" data-action="keep-outside-batam" data-file-id="${escapeAttribute(file.id)}" data-row-id="${escapeAttribute(rowId)}">Simpan koreksi alamat</button>
                                <button class="outside-batam-delete-row" type="button" data-action="delete-outside-batam" data-file-id="${escapeAttribute(file.id)}" data-row-id="${escapeAttribute(rowId)}">Hapus</button>
                            </div>
                            <button class="row-delete-button" type="button" aria-label="Hapus baris ${counter}" title="Hapus baris" data-action="delete-row" data-file-id="${escapeAttribute(file.id)}" data-row-id="${escapeAttribute(rowId)}">
                                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14M10 10v6m4-6v6"/></svg>
                                <span>Hapus</span>
                            </button>
                        </td>
                    `;
                    tbody.appendChild(tr);
                });
            });

            if (counter === 0) {
                const columnCount = 7 + (cn23 ? 1 : 0) + (isPackage ? 1 : 0) + (useInsurance ? 1 : 0);
                const emptyMessage = document.body.dataset.primarySource === 'camera'
                    ? 'Ambil foto melalui Camera HP atau muat batch dari Log Kamera untuk memulai.'
                    : 'Tarik file PDF, Excel, atau CSV ke panel kiri untuk memulai.';
                tbody.innerHTML = `<tr><td colspan="${columnCount}" style="text-align: center; color: #888; padding: 40px; font-style: italic;">${emptyMessage}</td></tr>`;
            }
        }

        function shipmentWeight(value, rowNumber) {
            const text = String(value ?? '0.20').trim().replace(',', '.');
            const weight = /^\d+(?:\.\d+)?$/.test(text) ? Number(text) : NaN;
            if (!Number.isFinite(weight) || weight <= 0) throw new Error(`Berat pada baris ${rowNumber} harus berupa angka lebih dari 0 kg (contoh: 0,2 atau 1,5).`);
            return weight;
        }

        function buildCn23QueueRows(rows, configuration = {}) {
            const mode = configuration.clientMode || document.getElementById('clientMode')?.value || 'RITEL';
            if (!['RITEL', 'KORPORAT'].includes(mode)) throw new Error('CN23 Dokumen mendukung kiriman Ritel atau Korporat. Pilih jenis pelanggan tersebut terlebih dahulu.');
            const template = configuration.corporateTemplate || document.getElementById('corporateTemplate')?.value || 'MANUAL';
            const preset = mode === 'KORPORAT' ? getCorporateTemplatePreset(template) : null;
            if (mode === 'KORPORAT' && template !== 'MANUAL' && !preset) throw new Error('Template pelanggan korporat tidak dikenali.');
            const value = (key, defaultValue = '') => configuration[key] ?? document.getElementById(key)?.value ?? defaultValue;
            const customerCode = mode === 'KORPORAT' ? resolveCorporateCustomerId(template, value('customerId')) : '';
            if (mode === 'KORPORAT' && !customerCode) throw new Error('Kode Pelanggan wajib diisi untuk antrean CN23 korporat.');
            const senderName = cleanArtifacts(preset?.senderName || value('senderName'));
            if (!senderName) throw new Error('Nama pengirim wajib diisi sebelum ekspor antrean CN23.');
            const senderPhone = mode === 'KORPORAT' ? '0' : cleanPhoneNumber(value('senderPhone'));
            const senderAddress = mode === 'KORPORAT' ? senderName : cleanAddressArtifacts(value('senderAddress'));
            if (mode === 'RITEL' && !senderAddress) throw new Error('Alamat pengirim ritel wajib diisi sebelum ekspor antrean CN23.');
            const payment = mode === 'KORPORAT' ? String(value('cn23PaymentMethod', 'INVOICE')).toUpperCase() : 'CASH';
            if (mode === 'KORPORAT' && !['INVOICE', 'CREDIT'].includes(payment)) throw new Error('Metode pembayaran CN23 korporat harus Invoice atau CREDIT.');
            const service = String(preset?.lockService ? preset.defaultServiceCode : value('serviceCode', 'PKH')).toUpperCase();
            const insurance = configuration.useInsurance ?? Boolean(document.getElementById('useInsurance')?.checked);
            const instruction = cleanArtifacts(value('cn23Instructions', 'Tolong diantar dengan baik'));
            const description = cleanArtifacts(value('cn23Description', 'Dokumen'));
            return rows.map((row, index) => {
                if (getDestinationMode(configuration) === 'mixed' && getShipmentRoute(row) !== 'cn23') throw new Error(`Baris ${index + 1} bukan kiriman luar Kota Batam yang siap. Ekspor CN23 campuran hanya memuat tujuan luar Batam.`);
                const name = cleanRecipientName(row.name);
                const address = cleanAddressArtifacts(row.address);
                if (!name || !address) throw new Error(`Nama dan alamat penerima wajib diisi pada baris ${index + 1}.`);
                const reference = cleanReference(row.noSurat);
                if (preset?.senderNameFromReference && !reference) throw new Error(`No Ref/Surat wajib diisi pada baris ${index + 1} untuk template ${senderName}.`);
                const match = getNationalPostcodeMatch(row);
                const region = match.selected || (match.status === 'matched' && match.candidates?.length === 1 ? match.candidates[0] : null);
                if (match.status !== 'matched' || !region) {
                    if (match.status === 'unavailable') throw new Error(nationalPostcodeLoadError || 'Database kode pos nasional belum siap. Muat ulang halaman atau coba lagi sebelum ekspor.');
                    throw new Error(`Wilayah tujuan pada baris ${index + 1} ${match.status === 'ambiguous' ? 'masih memiliki beberapa pilihan karena alamat belum cukup rinci' : 'belum ditemukan'}. Lengkapi alamat penerima agar kode pos dapat ditentukan otomatis.`);
                }
                if (getShipmentRoute(row) === 'batam') throw new Error(`Baris ${index + 1} adalah kiriman tujuan Kota Batam. Pilih mode Capture Campuran agar kiriman Batam dan luar kota diekspor menjadi dua file terpisah.`);
                return sanitizeExcelRowValues({
                    queue_id: String(row._rowId || `CN23-${index + 1}`),
                    workflow: 'CN23 DOKUMEN LUAR KOTA',
                    queue_status: 'SIAP',
                    customer_mode: mode,
                    customer_code: customerCode,
                    sender_name: preset?.senderNameFromReference ? reference : senderName,
                    sender_phone: senderPhone,
                    sender_address: senderAddress,
                    sender_postcode: '29411',
                    recipient_name: name,
                    recipient_phone: cleanPhoneNumber(row.phone),
                    recipient_address: address,
                    recipient_postcode: String(region.postcode),
                    recipient_village: region.village,
                    recipient_region_scope: match.regionScope || 'VILLAGE',
                    recipient_district: region.district,
                    recipient_city: region.city,
                    recipient_province: region.province,
                    destination_code: '',
                    postcode_review: match.confirmed ? 'PILIHAN PETUGAS' : match.regionScope === 'CITY_POSTCODE' ? 'KODE POS KOTA OTOMATIS' : match.routingDefault ? 'KODE POS KECAMATAN OTOMATIS' : 'COCOK DATABASE',
                    service_code: service,
                    payment_method: payment,
                    insurance: insurance ? 'Y' : 'N',
                    ref_no: reference,
                    shipping_instruction: instruction,
                    description,
                    cod: 'NON-COD',
                    item_type: 'DOKUMEN',
                    nature_of_goods: 'Documents',
                    shipment_category: 'Ecommerce/Biasa',
                    npwp: '000000000000000',
                    hs_code: '49011000',
                    item_name: 'DOKUMEN',
                    quantity: 1,
                    item_value_idr: 20000,
                    weight_kg: shipmentWeight(row.cw, index + 1),
                    length_cm: 0,
                    width_cm: 0,
                    height_cm: 0,
                    koli_count: 1,
                    country_of_origin: 'ID',
                    packaging_code: 'EN',
                    packaging_name: 'Envelope',
                    imei_1: '0',
                    imei_2: '0'
                });
            });
        }

        async function downloadCn23Queue(rows = uploadedFilesManager.flatMap(file => file.rows), expectedDestinationMode = getDestinationMode()) {
            if (!await refreshNationalPostcodes()) { alert(nationalPostcodeLoadError); return; }
            if (getDestinationMode() !== expectedDestinationMode) { alert('Mode tujuan berubah saat menyiapkan ekspor. Jalankan ekspor kembali sesuai mode yang dipilih.'); return; }
            try {
                const exportRows = buildCn23QueueRows(rows);
                const worksheet = XLSX.utils.json_to_sheet(exportRows);
                const headers = Object.keys(exportRows[0] || {});
                ['queue_id', 'customer_code', 'sender_phone', 'sender_postcode', 'recipient_phone', 'recipient_postcode', 'npwp', 'hs_code', 'imei_1', 'imei_2'].forEach(header => {
                    const column = headers.indexOf(header);
                    for (let rowIndex = 1; rowIndex <= exportRows.length; rowIndex++) {
                        const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: column })];
                        if (cell) { cell.t = 's'; cell.v = String(cell.v); cell.z = '@'; }
                    }
                });
                const workbook = XLSX.utils.book_new();
                XLSX.utils.book_append_sheet(workbook, worksheet, 'CN23_ANTREAN');
                XLSX.writeFile(workbook, `Antrean_CN23_Dokumen_${document.getElementById('clientMode')?.value || 'RITEL'}.xlsx`);
            } catch (error) {
                alert(error?.message || 'Antrean CN23 belum dapat diekspor. Periksa data tujuan.');
            }
        }

        function downloadLocalExcel() { return downloadFinalExcel({ partition: 'batam' }); }
        function downloadCn23Excel() { return downloadFinalExcel({ partition: 'cn23' }); }
        window.downloadLocalExcel = downloadLocalExcel;
        window.downloadCn23Excel = downloadCn23Excel;

        async function downloadFinalExcel(options = {}) {
            const destinationModeAtExport = getDestinationMode();
            if (typeof window.XLSX === 'undefined') {
                try {
                    if (!window.MileVendorLoader?.loadSheetJs) throw new Error('Pemuat library spreadsheet tidak tersedia.');
                    const exportButton = document.getElementById('exportButton');
                    if (exportButton) exportButton.disabled = true;
                    await window.MileVendorLoader.loadSheetJs();
                    if (exportButton) exportButton.disabled = false;
                } catch (error) {
                    const exportButton = document.getElementById('exportButton');
                    if (exportButton) exportButton.disabled = false;
                    alert(error?.message || 'Library spreadsheet gagal dimuat. Periksa koneksi lalu coba lagi.');
                    return;
                }
            }
            if (getDestinationMode() !== destinationModeAtExport) { alert('Mode tujuan berubah saat menyiapkan ekspor. Jalankan ekspor kembali sesuai mode yang dipilih.'); return; }
            let rows = Array.from(document.querySelectorAll('#resultTable tbody tr'));
            if (rows.length === 0 || rows[0].querySelector('input') === null) {
                alert("Tidak ada data untuk diekspor."); return;
            }

            document.querySelectorAll('#resultTable tbody tr input').forEach(input => syncManagedRowFromInput(input));

            if (destinationModeAtExport === 'mixed') {
                if (!['RITEL', 'KORPORAT'].includes(document.getElementById('clientMode')?.value)) {
                    alert('Capture campuran dokumen mendukung pelanggan Ritel atau Korporat. Pilih salah satunya sebelum ekspor.');
                    return;
                }
                if (!['batam', 'cn23'].includes(options.partition)) {
                    alert('Pilih Ekspor Batam atau Ekspor Antrean CN23. Kiriman campuran dibuat menjadi dua file Excel terpisah.');
                    return;
                }
                if (!await refreshNationalPostcodes()) { alert(nationalPostcodeLoadError); return; }
                if (getDestinationMode() !== destinationModeAtExport) { alert('Mode tujuan berubah saat menyiapkan ekspor. Jalankan ekspor kembali sesuai mode yang dipilih.'); return; }
                const unresolved = uploadedFilesManager.flatMap(file => file.rows).filter(row => getShipmentRoute(row) === 'pending');
                if (unresolved.length) {
                    alert(`Masih ada ${unresolved.length} tujuan yang belum dapat dipisahkan menjadi Batam atau luar kota. Lengkapi alamat atau pilih wilayah pada kolom Kode Pos / Wilayah CN23 sebelum ekspor.`);
                    return;
                }
                rows = rows.filter(tr => {
                    const row = findManagedRow(tr.dataset.fileId, tr.dataset.rowId)?.row;
                    return row && getShipmentRoute(row) === options.partition;
                });
                if (!rows.length) {
                    alert(options.partition === 'batam' ? 'Tidak ada kiriman tujuan Kota Batam untuk diekspor.' : 'Tidak ada kiriman luar Kota Batam untuk antrean CN23.');
                    return;
                }
            }

            const pendingOutsideCount = getPendingOutsideBatamCount();
            const unresolvedOutsideRows = Array.from(document.querySelectorAll('#resultTable tbody tr[data-outside-batam-pending="true"]'));
            if (pendingOutsideCount > 0) {
                const numbers = unresolvedOutsideRows.map(row => row.dataset.rowNumber).filter(Boolean).slice(0, 8).join(', ');
                alert(`Masih ada ${pendingOutsideCount} alamat penerima yang terdeteksi di luar Kota Batam${numbers ? ` pada No. ${numbers}` : ''}. Perbaiki alamat sampai jelas menunjukkan Kota Batam lalu simpan koreksinya, atau hapus baris jika tujuan memang di luar Batam.`);
                unresolvedOutsideRows[0]?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                return;
            }

            const pendingReviewCount = getPendingReviewCount();
            const unresolvedReviewInputs = Array.from(document.querySelectorAll('#resultTable tbody tr input[data-review-pending="true"]'));
            if (pendingReviewCount > 0) {
                alert(`Masih ada ${pendingReviewCount} bagian yang perlu diperiksa. Perbaiki nilai yang salah atau konfirmasi nilai yang sudah benar. Kolom tidak boleh kosong, penanda “perlu dicek” harus dihapus, dan seluruh bagian harus ditandai selesai sebelum ekspor.`);
                const firstIssue = unresolvedReviewInputs[0];
                firstIssue?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                firstIssue?.focus({ preventScroll: true });
                firstIssue?.select?.();
                return;
            }

            if (destinationModeAtExport === 'cn23' || (destinationModeAtExport === 'mixed' && options.partition === 'cn23')) {
                await downloadCn23Queue(rows.map(tr => findManagedRow(tr.dataset.fileId, tr.dataset.rowId)?.row).filter(Boolean), destinationModeAtExport);
                return;
            }

            const mode = document.getElementById('clientMode').value;
            const template = document.getElementById('corporateTemplate').value;
            const useInsurance = document.getElementById('useInsurance').checked;
            const mixedBatamExport = destinationModeAtExport === 'mixed' && options.partition === 'batam';
            
            let finalCustomerId = "";
            let finalTariffCode = "";
            let baseSenderName = "";
            let baseSenderPhone = "0";
            let baseSenderAddress = "";
            let serviceCode = document.getElementById('serviceCode').value.toUpperCase();
            let itemType = document.getElementById('itemType').value.toUpperCase();
            let activeCorporatePreset = null;
            
            const paymentType = (mode === 'KORPORAT' || mode === 'PINDAH') ? "INVOICE" : "CASH"; 
            
            let destZoneCodeGlobal = "29400";
            let destZipCodeGlobal = "";

            if (mode === 'KORPORAT') {
                activeCorporatePreset = getCorporateTemplatePreset(template);
                const preset = activeCorporatePreset;
                finalCustomerId = resolveCorporateCustomerId(template, document.getElementById('customerId').value);
                finalTariffCode = document.getElementById('tariffCode').value.trim().toUpperCase();

                if (template !== 'MANUAL' && !preset) {
                    alert('Ekspor dibatalkan: konfigurasi template pelanggan tidak ditemukan.');
                    return;
                }

                if (preset) {
                    // Semua preset mengunci ID Pelanggan dari konfigurasi, termasuk ASTRA dan BSN Batam.
                    // Field UI tidak pernah menjadi sumber kebenaran customer_code untuk template preset.
                    finalCustomerId = preset.customerId;
                    if (preset.publishTariff) finalTariffCode = '';
                    else if (preset.tariffCode && preset.lockTariff) finalTariffCode = preset.tariffCode;
                    if (preset.defaultServiceCode && preset.lockService) serviceCode = preset.defaultServiceCode;
                    if (preset.defaultItemType && preset.lockItemType) itemType = preset.defaultItemType;
                    if (preset.destinationZoneCode && !mixedBatamExport) destZoneCodeGlobal = preset.destinationZoneCode;
                    baseSenderName = preset.senderName || '';
                } else {
                    baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                }

                if (!finalCustomerId) {
                    alert('FATAL: ID Pelanggan kosong. Ekspor dibatalkan agar kiriman invoice tidak terbaca sebagai kiriman ritel.');
                    document.getElementById('customerId')?.focus();
                    return;
                }
            } else if (mode === 'RITEL') {
                finalCustomerId = ""; 
                finalTariffCode = ""; 
                baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                baseSenderPhone = cleanPhoneNumber(document.getElementById('senderPhone').value);
                baseSenderAddress = cleanArtifacts(document.getElementById('senderAddress').value);
            } else if (mode === 'PINDAH') {
                finalCustomerId = cleanArtifacts(document.getElementById('customerId').value);
                finalTariffCode = document.getElementById('tariffCode').value.trim().toUpperCase();
                baseSenderName = cleanArtifacts(document.getElementById('senderName').value);
                baseSenderPhone = cleanPhoneNumber(document.getElementById('senderPhone').value);
                baseSenderAddress = cleanArtifacts(document.getElementById('senderAddress').value);
                
                destZipCodeGlobal = document.getElementById('destZipPindah').value.trim();
                destZoneCodeGlobal = document.getElementById('destZonePindah').value.trim();

                if (!destZipCodeGlobal || !destZoneCodeGlobal) {
                    alert("Kodepos Tujuan dan Kode Zona Tujuan WAJIB diisi untuk Barang Pindah!");
                    return;
                }
            }

            if (!String(baseSenderName || '').trim()) {
                alert('Nama pengirim pada pengaturan awal wajib diisi sebelum ekspor.');
                document.getElementById('senderName')?.focus();
                return;
            }

            let finalExportRows = [];
            let validationFailed = false;

            rows.forEach((tr, index) => {
                if (validationFailed) return;
                const managedRow = findManagedRow(tr.dataset.fileId, tr.dataset.rowId)?.row || {};

                let dNoSurat = cleanReference(tr.querySelector('.val-noSurat').value);
                
                let dName = cleanRecipientName(tr.querySelector('.val-name').value);
                let dPhone = cleanPhoneNumber(tr.querySelector('.val-phone').value);
                let dAddress = cleanAddressArtifacts(tr.querySelector('.val-address').value);
                // Tujuan batch campuran sudah dipilih dari database nasional.
                // Pertahankan pilihannya, termasuk ketika desa hanya ada di pencarian petugas.
                let dZip = mixedBatamExport ? getNationalPostcodeMatch(managedRow).postcode : resolveZipCode(dAddress, template, managedRow.zip, { destinationMode: 'batam' });
                managedRow.zip = dZip;
                
                // Override khusus Barang Pindah
                if (mode === 'PINDAH') {
                    dZip = destZipCodeGlobal;
                }

                const weightInput = tr.querySelector('.val-cw');
                let dWeight;
                try { dWeight = shipmentWeight(weightInput?.value ?? managedRow.cw, index + 1); }
                catch (error) { alert(error.message); validationFailed = true; return; }

                let dP = parseFloat(tr.querySelector('.val-p')?.value ?? managedRow.p) || 10;
                let dL = parseFloat(tr.querySelector('.val-l')?.value ?? managedRow.l) || 10;
                let dT = parseFloat(tr.querySelector('.val-t')?.value ?? managedRow.t) || 10;

                let dHargaBarang = 0;
                if (useInsurance) {
                    dHargaBarang = parseFloat(tr.querySelector('.val-ins-harga').value) || 0;
                    if (mode === 'PINDAH' && dHargaBarang <= 0) {
                        alert(`Nilai Barang (Asuransi) pada Baris ke-${index + 1} WAJIB diisi (Tidak Boleh 0) untuk Barang Pindah!`);
                        validationFailed = true;
                        return;
                    }
                }

                let senderNameFinal, senderAddrFinal, senderPhoneFinal;

                if (mode === 'KORPORAT' && activeCorporatePreset?.senderNameFromReference) {
                    if (!dNoSurat) {
                        alert(`No Ref/Surat pada Baris ke-${index + 1} wajib diisi karena menjadi Nama Pengirim untuk ${baseSenderName}.`);
                        validationFailed = true;
                        return;
                    }
                    senderNameFinal = dNoSurat;
                    senderAddrFinal = baseSenderName;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT' && template === 'JACCS_MPM') {
                    senderNameFinal = "PT JACCS MPM FINANCE INDONESIA";
                    senderAddrFinal = baseSenderName;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT' && activeCorporatePreset?.lockSenderName) {
                    senderNameFinal = baseSenderName;
                    senderAddrFinal = baseSenderName.includes('BATAM') ? baseSenderName : `${baseSenderName} BATAM`;
                    senderPhoneFinal = "0";
                } else if (mode === 'KORPORAT') {
                    senderNameFinal = baseSenderName;
                    senderAddrFinal = baseSenderName;
                    if (!senderAddrFinal.includes("BATAM") && template !== 'POLRES') { senderAddrFinal += " BATAM"; }
                    senderPhoneFinal = "0";
                } else if (mode === 'RITEL' || mode === 'PINDAH') {
                    senderNameFinal = baseSenderName;
                    senderAddrFinal = baseSenderAddress;
                    senderPhoneFinal = baseSenderPhone;
                }

                let rowObject = {
                    "connote_code": index + 1,
                    "customer_code": finalCustomerId,
                    "origin_data_customer_name": senderNameFinal,
                    "origin_data_customer_phone": senderPhoneFinal, 
                    "origin_data_customer_address": senderAddrFinal,
                    "origin_data_customer_zip_code": "29411", 
                    "origin_data_zone_code": "29400",
                    "destination_data_customer_name": dName,
                    "destination_data_customer_phone": dPhone,
                    "destination_data_customer_address": dAddress,
                    "destination_data_customer_zip_code": dZip, 
                    "destination_data_zone_code": destZoneCodeGlobal,        
                    "service_code": serviceCode,
                    "connote_sub_service_code": finalTariffCode, 
                    "koli_data_koli_description": dNoSurat ? dNoSurat : itemType, 
                    "koli_data_koli_weight": dWeight,
                    "koli_data_koli_width": dP,
                    "koli_data_koli_height": dT, 
                    "koli_data_koli_length": dL, 
                    "transaction_payment_type_name": paymentType,
                    "instruksi_pengiriman": "Tolong diantar dengan baik",
                    "harga_barang": dHargaBarang,
                    "ref_no": dNoSurat, 
                    "Jenis_Barang": itemType, 
                    "statusRetur": "Kembali ke pengirim"
                };

                if (useInsurance) {
                    rowObject["INS"] = "Y"; 
                }

                finalExportRows.push(rowObject);
            });

            if (validationFailed) return;

            // Invariant terakhir sebelum file dibuat: kiriman korporat tidak boleh pernah memiliki customer_code kosong.
            if (mode === 'KORPORAT') {
                const invalidCustomerRow = finalExportRows.find(row => !String(row.customer_code || '').trim());
                if (invalidCustomerRow) {
                    alert('FATAL: ditemukan baris korporat tanpa ID Pelanggan. File tidak dibuat untuk mencegah kiriman terbaca sebagai ritel.');
                    return;
                }

                const preset = activeCorporatePreset;
                if (preset && finalExportRows.some(row => row.customer_code !== preset.customerId)) {
                    alert('FATAL: ID Pelanggan hasil ekspor tidak sesuai template. File dibatalkan.');
                    return;
                }
                if (preset?.lockSenderName && finalExportRows.some(row => row.origin_data_customer_name !== preset.senderName)) {
                    alert('FATAL: Nama Pelanggan hasil ekspor tidak sesuai template. File dibatalkan.');
                    return;
                }
                if (preset?.lockTariff && finalExportRows.some(row => row.connote_sub_service_code !== preset.tariffCode)) {
                    alert('FATAL: Kode Tarif hasil ekspor tidak sesuai template. File dibatalkan.');
                    return;
                }
                if (preset?.publishTariff && finalExportRows.some(row => String(row.connote_sub_service_code || '').trim())) {
                    alert('FATAL: Tarif Publish harus kosong. File dibatalkan.');
                    return;
                }
                if (preset?.lockService && finalExportRows.some(row => row.service_code !== preset.defaultServiceCode)) {
                    alert('FATAL: Kode Layanan hasil ekspor tidak sesuai template. File dibatalkan.');
                    return;
                }
                if (preset?.lockItemType && finalExportRows.some(row => row.Jenis_Barang !== preset.defaultItemType)) {
                    alert('FATAL: Jenis Kiriman hasil ekspor tidak sesuai template. File dibatalkan.');
                    return;
                }
            }

            // Batas akhir ekspor: bersihkan SEMUA nilai string, termasuk nilai
            // preset/konstanta yang tidak melewati input Periksa hasil.
            finalExportRows = finalExportRows.map(sanitizeExcelRowValues);
            const invalidSanitizedValue = finalExportRows
                .flatMap((row, rowIndex) => Object.entries(row).map(([column, value]) => ({ rowIndex, column, value })))
                .find(cell => hasForbiddenExcelCharacters(cell.value));
            if (invalidSanitizedValue) {
                alert(`FATAL: karakter terlarang masih ditemukan pada data Excel baris ${invalidSanitizedValue.rowIndex + 1}, kolom ${invalidSanitizedValue.column}. File tidak dibuat.`);
                return;
            }

            const exportHeaders = [
                "connote_code", "customer_code", "origin_data_customer_name", "origin_data_customer_phone", 
                "origin_data_customer_address", "origin_data_customer_zip_code", "origin_data_zone_code", 
                "destination_data_customer_name", "destination_data_customer_phone", "destination_data_customer_address", 
                "destination_data_customer_zip_code", "destination_data_zone_code", "service_code", 
                "connote_sub_service_code", "koli_data_koli_description", "koli_data_koli_weight", 
                "koli_data_koli_width", "koli_data_koli_height", "koli_data_koli_length", 
                "transaction_payment_type_name", "instruksi_pengiriman", "harga_barang", 
                "ref_no", "Jenis_Barang", "statusRetur"
            ];

            if (useInsurance) {
                exportHeaders.push("INS");
            }

            const worksheet = XLSX.utils.json_to_sheet(finalExportRows, { header: exportHeaders });

            // Verifikasi ulang hasil konversi aktual. Baris header dilewati karena
            // underscore adalah bagian wajib dari schema impor Mile App.
            for (let rowIndex = 1; rowIndex <= finalExportRows.length; rowIndex++) {
                for (let columnIndex = 0; columnIndex < exportHeaders.length; columnIndex++) {
                    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: columnIndex })];
                    if (hasForbiddenExcelCharacters(cell?.v)) {
                        alert(`FATAL: worksheet masih memuat karakter terlarang pada baris ${rowIndex}, kolom ${exportHeaders[columnIndex]}. File tidak dibuat.`);
                        return;
                    }
                }
            }

            // Guard sampai tingkat worksheet: customer_code harus benar-benar tertulis
            // pada setiap sel Excel, bukan hanya tersedia di objek sebelum konversi.
            if (mode === 'KORPORAT') {
                const customerCodeColumn = exportHeaders.indexOf('customer_code');
                for (let rowIndex = 1; rowIndex <= finalExportRows.length; rowIndex++) {
                    const cell = worksheet[XLSX.utils.encode_cell({ r: rowIndex, c: customerCodeColumn })];
                    const writtenCustomerId = String(cell?.v || '').trim();
                    if (!writtenCustomerId || (activeCorporatePreset && writtenCustomerId !== activeCorporatePreset.customerId)) {
                        alert('FATAL: kolom customer_code pada worksheet kosong atau tidak sesuai template. File tidak dibuat.');
                        return;
                    }
                }
            }

            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Sheet1");
            
            const range = XLSX.utils.decode_range(worksheet['!ref']);
            for (let R = range.s.r + 1; R <= range.e.r; ++R) {
                let cell_sender_phone = worksheet[XLSX.utils.encode_cell({r: R, c: 3})];
                if (cell_sender_phone) cell_sender_phone.z = '@';
                let cell_dest_phone = worksheet[XLSX.utils.encode_cell({r: R, c: 8})];
                if (cell_dest_phone) cell_dest_phone.z = '@';
                let cell_dest_zip = worksheet[XLSX.utils.encode_cell({r: R, c: 10})];
                if (cell_dest_zip) cell_dest_zip.z = '@';
            }

            let fileSuffix = mode === 'RITEL' ? "Ritel" : (mode === 'PINDAH' ? "BarangPindah" : (finalCustomerId || "Corporate"));
            XLSX.writeFile(workbook, `Upload_MileApp_${fileSuffix}.xlsx`);
        }
    
