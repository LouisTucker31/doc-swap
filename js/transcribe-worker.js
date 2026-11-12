/* Speech to text for Doc Swap's Transcribe tool (Whisper, via transformers.js).
   The engine is too big to bundle, so the first run fetches it from jsDelivr and the model from
   Hugging Face. Each engine file is checked against the SHA-256 that jsDelivr publishes for that
   exact version and refused if it differs, then kept in Cache Storage for offline use.
   Running it in a worker keeps that third-party code away from the page and its saved settings.
   The recording itself never leaves the device. */
const ENGINE = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/';
const ENGINE_FILES = {
  lib:  {name: 'transformers.min.js', sha256: 'qlACtw54l5jaJj9fmcYr0+j80MEZJYpJPEDBgGSDZfo=', type: 'text/javascript', size: 888173},
  mjs:  {name: 'ort-wasm-simd-threaded.jsep.mjs', sha256: 'CPuG7EM8eL+wMsXYSmi46OWo2BJo+jniQxQXmldnpbk=', type: 'text/javascript', size: 44484},
  wasm: {name: 'ort-wasm-simd-threaded.jsep.wasm', sha256: 'xGZV6KlK/EUzjUyyuEBHX4jlAS1SRQmRblBQecAL+jk=', type: 'application/wasm', size: 21596019}
};
const ENGINE_CACHE = 'docswap-transcribe-engine-3.8.1';
const RATE = 16000;

const send = msg => postMessage(msg);
const b64 = buf => { let s = ''; new Uint8Array(buf).forEach(b => { s += String.fromCharCode(b); }); return btoa(s); };

// Download progress across the engine and model files, reported as one figure
const bytes = {};
function reportDownload(){
  const v = Object.values(bytes), done = v.reduce((a, [l]) => a + l, 0), total = v.reduce((a, [, t]) => a + t, 0);
  if(total) send({type: 'download', loaded: done, total});
}

async function readBody(res, key, size){
  if(!res.body) return res.arrayBuffer();
  const reader = res.body.getReader(), parts = []; let got = 0;
  for(;;){
    const {done, value} = await reader.read();
    if(done) break;
    parts.push(value); got += value.length;
    bytes[key] = [got, Math.max(size, got)]; reportDownload();
  }
  const buf = new Uint8Array(got); let off = 0;
  for(const p of parts){ buf.set(p, off); off += p.length; }
  return buf.buffer;
}

async function verifiedEngineFile(key){
  const f = ENGINE_FILES[key], url = ENGINE + f.name, cache = await caches.open(ENGINE_CACHE);
  let res = await cache.match(url);
  const cached = !!res;
  if(!res){
    try{ res = await fetch(url, {credentials: 'omit'}); }
    catch{ throw new Error('Couldn’t download the speech engine. Check you’re online for this first run, then try again.'); }
    if(!res.ok) throw new Error(`Couldn’t download the speech engine (error ${res.status}). Try again later.`);
  }
  const buf = cached ? await res.arrayBuffer() : await readBody(res, key, f.size);
  bytes[key] = [f.size, f.size]; reportDownload();
  if(b64(await crypto.subtle.digest('SHA-256', buf)) !== f.sha256){
    if(cached) await cache.delete(url);
    throw new Error('Part of the speech engine didn’t match its expected fingerprint, so it wasn’t used. Try again later.');
  }
  if(!cached) await cache.put(url, new Response(buf, {headers: {'Content-Type': f.type}}));
  return URL.createObjectURL(new Blob([buf], {type: f.type}));
}

async function hasWebGPU(){
  try{ return !!(navigator.gpu && await navigator.gpu.requestAdapter()); }
  catch{ return false; }   // treated the same as no WebGPU: the processor is used instead
}

async function loadRecogniser(model){
  const [lib, mjs, wasm] = [await verifiedEngineFile('lib'), await verifiedEngineFile('mjs'), await verifiedEngineFile('wasm')];
  const {pipeline, env} = await import(lib);
  env.allowLocalModels = false;
  env.useBrowserCache = true;
  env.backends.onnx.wasm.wasmPaths = {mjs, wasm};
  const progress_callback = e => { if(e.status === 'progress' && e.total){ bytes[e.file] = [e.loaded, e.total]; reportDownload(); } };
  if(await hasWebGPU()){
    try{
      // the settings Hugging Face recommend for Whisper on WebGPU
      const asr = await pipeline('automatic-speech-recognition', model, {device: 'webgpu', dtype: {encoder_model: 'fp32', decoder_model_merged: 'q4'}, progress_callback});
      return {asr, device: 'webgpu'};
    }catch(e){ console.warn('WebGPU unavailable for Whisper, using the processor instead', e); }
  }
  const asr = await pipeline('automatic-speech-recognition', model, {device: 'wasm', dtype: 'q8', progress_callback});
  return {asr, device: 'wasm'};
}

onmessage = async ({data: {model, language, audio, sections}}) => {
  try{
    const {asr, device} = await loadRecogniser(model);
    send({type: 'ready', device});
    const chunks = [];
    for(const [k, [from, to]] of sections.entries()){
      const offset = from / RATE, length = (to - from) / RATE;
      const out = await asr(audio.subarray(from, to), {
        chunk_length_s: 30, stride_length_s: 5, return_timestamps: true,
        ...(language ? {language, task: 'transcribe'} : {})   // English-only models reject a language setting
      });
      for(const c of out.chunks || []){
        const text = (c.text || '').trim();
        if(!text) continue;
        const [s, e] = c.timestamp || [0, length];
        chunks.push({start: offset + (s ?? 0), end: offset + (e ?? length), text});
      }
      send({type: 'section', done: k + 1, total: sections.length});
    }
    send({type: 'done', chunks, device});
  }catch(e){
    send({type: 'error', message: (e && e.message) || 'The transcript couldn’t be made.'});
  }
};
