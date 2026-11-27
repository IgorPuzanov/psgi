'use strict';

const workspaceRole=user=>['b','m'].includes(user?.role);
const workplaceDay=(date=new Date())=>{
  const pieces=new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Yekaterinburg',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date);
  return ['year','month','day'].map(key=>pieces.find(piece=>piece.type===key).value).join('-');
};
const daysTo=(from,to)=>Math.round((Date.parse(to)-Date.parse(from))/86400000);
const workplaceTime=(date=new Date())=>new Intl.DateTimeFormat('ru-RU',{timeZone:'Asia/Yekaterinburg',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
function scheduleState(item,day=workplaceDay(),time=workplaceTime()) {
  if (item.cancelled) return 'cancelled';
  if (item.done) return 'done';
  if (item.review) return 'review';
  const end=item.end||item.start;
  if (end<day||end===day&&item.endTime&&item.endTime<=time) return 'late';
  if (item.start<day||item.start===day&&item.startTime&&item.startTime<=time) return 'active';
  return daysTo(day,item.start)<=3?'soon':'planned';
}
const scheduleStates={soon:'Ближайшие',late:'Просрочено',active:'Идёт',planned:'Запланировано',done:'Выполнено',review:'На сверке',cancelled:'Отменено'};
const scheduleCategories=['Проверка знаний','Инструктажи','Тренировки','СИЗ','Дежурства','Другое'];

async function workspaceIdentity() {
  if (!serverUrl()||!serverSession()) return null;
  return (await serverRequest('/me',{signal:AbortSignal.timeout(7000)})).user;
}
function protectedWorkspace(role,title,back,render) {
  header(title,back);
  const panel=document.createElement('section');
  panel.className='workspace-screen';
  panel.innerHTML='<p class="meta" role="status">Подключение к серверу ПСГИ…</p>';
  app.replaceChildren(panel);
  workspaceIdentity().then(user=>{
    if (!panel.isConnected) return;
    if (workspaceRole(user)) {
      const poll=setInterval(async()=>{
        if (!panel.isConnected) { clearInterval(poll); return; }
        try {
          const current=await workspaceIdentity();
          if (current?.id===user.id&&workspaceRole(current)) return;
        } catch(error) {
          if (!error.status) return;
          if (![401,403].includes(error.status)) return;
        }
        clearInterval(poll);
        if (panel.isConnected) panel.innerHTML=`<p class="card">Сессия завершена. Войдите снова или обратитесь к администратору ПСГИ.</p><a class="btn ghost" href="#/${role}/connection">Рабочий профиль</a>`;
      },15000);
      return render(panel);
    }
    panel.innerHTML=user?'<p class="card">Раздел доступен мастерам и начальнику ПСГИ.</p>':
      `<p class="card">Для доступа нужна рабочая учётная запись ПСГИ.</p><a class="btn accent" href="#/${role}/connection">Войти</a>`;
  }).catch(error=>{
    if (panel.isConnected) panel.innerHTML=`<p class="card" role="status">${esc(error.message)}</p><a class="btn ghost" href="#/${role}/connection">Подключение</a>`;
  });
}

async function referenceBlob(path) {
  const response=await fetch(serverUrl()+path,{
    headers:{Authorization:'Bearer '+serverSession().token},cache:'no-store',signal:AbortSignal.timeout(20000)
  });
  if (!response.ok) throw new Error('Не удалось получить файл. Проверьте соединение и рабочий вход.');
  return URL.createObjectURL(await response.blob());
}

function viewReferences(role,id) {
  const back=`/${role}/instructions`;
  protectedWorkspace(role,'Шпаргалки',id?`/${role}/reference`:back,async panel=>{
    if (id) {
      const {item}=await serverRequest('/reference/'+encodeURIComponent(id));
      if (!panel.isConnected) return;
      panel.innerHTML=`<article class="card material-head"><p class="meta">${esc(item.category)} · ${esc(item.format.toUpperCase())} · ${fmtDate(item.added)}</p>
        <h2>${esc(item.title)}</h2><p>${esc(item.description)}</p><button class="btn ghost" id="referenceDownload">Скачать оригинал</button>
        <p class="meta" role="status" id="referenceStatus"></p></article>
        ${item.sections.map((section,i)=>`<details class="card material-reading" ${i===0?'open':''} data-reference-section="${i}"><summary>${esc(section.title)}</summary><div class="material-body"></div></details>`).join('')}`;
      const asset=async (name,anchor)=>{
        const url=await referenceBlob('/reference/'+id+'/'+name);
        if (!anchor.isConnected) { URL.revokeObjectURL(url); return; }
        if (anchor.tagName==='IMG') {
          anchor.addEventListener('load',()=>URL.revokeObjectURL(url),{once:true});
          anchor.addEventListener('error',()=>URL.revokeObjectURL(url),{once:true});
          anchor.src=url;
        } else {
          anchor.href=url;anchor.download=item.title;anchor.click();
          setTimeout(()=>URL.revokeObjectURL(url),60000);
        }
      };
      panel.querySelector('#referenceDownload').onclick=async event=>{
        const button=event.currentTarget,status=panel.querySelector('#referenceStatus');
        const link=document.createElement('a');button.after(link);button.disabled=true;
        status.textContent='Загрузка оригинала…';
        try{await asset('original',link);status.textContent='';}
        catch(error){status.textContent=error.message;}
        finally{link.remove();button.disabled=false;}
      };
      const render=section=>{
        const body=section.querySelector('.material-body');
        if (!section.open||body.dataset.loaded) return;
        body.dataset.loaded='1';
        const blocks=item.sections[+section.dataset.referenceSection].blocks;
        for(const block of blocks){
          if(block.type==='image'){
            const figure=document.createElement('figure'), image=document.createElement('img');
            image.alt='Иллюстрация к памятке';image.loading='lazy';figure.append(image);body.append(figure);
            const observer=new IntersectionObserver((entries)=>{
              if(!entries.some(entry=>entry.isIntersecting))return;
              observer.disconnect();
              asset(block.name,image).catch(()=>{figure.textContent='Иллюстрация недоступна. Проверьте рабочий вход.';});
            },{rootMargin:'180px'});
            observer.observe(figure);
          } else if(block.type==='table'){
            const table=document.createElement('div');table.className='material-table';
            table.innerHTML=`<table>${block.head?`<thead><tr>${block.head.map(cell=>`<th scope="col">${esc(cell)}</th>`).join('')}</tr></thead>`:''}
              <tbody>${block.rows.map(row=>`<tr>${row.map(cell=>`<td>${esc(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table>`;
            body.append(table);
          } else {
            const paragraph=document.createElement('p');
            paragraph.className=block.type==='note'?'material-note':'material-text';
            paragraph.textContent=block.text;body.append(paragraph);
          }
        }
      };
      panel.querySelectorAll('[data-reference-section]').forEach(section=>{section.ontoggle=()=>render(section);render(section);});
      return;
    }
    panel.innerHTML=`<section class="card"><h2>Рабочие памятки</h2>
      <label class="field"><span class="lbl">Поиск по названию и тексту</span><input type="search" id="referenceQuery"></label>
      <label class="field"><span class="lbl">Категория</span><select id="referenceCategory"><option value="">Все категории</option></select></label></section>
      <p class="meta" id="referenceCount" role="status"></p><div class="material-list" id="referenceList"></div>`;
    const query=panel.querySelector('#referenceQuery'), category=panel.querySelector('#referenceCategory');
    let items=[],reading=0,delay;
    const draw=()=>{
      const selected=items.filter(item=>!category.value||item.category===category.value);
      panel.querySelector('#referenceCount').textContent=selected.length?`Материалов: ${selected.length}`:'Памятки не найдены.';
      panel.querySelector('#referenceList').innerHTML=selected.map(item=>`<a class="card material-item" href="#/${role}/reference/${item.id}">
        <span class="material-format">${esc(item.format.toUpperCase())}</span><div><h3>${esc(item.title)}</h3><p>${esc(item.description)}</p>
        <small class="meta">${esc(item.category)} · ${fmtDate(item.added)}</small></div></a>`).join('');
    };
    const search=async()=>{
      const serial=++reading;
      try {
        const result=await serverRequest('/reference?q='+encodeURIComponent(query.value));
        if(serial!==reading||!panel.isConnected)return;
        items=result.items;
        for(const value of [...new Set(items.map(item=>item.category))].sort()){
          if(![...category.options].some(option=>option.value===value))category.add(new Option(value,value));
        }
        draw();
        if (!result.configured) panel.querySelector('#referenceCount').textContent='Хранилище оригиналов ещё не подключено к серверу.';
      } catch(error){if(serial===reading&&panel.isConnected)panel.querySelector('#referenceCount').textContent=error.message;}
    };
    query.oninput=()=>{clearTimeout(delay);delay=setTimeout(search,220);};
    category.onchange=draw;
    await search();
  });
}

function viewSchedules(role) {
  protectedWorkspace(role,'Графики',`/${role}/more`,async panel=>{
    const {items,topics=[]}=await serverRequest('/schedules');
    if(!panel.isConnected)return;
    const day=workplaceDay();
    const initial=Math.max(2027,+day.slice(0,4));
    let editor=null;
    panel.innerHTML=`<section class="card schedule-controls"><label class="field"><span class="lbl">Год</span><select id="scheduleYear">${[...new Set([2027,2028,2029,initial,...items.map(item=>item.year)])].sort().map(year=>`<option ${year===initial?'selected':''}>${year}</option>`).join('')}</select></label>
      <button class="btn ghost" id="scheduleYearAdd" type="button">Другой год</button><button class="btn accent" id="scheduleAdd" type="button">Добавить запись</button></section>
      <div id="scheduleEditor"></div><div id="scheduleReminders"></div>
      <section class="card schedule-filters"><label class="field"><span class="lbl">Поиск по графикам</span><input id="scheduleQuery" type="search" placeholder="ФИО, СИЗ или название"></label>
      <label class="field"><span class="lbl">Статус</span><select id="scheduleState"><option value="">Все статусы</option>${Object.entries(scheduleStates).map(([key,label])=>`<option value="${key}">${label}</option>`).join('')}</select></label>
      <label class="field"><span class="lbl">Сортировка</span><select id="scheduleSort"><option value="start">По сроку</option><option value="subject">По сотруднику или СИЗ</option></select></label></section>
      <div id="scheduleTopics"></div><div id="scheduleList"></div>`;
    const year=panel.querySelector('#scheduleYear'), results=panel.querySelector('#scheduleList'), edit=panel.querySelector('#scheduleEditor');
    const field=(name,label,type,value='',attrs='')=>`<label class="field"><span class="lbl">${label}</span><input name="${name}" type="${type}" value="${esc(value)}" ${attrs}></label>`;
    const planLabel=item=>[fmtDate(item.start),item.startTime].filter(Boolean).join(' ')+
      (item.end||item.endTime?' — '+[fmtDate(item.end||item.start),item.endTime].filter(Boolean).join(' '):'');
    const sourceButton=name=>/^photo_2026-11-27_15-\d{2}-\d{2}\.jpg$/.test(name||'')?
      `<button class="btn ghost small" type="button" data-schedule-source="${esc(name)}">Фото источника</button>`:'';
    const row=item=>{
      const state=scheduleState(item,day);
      return `<article class="schedule-row"><div><strong>${esc(item.subject)}</strong>${item.role?`<p class="meta">${esc(item.role)}</p>`:''}
      <p>План ${planLabel(item)} · Факт ${item.done?fmtDate(item.done):'не внесён'}</p>
      ${item.previous?`<p class="meta">Предыдущий срок ${fmtDate(item.previous)}</p>`:''}
      ${item.note?`<p class="meta">${esc(item.note)}</p>`:''}${item.sourceRow?`<p class="meta">${esc(item.sourceRow)}</p>`:''}</div>
      <span class="schedule-status ${state}">${scheduleStates[state]}</span><div class="actions">
      ${!item.done&&!item.review&&!item.cancelled?`<button type="button" class="btn accent small" data-schedule-fact="${item.id}">Внести факт</button>`:''}
      <button type="button" class="btn ghost small" data-schedule-edit="${item.id}">Изменить план и факт</button>
      <button type="button" class="btn ghost small" data-schedule-history="${item.id}">История</button>${sourceButton(item.source)}</div></article>`;
    };
    const draw=()=>{
      const selected=items.filter(item=>item.year===+year.value);
      const query=panel.querySelector('#scheduleQuery').value.trim().toLocaleLowerCase('ru');
      const state=panel.querySelector('#scheduleState').value,sort=panel.querySelector('#scheduleSort').value;
      const visible=selected.filter(item=>(!state||scheduleState(item,day)===state)&&
        [item.title,item.subject,item.note,item.source].some(value=>value.toLocaleLowerCase('ru').includes(query)));
      const groups=new Map();
      for (const item of visible.sort((a,b)=>a[sort].localeCompare(b[sort],'ru')||a.start.localeCompare(b.start))) {
        const key=item.category+'\u0000'+item.title;
        if(!groups.has(key))groups.set(key,[]);
        groups.get(key).push(item);
      }
      panel.querySelector('#scheduleReminders').innerHTML=scheduleReminderHTML(selected,day,true);
      panel.querySelector('#scheduleTopics').innerHTML=topics.filter(topic=>topic.year===+year.value).map(topic=>
        `<details class="card schedule-group"><summary><strong>${esc(topic.title)}</strong></summary>
        ${topic.groups.map(group=>`<h3>${esc(group.label)}</h3><ul>${group.items.map(item=>`<li>${esc(item)}</li>`).join('')}</ul>`).join('')}
        ${sourceButton(topic.source)}</details>`).join('');
      results.innerHTML=[...groups.values()].map(entries=>`<details class="card schedule-group" ${groups.size===1?'open':''}>
        <summary><small>${esc(entries[0].category)}</small><strong>${esc(entries[0].title)}</strong><span class="meta">Записей: ${entries.length}</span></summary>
        ${entries.map(row).join('')}</details>`).join('')||`<p class="card meta">${selected.length?'По фильтрам ничего не найдено.':`На ${year.value} год записи ещё не внесены.`}</p>`;
    };
    const openEditor=(item,factOnly=false)=>{
      editor=item;
      edit.innerHTML=`<form class="card schedule-edit"><h2>${factOnly?'Внести факт':item?'Изменить запись':'Новая запись'}</h2>
        ${factOnly?`<p><strong>${esc(item.subject)}</strong> · ${esc(item.title)}</p><p>План ${planLabel(item)}</p>
          ${field('done','Фактическая дата','date',item.done,'required')}`:`
        ${field('title','Полное название графика','text',item?.title,'required maxlength="240"')}
        ${field('year','Год графика','number',item?.year??year.value,'required min="2027" max="2100"')}
        <label class="field"><span class="lbl">Категория</span><select name="category">${scheduleCategories.map(category=>`<option ${item?.category===category?'selected':''}>${category}</option>`).join('')}</select></label>
        ${field('subject','ФИО и должность или инвентарный номер СИЗ','text',item?.subject,'required maxlength="240"')}
        ${field('role','Должность','text',item?.role,'maxlength="240"')}
        <div class="schedule-dates">${field('start','План · начало','date',item?.start,'required')}${field('end','План · конец','date',item?.end)}${field('done','Фактическая дата','date',item?.done)}</div>
        <div class="schedule-dates">${field('startTime','Время начала','time',item?.startTime)}${field('endTime','Время конца','time',item?.endTime)}${field('previous','Предыдущий срок','date',item?.previous)}</div>
        ${field('source','Источник','text',item?.source,'maxlength="300"')}
        ${field('sourceRow','Строка источника','text',item?.sourceRow,'maxlength="240"')}
        <label class="field"><span class="lbl">Примечание</span><textarea name="note" maxlength="2000">${esc(item?.note||'')}</textarea></label>
        <label class="check"><input type="checkbox" name="cancelled" ${item?.cancelled?'checked':''}> Событие отменено</label>
        <label class="check"><input type="checkbox" name="review" ${item?.review?'checked':''}> План требует сверки</label>`}
        <div class="actions"><button class="btn accent">Сохранить</button><button class="btn ghost" type="button" id="closeScheduleEditor">Закрыть</button></div><p class="meta" role="status"></p></form>`;
      edit.scrollIntoView({block:'nearest'});
      edit.querySelector('#closeScheduleEditor').onclick=()=>edit.replaceChildren();
      edit.querySelector('form').onsubmit=async event=>{
        event.preventDefault();
        const form=event.currentTarget, button=form.querySelector('[type=submit], button');
        const data=Object.fromEntries(new FormData(form));
        const values=factOnly?{...editor,done:data.done}:{...data,year:+data.year,cancelled:data.cancelled==='on',review:data.review==='on'};
        if(editor){values.id=editor.id;values.revision=editor.revision;}
        button.disabled=true;
        try{
          const result=await serverRequest('/schedules',{method:'POST',body:values});
          const index=items.findIndex(entry=>entry.id===result.item.id);
          if(index===-1)items.push(result.item);else items[index]=result.item;
          if(![...year.options].some(option=>+option.value===result.item.year))year.add(new Option(result.item.year,result.item.year));
          year.value=result.item.year;
          edit.replaceChildren();draw();
        }catch(error){form.querySelector('[role=status]').textContent=error.message;}
        finally{button.disabled=false;}
      };
    };
    panel.querySelector('#scheduleAdd').onclick=()=>openEditor(null);
    panel.querySelector('#scheduleYearAdd').onclick=async()=>{
      const value=Number(await askText('Выбрать год','Год с 2027 по 2100',year.value));
      if(!Number.isInteger(value)||value<2027||value>2100)return;
      if(![...year.options].some(option=>+option.value===value))year.add(new Option(value,value));
      year.value=value;edit.replaceChildren();draw();
    };
    year.onchange=()=>{edit.replaceChildren();draw();};
    panel.querySelector('#scheduleQuery').oninput=draw;
    panel.querySelector('#scheduleState').onchange=draw;
    panel.querySelector('#scheduleSort').onchange=draw;
    panel.onclick=async event=>{
      const {scheduleSource,scheduleEdit,scheduleHistory,scheduleFact}=event.target.dataset;
      if(scheduleSource){
        const dialog=document.createElement('dialog');dialog.className='psgi-dialog schedule-source-dialog';
        dialog.innerHTML='<h2>Фото источника</h2><div role="status">Загрузка…</div><form method="dialog"><button class="btn ghost mt">Закрыть</button></form>';
        document.body.append(dialog);dialog.showModal();
        let url;
        dialog.onclose=()=>{if(url)URL.revokeObjectURL(url);dialog.remove();};
        try{
          url=await referenceBlob('/schedules/source/'+scheduleSource);
          if(!dialog.isConnected){URL.revokeObjectURL(url);return;}
          const image=new Image();image.alt='Фото исходного графика';image.src=url;
          dialog.querySelector('[role=status]').replaceChildren(image);
        }catch(error){dialog.querySelector('[role=status]').textContent=error.message;}
        return;
      }
      const item=items.find(entry=>entry.id===(scheduleEdit||scheduleHistory||scheduleFact));
      if(!item)return;
      if(scheduleEdit||scheduleFact){openEditor(item,!!scheduleFact);return;}
      const dialog=document.createElement('dialog');dialog.className='psgi-dialog';
      dialog.innerHTML='<h2>История изменений</h2><div role="status">Загрузка…</div><form method="dialog"><button class="btn ghost mt">Закрыть</button></form>';
      document.body.append(dialog);dialog.showModal();dialog.onclose=()=>dialog.remove();
      const log=dialog.querySelector('div');
      try{
        const result=await serverRequest('/schedules/'+item.id+'/history');
        log.innerHTML=result.items.map(entry=>`<p><strong>Версия ${entry.revision} · ${esc(entry.author)}</strong><br>
          ${fmtDT(entry.changed_at)} · План ${planLabel(entry.item)} · Факт ${entry.item.done?fmtDate(entry.item.done):'—'}
          ${entry.item.cancelled?' · Отменено':''}${entry.item.note?`<br>${esc(entry.item.note)}`:''}</p>`).join('');
      }catch(error){log.textContent=error.message;}
    };
    draw();
  });
}

function scheduleReminderHTML(items,day,detailed=false) {
  const html=['late','soon'].map(state=>{
    const group=items.filter(item=>scheduleState(item,day)===state).sort((a,b)=>a.start.localeCompare(b.start));
    return `<div class="schedule-count ${state}"><strong>${group.length}</strong><span>${state==='late'?'Просрочено':'В ближайшие 3 дня'}</span>
      ${detailed&&group.length?`<ul>${group.map(item=>`<li>${esc(item.title)} · ${esc(item.subject)} · ${fmtDate(item.start)}</li>`).join('')}</ul>`:''}</div>`;
  });
  return `<section class="schedule-reminders" aria-label="Напоминания">${html.join('')}</section>`;
}

function workspaceWidgets(role,user) {
  const items=[
    ['guides','book','Типовые работы'],['devices','meter','Приборы'],
    ['kusty','pin','Карты месторождений'],['archive','permit','Архив'],
    ['training','book','Обучение'],['backup','gear','Данные и копии']
  ];
  if(workspaceRole(user))items.unshift(['schedules','clipboard','Графики'],['monthly','meter','Отчёты']);
  return items.map(([path,icon,title])=>({path,icon,title,url:`#/${role}/${path}`}));
}
const workspaceWidgetKey=user=>'workspaceWidgets:'+(user?.id||me()||'device');
function widgetOrder(user,items) {
  const stored=jget(workspaceWidgetKey(user),null);
  return Array.isArray(stored)?stored.filter(path=>items.some(item=>item.path===path)):[];
}

async function populateHomeWorkspace(role,hello) {
  const panel=$('#homeWorkspace'),issue=$('#homeIssue'),greeting=$('#homeGreeting');
  const user=await workspaceIdentity().catch(()=>null);
  if(!panel.isConnected)return;
  if(user){
    const key='workspaceGreeting:'+user.id;
    const label=lsGet(key);
    greeting.textContent=label?`${hello}, ${label}`:hello;
    if(!label){
      const invite=document.createElement('button');
      invite.type='button';invite.className='btn ghost small mt';invite.textContent='Как к вам обращаться?';
      invite.onclick=async()=>{
        const value=await askText('Как к вам обращаться?','Имя будет видно в приветствии.','',user.name);
        if(value){lsSet(key,value.slice(0,60));greeting.textContent=`${hello}, ${value.slice(0,60)}`;invite.remove();}
      };
      greeting.after(invite);
    }
  }
  if(workspaceRole(user)){
    issue.hidden=false;issue.href=`#/${user.role}/new`;
    panel.innerHTML=`<div id="homeReminders"></div>`;
    serverRequest('/schedules',{signal:AbortSignal.timeout(7000)}).then(({items})=>{
      const slot=panel.querySelector('#homeReminders');
      if(!slot?.isConnected||!items.some(item=>['late','soon'].includes(scheduleState(item))))return;
      slot.innerHTML=`<section class="home-widget-group"><div class="section-label"><h3>Сроки по графикам</h3><a href="#/${user.role}/schedules">Открыть графики</a></div>${scheduleReminderHTML(items,workplaceDay())}</section>`;
    }).catch(()=>{});
  }
  const widgets=workspaceWidgets(user?.role||role,user);
  const active=widgetOrder(user,widgets).map(path=>widgets.find(item=>item.path===path));
  if(active.length){
    const section=document.createElement('section');section.className='home-widget-group';
    section.innerHTML=`<div class="section-label"><h3>Ярлыки</h3><a href="#/${user?.role||role}/more">Настроить</a></div><div class="tiles">${active.map(item=>tile(item.url,item.icon,item.title)).join('')}</div>`;
    panel.append(section);
  }
}

async function populateWorkspaceCatalog(role) {
  const panel=$('#workspaceCatalog');
  const user=await workspaceIdentity().catch(()=>null);
  if(!panel.isConnected)return;
  const items=workspaceWidgets(user?.role||role,user);
  let selected=widgetOrder(user,items);
  const draw=()=>{
    const ordered=[...selected.map(path=>items.find(item=>item.path===path)),...items.filter(item=>!selected.includes(item.path))];
    panel.innerHTML=`${workspaceRole(user)?`<div class="tiles">${tile(`#/${user.role}/schedules`,'clipboard','Графики')}</div>`:''}
      <details class="card mt" ${panel.querySelector('details')?.open?'open':''}><summary>Ярлыки на главной</summary><div class="widget-picker">
      ${ordered.map(item=>`<div><label class="check"><input type="checkbox" data-widget="${item.path}" ${selected.includes(item.path)?'checked':''}> ${item.title}</label>
        ${selected.indexOf(item.path)>0?`<button type="button" class="btn ghost small" data-widget-up="${item.path}" aria-label="Поднять ${item.title}">↑</button>`:''}</div>`).join('')}
      <button class="btn ghost small" type="button" id="widgetsReset">Сбросить ярлыки</button></div></details>`;
  };
  const update=()=>{lsSet(workspaceWidgetKey(user),JSON.stringify(selected));draw();};
  panel.onchange=event=>{
    const path=event.target.dataset.widget;
    if(!path)return;
    selected=event.target.checked?[...selected,path]:selected.filter(value=>value!==path);update();
  };
  panel.onclick=event=>{
    if(event.target.id==='widgetsReset'){selected=[];update();return;}
    const path=event.target.dataset.widgetUp;
    if(!path)return;
    const index=selected.indexOf(path);
    if(index>0){[selected[index-1],selected[index]]=[selected[index],selected[index-1]];update();}
  };
  draw();
}

async function viewWorkspaceArchive(role) {
  header('Архив',`/${role}/more`);
  const hash=location.hash;
  const tasks=(await dbAll()).filter(task=>(task.archived||task.status==='sent')&&
    (role!=='e'||isTaskAssignedTo(task,me()))).sort(byNew);
  if(location.hash!==hash)return;
  app.innerHTML=tasks.length?tasks.map(task=>`<a class="card task" href="#/${role==='m'||role==='b'?role:'e'}/task/${esc(task.id)}">
    <span class="meta">${esc(task.number)} · ${fmtDate(task.date)}</span><strong class="obj">${esc(task.object)}</strong></a>`).join(''):
    '<p class="card meta">Завершённых заявок пока нет.</p>';
}
