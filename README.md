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
- If you change a library (`*.min.js`), font or icon file, also bump `VERSION` in `sw.js` (e.g. `docswap-v4`).
- Bump `APP_VERSION` in `app.js` to change the version number shown in the footer.

## Tools
**PDF:** Merge, Split, Organise pages (delete / keep / reorder), PDF to image (JPG or PNG), Image to PDF, Rotate, Page numbers, Watermark, Remove PDF info, PDF to Text, Text to PDF
**Images:** Compress, Convert (JPG / PNG / WebP), Resize, Rotate & flip, Black & white, Remove photo data (GPS, camera, dates), HEIC to JPG/PNG, SVG to PNG, Favicon maker
**Docs & data:** Excel to CSV, CSV to Excel, Excel/CSV to JSON, JSON to Excel/CSV, Merge CSVs
**Files:** Create ZIP, Extract ZIP, Image to Base64
**Coming soon (code kept, tiles disabled):** PDF to Word, Word to PDF. To switch one back on, delete `disabled:true` from that tool in `app.js`.

## Files
- index.html, styles.css, app.js: the app
- manifest.webmanifest, sw.js: home-screen install, offline use and automatic updates
- *.png, icon.svg: icons
- jakarta-*.woff2: font
- *.min.js: converter libraries (pdf.js, pdf-lib, JSZip, heic2any, mammoth, html2pdf, SheetJS)

## Adding a tool
Add an object to the `TOOLS` array in `app.js` with `id`, `name`, `cats` (pdf / images / data / files), `exts`, `icon`, `desc` and an async `run(files, options, progress)` that returns `[{ blob, name }]`.
