/* =========================================================
   DOC SWAP — app.js
   All files live in the same folder as index.html.
   ========================================================= */
const APP_VERSION = '3';

/* =========================================================
   LIBRARIES — bundled next to index.html, loaded only when a tool needs them
   ========================================================= */
const LIB = {
  pdfjs:    'pdf.min.js',
  pdflib:   'pdf-lib.min.js',
  zip:      'jszip.min.js',
  heic:     'heic2any.min.js',
  mammoth:  'mammoth.browser.min.js',
  html2pdf: 'html2pdf.bundle.min.js',
  xlsx:     'xlsx.full.min.js'
};
const PDFJS_WORKER = 'pdf.worker.min.js';
const _loading = {};
function loadScript(src){
  if(!_loading[src]) _loading[src] = new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.async = true;
    s.onload = res;
    s.onerror = () => { delete _loading[src]; rej(new Error('Couldn’t load a converter. Open Doc Swap once while online so it can save itself for offline use, then try again.')); };
    document.head.appendChild(s);
  });
  return _loading[src];
}
async function need(...keys){
  for(const k of keys) await loadScript(LIB[k]);
  if(keys.includes('pdfjs')) pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER;
}

/* =========================================================
   HELPERS
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const baseName = n => n.replace(/\.[^.]+$/, '') || 'file';
const extOf = n => (n.match(/\.([^.]+)$/) || [,''])[1].toLowerCase();
const escH = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = b => b < 1024 ? b + ' B' : b < 1048576 ? (b/1024).toFixed(0) + ' KB' : (b/1048576).toFixed(1) + ' MB';
const tick = () => new Promise(r => setTimeout(r, 0));
const canvasToBlob = (c, type, q) => new Promise((res, rej) => c.toBlob(b => b ? res(b) : rej(new Error('Image export failed — the file may be too large for this device.')), type, q));
const pdfBlob = bytes => new Blob([bytes], {type: 'application/pdf'});
const textBlob = (s, type = 'text/plain;charset=utf-8') => new Blob([s], {type});
const EXT_FOR = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};
const isSvg = f => extOf(f.name) === 'svg' || f.type === 'image/svg+xml';
const safeFileName = s => (s || '').replace(/[\\/:*?"<>|]+/g, '').trim();

/* iPhone / iPad: the share sheet is the reliable way to save to Files or Photos,
   especially when running from the home screen */
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const PREFER_SHARE = IS_IOS || matchMedia('(pointer:coarse)').matches;
function canShareFiles(files){
  try{ return !!(navigator.canShare && navigator.share && navigator.canShare({files})); }
  catch{ return false; }
}

const MIME = {
  pdf:'application/pdf', jpg:'image/jpeg', jpeg:'image/jpeg', png:'image/png', webp:'image/webp', gif:'image/gif', svg:'image/svg+xml',
  heic:'image/heic', txt:'text/plain', csv:'text/csv', json:'application/json', html:'text/html', md:'text/markdown',
  mp4:'video/mp4', mov:'video/quicktime', mp3:'audio/mpeg', m4a:'audio/mp4', wav:'audio/wav', zip:'application/zip',
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation'
};

/* ---------- images ---------- */
async function imageToCanvas(blob, maxDim = 0, bg = null){
  const url = URL.createObjectURL(blob);
  try{
    const img = new Image();
    img.src = url;
    try{ await img.decode(); }
    catch{ throw new Error(`Couldn’t read “${blob.name || 'image'}”. This browser may not support that image format.`); }
    let w = img.naturalWidth, h = img.naturalHeight;
    if(maxDim && Math.max(w, h) > maxDim){ const s = maxDim / Math.max(w, h); w = Math.round(w*s); h = Math.round(h*s); }
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    if(bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/* Render an SVG at a given width, keeping its proportions */
async function svgToCanvas(file, width, bg = null){
  const doc = new DOMParser().parseFromString(await file.text(), 'image/svg+xml');
  const svg = doc.documentElement;
  if(!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) throw new Error(`“${file.name}” isn’t a valid SVG file.`);
  const num = v => { const n = parseFloat(v); return v && !/%/.test(v) && n > 0 ? n : 0; };
  let vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
  const w0 = num(svg.getAttribute('width')), h0 = num(svg.getAttribute('height'));
  let aspect = 1;
  if(vb.length === 4 && vb[2] > 0 && vb[3] > 0) aspect = vb[2] / vb[3];
  else if(w0 && h0){ aspect = w0 / h0; svg.setAttribute('viewBox', `0 0 ${w0} ${h0}`); }
  const W = Math.round(width), H = Math.max(1, Math.round(width / aspect));
  svg.setAttribute('width', W); svg.setAttribute('height', H);
  if(!svg.getAttribute('xmlns')) svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  const blob = new Blob([new XMLSerializer().serializeToString(svg)], {type: 'image/svg+xml'});
  const url = URL.createObjectURL(blob);
  try{
    const img = new Image(); img.src = url;
    try{ await img.decode(); }catch{ throw new Error(`Couldn’t draw “${file.name}”. The SVG may use features this browser can’t render.`); }
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const ctx = c.getContext('2d');
    if(bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    ctx.drawImage(img, 0, 0, W, H);
    return c;
  } finally { URL.revokeObjectURL(url); }
}
const rasterize = (file, maxDim = 0, bg = null) => isSvg(file) ? svgToCanvas(file, maxDim || 1024, bg) : imageToCanvas(file, maxDim, bg);

/* High-quality resize (steps down in halves to avoid jagged edges) */
function scaleCanvas(src, w, h, bg = null){
  let cur = src;
  while(cur.width / 2 >= w && cur.height / 2 >= h){
    const t = document.createElement('canvas');
    t.width = Math.round(cur.width / 2); t.height = Math.round(cur.height / 2);
    const c = t.getContext('2d'); c.imageSmoothingQuality = 'high'; c.drawImage(cur, 0, 0, t.width, t.height);
    cur = t;
  }
  const out = document.createElement('canvas'); out.width = w; out.height = h;
  const ctx = out.getContext('2d');
  if(bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h); }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(cur, 0, 0, w, h);
  return out;
}
/* Fit an image inside a square without cropping */
function squareCanvas(src, size, bg = null){
  const s = Math.min(size / src.width, size / src.height);
  const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
  const scaled = scaleCanvas(src, w, h);
  const out = document.createElement('canvas'); out.width = out.height = size;
  const ctx = out.getContext('2d');
  if(bg){ ctx.fillStyle = bg; ctx.fillRect(0, 0, size, size); }
  ctx.drawImage(scaled, Math.round((size - w) / 2), Math.round((size - h) / 2));
  return out;
}
/* Keep the original format where possible */
function outType(f){
  const e = extOf(f.name);
  if(e === 'png' || e === 'gif' || isSvg(f)) return 'image/png';
  if(e === 'webp') return 'image/webp';
  return 'image/jpeg';
}
async function saveCanvas(c, f, suffix, type = outType(f)){
  const blob = await canvasToBlob(c, type, .92);
  return {blob, name: `${baseName(f.name)}${suffix}.${EXT_FOR[blob.type] || 'png'}`};
}

/* ---------- favicon .ico (PNG-in-ICO, supported everywhere modern) ---------- */
async function buildIco(src){
  const sizes = [16, 32, 48], pngs = [];
  for(const s of sizes) pngs.push(new Uint8Array(await (await canvasToBlob(squareCanvas(src, s), 'image/png')).arrayBuffer()));
  const head = 6 + 16 * sizes.length;
  const buf = new Uint8Array(head + pngs.reduce((a, p) => a + p.length, 0)), dv = new DataView(buf.buffer);
  dv.setUint16(0, 0, true); dv.setUint16(2, 1, true); dv.setUint16(4, sizes.length, true);
  let off = head;
  sizes.forEach((s, i) => {
    const e = 6 + 16 * i;
    buf[e] = s; buf[e+1] = s; buf[e+2] = 0; buf[e+3] = 0;
    dv.setUint16(e+4, 1, true); dv.setUint16(e+6, 32, true);
    dv.setUint32(e+8, pngs[i].length, true); dv.setUint32(e+12, off, true);
    buf.set(pngs[i], off); off += pngs[i].length;
  });
  return new Blob([buf], {type: 'image/x-icon'});
}

/* ---------- photo metadata removal (lossless — image data is untouched) ---------- */
function readExif(seg){            // seg = APP1 payload starting at "Exif\0\0"
  const r = {orientation: 1, gps: false, camera: false, date: false};
  try{
    const t = 6, dv = new DataView(seg.buffer, seg.byteOffset, seg.byteLength);
    const le = dv.getUint16(t) === 0x4949;
    const ifd = t + dv.getUint32(t + 4, le), n = dv.getUint16(ifd, le);
    for(let k = 0; k < n; k++){
      const e = ifd + 2 + k * 12, tag = dv.getUint16(e, le);
      if(tag === 0x0112) r.orientation = dv.getUint16(e + 8, le);
      if(tag === 0x8825) r.gps = true;
      if(tag === 0x010F || tag === 0x0110) r.camera = true;
      if(tag === 0x0132 || tag === 0x8769) r.date = true;
    }
  }catch{}
  return r;
}
function orientationExif(o){       // minimal EXIF holding only the rotation, so photos stay upright
  const b = new Uint8Array(36);
  b.set([0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0, 0, 0x4D, 0x4D, 0x00, 0x2A, 0, 0, 0, 8, 0, 1, 0x01, 0x12, 0, 3, 0, 0, 0, 1, 0, o, 0, 0, 0, 0, 0, 0]);
  return b;
}
function stripJpeg(u8){
  if(u8[0] !== 0xFF || u8[1] !== 0xD8) throw new Error('This doesn’t look like a valid JPG.');
  const keep = [], found = new Set(); let orientation = 1, i = 2;
  while(i < u8.length){
    if(u8[i] !== 0xFF) throw new Error('This JPG appears to be damaged.');
    const m = u8[i+1];
    if(m === 0xFF){ i++; continue; }
    if(m === 0xDA || m === 0xD9){ keep.push(u8.subarray(i)); break; }
    if((m >= 0xD0 && m <= 0xD7) || m === 0x01){ keep.push(u8.subarray(i, i+2)); i += 2; continue; }
    const len = (u8[i+2] << 8) | u8[i+3], seg = u8.subarray(i, i + 2 + len), body = seg.subarray(4);
    const drop = m === 0xE1 || m === 0xFE || (m >= 0xE3 && m <= 0xED) || m === 0xEF;
    if(m === 0xE1 && String.fromCharCode(...body.subarray(0, 4)) === 'Exif'){
      const x = readExif(body);
      orientation = x.orientation || 1;
      if(x.gps) found.add('location'); if(x.camera) found.add('camera details'); if(x.date) found.add('date taken');
      found.add('EXIF data');
    } else if(m === 0xE1) found.add('XMP data');
    else if(m === 0xED) found.add('IPTC data');
    else if(m === 0xFE) found.add('comments');
    else if(drop) found.add('other metadata');
    if(!drop) keep.push(seg);
    i += 2 + len;
  }
  const parts = [u8.subarray(0, 2)];
  const firstIsJfif = keep[0] && keep[0][1] === 0xE0;
  if(firstIsJfif) parts.push(keep.shift());
  if(orientation > 1 && orientation <= 8) parts.push(orientationExif(orientation));
  parts.push(...keep);
  return {blob: new Blob(parts, {type: 'image/jpeg'}), found};
}
function stripPng(u8){
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  if(!sig.every((b, k) => u8[k] === b)) throw new Error('This doesn’t look like a valid PNG.');
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), parts = [u8.subarray(0, 8)], found = new Set();
  let i = 8;
  while(i + 8 <= u8.length){
    const len = dv.getUint32(i), type = String.fromCharCode(...u8.subarray(i+4, i+8)), end = i + 12 + len;
    if(['tEXt','zTXt','iTXt','eXIf','tIME'].includes(type)) found.add(type === 'eXIf' ? 'EXIF data' : type === 'tIME' ? 'timestamp' : 'text metadata');
    else parts.push(u8.subarray(i, end));
    i = end;
    if(type === 'IEND') break;
  }
  return {blob: new Blob(parts, {type: 'image/png'}), found};
}

/* ---------- PDF ---------- */
async function loadPdf(f, opts = {}){
  try{ return await PDFLib.PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption: true, ...opts}); }
  catch{ throw new Error(`“${f.name}” doesn’t look like a valid PDF.`); }
}
async function openPdfjs(f){
  try{ return await pdfjsLib.getDocument({data: await f.arrayBuffer()}).promise; }
  catch(e){ throw new Error(e && e.name === 'PasswordException' ? 'This PDF is password-protected.' : `“${f.name}” doesn’t look like a valid PDF.`); }
}
function parseRanges(str, n){
  const groups = [];
  for(const part of str.split(',')){
    const s = part.trim(); if(!s) continue;
    const m = s.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if(!m) throw new Error(`“${s}” isn’t a valid page range. Use something like 1-3, 5, 8-10.`);
    let a = +m[1], b = m[2] ? +m[2] : a;
    if(a > b) [a, b] = [b, a];
    if(a < 1 || b > n) throw new Error(`Page range ${s} is outside this PDF (1–${n}).`);
    groups.push({label: a === b ? String(a) : `${a}-${b}`, idx: Array.from({length: b - a + 1}, (_, i) => a - 1 + i)});
  }
  if(!groups.length) throw new Error('Enter at least one page range, e.g. 1-3, 5.');
  return groups;
}
/* Ordered page list: "3, 1-2, 9-7" → [2,0,1,8,7,6]; ranges can run backwards */
function parsePageList(str, n){
  const out = [];
  for(const part of (str || '').split(',')){
    const s = part.trim(); if(!s) continue;
    const m = s.match(/^(\d+)\s*(?:-\s*(\d+))?$/);
    if(!m) throw new Error(`“${s}” isn’t valid. Use page numbers and ranges like 3, 1-2, 5.`);
    const a = +m[1], b = m[2] ? +m[2] : a;
    if(a < 1 || b < 1 || a > n || b > n) throw new Error(`“${s}” includes a page that doesn’t exist. This PDF has ${n} page${n === 1 ? '' : 's'}.`);
    const step = a <= b ? 1 : -1;
    for(let i = a; ; i += step){ out.push(i - 1); if(i === b) break; }
  }
  if(!out.length) throw new Error('Enter the pages, e.g. 1-3, 5.');
  return out;
}

