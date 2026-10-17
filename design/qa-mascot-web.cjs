// Disposable browser contexts and synthetic API failures; no production account.
const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
const path=require('node:path');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({reducedMotion:'reduce'});
 const page=await context.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 const output=path.join(__dirname,'implementation-validation');
 for(const theme of ['light','dark'])for(const width of [1440,390])for(const [route,state,title]of[['/offline','offline','You’re offline.'],['/service-unavailable','service_unavailable','We’ll be back shortly.'],['/missing-qa-page','not_found','This page has moved.']]){
  await page.setViewportSize({width,height:900});
  await page.goto('http://127.0.0.1:5174'+route);
  await page.evaluate(theme=>{localStorage.removeItem('token');localStorage.removeItem('user');localStorage.setItem('printlly.appearance',theme);},theme);
  await page.reload();await page.getByRole('heading',{name:title,exact:true}).waitFor();
  await page.evaluate(()=>document.fonts.ready);
  const image=page.locator('.mascot-recovery-art img');await image.evaluate(img=>img.decode());
  assert.equal(await image.evaluate(img=>img.naturalWidth>0),true);
  const box=await image.boundingBox();assert.equal(box.width,width===1440?144:96);assert.equal(box.height,width===1440?144:96);
  assert.equal(await image.getAttribute('alt'),'');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
  await page.screenshot({path:path.join(output,`web-mascot-${state}-${theme}-${width}.png`),fullPage:true});
 }
 // Failed recovery remains on the affected page; only a successful GET permits home.
 let successful=false,reads=0;
 await page.route('**/shops',async route=>{reads++;await route.fulfill({status:successful?200:503,contentType:'application/json',body:successful?'[]':'{"message":"Synthetic outage"}'});});
 await page.goto('http://127.0.0.1:5174/service-unavailable');
 await page.getByRole('button',{name:'Try again',exact:true}).click();
 await page.getByRole('button',{name:'Try again',exact:true}).waitFor();
 assert.equal(new URL(page.url()).pathname,'/service-unavailable');assert.equal(reads,1);
 successful=true;await page.getByRole('button',{name:'Try again',exact:true}).click();
 await page.waitForURL('http://127.0.0.1:5174/');assert.equal(reads,2);
 const partner=await browser.newContext({reducedMotion:'reduce'});
 await partner.addInitScript(()=>{localStorage.setItem('token','synthetic-owner');localStorage.setItem('user',JSON.stringify({id:'synthetic-owner',role:'shop_owner',name:'QA Partner'}));});
 const partnerPage=await partner.newPage();partnerPage.on('pageerror',error=>errors.push(error.message));
 let status=404;
 await partnerPage.route('**/shops/me',route=>route.fulfill({status,contentType:'application/json',body:JSON.stringify({message:'Synthetic request state'})}));
 await partnerPage.goto('http://127.0.0.1:5174/app');await partnerPage.waitForURL('**/register-shop');
 status=503;await partnerPage.goto('http://127.0.0.1:5174/dashboard');await partnerPage.getByRole('heading',{name:'We’ll be back shortly.',exact:true}).waitFor();
 await partnerPage.getByRole('button',{name:'Try again',exact:true}).click();await partnerPage.getByRole('heading',{name:'We’ll be back shortly.',exact:true}).waitFor();assert.equal(new URL(partnerPage.url()).pathname,'/dashboard');
 status=401;await partnerPage.getByRole('button',{name:'Try again',exact:true}).click();await partnerPage.getByRole('heading',{name:'Your session has ended.',exact:true}).waitFor();
 await partnerPage.getByRole('button',{name:'Sign in again',exact:true}).click();await partnerPage.waitForURL('**/auth/vendor');
 assert.equal(await partnerPage.evaluate(()=>localStorage.getItem('token')),null);
 assert.deepEqual(errors,[]);
 console.log('PASS: 12 light/dark 1440/390 layouts, correct individual art dimensions, no overflow; real read retry failure stays/success returns home; shop404 goes registration, 503 stays dashboard, authenticated401 sign-in recovery clears expired session.');
 await browser.close();
})().catch(error=>{console.error(error);process.exitCode=1;});
