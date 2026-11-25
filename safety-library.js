const SAFETY_INSTRUCTIONS = [
  {
    id: '01', code: 'ИОТВ-10-2024', title: 'Работа с мегаомметром', pages: 11,
    points: [
      ['1.1, 1.3', 'Измеряют сопротивление изоляции на оборудовании без напряжения. Учитывают опасное напряжение и остаточный заряд на объектах большой ёмкости.'],
      ['1.2, 1.5, 1.6', 'Сверяют требования к допуску, используют положенные исправные СИЗ и знакомятся с условиями, характером и объёмом работ на месте.'],
    ],
  },
  {
    id: '02', code: 'ИОТВ-19-2024', title: 'Работа со стационарной и передвижной электротехнической лабораторией', pages: 10,
    points: [
      ['1.1', 'К испытаниям допускается подготовленный персонал. В удостоверении должна быть отметка о праве проведения специальных работ.'],
      ['1.2, 1.4', 'Учитывают шум и воздействие переменного электрического и электростатического поля. Используют положенные исправные СИЗ.'],
    ],
  },
  {
    id: '03', code: 'ИОТВ-24-2024', title: 'Работа с пирометром (тепловизором)', pages: 9,
    points: [
      ['1.2', 'Сверяют требования к подготовке и группе по электробезопасности. До работы изучают руководство по эксплуатации прибора.'],
      ['1.3, 1.4', 'Учитывают шум, электростатическое поле и общую вибрацию. Используют положенные исправные СИЗ с учётом условий работы.'],
    ],
  },
  {
    id: '04', code: 'ИОТВ-25-2024', title: 'Работы в электроустановках по наряду-допуску, распоряжению и в порядке текущей эксплуатации', pages: 23,
    points: [
      ['1.2, 1.3', 'Проверяют основание выполнения работ. Самовольные работы, расширение рабочего места или объёма задания запрещены.'],
      ['1.4, 1.6', 'Учитывают опасное напряжение, работу на высоте и скользкие поверхности. Используют СИЗ, предусмотренные для задания и условий работы.'],
    ],
  },
  {
    id: '05', code: 'ИОТВ-037-2023', title: 'Работа на высоте', pages: 22,
    points: [
      ['1.1, 1.4', 'Сверяют требования к подготовке и допуску. Используют СИЗ, полагающиеся для этого вида работ.'],
      ['1.2, 1.5.1', 'Учитывают высоту, освещённость, движущиеся механизмы и состояние поверхностей. Соблюдают правила применения индивидуальной и коллективной защиты.'],
    ],
  },
  {
    id: '06', code: 'ИОТВ-083-2023', title: 'Обеспечение, использование и применение спецодежды, спецобуви и других СИЗ', pages: 33,
    points: [
      ['1.1–1.3', 'Сверяют, какие СИЗ и смывающие средства положены для работы. Инструкция регулирует выдачу, применение, хранение, уход и вывод из эксплуатации.'],
      ['1.4–1.6', 'Проверяют документы о соответствии и применимость СИЗ. Условия, при которых допускается применение серийных СИЗ после окончания действия документа, сверяют по п. 1.4.'],
    ],
  },
  {
    id: '07', code: 'ИОТВ-248-2023', title: 'Передвижение по территории предприятия и по помещениям', pages: 9,
    points: [
      ['1.1', 'Пользуются установленными маршрутами. Со схемами передвижения знакомятся под подпись. Входы, выходы, проходы и проезды должны быть освещены и свободны.'],
      ['1.2', 'Поддерживают порядок на рабочем месте и правильно используют предусмотренные средства защиты.'],
    ],
  },
  {
    id: '08', code: 'ИОТП-01-2023', title: 'Для электромонтёра по ремонту и обслуживанию электрооборудования', pages: 15, incomplete: true,
    points: [
      ['1.1', 'Сверяют требования к профессиональной подготовке, обучению, проверке знаний и допуску к самостоятельной работе.'],
      ['1.2–1.3', 'Учитывают напряжение, движущиеся механизмы, высоту и риск падения. Перед работой сверяют требования с полным экземпляром инструкции.'],
    ],
  },
];

const safetyPdf = id => 'instructions/instruction_' + id + '_photos.pdf';
const safetyScansAvailable = () => isLocalMaterialsHost() || lsGet('privateMaterialsReady');

function safetySnapshot(ids) {
  return SAFETY_INSTRUCTIONS.filter(doc => ids.includes(doc.id));
}

function safetyPickerHTML(selected, staged = false) {
  return `<fieldset class="safety-picker"><legend>Инструкции к заявке</legend>
    ${SAFETY_INSTRUCTIONS.map(doc => `<label class="check"><input type="checkbox" data-safety-id="${doc.id}" ${selected.includes(doc.id) ? 'checked' : ''}>
      ${icon('book')}<span><strong>${doc.code}</strong><small>${doc.title}</small></span></label>`).join('')}
    ${staged ? '' : '<details id="safetyPreview"><summary>Предпросмотр общего инструктажа</summary><div id="safetyPreviewBody"></div></details>'}
  </fieldset>`;
}