/* Text extraction shared by PDF → Word and PDF → Text */
async function extractPdfText(f, p){
  await need('pdfjs');
  const pdf = await openPdfjs(f);
  const pages = []; let any = false;
  for(let i = 1; i <= pdf.numPages; i++){
    p(i / pdf.numPages * .9, `Reading page ${i} of ${pdf.numPages}`);
    const tc = await (await pdf.getPage(i)).getTextContent();
    const lines = []; let cur = '', y = null;
    for(const it of tc.items){
      if(typeof it.str !== 'string') continue;
      const iy = it.transform[5];
      if(y !== null && Math.abs(iy - y) > 2 && cur.trim()){ lines.push({t: cur, y}); cur = ''; }
      cur += it.str; y = iy;
      if(it.hasEOL){ if(cur.trim()) lines.push({t: cur, y}); cur = ''; y = null; }
    }
    if(cur.trim()) lines.push({t: cur, y});
    const gaps = lines.slice(1).map((l, k) => lines[k].y - l.y).filter(g => g > 0).sort((a, b) => a - b);
    const med = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0;
    const paras = []; let para = [];
    lines.forEach((l, k) => {
      if(k > 0){ const g = lines[k-1].y - l.y; if(g < 0 || (med && g > med * 1.45)){ paras.push(para); para = []; } }
      para.push(l.t.replace(/\s+/g, ' ').trim());
    });
    if(para.length) paras.push(para);
    if(paras.length) any = true;
    pages.push(paras);
  }
  if(!any) throw new Error('No selectable text found. This PDF is probably a scanned image.');
  return pages;
}

