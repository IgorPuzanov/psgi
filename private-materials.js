const PRIVATE_MATERIALS_CACHE = 'psgi-private-2026-11';
const MATERIAL_PATHS = [
  ...Array.from({ length: 8 }, (_, index) => 'instructions/instruction_0' + (index + 1) + '_photos.pdf'),
  'instructions/iotv-10-2024-original.pdf',
];
const isLocalMaterialsHost = () => ['127.0.0.1', 'localhost', '[::1]'].includes(location.hostname);

async function loadLocalPhoneDirectory() {
  if (!isLocalMaterialsHost() || lsGet('phoneSource20261123')) return;
  try {
    const response = await fetch('phone-directory-local.txt');
    if (!response.ok) return;
    const source = await response.text();
    if (source.startsWith('@')) seedPhoneDirectory(source);
  } catch {
    // The private data file is optional on this origin.
  }
}

async function importPrivateMaterials(file) {
  const headerSize = 8;
  if (file.size <= headerSize || file.size > 128 * 1024 * 1024) throw new Error('Не удалось прочитать файл материалов ПСГИ.');
  const prefix = new DataView(await file.slice(0, headerSize).arrayBuffer());
  const length = prefix.getUint32(4, true);
  if (prefix.getUint32(0, true) !== 0x50475350 || !length || length > 256 * 1024) {
    throw new Error('Выбери файл материалов ПСГИ (.psgimat).');
  }
  const header = JSON.parse(await file.slice(headerSize, headerSize + length).text());
  if (header.version !== 1 || typeof header.contacts !== 'string' || !Array.isArray(header.files) ||
      header.files.length !== MATERIAL_PATHS.length ||
      !header.files.every((item, index) => item?.path === MATERIAL_PATHS[index] &&
        Number.isSafeInteger(item.size) && item.size > 5)) {
    throw new Error('Структура файла материалов не совпадает с версией приложения.');
  }
  const people = header.staff === undefined ? [] : parseStaffList(header.staff);
  let position = headerSize + length;
  if (position + header.files.reduce((total, item) => total + item.size, 0) !== file.size) {
    throw new Error('Файл материалов неполный. Скачай его заново.');
  }
  const pdfs = [];
  for (const item of header.files) {
    const pdf = file.slice(position, position + item.size, 'application/pdf');
    if (await pdf.slice(0, 5).text() !== '%PDF-') throw new Error('Один из PDF в файле повреждён.');
    pdfs.push(pdf);
    position += item.size;
  }
  if (!('caches' in window)) throw new Error('Открой ПСГИ по HTTPS, чтобы загрузить сканы.');
  const materialCache = await caches.open(PRIVATE_MATERIALS_CACHE);
  for (const [index, pdf] of pdfs.entries()) {
    const url = new URL(MATERIAL_PATHS[index], document.baseURI);
    await materialCache.put(url.href, new Response(pdf, { headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(pdf.size),
    } }));
  }
  seedPhoneDirectory(header.contacts);
  if (people.length) saveStaffList(people, { fillOnly: true });
  lsSet('privateMaterialsReady', '1');
  return people.length;
}

function privateMaterialsLink(role) {
  return `<a class="btn ghost small no-print" href="#/${role}/materials">${lsGet('privateMaterialsReady') ? 'Рабочие материалы' : 'Загрузить рабочие материалы'}</a>`;
}

function viewPrivateMaterials(role) {
  header('Рабочие материалы', `/${role}/instructions`);
  app.innerHTML = `<div class="card">
    <h2>Телефонный справочник, работники и сканы инструкций</h2>
    <p>Выбери файл ПСГИ с расширением .psgimat. Материалы сохранятся в этом браузере.</p>
    <p class="meta" id="materialsStatus" role="status">${lsGet('privateMaterialsReady') ? 'Рабочие материалы уже загружены.' : ''}</p>
    <label class="btn accent file-btn">Выбрать файл материалов<input id="materialsFile" type="file" accept=".psgimat,application/octet-stream"></label>
    <div class="actions mt">
      <a class="btn ghost small" href="#/${role}/phones">Телефонный справочник</a>
      <a class="btn ghost small" href="#/${role}/people">Работники</a>
      <a class="btn ghost small" href="#/${role}/instructions">Инструкции по охране труда</a>
    </div></div>`;
  const input = $('#materialsFile');
  const status = $('#materialsStatus');
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    input.disabled = true;
    status.textContent = 'Сохраняем материалы на устройстве…';
    try {
      const count = await importPrivateMaterials(file);
      status.textContent = count
        ? `Загружены телефонный справочник, работники (${count}) и девять PDF.`
        : 'Телефонный справочник и девять PDF доступны на этом устройстве.';
    } catch (error) {
      console.error(error);
      status.textContent = 'Не удалось загрузить материалы. Проверь файл и свободное место, затем попробуй снова.';
    } finally {
      input.value = '';
      input.disabled = false;
    }
  };
}