function safetyBriefHTML(docs) {
  if (!docs?.length) return '<p class="meta">Отметь инструкции, чтобы собрать общий инструктаж.</p>';
  const groups = new Map();
  for (const doc of docs) {
    for (const [ref, text] of doc.points) {
      if (!groups.has(text)) groups.set(text, []);
      groups.get(text).push({ id: doc.id, code: doc.code, ref });
    }
  }
  const words = [...groups.keys()].join(' ').trim().split(/\s+/).length;
  const minutes = Math.max(1, Math.ceil(words / 105));
  return `<p class="banner warn">Черновик — требует сверки. ${docs.some(doc => doc.incomplete) ? 'Среди выбранных документов есть неполный комплект. ' : ''}Около ${minutes} мин на ознакомление.</p>
    <p class="meta">Материал для разбора задания. Формальный допуск и обязательный инструктаж оформляются отдельно.</p>
    <ul class="safety-points">${[...groups].map(([text, sources]) => `<li>${esc(text)}
      <span class="safety-sources">${sources.map(source => {
        const ref = `${esc(source.code)}, п. ${esc(source.ref)}, стр. 1 скана`;
        return safetyScansAvailable() ? `<a href="${safetyPdf(source.id)}#page=1" target="_blank" rel="noopener">${ref}</a>` : ref;
      }).join(' · ')}</span></li>`).join('')}</ul>`;
}

function safetyTaskHTML(task) {
  if (!task.safetyBrief?.length) return '';
  return `<section class="card"><h3>Инструкции к заявке</h3>${safetyBriefHTML(task.safetyBrief)}
    <button class="btn ghost small no-print" type="button" data-print-brief>Печать или сохранить в PDF</button></section>`;
}

function bindSafetyPrint(task) {
  app.querySelector('[data-print-brief]')?.addEventListener('click', () => {
    const sheet = document.createElement('section');
    sheet.className = 'safety-print-sheet';
    sheet.innerHTML = `<h1>Инструктаж к заявке ${esc(task.number)}</h1>
      <p>${esc(task.object)} · ${esc(fmtDate(task.date))}</p>
      <p>Исполнитель: ${esc(task.assignedElectrician || 'не назначен')}</p>${safetyBriefHTML(task.safetyBrief)}`;
    document.body.append(sheet);
    document.body.classList.add('print-safety-brief');
    const cleanup = () => {
      sheet.remove();
      document.body.classList.remove('print-safety-brief');
    };
    window.addEventListener('afterprint', cleanup, { once: true });
    window.print();
  });
}

function viewSafetyLibrary(role) {
  header('Инструкции по охране труда', role === 'h' ? '/' : `/${role}/docs/info`);
  app.innerHTML = `<div class="card directory-intro"><h2>Инструкции по охране труда</h2>
    <p class="meta">Тексты, сканы и краткие инструктажи. Номера и названия сверены по титульным страницам.</p>
    ${isLocalMaterialsHost() ? '' : `<div class="actions">${privateMaterialsLink(role)}</div>`}
    <label class="field"><span class="lbl">Найти по названию или номеру</span><input id="safetySearch" type="search" autocomplete="off"></label></div>
    <details class="card mt"><summary>Общий краткий инструктаж</summary>${safetyBriefHTML(SAFETY_INSTRUCTIONS)}</details>
    <div id="safetyResults"></div>
    <a class="btn ghost" href="#/e/tb">Правила по охране труда (ПОТЭЭ)</a>`;
  const search = $('#safetySearch');
  const draw = () => {
    const query = search.value.trim().toLocaleLowerCase('ru');
    $('#safetyResults').innerHTML = SAFETY_INSTRUCTIONS.filter(doc => `${doc.code} ${doc.title}`.toLocaleLowerCase('ru').includes(query))
      .map(doc => `<article class="card instruction-card"><p class="meta">${doc.code} · ${doc.pages} стр.</p>
        <h3>${doc.title}</h3><span class="badge ${doc.incomplete ? 'st-not' : 'st-new'}">${doc.incomplete ? 'Неполный комплект' : 'На сверке'}</span>
        ${doc.incomplete ? '<p class="meta">В пакете 15 страниц. Требуется полный экземпляр.</p>' : ''}
        <details class="mt" data-instruction-text="${doc.id}"><summary>Читать текст инструкции</summary><div data-text-body role="status"></div></details>
        ${safetyScansAvailable() ? `<div class="actions mt"><a class="btn ghost small" href="${safetyPdf(doc.id)}" target="_blank" rel="noopener">Открыть скан PDF</a>
        ${doc.id === '01' ? '<a class="btn ghost small" href="instructions/iotv-10-2024-original.pdf" target="_blank" rel="noopener">Дополнительный скан</a>' : ''}</div>` : ''}
        <details class="mt"><summary>Краткий инструктаж</summary>${safetyBriefHTML([doc])}</details></article>`).join('')
      || '<p class="card meta">По этому запросу ничего не найдено.</p>';
  };
  $('#safetyResults').addEventListener('toggle',async event=>{
    const panel=event.target;
    if (!panel.open||!panel.dataset.instructionText||panel.dataset.loaded) return;
    const body=panel.querySelector('[data-text-body]');
    body.textContent='Загружаем текст…';
    let source;
    try { source=await privateInstructionText(panel.dataset.instructionText); }
    catch { body.textContent='Текст временно недоступен. Попробуйте открыть ещё раз.'; return; }
    if (!source) {
      body.innerHTML=`<p class="meta">Текст доступен в обновлённом файле рабочих материалов.</p>${privateMaterialsLink(role)}`;
      return;
    }
    const notice=document.createElement('p');
    notice.className='banner warn';
    notice.textContent='Распознанный текст проходит сверку. Для применения сверяйтесь с утверждённым экземпляром.';
    const original=document.createElement('pre');
    original.className='instruction-text';
    original.textContent=source;
    body.removeAttribute('role');
    body.replaceChildren(notice,original);
    panel.dataset.loaded='1';
  },true);
  search.oninput = draw;
  draw();
}
