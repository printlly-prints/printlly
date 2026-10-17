const { chromium } = require('C:/Users/HP/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs/promises');
const out = path.resolve(__dirname, '../../design/implementation-validation/mascot-android');
const shop = {_id:'qa-shop',shop_name:'Paper Street Print',address:'Clock Tower',shop_status:'open',is_currently_open:true,queue:{rush_level:'low',active_orders_count:1}};
const closed = {...shop,_id:'qa-shop-closed',shop_name:'Campus Copy',shop_status:'closed',is_currently_open:false};
const order = {_id:'qa-cancelled',shop_id:shop,status:'cancelled',payment_status:'paid',documents:[],total_amount:7,platform_fee:3,base_subtotal:4,createdAt:'2026-10-17T08:00:00Z'};
(async()=>{
 await fs.mkdir(out,{recursive:true});
 const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const errors=[], captures=[];
 for(const theme of ['light','dark']) {
  const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
  await context.addInitScript(theme=>{localStorage.setItem('token','local-mascot-qa');localStorage.setItem('user',JSON.stringify({id:'qa-customer',name:'QA Customer',phone:'9999999999',role:'customer'}));localStorage.setItem('printlly:appearance',theme);localStorage.setItem('printlly:opening:enabled','false');},theme);
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  let mode='normal';let uploads=0;
  await page.route('**/127.0.0.1:8083/**',async route=>{
   const url=new URL(route.request().url()),endpoint=url.pathname;
   const json=(status,body)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body),headers:{'Access-Control-Allow-Origin':'*'}});
   if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'}});
   if(endpoint==='/orders/customer') {
    if(mode==='session') return json(401,{message:'Expired token'});
    if(mode==='offline') return route.abort('internetdisconnected');
    if(mode==='service') return json(503,{message:'Unavailable'});
    return json(200,mode==='missing'?[]:[order]);
   }
   if(endpoint==='/shops') {
    if(mode==='offline') return route.abort('internetdisconnected');
    if(mode==='service') return json(503,{message:'Unavailable'});
    return json(200,url.searchParams.get('search')?[ ]:[shop,closed]);
   }
   if(endpoint==='/shops/qa-shop-closed') return json(200,{...closed,pricing:{services:[]}});
   if(endpoint==='/upload') {uploads++;return uploads===1?json(200,{succeeded:[{upload_id:'mascot-success',original_name:'Good.pdf',page_count:1}],failed:[]}):json(503,{message:'Please try this file again.'});}
   if(endpoint==='/auth/profile') return json(200,{user:{id:'qa-customer',name:'QA Customer',role:'customer'}});
   if(endpoint.includes('saved')) return json(200,[]);
   if(endpoint.includes('notifications')) return json(200,[]);
   if(endpoint.includes('unread')) return json(200,{count:0});
   return json(200,[]);
  });
  const load=async()=>{console.log('LOAD',theme,mode);await page.goto('http://localhost:8082',{waitUntil:'domcontentloaded',timeout:120000});await page.getByText(mode==='offline'?'You’re offline.':mode==='service'?'We’ll be back shortly.':'What will you\nprint today?',{exact:true}).first().waitFor({timeout:120000});await page.locator('[aria-label="Printlly"]').waitFor({state:'detached',timeout:30000});};
  const shot=async name=>{console.log('CAPTURE',theme,name);await page.locator('[aria-label="Printlly"]').waitFor({state:'detached',timeout:30000});await page.evaluate(async()=>{await document.fonts.ready;await Promise.all([...document.images].map(img=>img.complete?Promise.resolve():new Promise(resolve=>{img.addEventListener('load',resolve,{once:true});img.addEventListener('error',resolve,{once:true});})));});await page.waitForTimeout(500);assert.equal(await page.locator('img').evaluateAll(images=>images.every(img=>img.complete&&img.naturalWidth>0)),true,'Every mounted static image must load before capture');assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);await page.screenshot({path:path.join(out,`${name}-${theme}.png`),fullPage:true});captures.push(`${name}-${theme}.png`);};
  mode='offline';await load();await page.getByText('You’re offline.',{exact:true}).first().waitFor();await shot('offline');
  // Failed retry remains on the same recovery; successful retry restores actual data.
  await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('You’re offline.',{exact:true}).first().waitFor();
  mode='normal';await page.getByRole('button',{name:'Try again',exact:true}).click();await page.getByText('Paper Street Print',{exact:true}).first().waitFor();assert.equal(await page.getByRole('button',{name:'Try again',exact:true}).count(),0);
  mode='service';await load();await page.getByText('We’ll be back shortly.',{exact:true}).first().waitFor();await shot('service');
  mode='normal';await load();await page.getByText('Campus Copy',{exact:true}).click();await page.getByText('This shop is closed.',{exact:true}).waitFor();await shot('shop-unavailable');await page.getByRole('button',{name:'Find another shop',exact:true}).click();
  await page.getByRole('textbox',{name:'Search shops by name or area'}).fill('nothingmatches');await page.getByText('No matching shops.',{exact:true}).waitFor();await shot('no-matching-shops');
  await load();await page.getByText('Paper Street Print',{exact:true}).last().click();await page.getByText('This order was cancelled.',{exact:true}).first().waitFor();await shot('cancelled');
  await load();mode='missing';await page.getByText('Paper Street Print',{exact:true}).last().click();await page.getByText('This page has moved.',{exact:true}).waitFor();await shot('not-found');mode='normal';
  await load();await page.getByRole('button',{name:'Add files',exact:true}).click();const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await chooser).setFiles([{name:'Good.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')},{name:'Retry.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')}]);
  await page.getByText('Some files need another try.',{exact:true}).waitFor();await shot('partial-upload');assert.equal(await page.getByText(/1 page · uploaded/).count(),1);await page.getByRole('button',{name:'Retry failed files',exact:true}).click();await page.getByText('Some files need another try.',{exact:true}).waitFor();assert.equal(uploads,3);assert.equal(await page.getByText(/1 page · uploaded/).count(),1);
  await load();await page.getByRole('button',{name:'Add files',exact:true}).click();const badChooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Choose files',exact:true}).click();await(await badChooser).setFiles({name:'Unsupported.txt',mimeType:'text/plain',buffer:Buffer.from('Unsupported file')});await page.getByText('Let’s try those files again.',{exact:true}).waitFor();await shot('unsupported-file');assert.equal(uploads,3);
  mode='session';await page.goto('http://localhost:8082',{waitUntil:'domcontentloaded',timeout:120000});await page.getByText('Your session has ended.',{exact:true}).waitFor();await shot('session-expired');await page.getByRole('button',{name:'Sign in again',exact:true}).click();await page.getByRole('textbox',{name:'Phone number',exact:true}).waitFor();
  await context.close();
 }
 assert.deepEqual(errors,[]);await fs.writeFile(path.join(out,'qa-results.json'),JSON.stringify({surface:'Actual Expo web app; synthetic intercepted existing APIs',captures,applicationErrors:errors,partialUploadRequestsPerTheme:3,verified:['failed retry remains recoverable','successful retry restores data','only failed file is retried','unsupported file rejected before upload','missing confirmed resource routes to NotFound','expired session returns to authentication'],nativeDeviceEvidence:false},null,2));await browser.close();console.log('PASS: 18 actual Expo web screen captures, read-retry stays on failure and restores on success, partial-upload retries failed files only, expired-session returns to auth. Browser evidence, not Android platform QA.');
})().catch(error=>{console.error(error);process.exit(1)});
