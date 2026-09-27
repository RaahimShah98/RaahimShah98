// SVG renderers. Every image is drawn from the collected data and has a
// finished static state, so viewers that don't animate still see it all.

export const THEMES = {
  dark: {
    bg: '#0f1722', panel: '#141e2b', rule: '#233044', grid: '#1b2635',
    text: '#e7ebf0', muted: '#8b98a9', faint: '#56647a',
    accent: '#f2b33d', accentInk: '#1a1204',
    ramp: ['#1d2a3b', '#2f5d63', '#3f8f89', '#6fb89a', '#f2b33d'],
    series: ['#f2b33d', '#4fb8b0', '#7f97d6', '#d98b98', '#a5c47c', '#c79bdb', '#7d8a9c'],
    floor: '#172231', floorEdge: '#223047',
  },
  light: {
    bg: '#ffffff', panel: '#f5f7fa', rule: '#dde3ea', grid: '#edf1f5',
    text: '#17212d', muted: '#5a6676', faint: '#98a3b1',
    accent: '#b7791f', accentInk: '#ffffff',
    ramp: ['#e6ebf1', '#b8d8d3', '#6fb3a9', '#2f8a80', '#b7791f'],
    series: ['#c1841f', '#24877f', '#4f66b0', '#b85a6a', '#6f9440', '#8a5aa6', '#6b7788'],
    floor: '#f0f3f7', floorEdge: '#dfe5ec',
  },
};

const SANS = "'Segoe UI', -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const MONO = "ui-monospace, 'Cascadia Mono', 'SF Mono', Menlo, Consolas, monospace";
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f = (n) => Number(n.toFixed(1));
const fmt = (n) => n.toLocaleString('en-US');

function frame(t, w, h, title, body, extraStyle = '') {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(title)}">
<title>${esc(title)}</title>
<style>
text{font-family:${SANS};fill:${t.text}}
.m{fill:${t.muted}}.fa{fill:${t.faint}}.mono{font-family:${MONO}}
${extraStyle}
@media (prefers-reduced-motion: reduce){*{animation:none!important}}
</style>
<rect x="0.5" y="0.5" width="${w - 1}" height="${h - 1}" rx="12" fill="${t.bg}" stroke="${t.rule}"/>
${body}
</svg>`;
}

function heading(t, x, y, title, caption) {
  return `<text x="${x}" y="${y}" font-size="21" font-weight="600" letter-spacing="-0.2">${esc(title)}</text>
