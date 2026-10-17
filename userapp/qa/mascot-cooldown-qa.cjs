const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 await context.addInitScript(()=>{localStorage.setItem('token','local-mascot-cooldown');localStorage.setItem('user',JSON.stringify({id:'qa-cooldown',name:'QA',role:'customer'}));localStorage.setItem('printlly:opening:enabled','false');});
 const page=await context.newPage();let shops=0,blocked=true;
 await page.route('**/127.0.0.1:8083/**',route=>{
  const url=new URL(route.request().url());
  const headers={'access-control-allow-origin':'*','access-control-expose-headers':'Retry-After','access-control-allow-headers':'Authorization,Content-Type','access-control-allow-methods':'GET,POST,OPTIONS'};
  if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers});
  if(url.pathname==='/shops') {shops++;return route.fulfill({status:blocked?429:200,headers:{...headers,'retry-after':'30'},contentType:'application/json',body:JSON.stringify(blocked?{message:'Rate limited'}:[{_id:'qa-shop',shop_name:'Paper Street Print',shop_status:'open',is_currently_open:true}])});}
  return route.fulfill({status:200,headers,contentType:'application/json',body:JSON.stringify([])});
 });
 await page.goto('http://localhost:8082',{waitUntil:'domcontentloaded',timeout:120000});await page.getByText('Let’s give it a moment.',{exact:true}).last().waitFor({timeout:120000});await page.locator('[aria-label="Printlly"]').waitFor({state:'detached'});
 const beforeFocus = shops;assert.ok(beforeFocus >= 1);await page.getByRole('tab',{name:'Shops',exact:true}).click();await page.getByText('Let’s give it a moment.',{exact:true}).last().waitFor();assert.equal(shops,beforeFocus,'Navigation/focus read must not bypass Retry-After');
 assert.equal(await page.getByRole('button',{name:/Try again in/}).isDisabled(),true);
 await page.clock.install();blocked=false;await page.clock.fastForward(31000);await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('Paper Street Print',{exact:true}).waitFor();assert.ok(shops>=2);await browser.close();console.log('PASS: actual Axios GET cooldown blocks focus/navigation request before deadline and permits retry after expiry. Synthetic API only.');
})().catch(e=>{console.error(e);process.exit(1)});
