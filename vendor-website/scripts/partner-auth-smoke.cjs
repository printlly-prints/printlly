const http=require('node:http');
const assert=require('node:assert/strict');
const {validatePassword}=require('../../backend/utils/passwordPolicy');
const requests=[];
http.createServer(async(req,res)=>{
 res.setHeader('Access-Control-Allow-Origin','http://127.0.0.1:5174');
 res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization');
 res.setHeader('Access-Control-Allow-Methods','GET, POST, OPTIONS');
 res.setHeader('Content-Type','application/json');
 if(req.method==='OPTIONS'){res.writeHead(204);return res.end();}
 if(req.url==='/test-results'){return res.end(JSON.stringify(requests));}
 if(req.url==='/shops/me'){res.writeHead(404);return res.end(JSON.stringify({message:'No shop registered'}));}
 if(req.url==='/auth/register'){
   let raw='';for await(const chunk of req)raw+=chunk;
   const body=JSON.parse(raw);
   assert.equal(body.role,'shop_owner');assert.equal(body.name,'Partner Test');assert.equal(body.phone,'9000000000');
   requests.push({path:req.url,role:body.role,email:body.email});
   const policy=validatePassword(body.password);
   if(!policy.valid){res.writeHead(400);return res.end(JSON.stringify({message:policy.message}));}
   if(body.email==='duplicate@example.test'){res.writeHead(409);return res.end(JSON.stringify({message:'This email address is already registered to another account'}));}
   assert.equal(body.email,'partner@example.test');assert.equal(body.password,'test-passphrase-123');
   res.writeHead(201);return res.end(JSON.stringify({token:'local-ui-test-only',user:{_id:'partner-test',name:body.name,email:body.email,role:'shop_owner'}}));
 }
 res.writeHead(404);res.end(JSON.stringify({message:'Test route not found'}));
}).listen(5011,'127.0.0.1',()=>console.log('Isolated test API ready on 5011; no real accounts or database.'));
