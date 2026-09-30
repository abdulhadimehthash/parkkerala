import { chromium } from '@playwright/test';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--enable-webgl','--ignore-gpu-blocklist']});
const page=await browser.newPage({viewport:{width:1440,height:960},deviceScaleFactor:1});
page.on('pageerror',e=>console.log('PAGE ERROR',e.message));page.on('console',m=>{if(m.type()==='error')console.log('CONSOLE',m.text())});
await page.goto('http://localhost:3000');await page.waitForFunction(()=>window.__park?.state().ready,{timeout:60000});await page.waitForTimeout(1600);
await page.screenshot({path:'artifacts/welcome.png'});console.log(await page.evaluate(()=>window.__park.state()));
await page.getByRole('button',{name:'Enter Park Kerala'}).click();await page.waitForTimeout(1500);await page.screenshot({path:'artifacts/gameplay.png'});
console.log(await page.evaluate(()=>window.__park.state()));await browser.close();