<text x="${x}" y="${y + 26}" font-size="14" class="m">${esc(caption)}</text>`;
}

// ---------------------------------------------------------------- 3D helpers

function rotY([x, y, z], a) { return [x * Math.cos(a) + z * Math.sin(a), y, -x * Math.sin(a) + z * Math.cos(a)]; }
function rotX([x, y, z], a) { return [x, y * Math.cos(a) - z * Math.sin(a), y * Math.sin(a) + z * Math.cos(a)]; }
function rotZ([x, y, z], a) { return [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a), z]; }

function icosahedron() {
  const p = (1 + Math.sqrt(5)) / 2;
  const v = [
    [-1, p, 0], [1, p, 0], [-1, -p, 0], [1, -p, 0],
    [0, -1, p], [0, 1, p], [0, -1, -p], [0, 1, -p],
    [p, 0, -1], [p, 0, 1], [-p, 0, -1], [-p, 0, 1],
  ].map((q) => { const l = Math.hypot(...q); return q.map((c) => c / l); });
  const edges = [];
  for (let i = 0; i < v.length; i++) for (let j = i + 1; j < v.length; j++) {
    if (Math.hypot(v[i][0] - v[j][0], v[i][1] - v[j][1], v[i][2] - v[j][2]) < 1.1) edges.push([i, j]);
  }
  return { v, edges };
}

// ---------------------------------------------------------------- hero

export function hero(t, s) {
  const W = 1200, H = 440;
  const FR = 60, DUR = 24;
  const cx = 968, cy = 168, R = 92, D = 4.2;
  const tilt = -0.42;

  const project = (p) => { const k = D / (D - p[2]); return [cx + p[0] * R * k, cy - p[1] * R * k, p[2]]; };
  const depthOpacity = (z) => f(0.18 + 0.82 * ((z + 1) / 2));
  const anim = (attr, vals) => `<animate attributeName="${attr}" dur="${DUR}s" repeatCount="indefinite" values="${vals.join(';')}"/>`;

  // Wireframe core
  const ico = icosahedron();
  const frames = [];
  for (let k = 0; k <= FR; k++) {
    const a = (2 * Math.PI * k) / FR;
    frames.push(ico.v.map((q) => project(rotX(rotY(q, a), tilt))));
  }
  const lines = ico.edges.map(([i, j]) => {
    const x1 = frames.map((fr) => f(fr[i][0])), y1 = frames.map((fr) => f(fr[i][1]));
    const x2 = frames.map((fr) => f(fr[j][0])), y2 = frames.map((fr) => f(fr[j][1]));
    const op = frames.map((fr) => depthOpacity((fr[i][2] + fr[j][2]) / 2));
    return `<line x1="${x1[0]}" y1="${y1[0]}" x2="${x2[0]}" y2="${y2[0]}" stroke-opacity="${op[0]}">${anim('x1', x1)}${anim('y1', y1)}${anim('x2', x2)}${anim('y2', y2)}${anim('stroke-opacity', op)}</line>`;
  }).join('');

  // Orbit: one point per repository, sized by repo size, coloured by language
  const orbitRepos = s.repos.slice(0, 18);
  const maxSize = Math.max(1, ...orbitRepos.map((r) => r.size));
  const orbit = orbitRepos.map((r, i) => {
    const phi = (2 * Math.PI * i) / orbitRepos.length;
    const pts = [];
    for (let k = 0; k <= FR; k++) {
      const a = phi - (2 * Math.PI * k) / FR;
      let p = [Math.cos(a) * 1.62, 0, Math.sin(a) * 1.62];
      p = rotZ(rotX(p, tilt + 0.1), 0.18);
      pts.push(project(p));
    }
    const rad = f(3 + 5 * Math.sqrt(r.size / maxSize));
    const col = s.langColor(r.language);
    const cxs = pts.map((p) => f(p[0])), cys = pts.map((p) => f(p[1]));
    const op = pts.map((p) => depthOpacity(p[2] / 1.62));
    return `<circle cx="${cxs[0]}" cy="${cys[0]}" r="${rad}" fill="${col}" fill-opacity="${op[0]}">${anim('cx', cxs)}${anim('cy', cys)}${anim('fill-opacity', op)}</circle>`;
  }).join('');

  // Orbit guide ellipse (static)
  const guide = [];
  for (let k = 0; k <= 72; k++) {
    const a = (2 * Math.PI * k) / 72;
    const p = project(rotZ(rotX([Math.cos(a) * 1.62, 0, Math.sin(a) * 1.62], tilt + 0.1), 0.18));
    guide.push(`${f(p[0])},${f(p[1])}`);
  }

  // Detection box around the object, labelled with the top language and its share
  const bx = cx - 182, by = cy - 128, bw = 364, bh = 250, c = 16;
  const corners = [
    `M${bx},${by + c}V${by}H${bx + c}`, `M${bx + bw - c},${by}H${bx + bw}V${by + c}`,
    `M${bx + bw},${by + bh - c}V${by + bh}H${bx + bw - c}`, `M${bx + c},${by + bh}H${bx}V${by + bh - c}`,
  ].join('');
  const top = s.languages[0];
  const tag = top ? `${top.name.toLowerCase()} ${top.share.toFixed(2)}` : 'code';
  const tagW = 18 + tag.length * 8.4;

  // Ledger of headline figures
  const ledger = s.ledger;
  const colW = (W - 112) / ledger.length;
  const ledgerSvg = ledger.map((item, i) => {
    const x = 56 + i * colW;
    return `${i ? `<line x1="${f(x - 20)}" y1="330" x2="${f(x - 20)}" y2="392" stroke="${t.rule}"/>` : ''}
