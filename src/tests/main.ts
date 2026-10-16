// The test map list (tests.html): what each map tests and a link to play it.

import { TEST_MAPS } from '@/testMaps';
import './tests.css';

const COLOR: Record<string, string> = { Yoav: '#6cc4ff', Noa: '#8ef0d0', Itai: '#c9b8ff' };
const esc = (t: string): string => t.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

document.getElementById('list')!.innerHTML = TEST_MAPS.map(
  (t, i) => `<a class="test" href="./?map=${t.id}" style="--who: ${COLOR[t.who] ?? '#ece4d3'}">
    <span class="num">${i + 1}</span>
    <span class="body"><span class="who">${esc(t.who)}</span><span class="name">${esc(t.name)}</span><span class="brief">${esc(t.brief)}</span></span>
    <span class="play">Play</span>
  </a>`,
).join('');
