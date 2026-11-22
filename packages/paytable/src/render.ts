/**
 * Таблиця виплат і правила як дані → HTML.
 * Гра описує розділи (суми вже в грошах для поточної ставки), пакет рендерить їх однаково для будь-якої гри.
 * Текст екранується; поле `art` і секція `html` — довірений HTML гри (картинки символів, банки тощо).
 */
export interface PaySymbol {
  image: string; // URL картинки символу
  name: string;
  /** Колонки виплат: «3 в лінію — €1.00» … */
  pays: { label: string; amount: string }[];
}

export interface PayCard {
  art: string; // довірений HTML (img, складна піктограма)
  name: string;
  text: string;
  amount?: string;
}

export type PaytableSection =
  | { kind: 'text'; title: string; paragraphs: string[] }
  | { kind: 'pays'; title: string; symbols: PaySymbol[] }
  | { kind: 'cards'; title: string; cards: PayCard[] }
  | { kind: 'steps'; title: string; steps: string[]; after?: string[] }
  | { kind: 'lines'; title: string; lines: readonly (readonly number[])[]; rows: number }
  | { kind: 'html'; title: string; intro?: string; html: string };

export interface PaytableModel {
  note?: string;
  sections: PaytableSection[];
  footnote?: string;
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ESC[c]);

function section(s: PaytableSection): string {
  const h = `<h2>${escapeHtml(s.title)}</h2>`;
  switch (s.kind) {
    case 'text':
      return h + s.paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join('');
    case 'pays':
      return (
        h +
        `<div class="paygrid">${s.symbols
          .map(
            (x) =>
              `<div class="paycard"><img alt="" src="${escapeHtml(x.image)}"><div><b>${escapeHtml(x.name)}</b><div class="pay3">${x.pays
                .map((p) => `<span><small>${escapeHtml(p.label)}</small>${escapeHtml(p.amount)}</span>`)
                .join('')}</div></div></div>`,
          )
          .join('')}</div>`
      );
    case 'cards':
      return (
        h +
        `<div class="paygrid">${s.cards
          .map(
            (c) =>
              `<div class="paycard">${c.art}<div><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.text)}</span>${c.amount ? `<em>${escapeHtml(c.amount)}</em>` : ''}</div></div>`,
          )
          .join('')}</div>`
      );
    case 'steps':
      return (
        h +
        `<ol class="pt-steps">${s.steps.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ol>` +
        (s.after ?? []).map((p) => `<p>${escapeHtml(p)}</p>`).join('')
      );
    case 'lines':
      return (
        h +
        `<div class="linegrid">${s.lines
          .map(
            (rows, i) =>
              `<div class="mini" aria-label="Line ${i + 1}" style="grid-template-columns:repeat(${rows.length},1fr)"><span>${i + 1}</span>${Array.from({ length: s.rows }, (_, r) =>
                rows.map((rr) => `<i class="${rr === r ? 'on' : ''}"></i>`).join(''),
              ).join('')}</div>`,
          )
          .join('')}</div>`
      );
    case 'html':
      return h + (s.intro ? `<p>${escapeHtml(s.intro)}</p>` : '') + s.html;
  }
}

export function renderPaytable(m: PaytableModel): string {
  return (
    (m.note ? `<p class="note">${escapeHtml(m.note)}</p>` : '') +
    m.sections.map(section).join('') +
    (m.footnote ? `<p class="note">${escapeHtml(m.footnote)}</p>` : '')
  );
}
