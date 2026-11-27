'use strict';

const LOCAL_SCHEDULES_ID='work-schedules-on-this-device';
const localSchedules=async()=>await docGet(LOCAL_SCHEDULES_ID)||
  {id:LOCAL_SCHEDULES_ID,kind:'local_schedules',items:[],topics:[],photos:{},history:{}};
const localScheduleDate=value=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&
  Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const localSchedulePhoto=name=>/^photo_2026-11-27_15-\d{2}-\d{2}\.jpg$/.test(name);

function normalizeLocalSchedule(input) {
  const year=Number(input.year);
  const text=(key,max=240)=>typeof input[key]==='string'?input[key].trim().slice(0,max):'';
  const title=text('title'),subject=text('subject'),category=text('category');
  const start=text('start'),end=text('end'),done=text('done'),previous=text('previous');
  const startTime=text('startTime'),endTime=text('endTime');
  const validTime=value=>/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
  const cancelled=input.cancelled===true,review=input.review===true;
  if(!Number.isInteger(year)||year<2027||year>2100||!title||!subject||!scheduleCategories.includes(category)||
     !localScheduleDate(start)||!(+start.slice(0,4)===year||category==='Дежурства'&&start===`${year-1}-12-31`)||
     end&&(!localScheduleDate(end)||end<start)||done&&(!localScheduleDate(done)||cancelled||review)||
     previous&&!localScheduleDate(previous)||(startTime||endTime)&&
     (!validTime(startTime)||!validTime(endTime)||(end||start)+endTime<=start+startTime))
    throw new Error('Проверьте название, участника, плановые и фактические даты. Для внесения факта план должен быть сверён.');
  return {year,title,subject,category,start,end,done,previous,startTime,endTime,cancelled,review,role:text('role'),
    note:text('note',2000),source:text('source',300),sourceRow:text('sourceRow')};
}

function changeLocalSchedules(change) {
  return new Promise((resolve,reject)=>{
    const tx=db.transaction('docs','readwrite'),store=tx.objectStore('docs'),read=store.get(LOCAL_SCHEDULES_ID);
    let result,failure;
    read.onsuccess=()=>{
      const data=read.result||{id:LOCAL_SCHEDULES_ID,kind:'local_schedules',items:[],topics:[],photos:{},history:{}};
      try{result=change(data);store.put(data);}
      catch(error){failure=error;tx.abort();}
    };
    tx.oncomplete=()=>resolve(result);
    tx.onabort=()=>reject(failure||tx.error||new Error('Не удалось сохранить графики.'));
  });
}

async function importLocalSchedules(file) {
  if(!file||file.size>18*1024*1024)throw new Error('Файл должен быть меньше 18 МБ.');
  let bundle;
  try{bundle=JSON.parse(await file.text());}
  catch{throw new Error('Откройте файл .psgigraphs, подготовленный для ПСГИ.');}
  if(bundle?.format!=='psgi-local-schedules'||bundle.version!==1||!Array.isArray(bundle.records)||
     !bundle.records.length||bundle.records.length>5000||!Array.isArray(bundle.topics)||bundle.topics.length>100||
     !bundle.photos||typeof bundle.photos!=='object'||Array.isArray(bundle.photos))
    throw new Error('Файл графиков имеет неподдерживаемый формат.');
  const photos=Object.entries(bundle.photos);
  if(photos.length>150||photos.some(([name,contents])=>!localSchedulePhoto(name)||typeof contents!=='string'||
     !contents.startsWith('/9j/')||!/^[A-Za-z0-9+/]+={0,2}$/.test(contents)))throw new Error('В файле есть повреждённое фото.');
  const items=bundle.records.map(input=>{
    if(!input||!/^[a-z][a-z0-9-]{2,80}$/.test(input.key||''))throw new Error('В файле есть запись без номера.');
    return {...normalizeLocalSchedule(input),id:'import-'+input.key,revision:1};
  });
  if(new Set(items.map(item=>item.id)).size!==items.length)throw new Error('В файле есть повторяющиеся записи.');
  if(bundle.topics.some(topic=>!topic||!Number.isInteger(topic.year)||typeof topic.title!=='string'||
     !localSchedulePhoto(topic.source)||!Array.isArray(topic.groups)||topic.groups.length>12||
     topic.groups.some(group=>!group||typeof group.label!=='string'||!Array.isArray(group.items)||
        group.items.length>100||group.items.some(item=>typeof item!=='string'))))
    throw new Error('В файле есть повреждённый список тем.');
  return changeLocalSchedules(data=>{
    const existing=new Set(data.items.map(item=>item.id));
    const added=items.filter(item=>!existing.has(item.id));
    const topics=new Map(data.topics.map(topic=>[`${topic.year}:${topic.title}`,topic]));
    for(const topic of bundle.topics)topics.set(`${topic.year}:${topic.title}`,topic);
    data.items.push(...added);
    data.topics=[...topics.values()];
    Object.assign(data.photos,Object.fromEntries(photos));
    return {added:added.length,total:data.items.length};
  });
}

function saveLocalSchedule(input) {
  const record=normalizeLocalSchedule(input);
  return changeLocalSchedules(data=>{
    const index=data.items.findIndex(item=>item.id===input.id);
    const original=data.items[index];
    if(input.id&&(!original||original.revision!==input.revision))throw new Error('Запись уже изменилась. Откройте графики заново.');
    const id=original?.id||crypto.randomUUID(),revision=(original?.revision||0)+1;
    if(original&&localSchedulePhoto(original.source)){
      record.source=original.source;record.sourceRow=original.sourceRow;
    }
    const item={...record,id,revision};
    const history=data.history[id]||[];
    if(original&&!history.length)history.push({revision:original.revision,author:'Исходный график',changed_at:0,item:original});
    history.unshift({revision,author:'На этом устройстве',changed_at:Date.now(),item});
    data.history[id]=history.slice(0,100);
    if(index<0)data.items.push(item);else data.items[index]=item;
    return {item};
  });
}

async function localScheduleSource(name) {
  const contents=(await localSchedules()).photos[name];
  if(!contents||!localSchedulePhoto(name))throw new Error('Фото отсутствует в загруженном файле.');
  const bytes=Uint8Array.from(atob(contents),ch=>ch.charCodeAt(0));
  return URL.createObjectURL(new Blob([bytes],{type:'image/jpeg'}));
}
