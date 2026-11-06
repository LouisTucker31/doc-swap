# Doc Swap

Convert, merge and tidy PDFs, Word, Excel and images on your device. Files never leave the device, and the app works offline once it's installed.

All files sit in one folder (no subfolders), so you can upload them from a phone.

## Put it on GitHub Pages
1. Upload every file to the root of the repo (Add file → Upload files).
2. Settings → Pages → Deploy from a branch → main, / (root).
3. Open https://<username>.github.io/<repo>/ in Safari, then Share → Add to Home Screen.
4. Open it once from the home screen while you're online, so it saves itself for offline use.

## Updating
When you change any file, bump VERSION in sw.js (e.g. docswap-v3), then close and reopen the app.

## Files
- index.html, styles.css, app.js: the app
- manifest.webmanifest, sw.js: PWA install and offline caching
- *.png, icon.svg: icons
- jakarta-*.woff2: font
- *.min.js: converter libraries (pdf.js, pdf-lib, JSZip, heic2any, mammoth, html2pdf, SheetJS)
