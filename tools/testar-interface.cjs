const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const path=require('node:path');const fs=require('node:fs');const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
(async()=>{
const server=spawn(process.execPath,[path.join(root,'tools/servidor.cjs')],{env:{...process.env,PORT:'0'}});
const url=await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{const match=String(d).match(/http:\/\/127\.0\.0\.1:\d+/);if(match)resolve(match[0]);});server.once('error',reject);});
let browser;
try{
browser=await chromium.launch({channel:'chrome',headless:true});const p=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];p.on('pageerror',e=>errors.push(e.message));
let plan=JSON.parse(fs.readFileSync(path.join(root,'dados/planejamento.js'),'utf8').replace(/^window\.EBD_PLAN\s*=\s*/,'').replace(/;\s*$/,''));let sha='a'.repeat(40),writes=0;
await p.route('**/dados/acesso.js',r=>r.fulfill({contentType:'text/javascript',body:'window.EBD_ACCESS={api:"https://test-access.workers.dev"};'}));
await p.route('https://test-access.workers.dev/**',async route=>{
const r=route.request(),pathname=new URL(r.url()).pathname;
const headers={'Access-Control-Allow-Origin':url,'Access-Control-Allow-Headers':'Authorization, Content-Type','Access-Control-Allow-Methods':'GET, POST, OPTIONS'};
const respond=(data,status=200)=>route.fulfill({status,headers,contentType:'application/json',body:JSON.stringify(data)});
if(r.method()==='OPTIONS')return route.fulfill({status:204,headers});
if(pathname==='/login'){const body=r.postDataJSON();if(body.password!=='test-only')return respond({error:'Login ou senha incorretos.'},401);return respond({token:body.user==='leader'?'leader-token':'reader-token',role:body.user==='leader'?'coordinator':'materials',user:body.user,expiresAt:Date.now()+1800000});}
if(pathname==='/materials'&&r.method()==='POST'){const input=r.postDataJSON();assert.equal(input.lesson,'aula-01');assert.equal(input.title,'PDF da aula');return respond({material:{id:'recurso-test',title:input.title,path:'atividades/envios/test.pdf',format:'PDF',age:'Adaptar à turma',kind:'Material enviado',sourceYear:'2026',source:'Liderança',lessons:[input.lesson],match:'same-story',context:'',bytes:20,sha256:'0'.repeat(64)}});}
if(pathname.startsWith('/materials/'))return route.fulfill({status:200,headers,contentType:'application/pdf',body:'%PDF-test'});
if(r.headers().authorization!=='Bearer leader-token')return respond({error:'Somente a liderança pode alterar o planejamento.'},403);
if(r.method()==='GET')return respond({plan,sha});
const input=r.postDataJSON();if(input.sha!==sha)return respond({error:'Outra pessoa atualizou o planejamento.'},409);
plan=input.plan;sha='b'.repeat(40);writes++;return respond({sha,commit:'c'.repeat(40),actionsUrl:'https://github.com/ucp-ipsc/ebd-infantil/actions'});
});
await p.goto(url);assert.equal(await p.locator('.lesson-hex').count(),52);assert.equal(await p.locator('.story-label:visible').count(),52);
await p.locator('#open-editor').click();assert.equal(await p.locator('#editor-dialog').isVisible(),false);
await p.locator('#login-user').fill('reader');await p.locator('#login-password').fill('test-only');await p.locator('#login-submit').click();await p.waitForFunction(()=>document.querySelector('#login-status').textContent.includes('Para editar'));assert.equal(await p.locator('#editor-dialog').isVisible(),false);
await p.locator('#login-user').fill('leader');await p.locator('#login-password').fill('wrong');await p.locator('#login-submit').click();await p.waitForFunction(()=>document.querySelector('#login-status').textContent.includes('incorretos'));
await p.locator('#login-password').fill('test-only');await p.locator('#login-submit').click();await p.locator('#editor-dialog').waitFor();
await p.locator('#editor-lesson').selectOption('aula-01');await p.locator('#upload-name').fill('PDF da aula');await p.locator('#upload-file').setInputFiles({name:'atividade.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n%%EOF')});p.once('dialog',d=>d.accept());await p.locator('#upload-submit').click();await p.waitForFunction(()=>document.querySelector('#upload-status').textContent.includes('PDF enviado'));assert.match(await p.locator('#material-count').innerText(),/58/);await p.locator('#edit-date').selectOption('aula-02');await p.locator('#edit-title').fill('Criação: revisão');await p.locator('#publish-plan').click();assert.match(await p.locator('#publish-status').innerText(),/Salve primeiro/);
await p.locator('#edit-form button[type=submit]').click();p.once('dialog',d=>d.accept());await p.locator('#publish-plan').click();await p.waitForFunction(()=>document.querySelector('#publish-status').textContent.includes('Alterações enviadas'));assert.equal(writes,1);assert.equal(plan.lessons[0].date,'2027-01-10');
await p.locator('#edit-title').fill('Nova revisão');await p.locator('#edit-form button[type=submit]').click();sha='d'.repeat(40);p.once('dialog',d=>d.accept());await p.locator('#publish-plan').click();await p.waitForFunction(()=>document.querySelector('#publish-status').textContent.includes('Outra pessoa'));assert.equal(writes,1);
await p.keyboard.press('Escape');await p.locator('#logout-access').click();await p.locator('#open-editor').click();assert.equal(await p.locator('#login-dialog').isVisible(),true);await p.keyboard.press('Escape');
await p.locator('[data-lesson="aula-01"]').first().click();assert.equal(await p.locator('.resource-link[href]').count(),0);await p.locator('[data-resource]').first().click();await p.locator('#login-user').fill('reader');await p.locator('#login-password').fill('test-only');const download=p.waitForEvent('download');await p.locator('#login-submit').click();await download;
assert.deepEqual(errors,[]);await p.keyboard.press('Escape');await p.locator('#logout-access').click();await p.setViewportSize({width:390,height:844});await p.locator('#open-editor').click();assert.equal(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await p.screenshot({path:path.join(root,'../tmp/login-mobile.png')});
console.log('OK: acesso público, login, senha incorreta, papéis separados, download, edição, publicação, conflito, logout e celular.');
}finally{if(browser)await browser.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
