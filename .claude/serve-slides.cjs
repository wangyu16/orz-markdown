const http=require('http'),fs=require('fs'),path=require('path');
const ROOT='/Users/C00278943/Documents/orz-slides';
const T={'.html':'text/html; charset=utf-8','.js':'text/javascript','.css':'text/css','.md':'text/markdown'};
http.createServer((req,res)=>{let fp=path.join(ROOT,decodeURIComponent((req.url||'/').split('?')[0]));
if(!fp.startsWith(ROOT)){res.writeHead(403);return res.end('no');}
fs.stat(fp,(e,st)=>{if(e){res.writeHead(404);return res.end('nf');}if(st.isDirectory())fp=path.join(fp,'index.html');
fs.readFile(fp,(e2,b)=>{if(e2){res.writeHead(404);return res.end('nf');}res.writeHead(200,{'content-type':T[path.extname(fp)]||'application/octet-stream'});res.end(b);});});
}).listen(8160,()=>console.log('on 8160'));
