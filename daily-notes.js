'use strict';

const DAILY_NOTES_ID='workspace-daily-notes';

function updateDailyNotes(change){
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('docs','readwrite'),store=tx.objectStore('docs'),read=store.get(DAILY_NOTES_ID);
    let notes,failure;
    read.onsuccess=()=>{
      const state=read.result||{id:DAILY_NOTES_ID,kind:'daily_notes',notes:[]};
      try{
        notes=change(state.notes);
        store.put({...state,notes});
      }catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>resolve(notes);
    tx.onabort=()=>reject(failure||tx.error||new Error('Не удалось сохранить запись.'));
  });
}

async function bindDailyNotes(panel){
  const today=workplaceDay();
  const templates=['Выдать задания','Провести инструктаж','Проверить комплект приборов','Проверить наряд-допуск','Просмотреть графики'];
  panel.innerHTML=`<form id="dailyNoteForm">
      <div class="daily-heading"><h2>Ежедневник</h2>
        <input type="date" name="day" aria-label="Дата ежедневника" value="${today}" required></div>
      <label class="field daily-task-field"><span class="lbl">Что сделать</span><textarea name="text" rows="2" maxlength="1000" required placeholder="Запиши или надиктуй задачу"></textarea></label>
      <div class="daily-actions"><button class="btn accent small" type="submit">Добавить</button><button class="btn ghost small" type="button" id="dailyCancel" hidden>Отмена</button>
      <details><summary>Типовые задачи</summary><div>${templates.map(title=>`<button class="btn ghost small" type="button" data-daily-template="${title}">${title}</button>`).join('')}</div></details></div>
    </form>
    <p class="meta" id="dailyStatus" role="status"></p><div id="dailyList"></div>`;
  const form=panel.querySelector('form'),list=panel.querySelector('#dailyList'),status=panel.querySelector('#dailyStatus');
  const add=form.querySelector('[type=submit]'),cancel=panel.querySelector('#dailyCancel');
  const day=form.elements.day,text=form.elements.text;
  let notes=[],editing=null,deleted=null;
  const rows=entries=>`<ul class="daily-list">${entries.map(note=>`<li><label>
    <input type="checkbox" data-daily-check="${esc(note.id)}" ${note.done?'checked':''}>
    <span>${esc(note.text)}${note.day!==day.value?`<small>${fmtDate(note.day)}</small>`:''}</span></label>
    <div class="daily-row-actions">
      <button class="daily-icon" data-daily-edit="${esc(note.id)}" type="button" aria-label="Изменить задачу" title="Изменить задачу">${icon('edit')}</button>
      <button class="daily-icon daily-trash" data-daily-delete="${esc(note.id)}" type="button" aria-label="Удалить задачу" title="Удалить задачу">${icon('trash')}</button>
    </div></li>`).join('')}</ul>`;
  const draw=()=>{
    const chosen=notes.filter(note=>note.day===day.value);
    const overdue=notes.filter(note=>note.day<today&&note.day!==day.value&&!note.done);
    list.innerHTML=(chosen.length?rows(chosen):'<p class="meta">На выбранную дату задач нет.</p>')+
      (overdue.length?`<details class="daily-overdue" ${day.value===today?'open':''}><summary>Просрочено · ${overdue.length}</summary>${rows(overdue)}</details>`:'');
  };
  const reset=()=>{editing=null;text.value='';add.textContent='Добавить';cancel.hidden=true;};
  const save=async(change,message)=>{
    try{notes=await updateDailyNotes(change);if(panel.isConnected){draw();status.textContent=message;}return true;}
    catch(error){status.textContent=error.message;return false;}
  };
  try{notes=(await docGet(DAILY_NOTES_ID))?.notes||[];}catch(error){status.textContent='Не удалось открыть ежедневник.';}
  if(!panel.isConnected)return;
  draw();
  day.onchange=draw;
  cancel.onclick=()=>{reset();draw();};
  panel.onclick=async event=>{
    const button=event.target.closest('button');
    if(!button)return;
    const {dailyTemplate,dailyEdit,dailyDelete,dailyUndo}=button.dataset;
    if(dailyTemplate){text.value=dailyTemplate;text.focus();button.closest('details').open=false;}
    if(dailyEdit){
      const note=notes.find(entry=>entry.id===dailyEdit);
      if(!note)return;
      editing=note.id;text.value=note.text;day.value=note.day;add.textContent='Сохранить';cancel.hidden=false;
      text.focus();draw();
    }
    if(dailyDelete){
      button.disabled=true;
      let removed;
      const ok=await save(current=>{
        const index=current.findIndex(note=>note.id===dailyDelete);
        if(index<0)return current;
        removed={index,note:current[index]};
        return current.filter(note=>note.id!==dailyDelete);
      },'Задача удалена.');
      if(!ok){button.disabled=false;return;}
      if(editing===dailyDelete)reset();
      if(removed&&panel.isConnected){
        deleted=removed;
        const undo=document.createElement('button');
        undo.type='button';undo.className='daily-undo';undo.dataset.dailyUndo='1';undo.textContent='Отменить';
        status.append(' ',undo);
      }
    }
    if(dailyUndo&&deleted){
      const {note,index}=deleted;
      button.disabled=true;
      const ok=await save(current=>{
        if(current.some(entry=>entry.id===note.id))return current;
        const restored=current.slice();restored.splice(index,0,note);return restored;
      },'Задача восстановлена.');
      if(ok)deleted=null;else button.disabled=false;
    }
  };
  list.onchange=async event=>{
    const checkbox=event.target,id=checkbox.dataset.dailyCheck;
    if(!id)return;
    const done=checkbox.checked;checkbox.disabled=true;
    if(!await save(current=>current.map(note=>note.id===id?{...note,done}:note),done?'Задача выполнена.':'Задача снова открыта.')){
      checkbox.checked=!done;checkbox.disabled=false;
    }
  };
  form.onsubmit=async event=>{
    event.preventDefault();
    const content=text.value.trim(),date=day.value,id=editing;
    if(!content||!date)return;
    add.disabled=true;
    const ok=await save(current=>id?current.map(note=>note.id===id?{...note,text:content,day:date}:note):
      [...current,{id:crypto.randomUUID(),text:content,day:date,done:false}],id?'Задача обновлена.':'Задача добавлена.');
    add.disabled=false;
    if(ok&&editing===id&&text.value.trim()===content)reset();
  };
}
