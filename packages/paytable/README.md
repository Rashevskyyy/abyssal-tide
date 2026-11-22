# @slotkit/paytable

Paytable and rules described as data and rendered to HTML. The game passes sections with amounts already converted to money for the current bet. Every game then gets the same structure, accessibility and print-friendly layout.

## Sections

| `kind` | Renders |
| --- | --- |
| `text` | A heading and paragraphs. |
| `pays` | Symbol cards with a pay column per count ("3 in a line: €1.00"). |
| `cards` | Bonus symbols: artwork, name, short text and an optional amount. |
| `steps` | A numbered sequence (how a bonus plays out), plus optional notes after it. |
| `lines` | Mini diagrams of every payline. |
| `html` | A trusted block of game markup, such as a custom meter or jars. |

All text is escaped. Only `art` on cards and the `html` section are inserted as markup, so keep those to your own templates.

## Example

```ts
import '@slotkit/paytable/paytable.css';
import { renderPaytable } from '@slotkit/paytable';

el.innerHTML = renderPaytable({
  note: `Pays shown for a ${formatMoney(bet)} bet`,
  sections: [
    { kind: 'pays', title: 'Symbols', symbols: [{ image: helmetUrl, name: 'Diving helmet', pays: [{ label: '3', amount: '€1.00' }] }] },
    { kind: 'steps', title: 'Salvage', steps: ['Land 6 pearls', 'Each new pearl resets respins to 3'] },
    { kind: 'lines', title: 'Lines', lines: LINES, rows: 3 },
  ],
  footnote: 'RTP 95.90%. Demo credits only.',
});
```
