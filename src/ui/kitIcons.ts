// Field-kit icons (Phase 6, Ran picked the field kit): stencilled silhouettes, the way kit is
// marked with spray paint. Filled shapes in currentColor, cut by stencil bridges (the thin
// gaps a real stencil needs to hold its islands). 24 x 24, read at 22 to 30 px.

/** A filled icon cut by vertical/diagonal bridges: `cuts` are rects in the 24 x 24 box. */
const stencil = (id: string, body: string, cuts: string): string =>
  `<svg viewBox="0 0 24 24" aria-hidden="true"><defs><mask id="kit-${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">` +
  `<rect width="24" height="24" fill="#fff"/><g fill="#000">${cuts}</g></mask></defs>` +
  `<g fill="currentColor" stroke="currentColor" stroke-linejoin="round" mask="url(#kit-${id})">${body}</g></svg>`;

/** Tools in the backpack. */
export const KIT_ICONS: Readonly<Record<string, string>> = {
  // a coil of rope with its loose end
  tie: stencil(
    'tie',
    '<path stroke="none" fill-rule="evenodd" d="M11 4.5a8 6.5 0 1 1 0 13a8 6.5 0 1 1 0-13zm0 3.6a4.3 2.9 0 1 0 0 5.8a4.3 2.9 0 1 0 0-5.8z"/><path fill="none" stroke-width="2.4" stroke-linecap="round" d="M18.2 13.5c2.3 1.4 3 3.6 2.2 6.3"/>',
    '<rect x="10.3" y="3" width="1.4" height="6"/><rect x="10.3" y="13" width="1.4" height="6"/>',
  ),
  // a stone, and the noise it makes
  decoy: stencil(
    'decoy',
    '<path stroke="none" d="M3.5 18.5l2.2-5.2 4.8-1.6 3.4 3.4-1.8 3.9z"/><path fill="none" stroke-width="2.2" stroke-linecap="round" d="M15.3 8.6a4.2 4.2 0 0 1 0 6.4M18.3 5.8a8.4 8.4 0 0 1 0 12"/>',
    '<rect x="8.6" y="10" width="1.3" height="10" transform="rotate(20 9 15)"/>',
  ),
  // a grenade can under its cloud
  smoke: stencil(
    'smoke',
    '<path stroke="none" d="M9 14h6v7.5H9z M10 12.2h4V14h-4z"/><circle stroke="none" cx="7" cy="8" r="3.3"/><circle stroke="none" cx="12.2" cy="6.2" r="4"/><circle stroke="none" cx="17.2" cy="8.4" r="3"/>',
    '<rect x="8" y="17" width="8" height="1.2"/><rect x="3" y="11" width="18" height="1.2"/>',
  ),
  // field glasses
  bino: stencil(
    'bino',
    '<circle stroke="none" cx="7" cy="15.5" r="4.6"/><circle stroke="none" cx="17" cy="15.5" r="4.6"/><path stroke="none" d="M4.6 12V6.2h4.8V12zM14.6 12V6.2h4.8V12zM9 8.4h6v2.4H9z"/>',
    '<circle cx="7" cy="15.5" r="1.7"/><circle cx="17" cy="15.5" r="1.7"/><rect x="3" y="11" width="18" height="1.2"/>',
  ),
  // an enemy shirt and cap
  uniform: stencil(
    'uniform',
    '<path stroke="none" d="M8 9.2L3.6 12l2.1 3.4 2.3-1.1V21h8v-6.7l2.3 1.1 2.1-3.4L16 9.2c-1 1.4-2.4 2-4 2s-3-.6-4-2z"/><path stroke="none" d="M8.2 4.2h7.6l1.6 2.6H6.6z"/>',
    '<rect x="11.4" y="11" width="1.2" height="11"/>',
  ),
  // two pegs and the wire between them
  wire: stencil(
    'wire',
    '<path stroke="none" d="M4 20.5l1.6-10h2.2l-.6 10zM20 20.5l-1.6-10h-2.2l.6 10z"/><path fill="none" stroke-width="2" stroke-dasharray="2.4 1.8" d="M6.5 12.5h11"/><path stroke="none" d="M2.5 19.5h6v2h-6zM15.5 19.5h6v2h-6z"/>',
    '',
  ),
  // a block of explosive, its receiver and antenna
  charge: stencil(
    'charge',
    '<path stroke="none" d="M3.5 11h13.5v9H3.5z"/><path fill="none" stroke-width="2" stroke-linecap="round" d="M17 14.5h2.3l1.4-8.7"/><circle stroke="none" cx="20.8" cy="4.6" r="1.4"/>',
    '<rect x="7.6" y="10" width="1.3" height="11"/><rect x="12" y="10" width="1.3" height="11"/>',
  ),
  // the hand detonator: body, button, antenna
  detonate: stencil(
    'detonate',
    '<path stroke="none" fill-rule="evenodd" d="M6.5 9.5h11v12h-11zM12 12.6a2.6 2.6 0 1 0 0 5.2a2.6 2.6 0 1 0 0-5.2z"/><path fill="none" stroke-width="2" stroke-linecap="round" d="M14.5 9.5V3.2M3.6 6l2.4 1.2M20.4 6L18 7.2"/>',
    '',
  ),
};

/** Orders every operator has (the right rail). */
export const ORDER_ICONS: Readonly<Record<string, string>> = {
  // a figure flat on the ground
  crawl: stencil(
    'crawl',
    '<circle stroke="none" cx="19" cy="13.2" r="2.3"/><path stroke="none" d="M4 15.2l12.4-1.6.3 2.6L4.3 17.8z"/><path fill="none" stroke-width="2" stroke-linecap="round" d="M11 15.5l-2 3.4M3 19.5h18"/>',
    '<rect x="9.6" y="12" width="1.2" height="7"/>',
  ),
  // the sight
  fire: stencil(
    'fire',
    '<path stroke="none" fill-rule="evenodd" d="M12 4a8 8 0 1 1 0 16a8 8 0 1 1 0-16zm0 2.6a5.4 5.4 0 1 0 0 10.8a5.4 5.4 0 1 0 0-10.8z"/><circle stroke="none" cx="12" cy="12" r="1.6"/>',
    '<rect x="11.4" y="2" width="1.2" height="7"/><rect x="11.4" y="15" width="1.2" height="7"/><rect x="2" y="11.4" width="7" height="1.2"/><rect x="15" y="11.4" width="7" height="1.2"/>',
  ),
  // a pistol with its suppressor
  silencer: stencil(
    'silencer',
    '<path stroke="none" d="M3 8h9.5v4.2H9.4l-.9 6.8H4.6l1-6.8H3z"/><path stroke="none" d="M13 8.4h8v3.4h-8z"/>',
    '<rect x="12.4" y="7" width="1.1" height="6"/><rect x="16.6" y="7" width="1" height="6"/>',
  ),
  // the body set down
  drop: stencil(
    'drop',
    '<path stroke="none" d="M10.4 3h3.2v7h3.4L12 15.4 7 10h3.4z"/><path stroke="none" d="M3.5 18h17v2.6h-17z"/>',
    '<rect x="11.4" y="2" width="1.2" height="5"/>',
  ),
  // halt
  stop: stencil(
    'stop',
    '<path stroke="none" d="M8.3 3h7.4L21 8.3v7.4L15.7 21H8.3L3 15.7V8.3z"/>',
    '<rect x="4" y="11.3" width="16" height="1.4"/>',
  ),
};
