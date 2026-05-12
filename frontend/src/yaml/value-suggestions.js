export function generateDateSuggestions(field) {
  const now   = new Date();
  const year  = now.getFullYear();
  const month = now.getMonth() + 1;
  const months = [];
  for (let i = 0; i < 6; i++) {
    let m = month - i;
    let y = year;
    if (m <= 0) { m += 12; y -= 1; }
    months.push(`"${y}.${String(m).padStart(2, '0')}"`);
  }
  if (field === 'end_date')   return ['"Present"', ...months, `"${year}"`];
  if (field === 'start_date') return [...months, `"${year}"`];
  if (field === 'date')       return [`"${year}"`, `"${year-1}"`, `"${year-2}"`, `"${year-3}"`, `"${year-4}"`];
  return [];
}

export function getValueSuggestions(field) {
  if (field === 'proficiency') return ['"Native"', '"Fluent"', '"Intermediate"', '"Basic"'];
  return generateDateSuggestions(field);
}
