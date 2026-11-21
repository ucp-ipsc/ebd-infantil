import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pbkdf2Sync,randomBytes,createHmac} from 'node:crypto';
import worker,{validatePlan} from './worker.mjs';
const origin='https://ucp-ipsc.github.io';
const original=JSON.parse(readFileSync(new URL('../dados/planejamento.js',import.meta.url),'utf8').replace(/^window\.EBD_PLAN\s*=\s*/,'').replace(/;\s*$/,''));
const hash=p=>{const salt=randomBytes(16);return salt.toString('base64')+':'+pbkdf2Sync(p,salt,100000,32,'sha256').toString('base64');};
const env={ALLOWED_ORIGIN:origin,GITHUB_TOKEN:'test-only-token',SESSION_SECRET:randomBytes(32).toString('hex'),MATERIAL_USER:'reader',COORD_USER:'editor',MATERIAL_PASSWORD_HASH:hash('reader-test-only'),COORD_PASSWORD_HASH:hash('editor-test-only'),MATERIAL_REPO:'ucp-ipsc/ebd-infantil-arquivo',MATERIAL_CATALOG:{'recurso-001':{path:'atividades/test.pdf'}},LOGIN_LIMITER:{limit:async()=>({success:true})},ACCESS_LIMITER:{limit:async()=>({success:true})}};
const call=(route,{method='GET',token,body,headers={}}={},bindings=env)=>worker.fetch(new Request('https://unit-test.invalid'+route,{method,headers:{Origin:origin,...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{}),...headers},...(body?{body:JSON.stringify(body)}:{})}),bindings);
async function login(user='editor',password='editor-test-only'){const result=await call('/login',{method:'POST',body:{user,password}});assert.equal(result.status,200);return result.json();}

test('authorization, credential validation, and server-side permissions',async()=>{
 let calls=0;const previous=globalThis.fetch;globalThis.fetch=async()=>{calls++;throw Error('Unexpected GitHub request');};
 try{
  assert.equal((await call('/plan')).status,401);
  assert.equal((await call('/materials/recurso-001')).status,401);
  assert.equal((await call('/login',{method:'POST',body:{user:'reader',password:'wrong'}})).status,401);
  assert.equal((await call('/login',{method:'POST',body:{user:'unknown',password:'reader-test-only'}})).status,401);
  assert.equal((await call('/login',{method:'POST',body:{user:'reader',password:'reader-test-only'},headers:{Origin:'https://attacker.invalid'}})).status,403);
  assert.equal((await call('/login',{method:'POST',body:{user:'reader',password:'reader-test-only'}},{...env,LOGIN_LIMITER:{limit:async()=>({success:false})}})).status,429);
  const reader=await login('reader','reader-test-only');assert.equal(reader.role,'materials');
  assert.equal((await call('/plan',{method:'POST',token:reader.token,body:{plan:original,sha:'a'.repeat(40)}})).status,403);
  assert.equal((await call('/plan',{token:reader.token})).status,403);
  const coordinator=await login();assert.equal(coordinator.role,'coordinator');
  assert.equal((await call('/plan',{token:coordinator.token+'a'})).status,401);
  const expiredPayload=Buffer.from(JSON.stringify({user:'editor',role:'coordinator',exp:1})).toString('base64url');
  const signature=createHmac('sha256',env.SESSION_SECRET).update(expiredPayload).digest('base64');
  assert.equal((await call('/plan',{token:expiredPayload+'.'+signature})).status,401);
  assert.equal((await call('/materials/invalid',{token:reader.token})).status,404);
  assert.equal(calls,0,'unauthorized requests must never reach GitHub');
 }finally{globalThis.fetch=previous;}
});

test('private materials are streamed without exposing credentials or upstream URLs',async()=>{
 const reader=await login('reader','reader-test-only');const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{if(url.includes('dados/materiais.js'))return Response.json({encoding:'base64',sha:'a'.repeat(40),content:Buffer.from('window.EBD_MATERIALS = '+JSON.stringify([{id:'recurso-001',path:'atividades/test.pdf'}])+';').toString('base64')});assert.match(url,/repos\/ucp-ipsc\/ebd-infantil-arquivo\/contents\/atividades\/test.pdf/);assert.equal(options.headers.Authorization,'Bearer test-only-token');return new Response('%PDF-test',{headers:{Location:'https://private-upstream.invalid'}});};
 try{const result=await call('/materials/recurso-001',{token:reader.token});assert.equal(result.status,200);assert.equal(result.headers.get('Cache-Control'),'no-store, private');assert.equal(result.headers.get('Location'),null);assert.equal(await result.text(),'%PDF-test');}finally{globalThis.fetch=previous;}
});