/* Minimal .docx writer (used by PDF → Word, currently disabled) */
async function buildDocx(pages){
  await need('zip');
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const x = s => s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  let body = '';
  pages.forEach((paras, i) => {
    if(i > 0) body += '<w:p><w:r><w:br w:type="page"/></w:r></w:p>';
    for(const pa of paras){
      const text = pa.join(' ').replace(/(\w)- (\w)/g, '$1$2').replace(/\s+/g, ' ').trim();
      body += `<w:p><w:r><w:t xml:space="preserve">${x(text)}</w:t></w:r></w:p>`;
    }
  });
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const zip = new JSZip();
  zip.file('[Content_Types].xml', head + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>');
  zip.file('_rels/.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', head + '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('word/styles.xml', head + `<w:styles xmlns:w="${W}"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="160" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`);
  zip.file('word/document.xml', head + `<w:document xmlns:w="${W}"><w:body>${body}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`);
  return zip.generateAsync({type: 'blob', mimeType: MIME.docx});
}

/* Word-wrap plain text to a width, for Text → PDF */
function wrapText(text, font, size, maxW){
  const W = s => font.widthOfTextAtSize(s, size), lines = [];
  for(const para of text.split('\n')){
    if(!para.trim()){ lines.push(''); continue; }
    let line = '', wrapped = false;
    for(const w of para.match(/\S+|\s+/g)){
      const space = /^\s+$/.test(w);
      if(space && wrapped && line === '') continue;
      if(W(line + w) <= maxW){ line += w; continue; }
      if(space){ lines.push(line.trimEnd()); line = ''; wrapped = true; continue; }
      if(line.trim()){ lines.push(line.trimEnd()); line = ''; wrapped = true; }
      let chunk = '';
      for(const ch of w){ if(chunk && W(chunk + ch) > maxW){ lines.push(chunk); chunk = ch; wrapped = true; } else chunk += ch; }
      line = chunk;
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

/* ---------- spreadsheets ---------- */
function uniqueSheetName(name, used){
  const nm = (name || 'Sheet').replace(/[\\\/?*\[\]:]/g, '').slice(0, 31) || 'Sheet';
  let k = nm, j = 2;
  while(used.has(k.toLowerCase())) k = nm.slice(0, 28) + ' ' + j++;
  used.add(k.toLowerCase());
  return k;
}
async function readWorkbook(f, opts = {}){
  const e = extOf(f.name);
  try{
    return ['csv','tsv','txt'].includes(e)
      ? XLSX.read((await f.text()).replace(/^﻿/, ''), {type: 'string', ...opts})
      : XLSX.read(await f.arrayBuffer(), opts);
  }catch{ throw new Error(`Couldn’t read “${f.name}” as a spreadsheet.`); }
}
function jsonToSheet(data){
  const flat = v => v !== null && typeof v === 'object' ? JSON.stringify(v) : v;
  const flatRow = r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, flat(v)]));
  const isObj = v => v && typeof v === 'object' && !Array.isArray(v);
  if(Array.isArray(data)){
    if(!data.length) return XLSX.utils.aoa_to_sheet([[]]);
    if(data.every(Array.isArray)) return XLSX.utils.aoa_to_sheet(data.map(r => r.map(flat)));
    if(data.every(isObj)) return XLSX.utils.json_to_sheet(data.map(flatRow));
    return XLSX.utils.aoa_to_sheet(data.map(v => [flat(v)]));
  }
  if(isObj(data)) return XLSX.utils.json_to_sheet([flatRow(data)]);
  return XLSX.utils.aoa_to_sheet([[flat(data)]]);
}

/* =========================================================
   ICONS — tile graphics (original artwork)
   ========================================================= */
const C = {pdf:'#e5484d', jpg:'#f5a524', png:'#8e4ec6', webp:'#12a594', heic:'#d6409f', doc:'#3e63dd', xls:'#30a46c', csv:'#0b9fc4',
           txt:'#70707c', svg:'#e8590c', ico:'#475569', json:'#b45309', zip:'#78716c', b64:'#9333ea', img:'#f5a524'};
const svg = inner => `<svg viewBox="0 0 80 56" aria-hidden="true">${inner}</svg>`;
function doc(x, y, label, c){
  const fs = label.length > 3 ? 6.4 : 7.6;
  return `<g transform="translate(${x} ${y})"><path d="M4 0h16l8 8v24a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V4a4 4 0 0 1 4-4z" fill="${c}" stroke="var(--surface)" stroke-width="2.5" paint-order="stroke"/><path d="M20 0v4a4 4 0 0 0 4 4h4z" fill="#fff" fill-opacity=".5"/><text x="14" y="27" text-anchor="middle" font-size="${fs}" font-weight="800" fill="#fff" font-family="system-ui,-apple-system,sans-serif">${label}</text></g>`;
}
function badge(cx, cy, d, fill = false){
  return `<g transform="translate(${cx} ${cy})"><circle r="8.5" fill="var(--ink)" stroke="var(--surface)" stroke-width="2.5"/><path d="${d}" fill="${fill ? 'var(--surface)' : 'none'}" stroke="var(--surface)" stroke-width="${fill ? 0 : 1.8}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
}
const G = {
  arrow:'M-4 0h8M1-3l3 3-3 3',
  plus:'M-4 0h8M0-4v8',
  split:'M-4.5 0h9M-4.5 0l2.2-2.2M-4.5 0l2.2 2.2M4.5 0l-2.2-2.2M4.5 0l-2.2 2.2',
  rotate:'M4 .5A4 4 0 1 1 2.6-3M3-5.6v2.8H.2',
  hash:'M-1.2-4l-.8 8M2-4l-.8 8M-4-1.3h8M-4.3 1.3h8',
  drop:'M0-4.8C2.6-1.6 3.6 0 3.6 1.3a3.6 3.6 0 0 1-7.2 0C-3.6 0-2.6-1.6 0-4.8z',
  shrink:'M-4.5-4.5l3 3M-1.5-4v2.5H-4M4.5 4.5l-3-3M1.5 4V1.5H4',
  list:'M-4-3h8M-4 0h8M-4 3h5',
  cross:'M-3.2-3.2l6.4 6.4M3.2-3.2l-6.4 6.4',
  grow:'M-4 4l8-8M1-4h3v3M-4 1v3h3',
  half:'M0-4.6A4.6 4.6 0 0 1 0 4.6Z',
  pin:'M0 4.6S-3.6 1-3.6-1.1a3.6 3.6 0 0 1 7.2 0C3.6 1 0 4.6 0 4.6zM0-1.1h0',
  out:'M0-4v7M-3 .2 0 3.2 3 .2'
};
const conv = (a, ca, b, cb) => svg(doc(10, 4, a, ca) + doc(42, 16, b, cb) + badge(40, 30, G.arrow));
const op = (label, c, glyph, fill, tilt) => svg((tilt ? `<g transform="rotate(-12 40 26)">${doc(24, 8, label, c)}</g>` : doc(24, 8, label, c)) + badge(54, 42, glyph, fill));
const pair = (label, c, glyph) => svg(doc(8, 10, label, c) + doc(44, 10, label, c) + badge(40, 28, glyph));

/* =========================================================
   TOOLS — each one is self-contained
   Fields: id, name, cats, exts ('*' = any file), imageInput, label, multiple,
           minFiles, verb, desc, note, icon, options, disabled, noZip, run()
   run() returns [{blob, name, from?, copy?}] and may set result.note
   ========================================================= */
const IMG_EXTS = ['jpg','jpeg','png','webp','gif','bmp'];
const TOOLS = [

/* ---------------- PDF ---------------- */
{
  id:'merge-pdf', name:'Merge PDF', cats:['pdf'], multiple:true, exts:['pdf'], verb:'Merge PDFs',
  desc:'Combine several PDFs into one, in the order you choose.',
  icon: pair('PDF', C.pdf, G.plus),
  minFiles:2,
  async run(files, o, p){
    await need('pdflib');
    const out = await PDFLib.PDFDocument.create();
    for(const [i, f] of files.entries()){
      p(i / files.length * .9, `Adding ${f.name}`);
      const src = await loadPdf(f);
      (await out.copyPages(src, src.getPageIndices())).forEach(pg => out.addPage(pg));
    }
    p(.95, 'Saving');
    return [{blob: pdfBlob(await out.save()), name: `${baseName(files[0].name)}-merged.pdf`}];
  }
},
{
  id:'split-pdf', name:'Split PDF', cats:['pdf'], exts:['pdf'], verb:'Split PDF',
  desc:'Pull out every page, or just the page ranges you need, as separate PDFs.',
  icon: op('PDF', C.pdf, G.split),
  options:[
    {key:'mode', label:'Split into', type:'select', value:'each', choices:[['each','One file per page'],['ranges','Custom page ranges']]},
    {key:'ranges', label:'Page ranges (each range becomes a file)', type:'text', value:'', placeholder:'e.g. 1-3, 5, 8-10', showIf:['mode','ranges']}
  ],
  async run(files, o, p){
    await need('pdflib');
    const f = files[0], src = await loadPdf(f), n = src.getPageCount();
    const groups = o.mode === 'ranges' ? parseRanges(o.ranges, n) : Array.from({length: n}, (_, i) => ({label: String(i + 1), idx: [i]}));
    const res = [];
    for(const [k, g] of groups.entries()){
      p(k / groups.length, `Creating file ${k + 1} of ${groups.length}`);
      const d = await PDFLib.PDFDocument.create();
      (await d.copyPages(src, g.idx)).forEach(pg => d.addPage(pg));
      res.push({blob: pdfBlob(await d.save()), name: `${baseName(f.name)}-p${g.label}.pdf`});
    }
    return res;
  }
},
{
  id:'organise-pages', name:'Organise pages', cats:['pdf'], exts:['pdf'], verb:'Save PDF',
  desc:'Delete pages, pick out the pages you want, or put them in a new order.',
  icon: op('PDF', C.pdf, G.list),
  options:[
    {key:'mode', label:'What do you want to do?', type:'select', value:'keep', choices:[['keep','Keep only these pages, in this order'],['delete','Delete these pages']]},
    {key:'pages', label:'Pages', type:'text', value:'', placeholder:'e.g. 3, 1-2, 5'},
  ],
  hint:'Tip: to reorder, list every page in the new order, e.g. 3, 1, 2. To reverse, type 10-1.',
  async run(files, o, p){
    await need('pdflib');
    const f = files[0], src = await loadPdf(f), n = src.getPageCount();
    const list = parsePageList(o.pages, n);
    let idx;
    if(o.mode === 'delete'){
      const del = new Set(list);
      idx = src.getPageIndices().filter(i => !del.has(i));
      if(!idx.length) throw new Error('That would delete every page. Leave at least one.');
    } else idx = list;
    p(.4, 'Rebuilding PDF');
    const d = await PDFLib.PDFDocument.create();
    (await d.copyPages(src, idx)).forEach(pg => d.addPage(pg));
    const res = [{blob: pdfBlob(await d.save()), name: `${baseName(f.name)}-organised.pdf`}];
    res.note = `${n} page${n === 1 ? '' : 's'} → ${idx.length} page${idx.length === 1 ? '' : 's'}`;
    return res;
  }
},
{
  id:'pdf-to-image', name:'PDF to image', cats:['pdf','images'], exts:['pdf'],
  desc:'Turn each page of a PDF into a JPG or PNG image.',
  icon: conv('PDF', C.pdf, 'IMG', C.img),
  options:[
    {key:'format', label:'Image format', type:'select', value:'image/jpeg', choices:[['image/jpeg','JPG (smaller files, best for photos)'],['image/png','PNG (sharpest, best for text and diagrams)']]},
    {key:'scale', label:'Image quality', type:'select', value:'2', choices:[['1.5','Standard'],['2','High'],['3','Very high (large files)']]}
  ],
  async run(files, o, p){
    await need('pdfjs');
    const f = files[0], pdf = await openPdfjs(f), res = [];
    for(let i = 1; i <= pdf.numPages; i++){
      p((i - 1) / pdf.numPages, `Rendering page ${i} of ${pdf.numPages}`);
      const page = await pdf.getPage(i);
      const vp = page.getViewport({scale: +o.scale});
      const c = document.createElement('canvas');
      c.width = Math.floor(vp.width); c.height = Math.floor(vp.height);
      const ctx = c.getContext('2d');
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({canvasContext: ctx, viewport: vp}).promise;
      const blob = await canvasToBlob(c, o.format, .92);
      res.push({blob, name: `${baseName(f.name)}-page-${i}.${EXT_FOR[blob.type] || 'png'}`});
      c.width = c.height = 0;
    }
    return res;
  }
},
{
  id:'image-to-pdf', name:'Image to PDF', cats:['pdf','images'], multiple:true, exts:IMG_EXTS, imageInput:true, verb:'Create PDF',
  desc:'Put one or more photos or images into a single PDF.',
  icon: conv('JPG', C.jpg, 'PDF', C.pdf),
  options:[{key:'size', label:'Page size', type:'select', value:'a4', choices:[['a4','A4 with margins'],['fit','Match each image']]}],
  async run(files, o, p){
    await need('pdflib');
    const d = await PDFLib.PDFDocument.create();
    for(const [i, f] of files.entries()){
      p(i / files.length * .9, `Adding ${f.name}`);
      let img;
      try{
        if(f.type === 'image/png') img = await d.embedPng(await f.arrayBuffer());
        else if(f.type === 'image/jpeg') img = await d.embedJpg(await f.arrayBuffer());
      }catch{ img = null; }
      if(!img){
        const c = await imageToCanvas(f, 0, '#fff');
        img = await d.embedJpg(await (await canvasToBlob(c, 'image/jpeg', .92)).arrayBuffer());
      }
      if(o.size === 'fit'){
        const w = img.width * .75, h = img.height * .75;
        d.addPage([w, h]).drawImage(img, {x: 0, y: 0, width: w, height: h});
      } else {
        const land = img.width > img.height, W = land ? 841.89 : 595.28, H = land ? 595.28 : 841.89, m = 28;
        const s = Math.min((W - 2*m) / img.width, (H - 2*m) / img.height);
        const w = img.width * s, h = img.height * s;
        d.addPage([W, H]).drawImage(img, {x: (W - w) / 2, y: (H - h) / 2, width: w, height: h});
      }
    }
    p(.95, 'Saving');
    return [{blob: pdfBlob(await d.save()), name: `${baseName(files[0].name)}${files.length > 1 ? '-and-more' : ''}.pdf`}];
  }
},
{
  id:'rotate-pdf', name:'Rotate PDF', cats:['pdf'], exts:['pdf'], verb:'Rotate PDF',
  desc:'Rotate every page of a PDF.',
  icon: op('PDF', C.pdf, G.rotate, false, true),
  options:[{key:'angle', label:'Rotate by', type:'select', value:'90', choices:[['90','90° clockwise'],['180','180°'],['270','90° anticlockwise']]}],
  async run(files, o, p){
    await need('pdflib');
    const d = await loadPdf(files[0]);
    d.getPages().forEach(pg => pg.setRotation(PDFLib.degrees((pg.getRotation().angle + +o.angle) % 360)));
    p(.9, 'Saving');
    return [{blob: pdfBlob(await d.save()), name: `${baseName(files[0].name)}-rotated.pdf`}];
  }
},
{
  id:'page-numbers', name:'Page numbers', cats:['pdf'], exts:['pdf'], verb:'Add page numbers',
  desc:'Stamp page numbers onto every page of a PDF.',
  icon: op('PDF', C.pdf, G.hash),
  options:[
    {key:'pos', label:'Position', type:'select', value:'bc', choices:[['bc','Bottom centre'],['br','Bottom right'],['tr','Top right']]},
    {key:'style', label:'Format', type:'select', value:'n', choices:[['n','1, 2, 3'],['of','Page 1 of 10']]}
  ],
  async run(files, o, p){
    await need('pdflib');
    const d = await loadPdf(files[0]);
    const font = await d.embedFont(PDFLib.StandardFonts.Helvetica);
    const pages = d.getPages(), n = pages.length, size = 10, m = 28;
    pages.forEach((pg, i) => {
      const t = o.style === 'of' ? `Page ${i + 1} of ${n}` : String(i + 1);
      const {width: w, height: h} = pg.getSize(), tw = font.widthOfTextAtSize(t, size);
      const x = o.pos === 'bc' ? (w - tw) / 2 : w - m - tw;
      const y = o.pos === 'tr' ? h - m : m - 6;
      pg.drawText(t, {x, y, size, font, color: PDFLib.rgb(.25, .25, .28)});
    });
    p(.9, 'Saving');
    return [{blob: pdfBlob(await d.save()), name: `${baseName(files[0].name)}-numbered.pdf`}];
  }
},
{
  id:'watermark-pdf', name:'Watermark', cats:['pdf'], exts:['pdf'], verb:'Add watermark',
  desc:'Stamp a diagonal text watermark across every page.',
  icon: op('PDF', C.pdf, G.drop, true),
  options:[
    {key:'text', label:'Watermark text', type:'text', value:'CONFIDENTIAL', placeholder:'e.g. DRAFT'},
    {key:'opacity', label:'Strength', type:'select', value:'.2', choices:[['.12','Subtle'],['.2','Medium'],['.35','Strong']]}
  ],
  async run(files, o, p){
    const text = (o.text || '').trim();
    if(!text) throw new Error('Enter some watermark text.');
    await need('pdflib');
    const d = await loadPdf(files[0]);
    const font = await d.embedFont(PDFLib.StandardFonts.HelveticaBold);
    try{ font.widthOfTextAtSize(text, 10); }catch{ throw new Error('Use plain letters and numbers for the watermark (no emoji or special symbols).'); }
    for(const pg of d.getPages()){
      const {width: w, height: h} = pg.getSize(), a = Math.atan2(h, w);
      let size = Math.min(w, h) / 7, tw = font.widthOfTextAtSize(text, size);
      const max = Math.hypot(w, h) * .7;
      if(tw > max){ size *= max / tw; tw = max; }
      const x = w/2 - (tw/2) * Math.cos(a) + (size/3) * Math.sin(a);
      const y = h/2 - (tw/2) * Math.sin(a) - (size/3) * Math.cos(a);
      pg.drawText(text, {x, y, size, font, color: PDFLib.rgb(.45, .45, .5), opacity: +o.opacity, rotate: PDFLib.degrees(a * 180 / Math.PI)});
    }
    p(.9, 'Saving');
    return [{blob: pdfBlob(await d.save()), name: `${baseName(files[0].name)}-watermarked.pdf`}];
  }
},
{
  id:'pdf-metadata', name:'Remove PDF info', cats:['pdf','files'], exts:['pdf'], verb:'Remove info',
  desc:'Strip hidden details like author, title, software and dates before you send a PDF.',
  icon: op('PDF', C.pdf, G.cross),
  async run(files, o, p){
    await need('pdflib');
    const f = files[0];
    const d = await loadPdf(f, {updateMetadata: false});
    const found = [];
    const info = d.getInfoDict();
    for(const k of info.keys()){
      const name = typeof k.decodeText === 'function' ? k.decodeText() : String(k).replace(/^\//, '');
      found.push(name.replace(/Date$/, ' date').replace(/^Mod /, 'Modified ').replace(/^Creation /, 'Created '));
      info.delete(k);
    }
    const meta = PDFLib.PDFName.of('Metadata');
    if(d.catalog.has(meta)){ d.catalog.delete(meta); found.push('XMP metadata'); }
    p(.8, 'Saving');
    const res = [{blob: pdfBlob(await d.save({updateFieldAppearances: false})), name: `${baseName(f.name)}-clean.pdf`}];
    res.note = found.length ? `Removed: ${found.join(', ')}` : 'No hidden info was found. The file was already clean.';
    return res;
  }
},
{
  id:'pdf-to-text', name:'PDF to Text', cats:['pdf','data'], exts:['pdf'],
  desc:'Pull all the readable text out of a PDF into a .txt file.',
  icon: conv('PDF', C.pdf, 'TXT', C.txt),
  async run(files, o, p){
    const pages = await extractPdfText(files[0], p);
    const txt = pages.map(ps => ps.map(pa => pa.join('\n')).join('\n\n')).join('\n\n\n');
    return [{blob: textBlob(txt), name: `${baseName(files[0].name)}.txt`}];
  }
},
{
  id:'text-to-pdf', name:'Text to PDF', cats:['pdf','data'], exts:['txt','md','log','csv'], verb:'Create PDF',
  desc:'Turn a plain text file into a tidy, readable PDF.',
  icon: conv('TXT', C.txt, 'PDF', C.pdf),
  options:[
    {key:'font', label:'Font', type:'select', value:'sans', choices:[['sans','Sans-serif (Helvetica)'],['serif','Serif (Times)'],['mono','Monospace (Courier)']]},
    {key:'size', label:'Text size', type:'select', value:'11', choices:[['10','Small'],['11','Medium'],['13','Large']]},
    {key:'page', label:'Page size', type:'select', value:'a4', choices:[['a4','A4'],['letter','US Letter']]}
  ],
  async run(files, o, p){
    await need('pdflib');
    const f = files[0];
    let text = (await f.text()).replace(/^﻿/, '').replace(/\r\n?/g, '\n').replace(/\t/g, '    ').replace(/[\u0000-\u0008\u000B-\u001F]/g, '');
    if(!text.trim()) throw new Error('This file is empty.');
    const d = await PDFLib.PDFDocument.create();
    d.setTitle(baseName(f.name));
    const font = await d.embedFont({sans: PDFLib.StandardFonts.Helvetica, serif: PDFLib.StandardFonts.TimesRoman, mono: PDFLib.StandardFonts.Courier}[o.font]);
    const cache = new Map();
    const safeCh = ch => { if(!cache.has(ch)){ try{ font.widthOfTextAtSize(ch, 10); cache.set(ch, ch); }catch{ cache.set(ch, '?'); } } return cache.get(ch); };
    text = [...text].map(ch => ch === '\n' ? ch : safeCh(ch)).join('');
    const [W, H] = o.page === 'letter' ? [612, 792] : [595.28, 841.89];
    const size = +o.size, lead = size * 1.45, m = 56, maxW = W - 2 * m;
    p(.3, 'Laying out pages');
    const lines = wrapText(text, font, size, maxW);
    let page = null, y = 0;
    for(const line of lines){
      if(!page || y < m){ page = d.addPage([W, H]); y = H - m - size; }
      if(line) page.drawText(line, {x: m, y, size, font, color: PDFLib.rgb(.1, .1, .12)});
      y -= lead;
    }
    p(.9, 'Saving');
    const res = [{blob: pdfBlob(await d.save()), name: `${baseName(f.name)}.pdf`}];
    if([...cache.values()].includes('?')) res.note = 'Some special characters (like emoji) couldn’t be shown and were replaced with “?”.';
    return res;
  }
},

/* ---------------- IMAGES ---------------- */
{
  id:'compress-image', name:'Compress image', cats:['images'], multiple:true, exts:IMG_EXTS, imageInput:true, verb:'Compress',
  desc:'Shrink photo file sizes for email, web or uploads.',
  icon: op('JPG', C.jpg, G.shrink),
  options:[
    {key:'q', label:'Quality', type:'select', value:'.72', choices:[['.85','High (smaller saving)'],['.72','Balanced'],['.55','Small file']]},
    {key:'max', label:'Max width or height', type:'select', value:'2560', choices:[['0','Keep original size'],['2560','2560 px'],['1920','1920 px'],['1280','1280 px']]}
  ],
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Compressing ${f.name}`);
      const c = await imageToCanvas(f, +o.max, '#fff');
      res.push({blob: await canvasToBlob(c, 'image/jpeg', +o.q), name: `${baseName(f.name)}-compressed.jpg`, from: f.size});
      c.width = c.height = 0;
    }
    return res;
  }
},
{
  id:'convert-image', name:'Convert image', cats:['images'], multiple:true, exts:IMG_EXTS, imageInput:true,
  desc:'Switch images between JPG, PNG and WebP.',
  icon: conv('PNG', C.png, 'WEBP', C.webp),
  options:[{key:'to', label:'Convert to', type:'select', value:'image/jpeg', choices:[['image/jpeg','JPG'],['image/png','PNG'],['image/webp','WebP']]}],
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Converting ${f.name}`);
      const c = await imageToCanvas(f, 0, o.to === 'image/jpeg' ? '#fff' : null);
      const blob = await canvasToBlob(c, o.to, .92);
      res.push({blob, name: `${baseName(f.name)}.${EXT_FOR[blob.type] || 'png'}`});
      c.width = c.height = 0;
    }
    if(o.to === 'image/webp' && res.some(r => r.blob.type !== 'image/webp')) res.note = 'This browser can’t create WebP files, so PNG was used instead.';
    return res;
  }
},
{
  id:'resize-image', name:'Resize image', cats:['images'], multiple:true, exts:IMG_EXTS, imageInput:true, verb:'Resize',
  desc:'Make images bigger or smaller. Proportions are always kept.',
  icon: op('IMG', C.img, G.grow),
  options:[
    {key:'mode', label:'Resize by', type:'select', value:'percent', choices:[['percent','Percentage'],['width','Width in pixels'],['height','Height in pixels']]},
    {key:'percent', label:'Percentage', type:'select', value:'50', choices:[['25','25%'],['50','50%'],['75','75%'],['150','150%'],['200','200%']], showIf:['mode','percent']},
    {key:'width', label:'New width (px)', type:'number', value:'1080', placeholder:'e.g. 1080', showIf:['mode','width']},
    {key:'height', label:'New height (px)', type:'number', value:'1080', placeholder:'e.g. 1080', showIf:['mode','height']}
  ],
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Resizing ${f.name}`);
      const src = await imageToCanvas(f);
      let s;
      if(o.mode === 'percent') s = +o.percent / 100;
      else {
        const v = parseInt(o[o.mode], 10);
        if(!(v > 0)) throw new Error(`Enter a ${o.mode} in pixels, e.g. 1080.`);
        s = v / (o.mode === 'width' ? src.width : src.height);
      }
      const w = Math.max(1, Math.round(src.width * s)), h = Math.max(1, Math.round(src.height * s));
      if(w > 12000 || h > 12000) throw new Error('That would be too large (over 12,000 px). Choose a smaller size.');
      const type = outType(f);
      const out = scaleCanvas(src, w, h, type === 'image/jpeg' ? '#fff' : null);
      res.push(await saveCanvas(out, f, `-${w}x${h}`, type));
      src.width = src.height = out.width = out.height = 0;
    }
    return res;
  }
},
{
  id:'rotate-image', name:'Rotate & flip', cats:['images'], multiple:true, exts:IMG_EXTS, imageInput:true, verb:'Apply',
  desc:'Rotate images by 90° or 180°, or mirror them.',
  icon: op('IMG', C.img, G.rotate, false, true),
  options:[{key:'action', label:'Action', type:'select', value:'r90', choices:[['r90','Rotate 90° clockwise'],['r270','Rotate 90° anticlockwise'],['r180','Rotate 180°'],['fh','Flip horizontally (mirror)'],['fv','Flip vertically']]}],
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Processing ${f.name}`);
      const src = await imageToCanvas(f), a = o.action, swap = a === 'r90' || a === 'r270';
      const c = document.createElement('canvas');
      c.width = swap ? src.height : src.width; c.height = swap ? src.width : src.height;
      const ctx = c.getContext('2d'), type = outType(f);
      if(type === 'image/jpeg'){ ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); }
      ctx.translate(c.width / 2, c.height / 2);
      if(a === 'r90') ctx.rotate(Math.PI / 2);
      if(a === 'r180') ctx.rotate(Math.PI);
      if(a === 'r270') ctx.rotate(-Math.PI / 2);
      if(a === 'fh') ctx.scale(-1, 1);
      if(a === 'fv') ctx.scale(1, -1);
      ctx.drawImage(src, -src.width / 2, -src.height / 2);
      res.push(await saveCanvas(c, f, a.startsWith('f') ? '-flipped' : '-rotated', type));
      src.width = src.height = c.width = c.height = 0;
    }
    return res;
  }
},
{
  id:'grayscale-image', name:'Black & white', cats:['images'], multiple:true, exts:IMG_EXTS, imageInput:true, verb:'Convert',
  desc:'Turn colour photos and images into black and white.',
  icon: op('IMG', '#6b7280', G.half, true),
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Processing ${f.name}`);
      const type = outType(f);
      const c = await imageToCanvas(f, 0, type === 'image/jpeg' ? '#fff' : null);
      const ctx = c.getContext('2d'), im = ctx.getImageData(0, 0, c.width, c.height), d = im.data;
      for(let k = 0; k < d.length; k += 4){
        const y = Math.round(.2126 * d[k] + .7152 * d[k+1] + .0722 * d[k+2]);
        d[k] = d[k+1] = d[k+2] = y;
      }
      ctx.putImageData(im, 0, 0);
      res.push(await saveCanvas(c, f, '-bw', type));
      c.width = c.height = 0;
    }
    return res;
  }
},
{
  id:'remove-photo-data', name:'Remove photo data', cats:['images','files'], multiple:true, exts:['jpg','jpeg','png'], verb:'Remove data',
  desc:'Strip GPS location, camera details and dates from photos before you share them. Image quality is untouched.',
  icon: op('JPG', C.jpg, G.pin),
  async run(files, o, p){
    const res = [], removed = new Set(); let withLocation = 0;
    for(const [i, f] of files.entries()){
      p(i / files.length, `Cleaning ${f.name}`);
      const u8 = new Uint8Array(await f.arrayBuffer());
      const isPng = u8[0] === 137 && u8[1] === 80;
      const r = isPng ? stripPng(u8) : stripJpeg(u8);
      r.found.forEach(x => removed.add(x));
      if(r.found.has('location')) withLocation++;
      res.push({blob: r.blob, name: `${baseName(f.name)}-clean.${isPng ? 'png' : 'jpg'}`, from: f.size});
    }
    res.note = removed.size
      ? `Removed: ${[...removed].join(', ')}.` + (withLocation ? ` ${withLocation} photo${withLocation > 1 ? 's had' : ' had'} a GPS location.` : '')
      : 'No hidden data was found. The photos were already clean.';
    return res;
  }
},
{
  id:'heic-convert', name:'HEIC to JPG/PNG', cats:['images'], multiple:true, exts:['heic','heif','jpg','jpeg','png'], imageInput:true,
  label:'HEIC (iPhone photos)',
  desc:'Convert iPhone photos (HEIC) into JPGs or PNGs that open anywhere.',
  icon: conv('HEIC', C.heic, 'JPG', C.jpg),
  options:[{key:'to', label:'Convert to', type:'select', value:'image/jpeg', choices:[['image/jpeg','JPG (smaller files)'],['image/png','PNG (lossless)']]}],
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Converting ${f.name}`);
      const heic = /^hei[cf]$/.test(extOf(f.name)) || /hei[cf]/.test(f.type);
      let blob;
      if(heic){
        await need('heic');
        let r;
        try{ r = await heic2any({blob: f, toType: o.to, quality: .92}); }
        catch{ throw new Error(`Couldn’t convert “${f.name}”. It may not be a HEIC photo.`); }
        blob = Array.isArray(r) ? r[0] : r;
      } else {
        // iPhone often hands over photos already converted to JPG, so handle those too
        const c = await imageToCanvas(f, 0, o.to === 'image/jpeg' ? '#fff' : null);
        blob = await canvasToBlob(c, o.to, .92);
      }
      res.push({blob, name: `${baseName(f.name)}.${EXT_FOR[blob.type] || 'jpg'}`});
    }
    return res;
  }
},
{
  id:'svg-to-image', name:'SVG to PNG', cats:['images'], multiple:true, exts:['svg'], verb:'Convert',
  desc:'Turn logos and vector graphics into PNG or JPG images at any size.',
  note:'Fonts or images linked from outside the SVG file can’t be included. Outline text in your design app first for the best result.',
  icon: conv('SVG', C.svg, 'PNG', C.png),
  options:[
    {key:'width', label:'Width', type:'select', value:'1024', choices:[['256','256 px'],['512','512 px'],['1024','1024 px'],['2048','2048 px'],['4096','4096 px']]},
    {key:'to', label:'Format', type:'select', value:'image/png', choices:[['image/png','PNG (keeps transparency)'],['image/jpeg','JPG (white background)']]}
  ],
  async run(files, o, p){
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Rendering ${f.name}`);
      const c = await svgToCanvas(f, +o.width, o.to === 'image/jpeg' ? '#fff' : null);
      const blob = await canvasToBlob(c, o.to, .92);
      res.push({blob, name: `${baseName(f.name)}-${c.width}px.${EXT_FOR[blob.type]}`});
    }
    return res;
  }
},
{
  id:'favicon', name:'Favicon maker', cats:['images','files'], exts:[...IMG_EXTS, 'svg'], imageInput:true, verb:'Create icons',
  desc:'Make a full website icon set from one image: favicon.ico, Apple and Android icons and the HTML to paste in.',
  note:'Use a square image of at least 512 px for the sharpest result. Non-square images are fitted, not cropped.',
  icon: conv('PNG', C.png, 'ICO', C.ico),
  options:[{key:'bg', label:'Background', type:'select', value:'', choices:[['','Transparent'],['#ffffff','White'],['#000000','Black']]}],
  async run(files, o, p){
    const f = files[0], bg = o.bg || null;
    p(.1, 'Reading image');
    const src = await rasterize(f, 1024);
    const png = async (size, name, fill = bg) => ({blob: await canvasToBlob(squareCanvas(src, size, fill), 'image/png'), name});
    p(.3, 'Creating icons');
    const res = [
      {blob: await buildIco(bg ? squareCanvas(src, 256, bg) : src), name: 'favicon.ico'},
      await png(16, 'favicon-16x16.png'),
      await png(32, 'favicon-32x32.png'),
      await png(180, 'apple-touch-icon.png', bg || '#ffffff'),
      await png(192, 'android-chrome-192x192.png'),
      await png(512, 'android-chrome-512x512.png')
    ];
    res.push({blob: textBlob(JSON.stringify({name: '', short_name: '', icons: [
      {src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png'},
      {src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png'}],
      theme_color: '#ffffff', background_color: '#ffffff', display: 'standalone'}, null, 2), 'application/manifest+json'), name: 'site.webmanifest'});
    const snippet = `<link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">
<link rel="manifest" href="/site.webmanifest">`;
    res.push({blob: textBlob(snippet), name: 'favicon-html.txt', copy: snippet});
    res.note = 'Upload the files to your website’s root folder and paste the HTML into the <head>.';
    res.copyLabel = 'Copy HTML';
    return res;
  }
},

/* ---------------- DOCS & DATA ---------------- */
{
  id:'excel-to-csv', name:'Excel to CSV', cats:['data'], exts:['xlsx','xls','ods'],
  desc:'Save each sheet of a spreadsheet as a CSV file.',
  icon: conv('XLSX', C.xls, 'CSV', C.csv),
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const f = files[0], wb = await readWorkbook(f);
    const many = wb.SheetNames.length > 1;
    return wb.SheetNames.map(n => ({
      blob: textBlob('﻿' + XLSX.utils.sheet_to_csv(wb.Sheets[n]), 'text/csv;charset=utf-8'),
      name: many ? `${baseName(f.name)}-${n.replace(/[^\w\- ]+/g, '').trim() || 'sheet'}.csv` : `${baseName(f.name)}.csv`
    }));
  }
},
{
  id:'csv-to-excel', name:'CSV to Excel', cats:['data'], multiple:true, exts:['csv','tsv','txt'],
  desc:'Turn CSV files into an Excel workbook (one sheet per file).',
  icon: conv('CSV', C.csv, 'XLSX', C.xls),
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const wb = XLSX.utils.book_new(), used = new Set();
    for(const f of files){
      const tmp = await readWorkbook(f);
      XLSX.utils.book_append_sheet(wb, tmp.Sheets[tmp.SheetNames[0]], uniqueSheetName(baseName(f.name), used));
    }
    const out = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
    return [{blob: new Blob([out], {type: MIME.xlsx}), name: `${baseName(files[0].name)}.xlsx`}];
  }
},
{
  id:'sheet-to-json', name:'Excel/CSV to JSON', cats:['data'], exts:['xlsx','xls','ods','csv','tsv'],
  desc:'Turn a spreadsheet or CSV into JSON. Workbooks with several sheets become one JSON object keyed by sheet name.',
  icon: conv('XLSX', C.xls, 'JSON', C.json),
  options:[{key:'shape', label:'JSON layout', type:'select', value:'objects', choices:[['objects','List of objects (first row = keys)'],['rows','List of rows (arrays)']]}],
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const f = files[0], wb = await readWorkbook(f, {cellDates: true});
    const conv = ws => o.shape === 'rows'
      ? XLSX.utils.sheet_to_json(ws, {header: 1, defval: '', blankrows: false})
      : XLSX.utils.sheet_to_json(ws, {defval: '', blankrows: false});
    const names = wb.SheetNames;
    const data = names.length === 1 ? conv(wb.Sheets[names[0]]) : Object.fromEntries(names.map(n => [n, conv(wb.Sheets[n])]));
    return [{blob: textBlob(JSON.stringify(data, null, 2), 'application/json'), name: `${baseName(f.name)}.json`}];
  }
},
{
  id:'json-to-sheet', name:'JSON to Excel/CSV', cats:['data'], exts:['json'],
  desc:'Turn JSON into a spreadsheet. Nested values are kept as text in their cell.',
  icon: conv('JSON', C.json, 'XLSX', C.xls),
  options:[{key:'to', label:'Convert to', type:'select', value:'xlsx', choices:[['xlsx','Excel (.xlsx)'],['csv','CSV']]}],
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const f = files[0];
    let data;
    try{ data = JSON.parse((await f.text()).replace(/^﻿/, '')); }
    catch(e){ throw new Error(`“${f.name}” isn’t valid JSON. ${e.message || ''}`.trim()); }
    const multi = data && typeof data === 'object' && !Array.isArray(data) && Object.keys(data).length > 1 && Object.values(data).every(Array.isArray);
    const sheets = multi ? Object.entries(data) : [[baseName(f.name), data]];
    if(o.to === 'csv'){
      return sheets.map(([n, v]) => ({
        blob: textBlob('﻿' + XLSX.utils.sheet_to_csv(jsonToSheet(v)), 'text/csv;charset=utf-8'),
        name: multi ? `${baseName(f.name)}-${safeFileName(n) || 'sheet'}.csv` : `${baseName(f.name)}.csv`
      }));
    }
    const wb = XLSX.utils.book_new(), used = new Set();
    sheets.forEach(([n, v]) => XLSX.utils.book_append_sheet(wb, jsonToSheet(v), uniqueSheetName(n, used)));
    return [{blob: new Blob([XLSX.write(wb, {bookType: 'xlsx', type: 'array'})], {type: MIME.xlsx}), name: `${baseName(f.name)}.xlsx`}];
  }
},
{
  id:'merge-csv', name:'Merge CSVs', cats:['data'], multiple:true, minFiles:2, exts:['csv','tsv'], verb:'Merge CSVs',
  desc:'Combine several CSV files into one. Columns are matched by their header name.',
  icon: pair('CSV', C.csv, G.plus),
  options:[{key:'source', label:'Add a column showing which file each row came from?', type:'select', value:'no', choices:[['no','No'],['yes','Yes']]}],
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const header = [], rows = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Reading ${f.name}`);
      const wb = await readWorkbook(f, {raw: true});
      const aoa = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: false, defval: '', blankrows: false});
      if(!aoa.length) continue;
      const h = aoa[0].map(c => String(c).trim());
      h.forEach(c => { if(!header.includes(c)) header.push(c); });
      for(const r of aoa.slice(1)){
        const obj = {}; h.forEach((c, k) => { if(!(c in obj)) obj[c] = r[k] ?? ''; });
        rows.push({obj, src: f.name});
      }
    }
    if(!header.length) throw new Error('These CSV files are empty.');
    const src = o.source === 'yes';
    const aoa = [src ? [...header, 'Source file'] : header, ...rows.map(r => header.map(c => r.obj[c] ?? '').concat(src ? [r.src] : []))];
    const res = [{blob: textBlob('﻿' + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(aoa)), 'text/csv;charset=utf-8'), name: `${baseName(files[0].name)}-merged.csv`}];
    res.note = `${rows.length} row${rows.length === 1 ? '' : 's'} from ${files.length} files, ${header.length} column${header.length === 1 ? '' : 's'}.`;
    return res;
  }
},

/* ---------------- FILES ---------------- */
{
  id:'create-zip', name:'Create ZIP', cats:['files'], multiple:true, exts:'*', verb:'Create ZIP',
  desc:'Bundle any files into a single .zip, ready to email or upload.',
  icon: op('ZIP', C.zip, G.plus),
  options:[{key:'name', label:'ZIP file name', type:'text', value:'files', placeholder:'e.g. project-files'}],
  async run(files, o, p){
    await need('zip');
    const zip = new JSZip(), used = new Set();
    for(const f of files){
      let n = f.name, k = 2;
      while(used.has(n.toLowerCase())) n = `${baseName(f.name)} (${k++})${extOf(f.name) ? '.' + extOf(f.name) : ''}`;
      used.add(n.toLowerCase());
      zip.file(n, f);
    }
    const blob = await zip.generateAsync({type: 'blob', compression: 'DEFLATE', compressionOptions: {level: 6}}, m => p(m.percent / 100, 'Compressing'));
    return [{blob, name: `${safeFileName(o.name) || 'files'}.zip`, from: files.reduce((a, f) => a + f.size, 0)}];
  }
},
{
  id:'extract-zip', name:'Extract ZIP', cats:['files'], exts:['zip'], verb:'Extract', noZip:true,
  desc:'Unpack a .zip file and save the files inside one by one.',
  icon: op('ZIP', C.zip, G.out),
  async run(files, o, p){
    await need('zip');
    let zip;
    try{ zip = await JSZip.loadAsync(files[0]); }
    catch{ throw new Error('Couldn’t open this ZIP. It may be damaged or password-protected.'); }
    const entries = Object.values(zip.files).filter(e => !e.dir && !/(^|\/)(__MACOSX\/|\._|\.DS_Store$)/.test(e.name));
    if(!entries.length) throw new Error('This ZIP has no files in it.');
    const res = [], used = new Set();
    for(const [i, e] of entries.entries()){
      p(i / entries.length, `Extracting ${e.name}`);
      let n = e.name.split('/').pop(), k = 2;
      while(used.has(n.toLowerCase())) n = `${baseName(e.name.split('/').pop())} (${k++})${extOf(e.name) ? '.' + extOf(e.name) : ''}`;
      used.add(n.toLowerCase());
      const data = await e.async('arraybuffer');
      res.push({blob: new Blob([data], {type: MIME[extOf(n)] || 'application/octet-stream'}), name: n});
    }
    if(entries.some(e => e.name.includes('/'))) res.note = 'Files from folders inside the ZIP are listed together.';
    return res;
  }
},
{
  id:'image-base64', name:'Image to Base64', cats:['files','images'], exts:[...IMG_EXTS, 'svg'], imageInput:true, verb:'Encode',
  desc:'Turn an image into Base64 code you can paste straight into HTML, CSS or an email template.',
  icon: conv('IMG', C.img, 'B64', C.b64),
  options:[{key:'format', label:'Output', type:'select', value:'uri', choices:[['uri','Data URI'],['img','HTML <img> tag'],['css','CSS background']]}],
  async run(files, o, p){
    const f = files[0];
    const type = isSvg(f) ? 'image/svg+xml' : (f.type || MIME[extOf(f.name)] || 'application/octet-stream');
    const uri = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(new Error('Couldn’t read this file.')); r.readAsDataURL(new Blob([f], {type})); });
    const text = o.format === 'img' ? `<img src="${uri}" alt="">` : o.format === 'css' ? `background-image: url("${uri}");` : uri;
    const res = [{blob: textBlob(text), name: `${baseName(f.name)}-base64.txt`, copy: text}];
    res.note = `${fmt(text.length)} of code` + (text.length > 500000 ? '. That’s large, so consider compressing the image first.' : '.');
    return res;
  }
},

/* ---------------- COMING SOON (code kept, tiles disabled) ---------------- */
{
  id:'pdf-to-word', name:'PDF to Word', cats:['pdf','data'], exts:['pdf'], disabled:true,
  desc:'Extract the text from a PDF into an editable Word document.',
  note:'Text only — layout, images and tables aren’t kept. Scanned PDFs won’t have any text to extract.',
  icon: conv('PDF', C.pdf, 'DOCX', C.doc),
  async run(files, o, p){
    const pages = await extractPdfText(files[0], p);
    p(.95, 'Building Word document');
    return [{blob: await buildDocx(pages), name: `${baseName(files[0].name)}.docx`}];
  }
},
{
  id:'word-to-pdf', name:'Word to PDF', cats:['pdf','data'], exts:['docx'], disabled:true,
  desc:'Turn a Word document (.docx) into a PDF.',
  note:'Keeps headings, lists, tables and images. Complex layouts may shift, and text in the PDF isn’t selectable.',
  icon: conv('DOCX', C.doc, 'PDF', C.pdf),
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('mammoth', 'html2pdf');
    p(.2, 'Reading document');
    let html;
    try{ html = (await mammoth.convertToHtml({arrayBuffer: await files[0].arrayBuffer()})).value; }
    catch{ throw new Error('Couldn’t read this file. Make sure it’s a .docx (not an older .doc).'); }
    const el = document.createElement('div');
    el.className = 'docrender'; el.innerHTML = html;
    p(.5, 'Laying out pages');
    const blob = await html2pdf().set({
      margin: 15, image: {type: 'jpeg', quality: .95},
      html2canvas: {scale: 2, backgroundColor: '#ffffff', useCORS: true},
      jsPDF: {unit: 'mm', format: 'a4', orientation: 'portrait'},
      pagebreak: {mode: ['css', 'legacy'], avoid: ['img', 'tr']}
    }).from(el).outputPdf('blob');
    return [{blob, name: `${baseName(files[0].name)}.pdf`}];
  }
}
];

const CATS = [['all','All tools'],['pdf','PDF'],['images','Images'],['data','Docs & data'],['files','Files']];

/* =========================================================
   ROUTER + VIEWS
   ========================================================= */
const app = $('#app');
let filter = 'all';
let objectUrls = [];
const revokeAll = () => { objectUrls.forEach(URL.revokeObjectURL); objectUrls = []; };

function route(){
  revokeAll();
  const id = location.hash.replace(/^#\/?/, '');
  const t = TOOLS.find(t => t.id === id);
  if(t && t.disabled){ history.replaceState(null, '', '#/'); renderHome(); }
  else t ? renderTool(t) : renderHome();
  window.scrollTo(0, 0);
}
addEventListener('hashchange', route);
addEventListener('scroll', () => $('#top').classList.toggle('scrolled', scrollY > 4), {passive: true});

function renderHome(){
  document.title = 'Doc Swap — convert files on your device';
  app.innerHTML = `
    <section class="hero">
      <h1>Every file, in the format you need.</h1>
      <p>Convert, merge and tidy documents and images in seconds. Everything happens on your device, so nothing gets uploaded.</p>
    </section>
    <div class="chips" role="group" aria-label="Filter tools">
      ${CATS.map(([v, l]) => `<button class="chip" data-cat="${v}" aria-pressed="${v === filter}">${l}</button>`).join('')}
    </div>
    <nav class="grid" id="grid" aria-label="Tools"></nav>`;
  const draw = () => {
    const list = TOOLS.filter(t => filter === 'all' || t.cats.includes(filter));
    const ordered = [...list.filter(t => !t.disabled), ...list.filter(t => t.disabled)];
    $('#grid').innerHTML = ordered.map(t => t.disabled
      ? `<div class="tile off" aria-disabled="true" title="Coming soon">${t.icon}<span>${t.name}</span><em class="soon">Soon</em></div>`
      : `<a class="tile" href="#/${t.id}">${t.icon}<span>${t.name}</span></a>`).join('');
  };
  app.querySelector('.chips').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if(!b) return;
    filter = b.dataset.cat;
    app.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', c === b));
    draw();
  });
  draw();
}

function renderTool(t){
  document.title = `${t.name} — Doc Swap`;
  const anyFile = t.exts === '*';
  const exts = anyFile ? [] : t.exts;
  const accept = anyFile ? '' : exts.map(e => '.' + e).join(',')
    + (t.imageInput ? ',image/*' : '')
    + (exts.includes('heic') ? ',image/heic,image/heif' : '')
    + (exts.includes('svg') ? ',image/svg+xml' : '');
  const label = t.label || (anyFile ? 'any file type'
    : t.imageInput ? 'JPG, PNG, WEBP' + (exts.includes('svg') ? ', SVG' : '')
    : exts.filter(e => e !== 'jpeg').map(e => e.toUpperCase()).join(', '));
  const opts = t.options || [];

  app.innerHTML = `
  <div class="tool">
    <a class="back" href="#/">← All tools</a>
    <div class="tool-head">
      <div class="ico">${t.icon}</div>
      <div><h1>${t.name}</h1><p>${escH(t.desc)}</p></div>
    </div>
    ${t.note ? `<p class="note">${escH(t.note)}</p>` : ''}
    <label class="drop" id="drop">
      <input class="sr" type="file" id="file" ${accept ? `accept="${accept}"` : ''} ${t.multiple ? 'multiple' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <strong>${t.multiple ? 'Choose files' : 'Choose a file'}</strong>
      <small>or drag ${t.multiple ? 'them' : 'it'} here · ${escH(label)}</small>
    </label>
    <ul class="files" id="files"></ul>
    <div class="opts" id="opts">${opts.map(optHtml).join('')}${t.hint ? `<p class="hint">${escH(t.hint)}</p>` : ''}</div>
    <button class="btn primary" id="go" disabled>${t.verb || 'Convert'}</button>
    <div class="progress" id="prog" hidden><div class="bar" id="bar"><i></i></div><p class="status" id="status" aria-live="polite"></p></div>
    <div class="result" id="result" hidden aria-live="polite"></div>
  </div>`;

  let files = [], busy = false;
  const input = $('#file'), drop = $('#drop'), list = $('#files'), go = $('#go'), result = $('#result');
  const minFiles = t.minFiles || 1;

  const ok = f => anyFile || exts.includes(extOf(f.name))
    || (t.imageInput && f.type.startsWith('image/') && (exts.includes('heic') || !/hei[cf]/.test(f.type)) && (exts.includes('svg') || f.type !== 'image/svg+xml'));
  function add(fl){
    const incoming = [...fl], good = incoming.filter(ok), bad = incoming.length - good.length;
    files = t.multiple ? files.concat(good) : good.length ? good.slice(0, 1) : files;
    result.hidden = true;
    drawFiles();
    if(bad) showError(`${bad} file${bad > 1 ? 's were' : ' was'} skipped. This tool accepts ${label}.`);
  }
  function drawFiles(){
    list.innerHTML = files.map((f, i) => `<li>
      <span class="n">${escH(f.name)}</span><span class="s">${fmt(f.size)}</span>
      ${t.multiple && files.length > 1 ? `<button class="iconbtn" data-a="up" data-i="${i}" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>↑</button><button class="iconbtn" data-a="down" data-i="${i}" aria-label="Move down" ${i === files.length - 1 ? 'disabled' : ''}>↓</button>` : ''}
      <button class="iconbtn" data-a="rm" data-i="${i}" aria-label="Remove">✕</button></li>`).join('');
    go.disabled = busy || files.length < minFiles;
    go.textContent = files.length && files.length < minFiles ? `Add at least ${minFiles} files` : (t.verb || 'Convert');
  }
  list.addEventListener('click', e => {
    const b = e.target.closest('button'); if(!b) return;
    const i = +b.dataset.i;
    if(b.dataset.a === 'rm') files.splice(i, 1);
    if(b.dataset.a === 'up') [files[i - 1], files[i]] = [files[i], files[i - 1]];
    if(b.dataset.a === 'down') [files[i + 1], files[i]] = [files[i], files[i + 1]];
    result.hidden = true; drawFiles();
  });
  input.addEventListener('change', () => { add(input.files); input.value = ''; });
  ['dragenter','dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave','drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
  drop.addEventListener('drop', e => add(e.dataTransfer.files));

  // options
  const optsEl = $('#opts');
  const getOpts = () => Object.fromEntries([...optsEl.querySelectorAll('[name]')].map(el => [el.name, el.value]));
  const syncShow = () => {
    const v = getOpts();
    opts.forEach(o => { if(o.showIf){ const want = o.showIf[1]; optsEl.querySelector(`[data-key="${o.key}"]`).hidden = Array.isArray(want) ? !want.includes(v[o.showIf[0]]) : v[o.showIf[0]] !== want; } });
  };
  optsEl.addEventListener('change', syncShow); syncShow();

  // progress
  const bar = $('#bar'), status = $('#status'), prog = $('#prog');
  const setP = (v, msg) => {
    bar.classList.toggle('indet', !(v > 0));
    bar.firstElementChild.style.width = v > 0 ? Math.min(100, v * 100) + '%' : '';
    if(msg) status.textContent = msg;
  };

  function showError(msg){
    result.hidden = false;
    result.innerHTML = `<div class="err"><span>⚠</span><span>${escH(msg)}</span></div>`;
  }
  function showResult(out){
    revokeAll();
    const items = out.map(o => { const u = URL.createObjectURL(o.blob); objectUrls.push(u); return {...o, u}; });
    const shareFiles = items.map(o => new File([o.blob], o.name, {type: o.blob.type || 'application/octet-stream'}));
    const canShare = canShareFiles(shareFiles);
    const one = items.length === 1 ? items[0] : null;
    const copyItem = items.find(o => typeof o.copy === 'string');
    const total = items.reduce((s, o) => s + o.blob.size, 0);
    const saved = items.every(o => o.from) ? (() => { const a = items.reduce((s, o) => s + o.from, 0); return total < a ? ` · ${Math.round((1 - total / a) * 100)}% smaller` : ''; })() : '';
    const zipBtn = !t.noZip;
    result.hidden = false;
    result.innerHTML = `
      <div class="done"><span class="tick">✓</span><div>
        <strong>${one ? 'Your file is ready' : `${items.length} files ready`}</strong>
        <small>${one ? `${escH(one.name)} · ${one.from ? fmt(one.from) + ' → ' : ''}${fmt(one.blob.size)}` : fmt(total) + ' in total'}${saved}</small>
      </div></div>
      ${out.note ? `<p class="result-note">${escH(out.note)}</p>` : ''}
      ${copyItem ? `<button class="btn ${one ? 'primary' : 'secondary'}" id="copy">${escH(out.copyLabel || 'Copy to clipboard')}</button>` : ''}
      ${one ? (canShare
              ? `<div class="btn-row two">
                   <button class="btn ${PREFER_SHARE && !copyItem ? 'primary' : 'secondary'}" id="share">Save or share</button>
                   <a class="btn ${PREFER_SHARE || copyItem ? 'secondary' : 'primary'}" href="${one.u}" download="${escH(one.name)}">Download</a>
                 </div>`
              : `<a class="btn ${copyItem ? 'secondary' : 'primary'}" href="${one.u}" download="${escH(one.name)}">Download</a>`)
            : `<div class="btn-row ${canShare && zipBtn ? 'two' : ''}">
                 ${canShare ? `<button class="btn ${PREFER_SHARE || !zipBtn ? 'primary' : 'secondary'}" id="share">Save or share all</button>` : ''}
                 ${zipBtn ? `<button class="btn ${canShare && PREFER_SHARE ? 'secondary' : 'primary'}" id="zip">Download all (.zip)</button>` : ''}
               </div>
               <ul class="outs">${items.map(o => `<li><span class="n">${escH(o.name)}</span><span class="s">${o.from ? fmt(o.from) + ' → ' : ''}${fmt(o.blob.size)}</span><a class="btn small" href="${o.u}" download="${escH(o.name)}">Save</a></li>`).join('')}</ul>`}
      <button class="btn ghost" id="again">Convert another</button>`;
    const cp = $('#copy');
    if(cp) cp.addEventListener('click', async () => {
      const label = cp.textContent;
      try{
        await navigator.clipboard.writeText(copyItem.copy);
        cp.textContent = 'Copied ✓';
      }catch{
        const ta = document.createElement('textarea');
        ta.value = copyItem.copy; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0;font-size:16px';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, ta.value.length);
        const okc = document.execCommand && document.execCommand('copy'); ta.remove();
        cp.textContent = okc ? 'Copied ✓' : 'Couldn’t copy. Use Download instead.';
      }
      setTimeout(() => { cp.textContent = label; }, 2000);
    });
    const sh = $('#share');
    if(sh) sh.addEventListener('click', async () => {
      try{ await navigator.share({files: shareFiles}); }
      catch(e){ if(e && e.name !== 'AbortError') showError('Sharing isn’t available here. Use Download instead.'); }
    });
    const z = $('#zip');
    if(z) z.addEventListener('click', async () => {
      z.disabled = true; z.textContent = 'Zipping…';
      try{
        await need('zip');
        const zip = new JSZip();
        items.forEach(o => zip.file(o.name, o.blob));
        const blob = await zip.generateAsync({type: 'blob'});
        const u = URL.createObjectURL(blob); objectUrls.push(u);
        const a = document.createElement('a'); a.href = u; a.download = `${baseName(files[0] ? files[0].name : 'files')}-${t.id}.zip`;
        document.body.appendChild(a); a.click(); a.remove();
      }catch(e){ showError(e.message); }
      z.disabled = false; z.textContent = 'Download all (.zip)';
    });
    $('#again').addEventListener('click', () => { files = []; drawFiles(); result.hidden = true; revokeAll(); window.scrollTo({top: 0, behavior: 'smooth'}); });
  }

  go.addEventListener('click', async () => {
    if(busy || files.length < minFiles) return;
    busy = true; go.disabled = true; result.hidden = true; prog.hidden = false;
    setP(0, 'Getting ready…');
    await tick();
    try{
      const out = await t.run(files, getOpts(), setP);
      if(!out || !out.length) throw new Error('Nothing was produced from this file.');
      setP(1, 'Done');
      showResult(out);
      result.scrollIntoView({behavior: 'smooth', block: 'nearest'});
    }catch(e){
      console.error(e);
      showError(e && e.message ? e.message : 'Something went wrong. Please try again.');
    }finally{
      busy = false; drawFiles();
      setTimeout(() => { prog.hidden = true; }, 500);
    }
  });
}

function optHtml(o){
  if(o.type === 'select') return `<label class="field" data-key="${o.key}"><span>${escH(o.label)}</span><select name="${o.key}">${o.choices.map(([v, l]) => `<option value="${escH(v)}" ${v === o.value ? 'selected' : ''}>${escH(l)}</option>`).join('')}</select></label>`;
  const num = o.type === 'number' ? ' inputmode="numeric" pattern="[0-9]*"' : '';
  return `<label class="field" data-key="${o.key}"><span>${escH(o.label)}</span><input name="${o.key}" type="text"${num} value="${escH(o.value || '')}" placeholder="${escH(o.placeholder || '')}" autocomplete="off" autocapitalize="off" spellcheck="false"></label>`;
}

/* =========================================================
   NO ZOOM — iOS ignores user-scalable=no, so block gestures here
   ========================================================= */
['gesturestart','gesturechange','gestureend'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), {passive: false}));
document.addEventListener('touchmove', e => { if(e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, {passive: false});
/* Double-tap zoom is disabled by touch-action:manipulation in styles.css */

/* =========================================================
   PWA — offline support + automatic updates
   - The app checks for a new version every time it's opened or brought back
   - When one is found it reloads itself once, so the home-screen app stays current
   ========================================================= */
let swReg = null;
if('serviceWorker' in navigator && location.protocol !== 'file:'){
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if(!hadController || reloading) return;   // first install: nothing to refresh
    reloading = true;
    location.reload();
  });
  addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js', {updateViaCache: 'none'})
      .then(reg => { swReg = reg; })
      .catch(err => console.warn('SW registration failed', err));
  });
  document.addEventListener('visibilitychange', () => { if(document.visibilityState === 'visible' && swReg) swReg.update().catch(() => {}); });
}
async function checkForUpdates(btn){
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Checking…';
  try{
    if(swReg){
      await swReg.update();
      if(swReg.installing || swReg.waiting){ btn.textContent = 'Updating…'; return; }   // controllerchange will reload
    }
    btn.textContent = 'Refreshing…';
    location.reload();
  }catch{
    btn.textContent = 'You’re offline. Try again later.';
    setTimeout(() => { btn.textContent = label; btn.disabled = false; }, 2500);
  }
}
const updBtn = $('#update');
if(updBtn){
  updBtn.addEventListener('click', () => checkForUpdates(updBtn));
  const v = $('#version'); if(v) v.textContent = 'v' + APP_VERSION;
}

route();
