/* =========================================================
   LIBRARIES — bundled next to index.html, loaded only when a tool needs them
   ========================================================= */
const V = '';  /* all files live in the same folder as index.html */
const LIB = {
  pdfjs:    V + 'pdf.min.js',
  pdflib:   V + 'pdf-lib.min.js',
  zip:      V + 'jszip.min.js',
  heic:     V + 'heic2any.min.js',
  mammoth:  V + 'mammoth.browser.min.js',
  html2pdf: V + 'html2pdf.bundle.min.js',
  xlsx:     V + 'xlsx.full.min.js'
};
const PDFJS_WORKER = V + 'pdf.worker.min.js';
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
const EXT_FOR = {'image/jpeg':'jpg','image/png':'png','image/webp':'webp'};

/* iPhone / iPad: the share sheet is the reliable way to save to Files or Photos,
   especially when running from the home screen */
const IS_IOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const PREFER_SHARE = IS_IOS || matchMedia('(pointer:coarse)').matches;
function canShareFiles(files){
  try{ return !!(navigator.canShare && navigator.share && navigator.canShare({files})); }
  catch{ return false; }
}

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
    ctx.drawImage(img, 0, 0, w, h);
    return c;
  } finally { URL.revokeObjectURL(url); }
}
async function loadPdf(f){
  try{ return await PDFLib.PDFDocument.load(await f.arrayBuffer(), {ignoreEncryption: true}); }
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

/* Text extraction shared by PDF → Word and PDF → Text.
   Returns pages → paragraphs → lines. */
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

/* Minimal .docx writer (no extra library beyond JSZip) */
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
  return zip.generateAsync({type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'});
}

/* =========================================================
   ICONS — tile graphics (original artwork)
   ========================================================= */
const C = {pdf:'#e5484d', jpg:'#f5a524', png:'#8e4ec6', webp:'#12a594', heic:'#d6409f', doc:'#3e63dd', xls:'#30a46c', csv:'#0b9fc4', txt:'#70707c'};
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
  shrink:'M-4.5-4.5l3 3M-1.5-4v2.5H-4M4.5 4.5l-3-3M1.5 4V1.5H4'
};
const conv = (a, ca, b, cb) => svg(doc(10, 4, a, ca) + doc(42, 16, b, cb) + badge(40, 30, G.arrow));
const op = (label, c, glyph, fill, tilt) => svg((tilt ? `<g transform="rotate(-12 40 26)">${doc(24, 8, label, c)}</g>` : doc(24, 8, label, c)) + badge(54, 42, glyph, fill));

/* =========================================================
   TOOLS — each one is self-contained (easy to split into files)
   ========================================================= */
const IMG_EXTS = ['jpg','jpeg','png','webp','gif','bmp'];
const TOOLS = [
{
  id:'merge-pdf', name:'Merge PDF', cats:['pdf'], multiple:true, exts:['pdf'], verb:'Merge PDFs',
  desc:'Combine several PDFs into one, in the order you choose.',
  icon: svg(doc(8, 10, 'PDF', C.pdf) + doc(44, 10, 'PDF', C.pdf) + badge(40, 28, G.plus)),
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
  desc:'Pull out every page, or just the page ranges you need.',
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
  id:'pdf-to-jpg', name:'PDF to JPG', cats:['pdf','images'], exts:['pdf'],
  desc:'Turn each page of a PDF into a JPG image.',
  icon: conv('PDF', C.pdf, 'JPG', C.jpg),
  options:[{key:'scale', label:'Image quality', type:'select', value:'2', choices:[['1.5','Standard'],['2','High'],['3','Very high (large files)']]}],
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
      res.push({blob: await canvasToBlob(c, 'image/jpeg', .92), name: `${baseName(f.name)}-page-${i}.jpg`});
      c.width = c.height = 0;
    }
    return res;
  }
},
{
  id:'image-to-pdf', name:'Image to PDF', cats:['pdf','images'], multiple:true, exts:IMG_EXTS, verb:'Create PDF',
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
  id:'pdf-to-word', name:'PDF to Word', cats:['pdf','office'], exts:['pdf'],
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
  id:'word-to-pdf', name:'Word to PDF', cats:['pdf','office'], exts:['docx'],
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
  id:'pdf-to-text', name:'PDF to Text', cats:['pdf','office'], exts:['pdf'],
  desc:'Pull all the readable text out of a PDF into a .txt file.',
  icon: conv('PDF', C.pdf, 'TXT', C.txt),
  async run(files, o, p){
    const pages = await extractPdfText(files[0], p);
    const txt = pages.map(ps => ps.map(pa => pa.join('\n')).join('\n\n')).join('\n\n\n');
    return [{blob: new Blob([txt], {type: 'text/plain;charset=utf-8'}), name: `${baseName(files[0].name)}.txt`}];
  }
},
{
  id:'compress-image', name:'Compress image', cats:['images'], multiple:true, exts:IMG_EXTS, verb:'Compress',
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
  id:'convert-image', name:'Convert image', cats:['images'], multiple:true, exts:IMG_EXTS,
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
    return res;
  }
},
{
  id:'heic-to-jpg', name:'HEIC to JPG', cats:['images'], multiple:true, exts:['heic','heif'],
  desc:'Convert iPhone photos (HEIC) into JPGs that open anywhere.',
  icon: conv('HEIC', C.heic, 'JPG', C.jpg),
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('heic');
    const res = [];
    for(const [i, f] of files.entries()){
      p(i / files.length, `Converting ${f.name}`);
      let r;
      try{ r = await heic2any({blob: f, toType: 'image/jpeg', quality: .9}); }
      catch{ throw new Error(`Couldn’t convert “${f.name}”. It may not be a HEIC photo.`); }
      res.push({blob: Array.isArray(r) ? r[0] : r, name: `${baseName(f.name)}.jpg`});
    }
    return res;
  }
},
{
  id:'excel-to-csv', name:'Excel to CSV', cats:['office'], exts:['xlsx','xls','ods'],
  desc:'Save each sheet of a spreadsheet as a CSV file.',
  icon: conv('XLSX', C.xls, 'CSV', C.csv),
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const f = files[0];
    let wb;
    try{ wb = XLSX.read(await f.arrayBuffer()); }catch{ throw new Error('Couldn’t read this spreadsheet.'); }
    const many = wb.SheetNames.length > 1;
    return wb.SheetNames.map(n => ({
      blob: new Blob(['\ufeff' + XLSX.utils.sheet_to_csv(wb.Sheets[n])], {type: 'text/csv;charset=utf-8'}),
      name: many ? `${baseName(f.name)}-${n.replace(/[^\w\- ]+/g, '').trim() || 'sheet'}.csv` : `${baseName(f.name)}.csv`
    }));
  }
},
{
  id:'csv-to-excel', name:'CSV to Excel', cats:['office'], multiple:true, exts:['csv','tsv','txt'],
  desc:'Turn CSV files into an Excel workbook (one sheet per file).',
  icon: conv('CSV', C.csv, 'XLSX', C.xls),
  async run(files, o, p){
    p(0, 'Loading converter');
    await need('xlsx');
    const wb = XLSX.utils.book_new(), used = new Set();
    for(const f of files){
      const tmp = XLSX.read((await f.text()).replace(/^\ufeff/, ''), {type: 'string'});
      let nm = baseName(f.name).replace(/[\\\/?*\[\]:]/g, '').slice(0, 31) || 'Sheet', k = nm, j = 2;
      while(used.has(k.toLowerCase())) k = nm.slice(0, 28) + ' ' + j++;
      used.add(k.toLowerCase());
      XLSX.utils.book_append_sheet(wb, tmp.Sheets[tmp.SheetNames[0]], k);
    }
    const out = XLSX.write(wb, {bookType: 'xlsx', type: 'array'});
    return [{blob: new Blob([out], {type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), name: `${baseName(files[0].name)}.xlsx`}];
  }
}
];

