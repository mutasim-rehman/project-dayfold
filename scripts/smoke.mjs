const base=process.env.TEST_APP_URL||'http://127.0.0.1:3000';
const cases=[
  ['/',{},200],
  ['/api/me',{},401],
  ['/api/editions',{},401],
  ['/api/memories',{},401],
  ['/api/admin',{},401],
  ['/api/account/export',{},401],
  ['/api/internal/worker',{method:'POST'},401],
  ['/api/ask',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'},403],
  ['/api/editions',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'},403],
  ['/api/account/delete',{method:'POST',headers:{origin:'https://untrusted.example','content-type':'application/json'},body:'{}'},403]
];
let failures=0;
for(const [path,options,expected] of cases){const response=await fetch(base+path,options);const pass=response.status===expected;console.log(`${pass?'PASS':'FAIL'} ${options.method||'GET'} ${path}: ${response.status}`);if(!pass)failures++;await response.body?.cancel();}
if(failures)process.exitCode=1;
