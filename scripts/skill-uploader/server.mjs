// Local skill uploader. Run: ECHELON_COOKIE='<cookie header>' node scripts/skill-uploader/server.mjs
// Forwards files to ECHELON's POST /api/skills (the only skill intake). Nothing is stored here.
import http from 'node:http';

const PORT = Number(process.env.PORT ?? 4777);
const ECHELON = (process.env.ECHELON_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const COOKIE = process.env.ECHELON_COOKIE ?? '';
const MAX_BODY = 10 * 262144 + 64 * 1024; // matches maxFilesPerRequest * maxFileBytes in apps/web/config/skill-pipeline.json

const PAGE = `<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1">
<title>Skill Uploader</title>
<style>body{font:15px system-ui;background:#070B12;color:#e6edf5;max-width:720px;margin:2rem auto;padding:0 1rem}
.box{border:2px dashed #38B6FF;border-radius:10px;padding:2rem;text-align:center;background:#0E1520}
.box.over{background:#0B4E7A}button{background:#38B6FF;border:0;border-radius:6px;padding:.5rem 1rem;font-weight:600;cursor:pointer}
pre{background:#0E1520;padding:1rem;border-radius:8px;white-space:pre-wrap}</style>
<h1>Skill Uploader</h1>
<p>Sends .md .txt .json .yaml .yml files (max 256 KB each) to WHINK Ultimate. Marcus Vale uses them through ECHELON.</p>
<div class=box id=drop>Drop files or folders here<br><br>
<input type=file id=f multiple> <input type=file id=d webkitdirectory></div>
<p><button id=go>Upload</button></p><pre id=out>Waiting.</pre>
<script>
const EXT=/\\.(md|txt|json|ya?ml)$/i; let files=[];
const rel=f=>(f.webkitRelativePath||f.name).replace(/\\//g,'__'); // folder/SKILL.md -> folder__SKILL.md, so names stay unique
const take=l=>{files=files.concat([...l]);out.textContent=files.length+' file(s) selected';};
f.onchange=()=>take(f.files); d.onchange=()=>take(d.files);
drop.ondragover=e=>{e.preventDefault();drop.classList.add('over')}; drop.ondragleave=()=>drop.classList.remove('over');
drop.ondrop=async e=>{e.preventDefault();drop.classList.remove('over');
  const walk=async en=>en.isFile?[await new Promise(r=>en.file(x=>{Object.defineProperty(x,'webkitRelativePath',{value:en.fullPath.slice(1)});r(x)}))]
    :(await new Promise(r=>{const rd=en.createReader(),all=[];(function n(){rd.readEntries(async b=>{if(!b.length)return r(all);for(const c of b)all.push(...await walk(c));n()})})()}));
  for(const it of e.dataTransfer.items){const en=it.webkitGetAsEntry();if(en)files.push(...await walk(en))}
  out.textContent=files.length+' file(s) selected'};
go.onclick=async()=>{const ok=files.filter(x=>EXT.test(x.name)),skipped=files.length-ok.length;let log='Skipped (type): '+skipped+'\\n';
  for(let i=0;i<ok.length;i+=10){const fd=new FormData();ok.slice(i,i+10).forEach(x=>fd.append('file',x,rel(x)));
    const r=await fetch('/upload',{method:'POST',body:fd});log+=r.status+' '+await r.text()+'\\n';out.textContent=log}
  files=[];out.textContent=log+'Done.'};
</script>`;

http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/') { res.setHeader('content-type', 'text/html'); return res.end(PAGE); }
  if (req.method === 'POST' && req.url === '/upload') {
    if (!COOKIE) { res.statusCode = 500; return res.end('Set ECHELON_COOKIE (your logged-in session cookie header) and restart.'); }
    const chunks = []; let n = 0;
    for await (const c of req) { n += c.length; if (n > MAX_BODY) { res.statusCode = 413; return res.end('Too large'); } chunks.push(c); }
    try {
      const r = await fetch(`${ECHELON}/api/skills`, { method: 'POST', headers: { 'content-type': req.headers['content-type'], cookie: COOKIE }, body: Buffer.concat(chunks) });
      res.statusCode = r.status; return res.end(await r.text());
    } catch (e) { res.statusCode = 502; return res.end(`Cannot reach ECHELON at ${ECHELON}: ${e.message}`); }
  }
  res.statusCode = 404; res.end();
}).listen(PORT, '127.0.0.1', () => console.log(`Skill uploader: http://localhost:${PORT} -> ${ECHELON}`));