const CATS = [['all','All tools'],['pdf','PDF'],['images','Images'],['office','Word & Excel']];

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
  t ? renderTool(t) : renderHome();
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
    $('#grid').innerHTML = TOOLS.filter(t => filter === 'all' || t.cats.includes(filter))
      .map(t => `<a class="tile" href="#/${t.id}">${t.icon}<span>${t.name}</span></a>`).join('');
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
  const exts = t.exts;
  const isImgTool = exts === IMG_EXTS;
  const accept = exts.map(e => '.' + e).join(',') + (isImgTool ? ',image/*' : '') + (exts.includes('heic') ? ',image/heic,image/heif' : '');
  const label = (isImgTool ? ['JPG','PNG','WEBP'] : exts.filter(e => e !== 'jpeg').map(e => e.toUpperCase())).join(', ');
  const opts = t.options || [];

  app.innerHTML = `
  <div class="tool">
    <a class="back" href="#/">← All tools</a>
    <div class="tool-head">
      <div class="ico">${t.icon}</div>
      <div><h1>${t.name}</h1><p>${t.desc}</p></div>
    </div>
    ${t.note ? `<p class="note">${t.note}</p>` : ''}
    <label class="drop" id="drop">
      <input class="sr" type="file" id="file" accept="${accept}" ${t.multiple ? 'multiple' : ''}>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4m0 0L8 8m4-4 4 4"/><path d="M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3"/></svg>
      <strong>${t.multiple ? 'Choose files' : 'Choose a file'}</strong>
      <small>or drag ${t.multiple ? 'them' : 'it'} here · ${label}</small>
    </label>
    <ul class="files" id="files"></ul>
    <div class="opts" id="opts">${opts.map(optHtml).join('')}</div>
    <button class="btn primary" id="go" disabled>${t.verb || 'Convert'}</button>
    <div class="progress" id="prog" hidden><div class="bar" id="bar"><i></i></div><p class="status" id="status" aria-live="polite"></p></div>
    <div class="result" id="result" hidden aria-live="polite"></div>
  </div>`;

  let files = [], busy = false;
  const input = $('#file'), drop = $('#drop'), list = $('#files'), go = $('#go'), result = $('#result');
  const minFiles = t.minFiles || 1;

  const ok = f => { const e = extOf(f.name); return exts.includes(e) || (isImgTool && f.type.startsWith('image/') && !/hei[cf]/.test(f.type)); };
  function add(fl){
    const incoming = [...fl], good = incoming.filter(ok), bad = incoming.length - good.length;
    files = t.multiple ? files.concat(good) : good.slice(0, 1).length ? good.slice(0, 1) : files;
    result.hidden = true;
    drawFiles();
    if(bad) showError(`${bad} file${bad > 1 ? 's were' : ' was'} skipped — this tool accepts ${label}.`);
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
  const syncShow = () => { const v = getOpts(); opts.forEach(o => { if(o.showIf) optsEl.querySelector(`[data-key="${o.key}"]`).hidden = v[o.showIf[0]] !== o.showIf[1]; }); };
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
    const saved = items.every(o => o.from) ? (() => { const a = items.reduce((s, o) => s + o.from, 0), b = items.reduce((s, o) => s + o.blob.size, 0); return b < a ? ` · ${Math.round((1 - b / a) * 100)}% smaller` : ''; })() : '';
    result.hidden = false;
    result.innerHTML = `
      <div class="done"><span class="tick">✓</span><div>
        <strong>${one ? 'Your file is ready' : `${items.length} files ready`}</strong>
        <small>${one ? `${escH(one.name)} · ${one.from ? fmt(one.from) + ' → ' : ''}${fmt(one.blob.size)}` : fmt(items.reduce((s, o) => s + o.blob.size, 0)) + ' in total'}${saved}</small>
      </div></div>
      ${one ? (canShare
              ? `<div class="btn-row two">
                   <button class="btn ${PREFER_SHARE ? 'primary' : 'secondary'}" id="share">Save or share</button>
                   <a class="btn ${PREFER_SHARE ? 'secondary' : 'primary'}" href="${one.u}" download="${escH(one.name)}">Download</a>
                 </div>`
              : `<a class="btn primary" href="${one.u}" download="${escH(one.name)}">Download</a>`)
            : `<div class="btn-row ${canShare ? 'two' : ''}">
                 ${canShare ? `<button class="btn ${PREFER_SHARE ? 'primary' : 'secondary'}" id="share">Save or share all</button>` : ''}
                 <button class="btn ${canShare && PREFER_SHARE ? 'secondary' : 'primary'}" id="zip">Download all (.zip)</button>
               </div>
               <ul class="outs">${items.map(o => `<li><span class="n">${escH(o.name)}</span><span class="s">${o.from ? fmt(o.from) + ' → ' : ''}${fmt(o.blob.size)}</span><a class="btn small" href="${o.u}" download="${escH(o.name)}">Save</a></li>`).join('')}</ul>`}
      <button class="btn ghost" id="again">Convert another</button>`;
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
  if(o.type === 'select') return `<label class="field" data-key="${o.key}"><span>${o.label}</span><select name="${o.key}">${o.choices.map(([v, l]) => `<option value="${v}" ${v === o.value ? 'selected' : ''}>${l}</option>`).join('')}</select></label>`;
  return `<label class="field" data-key="${o.key}"><span>${o.label}</span><input name="${o.key}" type="text" value="${escH(o.value || '')}" placeholder="${escH(o.placeholder || '')}" autocomplete="off"></label>`;
}

/* =========================================================
   NO ZOOM — iOS ignores user-scalable=no, so block gestures here
   ========================================================= */
['gesturestart','gesturechange','gestureend'].forEach(ev =>
  document.addEventListener(ev, e => e.preventDefault(), {passive: false}));
document.addEventListener('touchmove', e => { if(e.touches.length > 1 || (e.scale && e.scale !== 1)) e.preventDefault(); }, {passive: false});
/* Double-tap zoom is disabled by touch-action:manipulation in styles.css */

/* =========================================================
   PWA — offline support
   ========================================================= */
if('serviceWorker' in navigator && location.protocol !== 'file:'){
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(err => console.warn('SW registration failed', err)));
}

route();