<text x="${f(x)}" y="362" font-size="30" font-weight="600" letter-spacing="-0.5">${esc(item.value)}</text>
<text x="${f(x)}" y="387" font-size="13.5" class="m">${esc(item.label)}</text>`;
  }).join('');

  const summaryLines = s.summaryLines.map((l, i) => `<text x="56" y="${218 + i * 24}" font-size="16" class="m">${esc(l)}</text>`).join('');

  const body = `
<text x="56" y="70" font-size="14" class="m mono">github.com/${esc(s.login)}</text>
<text x="53" y="136" font-size="58" font-weight="600" letter-spacing="-1.6">${esc(s.displayName)}</text>
<text x="56" y="176" font-size="20">${esc(s.headline)}</text>
${summaryLines}
<line x1="56" y1="310" x2="${W - 56}" y2="310" stroke="${t.rule}"/>
${ledgerSvg}
<polyline points="${guide.join(' ')}" fill="none" stroke="${t.rule}" stroke-width="1"/>
<g stroke="${t.muted}" stroke-width="1.2" stroke-linecap="round">${lines}</g>
${orbit}
<path d="${corners}" fill="none" stroke="${t.accent}" stroke-width="2"/>
<rect x="${bx}" y="${by - 24}" width="${f(tagW)}" height="24" fill="${t.accent}"/>
<text x="${bx + 9}" y="${by - 7}" font-size="13" class="mono" style="fill:${t.accentInk}">${esc(tag)}</text>
<text x="${bx + bw}" y="${by + bh + 20}" font-size="12" text-anchor="end" class="fa">points are repositories, sized by code</text>`;
  return frame(t, W, H, `${s.displayName}, ${s.headline}`, body);
}

// ---------------------------------------------------------------- isometric skyline

export function skyline(t, s) {
  const W = 1200;
  const years = s.years; // [{year, months:[12 counts|null], total}]
  const Y = years.length;
  const S = 36, MAXH = 150;
  const c30 = Math.cos(Math.PI / 6), s30 = 0.5;
  const gridW = (12 + Y) * S * c30;
  const left = 440 + (W - 40 - 440 - gridW) / 2;
  const ox = left + Y * S * c30, oy = 196;
  const H = Math.ceil(oy + (12 + Y) * S * s30 + 56);
  const iso = (x, y, z) => [f(ox + (x - y) * S * c30), f(oy + (x + y) * S * s30 - z)];
  const pts = (arr) => arr.map((p) => p.join(',')).join(' ');

  const all = years.flatMap((y) => y.months.filter((m) => m != null));
  const max = Math.max(1, ...all);
  const shade = (hex, k) => {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * k));
    return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
  };
  // Teal steps for ordinary months; amber is kept for the top months only.
  const level = (c) => (c === 0 ? 0 : c >= 0.8 * max ? 4 : Math.min(3, 1 + Math.floor(3 * Math.sqrt(c / max))));

  let peak = null;
  const cells = [];
  years.forEach((yr, yi) => yr.months.forEach((count, mi) => {
    if (count == null) return;
    cells.push({ x: mi, y: yi, count, year: yr.year });
    if (!peak || count > peak.count) peak = { x: mi, y: yi, count, year: yr.year };
  }));
  cells.sort((a, b) => a.x + a.y - (b.x + b.y) || a.x - b.x);

  const g = 0.14;
  const bars = cells.map((cell) => {
    const { x, y, count } = cell;
    const x0 = x + g, x1 = x + 1 - g, y0 = y + g, y1 = y + 1 - g;
    if (count === 0) {
      return `<polygon points="${pts([iso(x0, y0, 0), iso(x1, y0, 0), iso(x1, y1, 0), iso(x0, y1, 0)])}" fill="${t.floor}" stroke="${t.floorEdge}" stroke-width="0.8"/>`;
    }
    const h = Math.max(6, MAXH * Math.sqrt(count / max));
    const col = t.ramp[level(count)];
    const topF = [iso(x0, y0, h), iso(x1, y0, h), iso(x1, y1, h), iso(x0, y1, h)];
    const right = [iso(x1, y0, 0), iso(x1, y1, 0), iso(x1, y1, h), iso(x1, y0, h)];
    const leftF = [iso(x0, y1, 0), iso(x1, y1, 0), iso(x1, y1, h), iso(x0, y1, h)];
    return `<g><title>${MONTHS[x]} ${cell.year}: ${count} contribution${count === 1 ? '' : 's'}</title><polygon points="${pts(leftF)}" fill="${shade(col, 0.62)}"/><polygon points="${pts(right)}" fill="${shade(col, 0.8)}"/><polygon points="${pts(topF)}" fill="${col}"/></g>`;
  }).join('');

  const yearLabels = years.map((yr, yi) => {
    const [x, y] = iso(12.3, yi + 0.5, 0);
    return `<text x="${x}" y="${f(y + 10)}" font-size="12.5" class="m mono">${yr.year}</text>`;
  }).join('');
  const monthLabels = MONTHS.map((m, mi) => {
    const [x, y] = iso(mi + 0.5, Y + 0.45, 0);
    return `<text x="${x}" y="${f(y + 12)}" font-size="11.5" text-anchor="middle" class="fa">${m[0]}</text>`;
  }).join('');

  // Detection box on the busiest month
  let det = '';
  if (peak && peak.count > 0) {
    const h = Math.max(6, MAXH * Math.sqrt(peak.count / max));
    const ps = [iso(peak.x + g, peak.y + g, h), iso(peak.x + 1 - g, peak.y + 1 - g, 0), iso(peak.x + g, peak.y + 1 - g, 0), iso(peak.x + 1 - g, peak.y + g, 0)];
    const xs = ps.map((p) => p[0]), ys = ps.map((p) => p[1]);
    const bx = Math.min(...xs) - 8, by = Math.min(...ys) - 8, bw = Math.max(...xs) - bx + 8, bh = Math.max(...ys) - by + 8;
    const label = `peak ${MONTHS[peak.x].toLowerCase()} ${peak.year} ${peak.count}`;
    const lw = 14 + label.length * 7.3;
    det = `<rect x="${f(bx)}" y="${f(by)}" width="${f(bw)}" height="${f(bh)}" fill="none" stroke="${t.accent}" stroke-width="1.6"/>
