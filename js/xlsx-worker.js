/* Spreadsheet work for Doc Swap, run in a worker instead of the page.
   The bundled SheetJS 0.18.5 has two known problems with crafted files: prototype pollution
   (CVE-2023-30533) and very slow regular expressions (CVE-2024-22363). In here, pollution can't
   reach the app, and app.js terminates the worker if a file makes it hang.
   TODO: swap in SheetJS 0.20.3+ from cdn.sheetjs.com when possible; keep this worker anyway. */
importScripts('lib/xlsx.full.min.js');

const BOM = '﻿';
const extOf = n => (n.match(/\.([^.]+)$/) || [, ''])[1].toLowerCase();

async function readWorkbook(f, opts = {}){
  try{
    return ['csv', 'tsv', 'txt'].includes(extOf(f.name))
      ? XLSX.read((await f.text()).replace(/^﻿/, ''), {type: 'string', ...opts})
      : XLSX.read(await f.arrayBuffer(), opts);
  }catch{ throw new Error(`Couldn’t read “${f.name}” as a spreadsheet.`); }
}

// Excel limits sheet names to 31 characters and bans \ / ? * [ ] :
function sheetName(name, used){
  const nm = (name || 'Sheet').replace(/[\\\/?*\[\]:]/g, '').slice(0, 31) || 'Sheet';
  let k = nm, j = 2;
  while(used.has(k.toLowerCase())) k = nm.slice(0, 28) + ' ' + j++;
  used.add(k.toLowerCase());
  return k;
}

// Nested objects and arrays are kept as JSON text in their cell
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

const xlsxBuffer = wb => XLSX.write(wb, {bookType: 'xlsx', type: 'array'});

const OPS = {
  // every sheet of a workbook as CSV text
  async workbookToCsv(f){
    const wb = await readWorkbook(f);
    return wb.SheetNames.map(name => ({name, csv: BOM + XLSX.utils.sheet_to_csv(wb.Sheets[name])}));
  },
  // one sheet per CSV file, named after the file
  async csvFilesToXlsx(files, names){
    const wb = XLSX.utils.book_new(), used = new Set();
    for(const [i, f] of files.entries()){
      const src = await readWorkbook(f);
      XLSX.utils.book_append_sheet(wb, src.Sheets[src.SheetNames[0]], sheetName(names[i], used));
    }
    return xlsxBuffer(wb);
  },
  async workbookToJson(f, shape){
    const wb = await readWorkbook(f, {cellDates: true});
    const toJson = ws => shape === 'rows'
      ? XLSX.utils.sheet_to_json(ws, {header: 1, defval: '', blankrows: false})
      : XLSX.utils.sheet_to_json(ws, {defval: '', blankrows: false});
    const names = wb.SheetNames;
    return names.length === 1 ? toJson(wb.Sheets[names[0]]) : Object.fromEntries(names.map(n => [n, toJson(wb.Sheets[n])]));
  },
  // sheets = [[name, jsonValue], ...]
  jsonToCsv(sheets){ return sheets.map(([, v]) => BOM + XLSX.utils.sheet_to_csv(jsonToSheet(v))); },
  jsonToXlsx(sheets){
    const wb = XLSX.utils.book_new(), used = new Set();
    sheets.forEach(([n, v]) => XLSX.utils.book_append_sheet(wb, jsonToSheet(v), sheetName(n, used)));
    return xlsxBuffer(wb);
  },
  // first sheet as rows of text, for Merge CSVs
  async csvRows(f){
    const wb = await readWorkbook(f, {raw: true});
    return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header: 1, raw: false, defval: '', blankrows: false});
  },
  rowsToCsv(rows){ return BOM + XLSX.utils.sheet_to_csv(XLSX.utils.aoa_to_sheet(rows)); }
};

onmessage = async ({data: {op, args}}) => {
  try{
    const result = await OPS[op](...args);
    postMessage({result}, result instanceof ArrayBuffer ? [result] : []);
  }catch(e){
    postMessage({error: (e && e.message) || 'The spreadsheet couldn’t be converted.'});
  }
};
