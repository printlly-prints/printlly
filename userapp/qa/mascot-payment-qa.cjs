const {chromium}=require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const out=path.resolve(__dirname,'../../design/implementation-validation/mascot');fs.mkdirSync(out,{recursive:true});
 const results=[];
 for(const theme of ['light','dark']){
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(theme=>{localStorage.setItem('token','local-mascot-qa');localStorage.setItem('user',JSON.stringify({id:'qa-customer',name:'QA Customer',phone:'9999999999',role:'customer'}));localStorage.setItem('printlly:appearance',theme);localStorage.setItem('printlly:opening:enabled','false');},theme);
  const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  let state='created',reads=0,charges=0;
  const order={_id:'qa-mascot-unpaid',shop_id:{_id:'qa-shop',shop_name:'Paper Street Print',address:'Clock Tower, Dehradun'},status:'pending',otp:null,total_amount:7,base_subtotal:4,platform_fee:3,documents:[{original_name:'QA-notes.pdf',page_count:2}],createdAt:new Date().toISOString()};
  await page.route('**/orders/customer',route=>{reads++;return route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify([{...order,payment_status:state}])});});
  await page.route('**/payments/razorpay/create-order',route=>{charges++;return route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'QA provider unavailable'})});});
  await page.goto('http://localhost:8082');
  await page.getByRole('tab',{name:/Orders/}).click({timeout:90000});
  await page.getByText('Check payment',{exact:true}).click();
  await page.getByText('Still confirming payment.',{exact:true}).waitFor();
  await page.screenshot({path:path.join(out,`android-payment-uncertain-${theme}.png`),fullPage:true});
  assert.equal(charges,0,'Checking status must not create a checkout');
  state='failed';await page.getByText('Check status',{exact:true}).click();
  await page.getByText(/Payment didn.t complete\./).waitFor();
  await page.screenshot({path:path.join(out,`android-payment-failed-${theme}.png`),fullPage:true});
  assert.equal(charges,0);assert.equal(await page.getByText('012345',{exact:true}).count(),0);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);assert.deepEqual(errors,[]);
  results.push({theme,reads,charges,screens:['payment_uncertain','payment_failed'],runtimeErrors:errors});await context.close();
 }
 await browser.close();fs.writeFileSync(path.join(out,'payment-qa-results.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results));
})().catch(e=>{console.error(e);process.exitCode=1;});

