# Doc Swap

Convert, merge and tidy PDFs, images, spreadsheets and files on your device. Nothing is uploaded, and the app works offline once it's installed.

`index.html`, `manifest.webmanifest` and `sw.js` sit in the root; everything else lives in `css/`, `js/` and `assets/`. Keep `sw.js` in the root so offline mode covers the whole app.

## Put it on GitHub Pages
1. Upload every file and folder to the root of the repo, keeping the folder structure (Add file → Upload files, then drag the folders in).
2. Settings → Pages → Deploy from a branch → main, / (root).
3. Open https://<username>.github.io/<repo>/ in Safari, then Share → Add to Home Screen.
4. Open it once from the home screen while you're online, so it saves itself for offline use.

## Updating the home-screen app
- Upload the changed files to GitHub. When you next open the app online, it loads the new version by itself.
- To update straight away, tap **Check for updates** at the bottom of the home screen.
- GitHub Pages can take a minute or two to publish after you upload.
- If you change a library (`js/lib/`), font, icon or model file, also bump `VERSION` in `sw.js` (e.g. `docswap-v6`).
- Bump `APP_VERSION` in `js/app.js` to change the version number shown in the footer.

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
```
index.html              the page
manifest.webmanifest    home-screen install
sw.js                   offline use and automatic updates (must stay in the root)
css/styles.css          styles
js/app.js               the app
js/lib/                 converter libraries (pdf.js, pdf-lib, JSZip, heic2any, SheetJS, Mediabunny + MP3 encoder, gifenc, qrcode-generator, JsBarcode, TensorFlow.js)
assets/icons/           app icons and favicons
assets/fonts/           Plus Jakarta Sans
assets/models/          AI upscaling models, upscale-x2/x4 (.json + .bin) (ESRGAN-slim, MIT licence)
```

## Security
- **Content Security Policy** is set with a `<meta>` tag in `index.html`, because GitHub Pages can't send custom headers. It only allows the app's own files, is.gd (Link shortener), the GitHub API (GitHub links), YouTube and Vimeo frames and YouTube thumbnails (Embed code preview). If you add a tool that loads anything else, add that source to the policy or it will be blocked.
- `'unsafe-eval'` is in the policy only because heic2any needs it. Remove it if heic2any is ever replaced.
- A meta-tag CSP can't set `frame-ancestors`, and GitHub Pages can't set `Strict-Transport-Security`, `X-Content-Type-Options` or `Permissions-Policy`. If the app moves to a host that supports headers (Netlify, Cloudflare Pages), set those there. GitHub Pages already forces HTTPS when "Enforce HTTPS" is ticked in Settings → Pages.
- PDFs are opened with `isEvalSupported: false`, which blocks CVE-2024-4367 in the bundled pdf.js 3.11.174.
- `js/lib/xlsx.full.min.js` is SheetJS 0.18.5, which has two known issues when opening a crafted spreadsheet (CVE-2023-30533 and CVE-2024-22363). Replace it with the current version from https://cdn.sheetjs.com (0.20.3 or later). It isn't on npm, so Dependabot won't flag it.
- If you tick "Remember GitHub settings", the GitHub token is saved in this browser's local storage. Give it access to the links repo only, with Contents "Read and write" and an expiry date.

## Adding a tool
Add an object to the `TOOLS` array in `js/app.js` with `id`, `name`, `cats` (pdf / images / video / data / web / files), `exts`, `icon`, `desc` and an async `run(files, options, progress)` that returns `[{ blob, name }]`.
