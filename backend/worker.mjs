const encoder = new TextEncoder();
const decode = new TextDecoder();
const SITE_REPO = 'ucp-ipsc/ebd-infantil';
const PLAN_PATH = 'dados/planejamento.js';
const TTL = 1800;
const b64 = bytes => {let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text);};
const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
const url64 = value => b64(encoder.encode(value)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const unurl64 = value => decode.decode(bytes(value.replace(/-/g,'+').replace(/_/g,'/')));
class ApiError extends Error { constructor(status,message){super(message);this.status=status;} }
const fail = (status,message) => { throw new ApiError(status,message); };

export function validatePlan(plan) {
  if (!plan || plan.version!==1 || plan.year!==2027 || !Array.isArray(plan.lessons) || plan.lessons.length!==52 || !Array.isArray(plan.topics) || plan.topics.length!==12) fail(400,'Planejamento inválido. São necessárias 52 aulas e 12 trilhas de 2027.');
  const text=(s,max)=>typeof s==='string' && s.trim().length>0 && s.length<=max;
  const icons=['sprout','sun','heart','book','rainbow','star','stars','leaf','crown','flame','compass','sparkles'];
  const topicIds=new Set();
  const topics=plan.topics.map(t=>{
    if(!t || !Number.isInteger(t.id)||t.id<1||t.id>12||topicIds.has(t.id)||!text(t.title,180)||!/^#[a-f\d]{6}$/i.test(t.color)||!icons.includes(t.icon)) fail(400,'Trilha inválida.');
    topicIds.add(t.id);return {id:t.id,title:t.title.trim(),color:t.color,icon:t.icon};
  });
  const validDates=new Set(Array.from({length:52},(_,i)=>new Date(Date.UTC(2027,0,3+i*7)).toISOString().slice(0,10)));
  const ids=new Set(),dates=new Set();
  const lessons=plan.lessons.map(l=>{
    if(!l||!/^aula-(0[1-9]|[1-4]\d|5[0-2])$/.test(l.id)||ids.has(l.id)||!validDates.has(l.date)||dates.has(l.date)||!topicIds.has(l.topic)||!text(l.title,180)||!text(l.reference,120)||typeof l.notes!=='string'||l.notes.length>2000||typeof l.special!=='string'||l.special.length>120) fail(400,'Aula inválida, data repetida ou domingo ausente.');
    ids.add(l.id);dates.add(l.date);return {id:l.id,date:l.date,title:l.title.trim(),reference:l.reference.trim(),topic:l.topic,notes:l.notes,special:l.special};
  });
  return {version:1,year:2027,title:'A Grande História da Bíblia',topics,lessons};
}

async function passwordMatches(password,record) {
  const [salt,expected]=record.split(':');
  const key=await crypto.subtle.importKey('raw',encoder.encode(password),'PBKDF2',false,['deriveBits']);
  const derived=new Uint8Array(await crypto.subtle.deriveBits({name:'PBKDF2',salt:bytes(salt),iterations:100000,hash:'SHA-256'},key,256));
  const target=bytes(expected);let mismatch=derived.length^target.length;
  for(let i=0;i<derived.length;i++) mismatch|=derived[i]^(target[i]||0);
  return mismatch===0;
}
async function sessionKey(env){return crypto.subtle.importKey('raw',encoder.encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign','verify']);}
async function createSession(user,role,env) {
  const exp=Math.floor(Date.now()/1000)+TTL;
  const payload=url64(JSON.stringify({user,role,exp,nonce:crypto.randomUUID()}));
  const sig=b64(new Uint8Array(await crypto.subtle.sign('HMAC',await sessionKey(env),encoder.encode(payload))));
  return {token:payload+'.'+sig,role,user,expiresAt:exp*1000};
}
async function session(request,env) {
  try {
    const auth=request.headers.get('Authorization')||'';
    if(!auth.startsWith('Bearer ')||auth.length>2000) throw Error();
    const parts=auth.slice(7).split('.');if(parts.length!==2)throw Error();
    if(!await crypto.subtle.verify('HMAC',await sessionKey(env),bytes(parts[1]),encoder.encode(parts[0])))throw Error();
    const data=JSON.parse(unurl64(parts[0]));
    if(!Number.isInteger(data.exp)||data.exp<=Math.floor(Date.now()/1000)||!['materials','coordinator'].includes(data.role))throw Error();
    if(data.user!==(data.role==='coordinator'?env.COORD_USER:env.MATERIAL_USER))throw Error();
    return data;
  } catch {fail(401,'Sua sessão expirou. Entre novamente.');}
}
async function body(request,max=180000) {
  if(!request.headers.get('Content-Type')?.startsWith('application/json'))fail(415,'Envie dados JSON.');
  if(Number(request.headers.get('Content-Length'))>max)fail(413,'Arquivo muito grande.');
  const reader=request.body?.getReader();if(!reader)fail(400,'Dados ausentes.');
  let count=0,parts=[];
  while(true){const {done,value}=await reader.read();if(done)break;count+=value.byteLength;if(count>max){await reader.cancel();fail(413,'Arquivo muito grande.');}parts.push(value);}
  try {return JSON.parse(await new Blob(parts).text());}catch{fail(400,'Dados JSON inválidos.');}
}
async function github(env,path,options={}) {
  const result=await fetch('https://api.github.com/repos/'+path,{...options,headers:{'Authorization':'Bearer '+env.GITHUB_TOKEN,'User-Agent':'IPSC-EBD-Coordination','Accept':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...options.headers},redirect:'error'});
  if(result.status===409||result.status===422)fail(409,'O planejamento mudou. Carregue a versão atual antes de publicar novamente.');
  if(!result.ok)fail(502,'Não foi possível acessar o repositório. Tente novamente ou avise o responsável.');
  return result;
}
async function currentPlan(env){
  const result=await (await github(env,SITE_REPO+'/contents/'+PLAN_PATH+'?ref=main')).json();
  if(result.encoding!=='base64'||!result.sha)fail(502,'Formato de planejamento inesperado.');
  const source=decode.decode(bytes(result.content.replace(/\s/g,'')));
  const match=source.match(/^\s*window\.EBD_PLAN\s*=\s*([\s\S]*?);?\s*$/);
  if(!match)fail(502,'Planejamento do repositório inválido.');
  let plan;try{plan=JSON.parse(match[1]);}catch{fail(502,'Planejamento do repositório inválido.');}
  return {plan:validatePlan(plan),sha:result.sha};
}
export default {
 async fetch(request,env) {
  const origin=request.headers.get('Origin');
  const headers={'Cache-Control':'no-store, private','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Vary':'Origin'};
  if(origin===env.ALLOWED_ORIGIN){headers['Access-Control-Allow-Origin']=origin;headers['Access-Control-Allow-Methods']='GET, POST, OPTIONS';headers['Access-Control-Allow-Headers']='Authorization, Content-Type';}
  const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{...headers,'Content-Type':'application/json; charset=utf-8'}});
  try {
   if(origin!==env.ALLOWED_ORIGIN)fail(403,'Origem não autorizada.');
   if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
   if(!env.GITHUB_TOKEN||!env.SESSION_SECRET||!env.MATERIAL_PASSWORD_HASH||!env.COORD_PASSWORD_HASH||!env.COORD_USER||!env.MATERIAL_USER)fail(503,'A área restrita ainda está sendo configurada.');
   const url=new URL(request.url),route=url.pathname;
   if(route==='/login'&&request.method==='POST'){
    if(!env.LOGIN_LIMITER||!(await env.LOGIN_LIMITER.limit({key:request.headers.get('CF-Connecting-IP')||'unknown'})).success)fail(429,'Muitas tentativas. Aguarde um minuto antes de tentar novamente.');
    const input=await body(request,2048);
    if(typeof input.user!=='string'||input.user.length>80||typeof input.password!=='string'||input.password.length>256)fail(401,'Login ou senha incorretos.');
    const isCoordinator=input.user===env.COORD_USER;
    const valid=await passwordMatches(input.password,isCoordinator?env.COORD_PASSWORD_HASH:env.MATERIAL_PASSWORD_HASH);
    if(!valid||(!isCoordinator&&input.user!==env.MATERIAL_USER))fail(401,'Login ou senha incorretos.');
    return json(await createSession(input.user,isCoordinator?'coordinator':'materials',env));
   }
   const user=await session(request,env);
   if(!env.ACCESS_LIMITER||!(await env.ACCESS_LIMITER.limit({key:user.user+':'+(request.headers.get('CF-Connecting-IP')||'unknown')})).success)fail(429,'Muitos acessos. Aguarde um minuto.');
   if(route.startsWith('/materials/')&&request.method==='GET'){
    const id=route.slice('/materials/'.length);if(!/^recurso-\d{3}$/.test(id))fail(404,'Material não encontrado.');
    // The catalogue is bundled server-side; clients never choose a repository or file path.
    const material=env.MATERIAL_CATALOG?.[id];if(!material||!material.path.startsWith('atividades/')||material.path.includes('..'))fail(404,'Material não encontrado.');
    if(!/^ucp-ipsc\/[a-z0-9-]+$/.test(env.MATERIAL_REPO||''))fail(503,'Acervo privado não configurado.');
    const file=await github(env,env.MATERIAL_REPO+'/contents/'+material.path.split('/').map(encodeURIComponent).join('/')+'?ref=main',{headers:{Accept:'application/vnd.github.raw+json'}});
    return new Response(file.body,{headers:{...headers,'Content-Type':'application/pdf','Content-Disposition':'attachment; filename="'+id+'.pdf"'}});
   }
   if(user.role!=='coordinator')fail(403,'Somente a liderança pode alterar o planejamento.');
   if(route==='/plan'&&request.method==='GET')return json(await currentPlan(env));
   if(route==='/plan'&&request.method==='POST'){
    const input=await body(request);const plan=validatePlan(input.plan);
    if(!/^[a-f0-9]{40}$/.test(input.sha||''))fail(400,'Versão de origem inválida.');
    const current=await currentPlan(env);if(current.sha!==input.sha)fail(409,'Outra pessoa atualizou o planejamento. Exporte seu rascunho e carregue a versão atual para revisar as diferenças.');
    if(JSON.stringify(current.plan)===JSON.stringify(plan))return json({unchanged:true,sha:current.sha});
    const content=b64(encoder.encode('window.EBD_PLAN = '+JSON.stringify(plan,null,2)+';\n'));
    const result=await (await github(env,SITE_REPO+'/contents/'+PLAN_PATH,{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({message:'Atualiza planejamento pela coordenação da EBD',branch:'main',sha:input.sha,content})})).json();
    return json({sha:result.content.sha,commit:result.commit.sha,actionsUrl:'https://github.com/'+SITE_REPO+'/actions'});
   }
   fail(404,'Página não encontrada.');
  } catch(error){return json({error:error instanceof ApiError?error.message:'Não foi possível concluir a solicitação.'},error instanceof ApiError?error.status:500);}
 }
};
