const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage();let requests=0;
 await page.route('**/shops?cooldown-qa=1',route=>{requests++;return route.fulfill({status:requests===1?429:200,contentType:'application/json',headers:{'retry-after':'1','access-control-allow-origin':'*','access-control-expose-headers':'retry-after'},body:requests===1?'{"private":"must not be retained"}':'[]'});});
 await page.goto('http://127.0.0.1:5174/offline');
 const results=await page.evaluate(async()=>{
  const {default:api}=await import('/src/api/axios.js');window.cooldownQaApi=api;
  const results=[];for(let i=0;i<3;i++){try{await api.get('/shops?cooldown-qa=1');results.push('success');}catch(error){results.push({status:error.response?.status,code:error.code,data:error.response?.data});}}return results;
 });
 assert.equal(requests,1);assert.equal(results[0].status,429);
 assert.equal(results[1].code,'ERR_SERVER_READ_COOLDOWN');assert.equal(results[2].code,'ERR_SERVER_READ_COOLDOWN');assert.equal(results[1].data,null);
 await page.waitForTimeout(1100);
 const status=await page.evaluate(async()=>{const result=await window.cooldownQaApi.get('/shops?cooldown-qa=1');return result.status;});
 assert.equal(status,200);assert.equal(requests,2);
 console.log('PASS: actual Axios integration sends one GET for three attempts during Retry-After; synthetic429 retains no payload; GET resumes after expiry.');
 await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});

