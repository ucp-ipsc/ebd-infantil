// Recebe as senhas por stdin sem eco; envia apenas hashes e chave de sessão ao secret store.
const {pbkdf2Sync,randomBytes}=require('node:crypto');
const {spawn}=require('node:child_process');
const path=require('node:path');
let input='';
if(!process.stdin.isTTY)throw Error('Use um terminal interativo para a entrada oculta.');
process.stdin.setRawMode(true);process.stdin.resume();
console.log('Pronto para configuração por stdin (entrada oculta).');
process.stdin.on('data',chunk=>{
 const value=chunk.toString();if(value.includes('\x03'))process.exit(1);input+=value;
 if(!/[\r\n]/.test(input))return;
 process.stdin.removeAllListeners('data');process.stdin.setRawMode(false);process.stdin.pause();
 try{
  const record=JSON.parse(input.trim());input='';
  const hash=password=>{if(typeof password!=='string'||password.length<8)throw Error('Senha inválida.');const salt=randomBytes(16);return salt.toString('base64')+':'+pbkdf2Sync(password,salt,100000,32,'sha256').toString('base64');};
  const secrets={MATERIAL_PASSWORD_HASH:hash(record.material),COORD_PASSWORD_HASH:hash(record.coordinator),SESSION_SECRET:randomBytes(32).toString('hex')};
  const child=spawn(process.execPath,[path.join(__dirname,'node_modules/wrangler/bin/wrangler.js'),'secret','bulk'],{cwd:__dirname,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_LOG:'error'},stdio:['pipe','pipe','pipe']});
  child.stdin.end(JSON.stringify(secrets));child.stdout.resume();child.stderr.resume();
  child.on('error',()=>{console.error('Falha ao iniciar a configuração.');process.exitCode=1;});
  child.on('exit',code=>{console.log(code===0?'Hashes e chave de sessão configurados.':'Falha ao configurar os segredos.');process.exitCode=code||0;});
 }catch{console.error('Entrada de configuração inválida.');process.exitCode=1;}
});
