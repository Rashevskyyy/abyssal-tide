import { describe, expect, it } from 'vitest';
import { renderPaytable } from '../src';

describe('renderPaytable', () => {
  it('renders symbol pays as money columns and escapes text', () => {
    const html = renderPaytable({
      note: 'At bet €1.00',
      sections: [{ kind: 'pays', title: 'Symbols', symbols: [{ image: 'a.png', name: 'Nautilus <rare>', pays: [{ label: '3 in a line', amount: '€4.00' }] }] }],
    });
    expect(html).toContain('<h2>Symbols</h2>');
    expect(html).toContain('Nautilus &lt;rare&gt;');
    expect(html).toContain('<small>3 in a line</small>€4.00');
    expect(html.indexOf('At bet €1.00')).toBeLessThan(html.indexOf('Symbols'));
  });

  it('draws each line as a grid with the line row lit on every reel', () => {
    const html = renderPaytable({ sections: [{ kind: 'lines', title: 'Lines', rows: 3, lines: [[1, 1, 1, 1, 1], [0, 1, 2, 1, 0]] }] });
    const lines = html.split('class="mini"').slice(1);
    expect(lines).toHaveLength(2);
    // 15 клітин, з них 5 підсвічених на кожній лінії
    expect((lines[1].match(/<i class="on">/g) ?? []).length).toBe(5);
    expect((lines[1].match(/<i /g) ?? []).length).toBe(15);
  });

  it('keeps trusted html for cards and custom sections', () => {
    const html = renderPaytable({
      sections: [
        { kind: 'cards', title: 'Bonus', cards: [{ art: '<img src="p.png">', name: 'Pearl', text: '1–10× bet', amount: '€10.00' }] },
        { kind: 'steps', title: 'Steps', steps: ['One', 'Two'], after: ['Done'] },
        { kind: 'html', title: 'Jars', intro: 'Fill them', html: '<div class="jars"></div>' },
      ],
    });
    expect(html).toContain('<img src="p.png">');
    expect(html).toContain('<em>€10.00</em>');
    expect(html).toContain('<ol class="pt-steps"><li>One</li><li>Two</li></ol><p>Done</p>');
    expect(html).toContain('<p>Fill them</p><div class="jars"></div>');
  });
});
