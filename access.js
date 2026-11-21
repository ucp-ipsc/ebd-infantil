'use strict';
(() => {
  const $=s=>document.querySelector(s);
  let session=null, nextAction=null;
  const endpoint=(window.EBD_ACCESS?.api||'').replace(/\/$/,'');
  const configured=()=>/^https:\/\/[a-z0-9.-]+\.workers\.dev$/.test(endpoint);
  function active(){if(session&&Date.now()>=session.expiresAt)clear();return session;}
  function clear(){session=null;$('#access-state').textContent='';$('#logout-access').hidden=true;document.dispatchEvent(new Event('ebd-logout'));}
  async function request(route,options={}){
    if(!configured())throw new Error('A área restrita está sendo configurada. Aguarde a ativação do responsável.');
    const response=await fetch(endpoint+route,{...options,cache:'no-store',referrerPolicy:'no-referrer',headers:{...(options.body?{'Content-Type':'application/json'}:{}),...(active()?{Authorization:'Bearer '+session.token}:{}),...options.headers}});
    if(!response.ok){let data;try{data=await response.json();}catch{}if(response.status===401)clear();const error=new Error(data?.error||'Não foi possível conectar. Tente novamente.');error.status=response.status;throw error;}
    return response;
  }
  function requireRole(role,action){
    const user=active();
    if(user&&(role==='materials'||user.role==='coordinator'))return action();
    nextAction={role,action};
    $('#login-title').textContent=role==='coordinator'?'Acesso da liderança':'Acesso aos materiais';
    $('#login-description').textContent=role==='coordinator'?'Entre com o acesso da liderança para organizar as aulas e publicar o calendário.':'Entre com o acesso fornecido pela igreja para consultar e baixar as atividades.';
    $('#login-status').textContent=user?'Seu acesso permite consultar materiais. Entre com a conta da liderança para editar.':'';
    $('#login-password').value='';$('#login-dialog').showModal();
  }
  $('#login-form').onsubmit=async e=>{
    e.preventDefault();const button=$('#login-submit');button.disabled=true;$('#login-status').textContent='Verificando acesso…';
    try{
      const response=await request('/login',{method:'POST',body:JSON.stringify({user:$('#login-user').value.trim(),password:$('#login-password').value})});
      const data=await response.json();session=data;$('#login-password').value='';
      $('#access-state').textContent=data.role==='coordinator'?'Liderança conectada':'Acesso aos materiais';$('#logout-access').hidden=false;
      if(nextAction?.role==='coordinator'&&data.role!=='coordinator'){$('#login-status').textContent='Esse acesso permite consultar materiais. Para editar, use o login da liderança.';return;}
      const action=nextAction?.action;nextAction=null;$('#login-dialog').close();if(action)await action();
    }catch(error){$('#login-status').textContent=error.message;}finally{button.disabled=false;}
  };
  $('#login-dialog').addEventListener('close',()=>{$('#login-password').value='';nextAction=null;});
  $('#logout-access').onclick=()=>{clear();$('#editor-dialog').close();$('#lesson-dialog').close();};
  async function download(id,title){
    return requireRole('materials',async()=>{
      $('#access-status').textContent='Preparando o material…';
      try{
        const response=await request('/materials/'+encodeURIComponent(id));const blob=await response.blob();
        const href=URL.createObjectURL(blob),a=document.createElement('a');a.href=href;a.download=title.replace(/[^\p{L}\p{N} -]/gu,'').slice(0,100)+'.pdf';a.click();setTimeout(()=>URL.revokeObjectURL(href),60000);
        $('#access-status').textContent='Material pronto para download.';
      }catch(error){$('#access-status').textContent=error.message;}
    });
  }
  window.EBD_AUTH={requireRole,download,role:()=>active()?.role||null,async getPlan(){return (await request('/plan')).json();},async publish(plan,sha){return (await request('/plan',{method:'POST',body:JSON.stringify({plan,sha})})).json();}};
})();
