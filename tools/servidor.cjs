const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const types = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.pdf':'application/pdf'};
const server = http.createServer((req,res) => {
  let relative;
  try { relative = decodeURIComponent(new URL(req.url,'http://localhost').pathname); } catch { res.writeHead(400).end(); return; }
  const file = path.resolve(root, '.'+relative+(relative.endsWith('/')?'index.html':''));
  if (!file.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
  fs.stat(file,(err,stat)=>{
    if(err||!stat.isFile()){res.writeHead(404).end('Arquivo não encontrado');return;}
    res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Content-Length':stat.size,'Cache-Control':'no-cache'});
    if(req.method==='HEAD')res.end();else fs.createReadStream(file).pipe(res);
  });
});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log(`Prévia local: http://127.0.0.1:${server.address().port}`));
