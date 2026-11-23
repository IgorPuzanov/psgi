function seedPhoneDirectory(source) {
  if (lsGet('phoneSource20261123') || typeof source !== 'string' || !source.trim()) return;
  const list = phones();
  let group = '', defaultPlace = '';
  const nameKey = name => name.toLocaleLowerCase('ru').replaceAll('ё', 'е').replace(/[^а-яa-z\d]+/g, ' ').trim();
  const personKey = name => {
    const [last, first, middle] = nameKey(name).split(' ');
    return first && middle ? [last, first[0], middle[0]].join(' ') : '';
  };
  const numberKey = number => number.replace(/\D/g, '').replace(/^[78](?=\d{10}$)/, '7');
  for (const [index, line] of source.trim().split(/\r?\n/).entries()) {
    if (line.startsWith('@')) {
      [group, defaultPlace = ''] = line.slice(1).split('|');
      continue;
    }
    const [name, pos = '', place = '', numbers = '', tetra = ''] = line.split('|');
    if (!name || !numbers) continue;
    const nums = numbers.split(',').filter(Boolean);
    const exact = list.filter(contact => nameKey(contact.name) === nameKey(name));
    const initials = personKey(name);
    const matching = exact.length ? exact : list.filter(contact =>
      (initials && personKey(contact.name) === initials) ||
      (contact.phones || []).some(number => numberKey(number).length === 11 && nums.some(num => numberKey(num) === numberKey(number))));
    if (matching.length > 1) continue;
    const old = matching[0];
    if (!old) {
      list.push({ id: 'source-20261123-' + index, name, pos, dep: group, place: place || defaultPlace, phones: nums, tetra, note: '' });
      continue;
    }
    old.pos ||= pos;
    old.dep ||= group;
    old.place ||= place || defaultPlace;
    if (!old.phones?.length) old.phones = nums;
    old.tetra ||= tetra;
  }
  savePhones(list);
  lsSet('phoneSource20261123', '1');
}