<rect x="${f(bx)}" y="${f(by - 20)}" width="${f(lw)}" height="20" fill="${t.accent}"/>
<text x="${f(bx + 7)}" y="${f(by - 6)}" font-size="11.5" class="mono" style="fill:${t.accentInk}">${esc(label)}</text>`;
  }

  // Year totals on the left
  const maxYear = Math.max(1, ...years.map((y) => y.total));
  const totals = [...years].reverse().map((yr, i) => {
    const y = 150 + i * 34;
    const w = f(Math.max(2, 180 * (yr.total / maxYear)));
    return `<text x="56" y="${y}" font-size="14" class="mono m">${yr.year}</text>
<rect x="106" y="${y - 11}" width="${w}" height="12" rx="2" fill="${yr.total === maxYear ? t.accent : t.ramp[2]}"/>
<text x="${f(116 + Number(w))}" y="${y}" font-size="14">${fmt(yr.total)}</text>`;
  }).join('');

  // A detector-style light sheet sweeps across the months. Towers are static,
  // so any viewer that doesn't animate still shows the full chart.
  const BH = MAXH + 24;
  const sweep = [iso(0, -0.2, 0), iso(0, Y + 0.2, 0), iso(0, Y + 0.2, BH), iso(0, -0.2, BH)];
  const [dx, dy] = [f(12 * S * c30), f(12 * S * s30)];
  const beam = `<defs><linearGradient id="beam" x1="0" y1="1" x2="0" y2="0">
