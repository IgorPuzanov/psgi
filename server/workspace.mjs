import { randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readdir, readFile, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const imageTypes={png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',gif:'image/gif',webp:'image/webp',bmp:'image/bmp'};
const formats={
  docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
};
const categories=['Проверка знаний','Инструктажи','Тренировки','СИЗ','Дежурства','Другое'];
const isDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&Number.isFinite(Date.parse(value))&&
  new Date(value).toISOString().slice(0,10)===value;
const fail=(status,message)=>Object.assign(new Error(message),{status});

export function workspaceRoutes(db, referenceRoot) {
  db.exec(`CREATE TABLE IF NOT EXISTS work_schedules(id TEXT PRIMARY KEY, year INTEGER NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_schedule_history(schedule_id TEXT NOT NULL REFERENCES work_schedules(id), revision INTEGER NOT NULL,
      author TEXT NOT NULL, changed_at INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY (schedule_id,revision));`);

  async function readReference(id) {
    if (!referenceRoot||!/^ref-\d{1,4}$/.test(id)) return null;
    try { return JSON.parse(await readFile(join(referenceRoot,id,'preview.json'),'utf8')); }
    catch(error) { if(error.code==='ENOENT') return null; throw error; }
  }

  return async ({req,res,path,url,user,respond,readJSON})=>{
    if (path==='/me'&&req.method==='GET') {
      respond(200,{user:{id:user.id,name:user.name,role:user.role,admin:user.admin}});
      return true;
    }
    if (!/^\/(reference|schedules)(\/|$)/.test(path)) return false;
    if (!['b','m'].includes(user.role)) throw fail(403,'Раздел доступен мастерам и начальнику ПСГИ.');
    if (path==='/reference'&&req.method==='GET') {
      const q=(url.searchParams.get('q')||'').slice(0,120).trim().toLocaleLowerCase('ru');
      const entries=referenceRoot?await readdir(referenceRoot,{withFileTypes:true}):[];
      const list=await Promise.all(entries.filter(entry=>entry.isDirectory()).map(entry=>readReference(entry.name)));
      const items=list.filter(Boolean).filter(item=>!q||[item.title,item.description,item.category,
        ...item.sections.flatMap(section=>section.blocks.flatMap(block=>block.rows?.flat()??[block.text||'']))]
        .some(text=>String(text).toLocaleLowerCase('ru').includes(q)))
        .map(({sections,...item})=>({...item,sections:sections.length}));
      respond(200,{items:items.sort((a,b)=>a.id.localeCompare(b.id,undefined,{numeric:true})),configured:!!referenceRoot});
      return true;
    }
    const reference=path.match(/^\/reference\/(ref-\d{1,4})(?:\/(original|image-\d+\.[a-z]+))?$/);
    if (reference&&req.method==='GET') {
      const [,id,file]=reference;
      const item=await readReference(id);
      if (!item) throw fail(404,'Шпаргалка не найдена.');
      if (!file) { respond(200,{item}); return true; }
      const original=file==='original';
      const name=original?item.title:file;
      const type=original?formats[item.format]:imageTypes[file.split('.').pop()];
      const listed=item.sections.some(section=>section.blocks.some(block=>block.type==='image'&&block.name===file));
      if (!type||name!==basename(name)||/[\\/]/.test(name)||!original&&!listed) throw fail(404,'Файл не найден.');
      const target=join(referenceRoot,id,name);
      const info=await stat(target).catch(()=>null);
      if (!info?.isFile()) throw fail(404,'Файл не найден.');
      res.setHeader('Content-Type',type);
      res.setHeader('Content-Length',info.size);
      if (original) res.setHeader('Content-Disposition',"attachment; filename*=UTF-8''"+encodeURIComponent(name));
      await pipeline(createReadStream(target),res);
      return true;
    }
    if (path==='/schedules'&&req.method==='GET') {
      const items=db.prepare('SELECT id,year,revision,record FROM work_schedules ORDER BY year,id').all()
        .map(row=>({...JSON.parse(row.record),id:row.id,revision:row.revision}));
      respond(200,{items}); return true;
    }
    const history=path.match(/^\/schedules\/([\da-f-]{36})\/history$/);
    if (history&&req.method==='GET') {
      const items=db.prepare('SELECT revision,author,changed_at,record FROM work_schedule_history WHERE schedule_id=? ORDER BY revision DESC LIMIT 100')
        .all(history[1]).map(({record,...entry})=>({...entry,item:JSON.parse(record)}));
      respond(200,{items}); return true;
    }
    if (path==='/schedules'&&req.method==='POST') {
      const input=await readJSON(req);
      const getText=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
      const start=input.start,end=input.end||'',done=input.done||'';
      const year=Number(input.year), title=getText(input.title,240), subject=getText(input.subject,240);
      if (!Number.isInteger(year)||year<2027||year>2100||!title||!subject||!categories.includes(input.category)||
          !isDate(start)||!start.startsWith(year+'-')||end&&(!isDate(end)||end<start)||done&&!isDate(done))
        throw fail(400,'Проверьте название, сотрудника или СИЗ и даты графика.');
      const record={year,title,subject,start,end,done,category:input.category,cancelled:input.cancelled===true,
        note:getText(input.note,2000),source:getText(input.source,300)};
      if (record.cancelled&&done) throw fail(400,'У отменённой записи должна быть пустая дата выполнения.');
      const id=input.id||randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous=db.prepare('SELECT revision FROM work_schedules WHERE id=?').get(id);
        if (input.id&&(!previous||input.revision!==previous.revision)) throw fail(409,'Запись уже изменилась. Откройте графики заново.');
        const revision=(previous?.revision||0)+1, encoded=JSON.stringify(record);
        db.prepare('INSERT INTO work_schedules VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET year=excluded.year,revision=excluded.revision,record=excluded.record')
          .run(id,year,revision,encoded);
        db.prepare('INSERT INTO work_schedule_history VALUES (?,?,?,?,?)').run(id,revision,user.name,Date.now(),encoded);
        db.exec('COMMIT');
        respond(200,{item:{...record,id,revision}});
      } catch(error) { db.exec('ROLLBACK'); throw error; }
      return true;
    }
    throw fail(404,'Раздел не найден.');
  };
}
