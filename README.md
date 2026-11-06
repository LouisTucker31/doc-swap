# Doc Swap

Convert, merge and tidy PDFs, images, spreadsheets and files on your device. Nothing is uploaded, and the app works offline once it's installed.

All files sit in one folder (no subfolders), so you can upload them from a phone.

## Put it on GitHub Pages
1. Upload every file to the root of the repo (Add file → Upload files).
2. Settings → Pages → Deploy from a branch → main, / (root).
3. Open https://<username>.github.io/<repo>/ in Safari, then Share → Add to Home Screen.
4. Open it once from the home screen while you're online, so it saves itself for offline use.

## Updating the home-screen app
- Upload the changed files to GitHub. When you next open the app online, it loads the new version by itself.
- To update straight away, tap **Check for updates** at the bottom of the home screen.
- GitHub Pages can take a minute or two to publish after you upload.
- If you change a library (`*.min.js`), font or icon file, also bump `VERSION` in `sw.js` (e.g. `docswap-v5`).
- Bump `APP_VERSION` in `app.js` to change the version number shown in the footer.

## Tools
**PDF:** Merge, Split, Organise pages, PDF to image, Image to PDF, Rotate, Page numbers, Watermark, Remove PDF info, PDF to Text, Text to PDF
**Images:** Compress, Convert, Resize, Rotate & flip, Black & white, Remove photo data, HEIC to JPG/PNG, SVG to PNG, Favicon maker, AI upscale (2×/4×)
**Video & audio:** Convert video (MP4/MOV/WebM), Compress video (1080p/720p/480p), Mute video, Audio converter (MP3/M4A/WAV, volume), Video to images, Video to GIF
**Docs & data:** Excel to CSV, CSV to Excel, Excel/CSV to JSON, JSON to Excel/CSV, Merge CSVs
**Web & links:** QR code maker, Barcode maker, Embed code maker, Link shortener, Favicon maker, Image to Base64
**Files:** Create ZIP, Extract ZIP, Remove PDF info, Remove photo data

Long jobs (video, audio, AI upscale) show a timer and countdown, can be cancelled, and keep the screen awake. iPhone pauses web apps in the background, so keep Doc Swap open while they run.

The Link shortener is the only tool that goes online: it sends the link (never a file) to is.gd, or to your own GitHub repo using a token saved only on your device.

## Files
- index.html, styles.css, app.js: the app
- manifest.webmanifest, sw.js: home-screen install, offline use and automatic updates
- *.png, icon.svg: icons
- jakarta-*.woff2: font
- *.min.js, qrcode.js: converter libraries (pdf.js, pdf-lib, JSZip, heic2any, SheetJS, Mediabunny + MP3 encoder, gifenc, qrcode-generator, JsBarcode, TensorFlow.js)
- upscale-x2/x4 (.json + .bin): the AI upscaling models (ESRGAN-slim, MIT licence)

## Adding a tool
Add an object to the `TOOLS` array in `app.js` with `id`, `name`, `cats` (pdf / images / video / data / web / files), `exts`, `icon`, `desc` and an async `run(files, options, progress)` that returns `[{ blob, name }]`.
