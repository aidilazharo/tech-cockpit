import type { Content, TableCell } from 'pdfmake/interfaces.js';

// What the SAD PDF's parts share: AIA maroon headings and tables, grey notes, Malaysian dates.

export const MAROON = '#8E1E3F';
export const GREY = '#6B6B6B';

/** A calendar date 'YYYY-MM-DD' as DD/MM/YYYY. */
export function displayDate(value: string): string {
  const [year, month, day] = value.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}

const MALAYSIA = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kuala_Lumpur', day: '2-digit', month: '2-digit', year: 'numeric' });
/** A moment as its date in Malaysia, DD/MM/YYYY. */
export const malaysiaDate = (date: Date): string => MALAYSIA.format(date);

/** A table with a maroon header row (rows as given); `padding` is the room beside each cell's text. */
export const table = (headers: string[], rows: TableCell[][], widths?: (string | number)[], fontSize = 9, padding = 4): Content => ({
  table: { headerRows: 1, widths: widths ?? headers.map(() => '*'), body: [headers.map((label): TableCell => ({ text: label, bold: true, color: 'white', fillColor: MAROON })), ...rows] },
  layout: { hLineColor: () => '#BDBDBD', vLineColor: () => '#BDBDBD', paddingLeft: () => padding, paddingRight: () => padding },
  fontSize,
  margin: [0, 2, 0, 8],
});