<stop offset="0" stop-color="${t.accent}" stop-opacity="0.2"/><stop offset="1" stop-color="${t.accent}" stop-opacity="0"/></linearGradient></defs>
<g opacity="0"><polygon points="${pts(sweep)}" fill="url(#beam)"/><polyline points="${pts([sweep[0], sweep[1]])}" fill="none" stroke="${t.accent}" stroke-width="1.5"/>
<animateTransform attributeName="transform" type="translate" values="0,0;${dx},${dy}" dur="7s" repeatCount="indefinite"/>
<animate attributeName="opacity" values="0;1;1;0" keyTimes="0;0.08;0.9;1" dur="7s" repeatCount="indefinite"/></g>`;
  const legend = t.ramp.map((c, i) => `<rect x="${56 + i * 18}" y="${H - 46}" width="12" height="12" rx="2" fill="${c}"/>`).join('');
  const body = `${heading(t, 56, 64, 'Contribution history', `${fmt(s.totalContributions)} contributions since ${s.since}${s.privateCount ? ', private work included' : ''}, one tower per month`)}
${totals}
${legend}
<text x="${56 + 5 * 18 + 6}" y="${H - 36}" font-size="12.5" class="fa">fewer to more</text>
${yearLabels}${monthLabels}${bars}${beam}${det}`;
  return frame(t, W, H, `Contribution history: ${s.totalContributions} contributions since ${s.since}`, body);
}

// ---------------------------------------------------------------- languages

export function languages(t, s) {
  const W = 1200;
  const langs = s.languages.slice(0, 8);
  const rows = Math.ceil(langs.length / 2);
  const H = 176 + rows * 36;
  const barX = 56, barW = W - 112, barY = 112;
  let x = barX;
  const segs = langs.map((l, i) => {
    const w = barW * l.shareOfShown;
    const seg = `<rect x="${f(x)}" y="${barY}" width="${f(Math.max(0, w - 3))}" height="18" rx="3" fill="${s.langColor(l.name)}"><title>${esc(l.name)}: ${(l.share * 100).toFixed(1)}%</title></rect>`;
    x += w;
    return seg;
  }).join('');
  const legend = langs.map((l, i) => {
    const col = i % 2, row = Math.floor(i / 2);
    const lx = 56 + col * 560, ly = 176 + row * 36;
    return `<rect x="${lx}" y="${ly - 11}" width="12" height="12" rx="2" fill="${s.langColor(l.name)}"/>
<text x="${lx + 22}" y="${ly}" font-size="15">${esc(l.name)}</text>
<text x="${lx + 270}" y="${ly}" font-size="15" text-anchor="end" class="mono">${(l.share * 100).toFixed(1)}%</text>
<text x="${lx + 290}" y="${ly}" font-size="13.5" class="m">${l.repos} repo${l.repos === 1 ? '' : 's'}</text>`;
  }).join('');
  const body = `${heading(t, 56, 52, 'Language mix', 'Each repository counts once, split by its bytes of code, so one large notebook cannot skew the picture')}
${segs}${legend}`;
  return frame(t, W, H, 'Language mix across repositories', body);
}

// ---------------------------------------------------------------- stack matrix

export function stack(t, s) {
  const W = 1200;
  const repos = s.matrixRepos;
  const techs = s.matrixTechs;
  const priv = s.privateCount > 0;
  const rowH = 26, labelW = 200;
  const colW = Math.min(64, (W - 56 - labelW - 110 - (priv ? 90 : 0)) / Math.max(1, repos.length));
  const gridX = 56 + labelW;
  const privX = gridX + repos.length * colW + 44;
  const top = 250;
  const H = top + techs.length * rowH + 44;

  const colLabels = repos.map((r, i) => {
    const x = f(gridX + i * colW + colW / 2);
    const name = r.name.length > 26 ? r.name.slice(0, 25) + '…' : r.name;
    return `<text transform="translate(${x + 4},${top - 16}) rotate(-50)" font-size="12.5" class="m">${esc(name)}</text>`;
  }).join('');

  let lastGroup = null;
  const rows = techs.map((tech, j) => {
    const y = top + j * rowH;
    const groupHead = tech.group !== lastGroup;
    lastGroup = tech.group;
    const dots = repos.map((r, i) => {
      const on = r.stack.some((x) => x.label === tech.label);
      const cx = f(gridX + i * colW + colW / 2);
      return on
        ? `<circle cx="${cx}" cy="${y + 13}" r="6" fill="${tech.group === 'ml' ? t.accent : t.series[1]}"><title>${esc(r.name)} uses ${esc(tech.label)}</title></circle>`
        : `<circle cx="${cx}" cy="${y + 13}" r="2" fill="${t.faint}" fill-opacity="0.5"/>`;
    }).join('') + (priv
      ? tech.private
        ? `<text x="${f(privX)}" y="${y + 18}" font-size="13" text-anchor="middle" class="mono" style="fill:${tech.group === 'ml' ? t.accent : t.series[1]}">${tech.private}</text>`
        : `<circle cx="${f(privX)}" cy="${y + 13}" r="2" fill="${t.faint}" fill-opacity="0.5"/>`
      : '');
    return `${groupHead && j ? `<line x1="56" y1="${y}" x2="${W - 56}" y2="${y}" stroke="${t.rule}"/>` : ''}
