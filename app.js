'use strict';
(() => {
  const $ = (s) => document.querySelector(s);
  const escape = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const normalize = s => String(s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const clone = x => JSON.parse(JSON.stringify(x));
  const key = 'ipsc-ebd-planejamento-2027-v1';
  let original = clone(window.EBD_PLAN);
  let baseSha = null, editorDirty = false, publishBusy = false;
  const materials = window.EBD_MATERIALS || [];
  let plan = clone(original), mode = 'map', featuredId, selectedId, toastTimer;
  const monthNames = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
  const holidays = {'2027-03-28':'Páscoa','2027-05-16':'Pentecostes','2027-10-31':'Reforma Protestante','2027-12-26':'Celebração de Natal'};
  const paths = {
    sprout:'M12 21V11M12 16C4 16 2 10 3 5c6 0 10 4 9 11ZM12 11C12 5 16 2 21 3c0 5-3 8-9 8Z',
    sun:'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z',
    heart:'M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z',
    book:'M12 6v15M12 6C9 3 5 3 2 4v15c4-1 7-1 10 2 3-3 6-3 10-2V4c-3-1-7-1-10 2ZM5 8h3m-3 4h3m8-4h3m-3 4h3',
    rainbow:'M2 20v-6a10 10 0 0 1 20 0v6M6 20v-6a6 6 0 0 1 12 0v6M10 20v-6a2 2 0 0 1 4 0v6',
    star:'m12 2 3.1 6.4 7.1 1-5.1 5 1.2 7.1L12 18.2l-6.3 3.3 1.2-7.1-5.1-5 7.1-1Z',
    stars:'m8 3 1.7 3.6 4 .6-2.9 2.8.7 4L8 12.1l-3.5 1.9.7-4L2.3 7.2l4-.6ZM18 13v8m-4-4h8M19 3v5m-2.5-2.5h5',
    leaf:'M20 3C9 1 1 7 4 16c9 5 17-1 16-13ZM4 21 16 9',
    crown:'m2 6 5 4 5-7 5 7 5-4-2 13H4ZM5 22h14',
    flame:'M12 2c2 7 8 8 8 14a8 8 0 0 1-16 0c0-4 3-6 4-9 0 5 2 6 3 6 2-3 2-7 1-11ZM12 15c-4 5-2 7 0 7s4-2 0-7Z',
    compass:'M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0ZM16 8l-3 5-5 3 3-5Z',
    sparkles:'m12 2 3 7 7 3-7 3-3 7-3-7-7-3 7-3ZM3 2v4M1 4h4m16 14v4m-2-2h4'
  };
  const icon = name => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${paths[name] || paths.book}"/></svg>`;
  const topic = id => plan.topics.find(t => t.id === id);
  const sorted = () => [...plan.lessons].sort((a,b) => a.date.localeCompare(b.date));
  const shortDate = date => date.slice(8) + '/' + date.slice(5,7);
  const longDate = date => `${Number(date.slice(8))} de ${monthNames[Number(date.slice(5,7))-1].toLowerCase()} de ${plan.year}`;
  const resources = id => materials.filter(m => m.lessons.includes(id));
  const today = () => new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
  function toast(message) { clearTimeout(toastTimer); $('#toast').textContent = message; $('#toast').hidden = false; toastTimer = setTimeout(() => $('#toast').hidden = true, 5500); }
  function validate(data) {
    if (!data || data.version !== 1 || data.year !== 2027 || !Array.isArray(data.lessons) || data.lessons.length !== 52 || !Array.isArray(data.topics) || data.topics.length !== 12) throw new Error('O arquivo precisa conter o planejamento de 2027, com 52 aulas e 12 trilhas.');
    if (new Set(data.topics.map(t => t.id)).size !== 12 || data.topics.some(t => !original.topics.some(o=>o.id===t.id) || typeof t.title !== 'string' || !t.title.trim() || t.title.length>180 || !/^#[0-9a-f]{6}$/i.test(t.color) || !Object.hasOwn(paths,t.icon))) throw new Error('As trilhas do arquivo são inválidas.');
    const ids = new Set(), dates = new Set(), validDates = new Set(original.lessons.map(l => l.date));
    for (const l of data.lessons) {
      if (!original.lessons.some(o=>o.id===l.id) || ids.has(l.id) || !validDates.has(l.date) || dates.has(l.date) || !data.topics.some(t => t.id === l.topic) || typeof l.title !== 'string' || !l.title.trim() || l.title.length>180 || typeof l.reference !== 'string' || !l.reference.trim() || l.reference.length>120 || typeof l.notes !== 'string' || l.notes.length>2000 || (l.special != null && typeof l.special !== 'string')) throw new Error('Há uma aula inválida, uma data repetida ou um domingo ausente no arquivo.');
      ids.add(l.id); dates.add(l.date);
    }
    return clone(data);
  }
  function persist(next) {
    validate(next);
    try { localStorage.setItem(key,JSON.stringify(next)); } catch { throw new Error('O navegador não conseguiu salvar o rascunho. Verifique o armazenamento e tente novamente.'); }
    plan = next; $('#draft-banner').hidden = false;
    if(baseSha)localStorage.setItem(key+'-base',baseSha);
  }
  function renderFeatured() {
    const lessons = sorted(), date = today();
    const current = lessons.find(l=>l.date >= date) || lessons.at(-1); featuredId = current.id;
    const label = date < lessons[0].date ? 'NOSSA JORNADA COMEÇA AQUI' : date > lessons.at(-1).date ? 'ÚLTIMO ENCONTRO DE 2027' : current.date === date ? 'A HISTÓRIA DESTE DOMINGO' : 'NO PRÓXIMO DOMINGO';
    $('#featured').innerHTML = `<div class="featured-icon">${icon(topic(current.topic).icon)}</div><div class="featured-date"><b>${current.date.slice(8)}</b><span>${monthNames[Number(current.date.slice(5,7))-1].slice(0,3).toUpperCase()}</span></div><div class="featured-copy"><p class="eyebrow">${label}</p><h2>${escape(current.title)}</h2><p>${escape(current.reference)} · ${escape(topic(current.topic).title)}</p></div><button class="button primary" data-lesson="${current.id}">Ver a aula</button>`;
    $('#week-button').textContent = date>lessons.at(-1).date ? 'Rever o último encontro' : current.date===date ? 'Conhecer a aula de hoje' : 'Conhecer a próxima aula';
  }
  function renderTrails() {
    const query = normalize($('#search').value), filter = Number($('#topic-filter').value);
    const all = sorted(), filtered = all.filter(l => (!filter || l.topic===filter) && normalize(`${l.title} ${l.reference} ${topic(l.topic).title} ${longDate(l.date)} ${holidays[l.date]||''}`).includes(query));
    $('#trail-grid').classList.toggle('list-mode',mode==='list');
    $('#view-map').setAttribute('aria-pressed',String(mode==='map')); $('#view-list').setAttribute('aria-pressed',String(mode==='list'));
    $('#clear-filter').hidden = !query && !filter;
    $('#empty').hidden = filtered.length>0; $('#result-count').textContent = `${filtered.length} aulas encontradas`;
    $('#trail-grid').innerHTML = plan.topics.map(t => {
      const lessons = filtered.filter(l=>l.topic===t.id); if (!lessons.length) return '';
      const materialCount = materials.filter(m=>m.lessons.some(id=>lessons.some(l=>l.id===id))).length;
      const months=[...new Set(lessons.map(l=>Number(l.date.slice(5,7))-1))].sort((a,b)=>a-b).map(m=>monthNames[m]).join(' · ');
      return `<article class="trail-card" style="--tone:${t.color}"><div class="trail-card-header"><span class="topic-symbol">${icon(t.icon)}</span><div><p class="month-label">${months}</p><h3>${escape(t.title)}</h3></div></div><div class="honeycomb" ${mode==='list'?'hidden':''}>${lessons.map(l=>`<button class="lesson-hex ${l.id===featuredId?'is-featured':''}" data-lesson="${l.id}" aria-label="${escape(longDate(l.date)+': '+l.title)}">${holidays[l.date]?'<span class="hex-special" aria-hidden="true">✦</span>':''}<span class="hex-number">${String(all.findIndex(x=>x.id===l.id)+1).padStart(2,'0')}</span><span class="hex-date">${shortDate(l.date)}</span></button>`).join('')}</div><div class="story-key" ${mode==='list'?'hidden':''}>${lessons.map(l=>`<button class="story-label" data-lesson="${l.id}"><span class="story-number">${String(all.findIndex(x=>x.id===l.id)+1).padStart(2,'0')}</span><span class="story-name">${escape(l.title)}</span></button>`).join('')}</div><div class="lesson-list" ${mode==='map'?'hidden':''}>${lessons.map(l=>`<button class="lesson-row" data-lesson="${l.id}"><span class="row-date">${shortDate(l.date)}</span><span class="row-title">${escape(l.title)}<small>${escape(l.reference)}${holidays[l.date]?' · '+escape(holidays[l.date]):''}</small></span></button>`).join('')}</div><div class="card-footer"><span>${lessons.length} encontros · ${materialCount} recursos</span><button data-topic="${t.id}">Explorar tema</button></div></article>`;
    }).join('');
  }
  function renderLibrary() {
    $('#material-count').textContent = `${materials.length} recursos organizados`;
    $('#library-topics').innerHTML = plan.topics.map(t => {
      const count=materials.filter(m=>m.lessons.some(id=>plan.lessons.find(l=>l.id===id)?.topic===t.id)).length;
      return `<button class="library-topic" data-library="${t.id}" style="--tone:${t.color}"><span class="topic-symbol">${icon(t.icon)}</span><span><strong>${escape(t.title)}</strong><small>${count ? count+' recursos de apoio' : 'Materiais a preparar'}</small></span></button>`;
    }).join('');
  }
  function render() {
    const filter = $('#topic-filter').value;
    const options = plan.topics.map(t=>`<option value="${t.id}">${escape(t.title)}</option>`).join('');
    $('#topic-filter').innerHTML = '<option value="">Todas as trilhas</option>'+options; $('#topic-filter').value = filter;
    $('#edit-topic').innerHTML = options;
    renderFeatured(); renderTrails(); renderLibrary();
  }
  function resourceHTML(m) {

    return `<button class="resource-link" data-resource="${escape(m.id)}" type="button"><span class="file-type">${escape(m.format)}</span><span><strong>${escape(m.title)}</strong><small>${escape(m.age)} · ${escape(m.kind)} · ${escape(m.sourceYear)}${m.match==='same-story'?' · Mesma história':' · Apoio temático'}</small><small>${escape(m.context || '')}</small></span></button>`;
  }
  function showLesson(id, updateHash=true) {
    const l = plan.lessons.find(x=>x.id===id); if(!l) return;
    selectedId=id; const t=topic(l.topic), list=resources(id), all=sorted(), index=all.findIndex(x=>x.id===id);
    $('#lesson-content').innerHTML=`<p class="eyebrow">${escape(t.title)}</p><h2 id="lesson-title">${escape(l.title)}</h2><div class="lesson-meta"><span>Domingo, ${longDate(l.date)}</span><span>Encontro ${index+1} de 52</span>${holidays[l.date]?`<span class="badge">${escape(holidays[l.date])}</span>`:''}</div><div class="passage-box"><h3>Vamos abrir a Bíblia</h3><p>${escape(l.reference)}</p></div>${l.notes?`<p class="lesson-notes">${escape(l.notes)}</p>`:''}<h3 class="resource-heading">Para conversar em família</h3><p>Leiam juntos a passagem da semana. O que ela nos ensina sobre Deus? Como essa história se conecta a Jesus? Encerrem com uma oração.</p><h3 class="resource-heading">Materiais para este encontro <span class="badge">${list.length}</span></h3><p class="resource-note">Acervo de 2025 e 2026. As relações abaixo são sugestões para revisão dos professores; adapte o roteiro à passagem e à faixa etária.</p><div class="resource-list">${list.length?list.map(resourceHTML).join(''):'<p class="editor-tip">Ainda não há um recurso associado a esta aula. A passagem bíblica já está disponível para o preparo.</p>'}</div><div class="lesson-navigation"><button class="button secondary" data-lesson="${all[index-1]?.id||''}" ${index===0?'disabled':''}>Aula anterior</button><button class="button secondary" data-lesson="${all[index+1]?.id||''}" ${index===51?'disabled':''}>Próxima aula</button></div>`;
    if(!$('#lesson-dialog').open) $('#lesson-dialog').showModal();
    $('#lesson-dialog').scrollTop=0;
    if(updateHash) history.replaceState(null,'',`#${id}`);
  }
  function showLibrary(id) {
    const t=topic(id), lessons=plan.lessons.filter(l=>l.topic===id), list=materials.filter(m=>m.lessons.some(i=>lessons.some(l=>l.id===i)));
    $('#lesson-content').innerHTML=`<p class="eyebrow">BIBLIOTECA DA EBD</p><h2 id="lesson-title">${escape(t.title)}</h2><p class="resource-note">${list.length} recursos para revisão e adaptação dos professores. A organização mantém a identificação do material original.</p><div class="resource-list">${list.length?list.map(resourceHTML).join(''):'<p class="editor-tip">Materiais a preparar para esta trilha.</p>'}</div>`;
    $('#lesson-dialog').showModal(); $('#lesson-dialog').scrollTop=0;
  }
  function fillEditor(id) {
    selectedId = id; const l=plan.lessons.find(x=>x.id===id);
    $('#editor-lesson').innerHTML=sorted().map(x=>`<option value="${x.id}">${shortDate(x.date)} · ${escape(x.title)}</option>`).join(''); $('#editor-lesson').value=id;
    $('#edit-title').value=l.title; $('#edit-reference').value=l.reference; $('#edit-topic').value=l.topic; $('#edit-notes').value=l.notes||'';
    $('#edit-date').innerHTML=sorted().map(x=>`<option value="${x.id}">${shortDate(x.date)} · ${escape(x.title)}${holidays[x.date]?' ['+holidays[x.date]+']':''}</option>`).join(''); $('#edit-date').value=id;
    $('#editor-status').textContent=''; editorDirty=false; dateWarning();
  }
  function dateWarning() {
    const a=plan.lessons.find(l=>l.id===selectedId), b=plan.lessons.find(l=>l.id===$('#edit-date').value);
    $('#date-warning').textContent = a.id===b.id ? 'A data será mantida. Para reorganizar, escolha o encontro com o qual deseja trocar.' : `Aula selecionada: ${shortDate(a.date)} para ${shortDate(b.date)}. “${b.title}” passará para ${shortDate(a.date)}.${holidays[a.date]||holidays[b.date]?' Atenção: a troca envolve uma data comemorativa.':''}`;
  }
  document.querySelectorAll('[data-icon]').forEach(el=>el.innerHTML=icon(el.dataset.icon));
  document.addEventListener('click',e=>{
    const lesson=e.target.closest('[data-lesson]'); if(lesson && !lesson.disabled) showLesson(lesson.dataset.lesson);
    const close=e.target.closest('[data-close]'); if(close) document.getElementById(close.dataset.close).close();
    const trail=e.target.closest('[data-topic]'); if(trail){ $('#topic-filter').value=trail.dataset.topic; mode='list'; renderTrails(); $('#trilhas').scrollIntoView({behavior:'smooth'}); }
    const library=e.target.closest('[data-library]'); if(library) window.EBD_AUTH.requireRole('materials',()=>showLibrary(Number(library.dataset.library)));
    const resource=e.target.closest('[data-resource]'); if(resource){const m=materials.find(x=>x.id===resource.dataset.resource);if(m)window.EBD_AUTH.download(m.id,m.title);}
  });
  for(const dialog of document.querySelectorAll('dialog')) dialog.addEventListener('click',e=>{ if(e.target===dialog){const r=dialog.getBoundingClientRect(); if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom) dialog.close();} });
  $('#lesson-dialog').addEventListener('close',()=>{if(location.hash.startsWith('#aula-')) history.replaceState(null,'','#trilhas');});
  // Keep each visible story name and its hexagon linked for pointer and keyboard use.
  function highlightStory(card) {
    const focused = card.querySelector('[data-lesson]:focus');
    const hovered = card.querySelector('[data-lesson]:hover');
    const active = hovered || focused;
    card.querySelectorAll('[data-lesson]').forEach(el => {
      el.classList.toggle('story-active', Boolean(active && el.dataset.lesson === active.dataset.lesson));
    });
  }
  for (const event of ['pointerover','pointerout','focusin','focusout']) {
    $('#trail-grid').addEventListener(event, e => {
      const card = e.target.closest('.trail-card');
      if (card) requestAnimationFrame(() => highlightStory(card));
    });
  }
  $('#search').addEventListener('input',renderTrails); $('#topic-filter').addEventListener('change',renderTrails);
  $('#clear-filter').onclick=()=>{$('#search').value='';$('#topic-filter').value='';renderTrails();};
  $('#view-map').onclick=()=>{mode='map';renderTrails();}; $('#view-list').onclick=()=>{mode='list';renderTrails();};
  $('#week-button').onclick=()=>showLesson(featuredId);
  $('#open-editor').onclick=()=>window.EBD_AUTH.requireRole('coordinator',openEditor);
  $('#editor-lesson').onchange=()=>fillEditor($('#editor-lesson').value); $('#edit-date').onchange=dateWarning;
  $('#edit-form').onsubmit=e=>{
    e.preventDefault(); const next=clone(plan), l=next.lessons.find(x=>x.id===selectedId), other=next.lessons.find(x=>x.id===$('#edit-date').value);
    [l.date,other.date]=[other.date,l.date]; l.title=$('#edit-title').value.trim(); l.reference=$('#edit-reference').value.trim(); l.topic=Number($('#edit-topic').value); l.notes=$('#edit-notes').value.trim();
    try { persist(next); render(); fillEditor(l.id); $('#editor-status').textContent='Rascunho salvo. Clique em Publicar alterações quando terminar a revisão.'; } catch(error){$('#editor-status').textContent=error.message;}
  };
  $('#export-plan').onclick=()=>{
    const text='window.EBD_PLAN = '+JSON.stringify(plan,null,2)+';\n'; const url=URL.createObjectURL(new Blob([text],{type:'text/javascript;charset=utf-8'})); const a=document.createElement('a'); a.href=url; a.download='planejamento.js'; a.click(); setTimeout(()=>URL.revokeObjectURL(url),1000); toast('Arquivo exportado. Substitua dados/planejamento.js no GitHub para publicar.');
  };
  $('#import-plan').onchange=async e=>{
    const file=e.target.files[0]; if(!file)return;
    try { if(file.size>200000) throw new Error('O arquivo excede o tamanho esperado para um planejamento.'); let text=(await file.text()).replace(/^\uFEFF/,'').trim(); if(text.startsWith('window.EBD_PLAN')) { text=text.replace(/^window\.EBD_PLAN\s*=\s*/,'').replace(/;\s*$/,''); } const next=validate(JSON.parse(text)); persist(next); render(); fillEditor(featuredId); $('#editor-status').textContent='Planejamento importado como rascunho local.'; } catch(error){$('#editor-status').textContent='Não foi possível importar: '+error.message;} e.target.value='';
  };
  $('#discard-draft').onclick=()=>{if(!confirm('Descartar o rascunho deste navegador e voltar ao planejamento publicado? Exporte antes se quiser guardar as alterações.'))return;try{localStorage.removeItem(key);plan=clone(original);$('#draft-banner').hidden=true;render();toast('Planejamento publicado restaurado.');}catch{toast('Não foi possível remover o rascunho.');}};
  $('#print-plan').onclick=()=>{const search=$('#search').value,filter=$('#topic-filter').value,oldMode=mode;$('#search').value='';$('#topic-filter').value='';mode='list';renderTrails();$('#editor-dialog').close();window.print();$('#search').value=search;$('#topic-filter').value=filter;mode=oldMode;renderTrails();};
  $('#edit-form').addEventListener('input',()=>editorDirty=true);
  async function loadRemote(restoreDraft=false){
    const remote=await window.EBD_AUTH.getPlan();
    original=validate(remote.plan);baseSha=remote.sha;plan=clone(original);
    $('#draft-banner').hidden=true;
    if(restoreDraft){
      const saved=localStorage.getItem(key);
      if(saved&&localStorage.getItem(key+'-base')===baseSha){plan=validate(JSON.parse(saved));$('#draft-banner').hidden=false;}
      else if(saved)toast('Há um rascunho antigo neste navegador. Ele não foi aplicado porque a versão de origem é diferente.');
    }
    render();fillEditor(selectedId||featuredId);
  }
  async function openEditor(){
    try{if(!baseSha)await loadRemote(true);fillEditor(selectedId||featuredId);$('#editor-dialog').showModal();}
    catch(error){toast(error.message);}
  }
  $('#reload-plan').onclick=async()=>{
    if(publishBusy)return;
    if(!confirm('Carregar o planejamento atual? As alterações locais serão descartadas. Exporte seu rascunho antes se quiser guardá-lo.'))return;
    try{await loadRemote();localStorage.removeItem(key);localStorage.removeItem(key+'-base');$('#publish-status').textContent='Versão atual carregada.';}catch(error){$('#publish-status').textContent=error.message;}
  };
  $('#publish-plan').onclick=async()=>{
    if(publishBusy)return;
    if(editorDirty){$('#publish-status').textContent='Salve primeiro as alterações da aula no rascunho.';return;}
    if(!baseSha){$('#publish-status').textContent='Carregue a versão atual antes de publicar.';return;}
    if(!confirm('Publicar este planejamento para todas as famílias e professores?'))return;
    publishBusy=true;$('#publish-plan').disabled=true;$('#publish-status').textContent='Enviando planejamento…';
    const snapshot=clone(plan);
    try{
      const result=await window.EBD_AUTH.publish(snapshot,baseSha);baseSha=result.sha;original=snapshot;
      if(JSON.stringify(plan)===JSON.stringify(snapshot)){localStorage.removeItem(key);localStorage.removeItem(key+'-base');$('#draft-banner').hidden=true;}
      else localStorage.setItem(key+'-base',baseSha);
      $('#publish-status').textContent=result.unchanged?'O planejamento já está atualizado.':'Alterações enviadas! O site será atualizado quando a publicação terminar.';
      $('#publish-link').hidden=!result.actionsUrl;if(result.actionsUrl)$('#publish-link').href=result.actionsUrl;
    }catch(error){$('#publish-status').textContent=error.message;}
    finally{publishBusy=false;$('#publish-plan').disabled=false;}
  };
  document.addEventListener('ebd-logout',()=>{baseSha=null;plan=clone(original);$('#draft-banner').hidden=true;render();});
  window.addEventListener('hashchange',()=>{if(location.hash.startsWith('#aula-'))showLesson(location.hash.slice(1),false);});
  render(); if(location.hash.startsWith('#aula-'))showLesson(location.hash.slice(1),false);
})();
