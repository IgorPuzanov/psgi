import { randomUUID, createHash } from 'node:crypto';
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
const sourceName=/^photo_2026-11-27_15-\d{2}-\d{2}\.jpg$/;
const text=(value,max)=>typeof value==='string'?value.trim().slice(0,max):'';
function scheduleRecord(input){
  const year=Number(input.year), title=text(input.title,240),subject=text(input.subject,240);
  const {start}=input;
  const end=input.end||'',done=input.done||'',previous=input.previous||'';
  const startTime=input.startTime||'',endTime=input.endTime||'';
  const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  if(!Number.isInteger(year)||year<2027||year>2100||!title||!subject||!categories.includes(input.category)||
     !isDate(start)||!(+start.slice(0,4)===year||input.category==='Дежурства'&&start===`${year-1}-12-31`)||
     end&&(!isDate(end)||end<start)||done&&!isDate(done)||previous&&!isDate(previous)||
     (startTime||endTime)&&(!validTime(startTime)||!validTime(endTime)||(end||start)+endTime<=start+startTime))
    throw fail(400,'Проверьте название, сотрудника или СИЗ и даты графика.');
  const cancelled=input.cancelled===true,review=input.review===true;
  if (done&&(cancelled||review)) throw fail(400,'Факт можно внести после сверки плана для действующего события.');
  return {year,title,subject,start,end,done,previous,startTime,endTime,category:input.category,cancelled,review,
    role:text(input.role,240),note:text(input.note,2000),source:text(input.source,300),sourceRow:text(input.sourceRow,240)};
}
function sourceId(key){
  const hash=createHash('sha256').update('psgi-schedules-2027:'+key).digest('hex');
  return [hash.slice(0,8),hash.slice(8,12),hash.slice(12,16),hash.slice(16,20),hash.slice(20,32)].join('-');
}

export async function workspaceRoutes(db, referenceRoot,scheduleRoot) {
  db.exec(`CREATE TABLE IF NOT EXISTS work_schedules(id TEXT PRIMARY KEY, year INTEGER NOT NULL, revision INTEGER NOT NULL, record TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS work_schedule_history(schedule_id TEXT NOT NULL REFERENCES work_schedules(id), revision INTEGER NOT NULL,
      author TEXT NOT NULL, changed_at INTEGER NOT NULL, record TEXT NOT NULL, PRIMARY KEY (schedule_id,revision));`);
  let topics=[];
  if(scheduleRoot){
    const packet=JSON.parse(await readFile(join(scheduleRoot,'schedules.json'),'utf8'));
    if(packet.version!==1||!Array.isArray(packet.records)||!Array.isArray(packet.topics))throw Error('Неверный формат комплекта графиков');
    const pending=packet.records.map(input=>{
      if(!/^[a-z][a-z0-9-]{2,80}$/.test(input.key)||!sourceName.test(input.source))throw Error('У записи графика отсутствует проверяемый источник');
      return [sourceId(input.key),scheduleRecord(input)];
    });
    if(new Set(pending.map(([id])=>id)).size!==pending.length)throw Error('Повтор идентификатора в комплекте графиков');
    topics=packet.topics;
    db.exec('BEGIN IMMEDIATE');
    try {
      const insert=db.prepare('INSERT OR IGNORE INTO work_schedules VALUES (?,?,1,?)');
      const history=db.prepare('INSERT INTO work_schedule_history VALUES (?,1,?,?,?)');
      for(const [id,record] of pending){
        const encoded=JSON.stringify(record);
        if(insert.run(id,record.year,encoded).changes)history.run(id,'Перенос из исходного графика',Date.now(),encoded);
      }
      db.exec('COMMIT');
    }catch(error){db.exec('ROLLBACK');throw error;}
  }

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
      respond(200,{items,topics}); return true;
    }
    const source=path.match(/^\/schedules\/source\/(photo_2026-11-27_15-\d{2}-\d{2}\.jpg)$/);
    if(source&&req.method==='GET'){
      if(!scheduleRoot)throw fail(404,'Фото доступно в закрытом комплекте графиков.');
      const file=join(scheduleRoot,source[1]),info=await stat(file).catch(()=>null);
      if(!info?.isFile())throw fail(404,'Фото не найдено.');
      res.setHeader('Content-Type','image/jpeg');
      res.setHeader('Content-Length',info.size);
      await pipeline(createReadStream(file),res);
      return true;
    }
    const history=path.match(/^\/schedules\/([\da-f-]{36})\/history$/);
    if (history&&req.method==='GET') {
      const items=db.prepare('SELECT revision,author,changed_at,record FROM work_schedule_history WHERE schedule_id=? ORDER BY revision DESC LIMIT 100')
        .all(history[1]).map(({record,...entry})=>({...entry,item:JSON.parse(record)}));
      respond(200,{items}); return true;
    }
    if (path==='/schedules'&&req.method==='POST') {
      const input=await readJSON(req);
      const record=scheduleRecord(input);
      const id=input.id||randomUUID();
      db.exec('BEGIN IMMEDIATE');
      try {
        const previous=db.prepare('SELECT revision,record FROM work_schedules WHERE id=?').get(id);
        if (input.id&&(!previous||input.revision!==previous.revision)) throw fail(409,'Запись уже изменилась. Откройте графики заново.');
        if(previous){
          const original=JSON.parse(previous.record);
          if(sourceName.test(original.source)){
            record.source=original.source;
            record.sourceRow=original.sourceRow;
          }
        }
        const revision=(previous?.revision||0)+1, encoded=JSON.stringify(record);
        db.prepare('INSERT INTO work_schedules VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET year=excluded.year,revision=excluded.revision,record=excluded.record')
          .run(id,record.year,revision,encoded);
        db.prepare('INSERT INTO work_schedule_history VALUES (?,?,?,?,?)').run(id,revision,user.name,Date.now(),encoded);
        db.exec('COMMIT');
        respond(200,{item:{...record,id,revision}});
      } catch(error) { db.exec('ROLLBACK'); throw error; }
      return true;
    }
    throw fail(404,'Раздел не найден.');
  };
}