<text x="56" y="${y + 18}" font-size="14">${esc(tech.label)}</text>
<text x="${W - 56}" y="${y + 18}" font-size="13" text-anchor="end" class="m mono">${tech.count}</text>
${dots}`;
  }).join('');

  const body = `${heading(t, 56, 52, 'Stack, detected from the code', 'Read from package.json, requirements, notebook imports and READMEs. Amber is ML and vision, teal is web.')}
 ${colLabels}
${priv ? `<text transform="translate(${f(privX + 4)},${top - 16}) rotate(-50)" font-size="12.5" class="m">${s.privateCount} private repos</text>` : ''}
<text x="${W - 56}" y="${top - 12}" font-size="12.5" text-anchor="end" class="fa">repos</text>
${rows}`;
  return frame(t, W, H, 'Technology used per repository', body);
}

// ---------------------------------------------------------------- timeline

export function timeline(t, s, now) {
  const W = 1200;
  const repos = [...s.named].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lane = 27, top = 142, labelW = 330;
  const H = top + repos.length * lane + 40;
  const start = new Date(Date.UTC(new Date(repos[0].createdAt).getUTCFullYear(), 0, 1));
  const end = new Date(Date.UTC(now.getUTCFullYear() + 1, 0, 1));
  const x0 = 56 + labelW, x1 = W - 56;
  const X = (d) => f(x0 + ((new Date(d) - start) / (end - start)) * (x1 - x0));

  const grid = [];
  for (let y = start.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
    const gx = X(Date.UTC(y, 0, 1));
    grid.push(`<line x1="${gx}" y1="${top - 22}" x2="${gx}" y2="${H - 30}" stroke="${t.grid}"/>
<text x="${gx + 6}" y="${top - 26}" font-size="12.5" class="m mono">${y}</text>`);
  }
  const nowX = X(now);
  const lanes = repos.map((r, i) => {
    const y = top + i * lane + 10;
    const a = X(r.createdAt), b = Math.max(X(r.pushedAt), a + 4);
    const col = s.langColor(r.language);
    return `<text x="56" y="${y + 5}" font-size="13.5">${esc(r.name.length > 38 ? r.name.slice(0, 37) + '…' : r.name)}</text>
<line x1="${a}" y1="${y}" x2="${b}" y2="${y}" stroke="${col}" stroke-width="6" stroke-linecap="round"><title>${esc(r.name)}: created ${r.createdAt.slice(0, 10)}, last push ${r.pushedAt.slice(0, 10)}</title></line>
<circle cx="${b}" cy="${y}" r="4.5" fill="${t.bg}" stroke="${col}" stroke-width="2"/>`;
  }).join('');
  const body = `${heading(t, 56, 52, 'Project timeline', `Each bar runs from the day a public repository was created to its latest push${s.privateCount ? `. ${s.privateCount} private repositories are not listed.` : ''}`)}
${grid.join('')}
<line x1="${nowX}" y1="${top - 22}" x2="${nowX}" y2="${H - 30}" stroke="${t.accent}" stroke-dasharray="3 4"/>
<text x="${nowX - 6}" y="${H - 14}" font-size="12" text-anchor="end" class="m">today</text>
${lanes}`;
  return frame(t, W, H, 'Project timeline', body);
}
