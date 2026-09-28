# Camera QA v26.17

Unit/regression checks:

```sh
node --test tests/*.test.js tests/*.test.mjs
```

Browser QA (Playwright and Microsoft Edge installed):

```sh
node tests/camera-browser.qa.cjs
```

If Playwright is installed outside this repository, set `MILE_PLAYWRIGHT_PATH` to its module path first.

The browser harness serves only localhost, mocks authentication/camera hardware, and never sends images to an external AI provider. It checks native still-photo capture, video fallback, both physical landscape directions with portrait lock, absence of preview CSS rotation/cover zoom, exact guide/crop ratios, WebP MIME/extension, JPEG fallback, rejection of very small frames, and persistence of original images before Review.

Browser results on 2026-09-28: all six mocked camera/encoder scenarios passed. Native fixtures saved up to 3441 × 1360 and 1663 × 2949 pixels; source data was synthetic, so its file sizes are not representative of real camera noise. Ten unit/regression files and CHECK-VERSION.bat passed.

Still requires physical-device validation: Android Chrome/Firefox camera negotiation, native still-photo EXIF/orientation, autofocus, shutter latency, and real-provider AI extraction. Hardware capabilities and browser camera drivers cannot be reproduced by the mock.
