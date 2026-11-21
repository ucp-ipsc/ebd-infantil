const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const root=path.resolve(__dirname,'..');
const context={window:{}};
for(const name of ['planejamento','materiais'])vm.runInNewContext(fs.readFileSync(path.join(root,'dados',name+'.js'),'utf8'),context);
const plan=context.window.EBD_PLAN, materials=context.window.EBD_MATERIALS;
assert.equal(plan.lessons.length,52);assert.equal(plan.topics.length,12);
assert.equal(new Set(plan.lessons.map(l=>l.id)).size,52);
assert.equal(new Set(plan.lessons.map(l=>l.date)).size,52);
const dates=plan.lessons.map(l=>l.date).sort();
dates.forEach((date,i)=>{
  const d=new Date(date+'T12:00:00Z'); assert.equal(d.getUTCFullYear(),2027);assert.equal(d.getUTCDay(),0);
  if(i) assert.equal(d-new Date(dates[i-1]+'T12:00:00Z'),7*86400000);
});
assert.equal(dates[0],'2027-01-03');assert.equal(dates.at(-1),'2027-12-26');
for(const l of plan.lessons){assert.ok(l.title&&l.reference);assert.ok(plan.topics.some(t=>t.id===l.topic));}
assert.equal(new Set(materials.map(m=>m.id)).size,materials.length);
let total=0;
for(const m of materials){
  const file=path.resolve(root,m.path);assert.ok(file.startsWith(path.join(root,'atividades')+path.sep));
  assert.ok(m.lessons.length);for(const id of m.lessons)assert.ok(plan.lessons.some(l=>l.id===id));
  assert.ok(['same-story','theme'].includes(m.match));
  assert.match(m.sha256,/^[a-f0-9]{64}$/);assert.ok(m.bytes>0&&m.bytes<100*1024*1024);
  total+=m.bytes;
  if(!fs.existsSync(file))continue; // Public checkout stores only the catalogue. PDFs live in the private archive.
  const bytes=fs.readFileSync(file);
  assert.ok(bytes.length<100*1024*1024,'Arquivo excede 100 MiB: '+m.path);
  assert.equal(bytes.length,m.bytes);assert.equal(bytes.subarray(0,5).toString(),'%PDF-');
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'),m.sha256);
}
const linked=new Set(materials.flatMap(m=>m.lessons));
console.log(`OK: 52 domingos consecutivos, 12 trilhas, ${materials.length} recursos catalogados (${(total/1024/1024).toFixed(1)} MiB). PDFs locais, quando presentes, foram verificados.`);
console.log(`${linked.size} aulas com sugestões de materiais; ${52-linked.size} aulas com materiais a preparar.`);
console.log('Integridade, referências, caminhos e limites de arquivo verificados.');