test('coordinator publishes only the calendar and rejects stale revisions and invalid data',async()=>{
 const user=await login();let writes=0;const previous=globalThis.fetch;
 globalThis.fetch=async(url,options)=>{
  assert.ok(url.startsWith('https://api.github.com/repos/ucp-ipsc/ebd-infantil/contents/dados/planejamento.js'));
  if(options.method==='PUT'){
   writes++;const input=JSON.parse(options.body);assert.equal(input.sha,'a'.repeat(40));assert.equal(input.branch,'main');
   const text=Buffer.from(input.content,'base64').toString('utf8');assert.match(text,/Título revisado/);assert.ok(!text.includes('reader-test-only'));
   return Response.json({content:{sha:'b'.repeat(40)},commit:{sha:'c'.repeat(40)}});
  }
  return Response.json({encoding:'base64',sha:'a'.repeat(40),content:Buffer.from('window.EBD_PLAN = '+JSON.stringify(original)+';\n').toString('base64')});
 };
 try{
  const fetched=await call('/plan',{token:user.token});assert.equal(fetched.status,200);assert.equal((await fetched.json()).plan.lessons.length,52);
  const revised=structuredClone(original);revised.lessons[0].title='Título revisado';
  assert.equal((await call('/plan',{method:'POST',token:user.token,body:{plan:revised,sha:'d'.repeat(40)}})).status,409);assert.equal(writes,0);
  const invalid=structuredClone(revised);invalid.lessons[1].date=invalid.lessons[0].date;
  assert.equal((await call('/plan',{method:'POST',token:user.token,body:{plan:invalid,sha:'a'.repeat(40)}})).status,400);assert.equal(writes,0);
  const result=await call('/plan',{method:'POST',token:user.token,body:{plan:revised,sha:'a'.repeat(40)}});assert.equal(result.status,200);assert.equal((await result.json()).sha,'b'.repeat(40));assert.equal(writes,1);
 }finally{globalThis.fetch=previous;}
});

test('validates and strips unexpected fields from the published document',()=>{
 const value=structuredClone(original);value.token='do not publish';value.lessons[0].unknown='do not publish';
 const clean=validatePlan(value);assert.equal(clean.token,undefined);assert.equal(clean.lessons[0].unknown,undefined);
 const bad=structuredClone(original);bad.topics[0].color='red; background:url(evil)';assert.throws(()=>validatePlan(bad));
});


test('PDF upload is restricted, validated, and committed to private storage before the catalogue',async()=>{
 const reader=await login('reader','reader-test-only'),leader=await login();
 const previous=globalThis.fetch;const writes=[];
 globalThis.fetch=async(url,options)=>{
  if(options.method==='PUT'){writes.push({url,body:JSON.parse(options.body)});return Response.json({commit:{sha:'c'.repeat(40)}});}
  assert.ok(url.includes('dados/materiais.js'));return Response.json({encoding:'base64',sha:'a'.repeat(40),content:Buffer.from('window.EBD_MATERIALS = [];').toString('base64')});
 };
 try{
  const input={title:'Atividade nova',lesson:'aula-03',content:Buffer.from('%PDF-1.4\nExemplo\n%%EOF').toString('base64')};
  assert.equal((await call('/materials',{method:'POST',token:reader.token,body:input})).status,403);
  assert.equal((await call('/materials',{method:'POST',token:leader.token,body:{...input,lesson:'../evil'}})).status,400);
  assert.equal((await call('/materials',{method:'POST',token:leader.token,body:{...input,content:Buffer.from('not pdf!!').toString('base64')}})).status,400);
  assert.equal(writes.length,0);
  const result=await call('/materials',{method:'POST',token:leader.token,body:input});assert.equal(result.status,200);
  const data=await result.json();assert.deepEqual(data.material.lessons,['aula-03']);assert.equal(data.material.title,'Atividade nova');assert.match(data.material.sha256,/^[a-f0-9]{64}$/);
  assert.equal(writes.length,2);assert.ok(writes[0].url.includes('/ebd-infantil-arquivo/contents/atividades/envios/aula-03/'));assert.ok(writes[1].url.includes('/ebd-infantil/contents/dados/materiais.js'));assert.equal(writes[1].body.sha,'a'.repeat(40));
  const catalogue=Buffer.from(writes[1].body.content,'base64').toString('utf8');assert.ok(catalogue.includes(data.material.id));assert.ok(!catalogue.includes(input.content));
 }finally{globalThis.fetch=previous;}
});
