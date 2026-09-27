// Rebuilds the profile README and its images from live GitHub data.
// Usage: node .github/profile/generate.mjs   (GH_TOKEN optional locally)

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, listJoin } from './fetch.mjs';
import { THEMES, hero, skyline, languages, stack, timeline } from './svg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const outDir = join(root, 'assets', 'profile');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const monthYear = (iso) => { const d = new Date(iso); return `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };

function derive(config, data, now) {
  const repos = data.repos.filter((r) => r.language || r.stack.length);

  // Languages: every repo counts once, split by its byte share.
  const langTotals = new Map();
  for (const r of repos) {
    const entries = Object.entries(r.languages);
    const sum = entries.reduce((a, [, b]) => a + b, 0);
    if (!sum) continue;
    for (const [name, bytes] of entries) {
      const cur = langTotals.get(name) || { name, weight: 0, repos: 0 };
      cur.weight += bytes / sum;
      if (bytes / sum >= 0.05) cur.repos += 1;
      langTotals.set(name, cur);
    }
  }
  const weightSum = [...langTotals.values()].reduce((a, l) => a + l.weight, 0) || 1;
  const langs = [...langTotals.values()]
    .map((l) => ({ ...l, repos: Math.max(1, l.repos), share: l.weight / weightSum }))
    .filter((l) => l.share >= 0.005)
    .sort((a, b) => b.share - a.share);
  const shown = langs.slice(0, 8);
  const shownSum = shown.reduce((a, l) => a + l.share, 0) || 1;
  shown.forEach((l) => { l.shareOfShown = l.share / shownSum; });
  const langRank = new Map(langs.map((l, i) => [l.name, i]));

  // Contributions bucketed by year and month.
  const created = new Date(data.user.createdAt);
  const byMonth = new Map();
  for (const d of data.calendar) {
    const key = d.date.slice(0, 7);
    byMonth.set(key, (byMonth.get(key) || 0) + d.count);
  }
  const years = [];
  for (let y = created.getUTCFullYear(); y <= now.getUTCFullYear(); y++) {
    const months = MONTHS.map((_, m) => {
      const before = y === created.getUTCFullYear() && m < created.getUTCMonth();
      const after = y === now.getUTCFullYear() && m > now.getUTCMonth();
      return before || after ? null : byMonth.get(`${y}-${String(m + 1).padStart(2, '0')}`) || 0;
    });
    years.push({ year: y, months, total: months.reduce((a, b) => a + (b || 0), 0) });
  }
  const totalContributions = years.reduce((a, y) => a + y.total, 0);
  const busiest = [...years].sort((a, b) => b.total - a.total)[0];

  // Stack.
  const techCount = new Map();
  for (const r of repos) for (const t of r.stack) {
    const cur = techCount.get(t.label) || { ...t, count: 0 };
    cur.count += 1;
    techCount.set(t.label, cur);
  }
  const techs = [...techCount.values()].sort((a, b) => (a.group === b.group ? b.count - a.count : a.group === 'ml' ? -1 : 1));
  const matrixRepos = repos.filter((r) => r.stack.length).sort((a, b) => b.pushedAt.localeCompare(a.pushedAt)).slice(0, 12);
  const mlRepos = repos.filter((r) => r.stack.some((t) => t.group === 'ml')).length;

  const topLangs = langs.slice(0, 3).map((l) => l.name);
  const summaryLines = [
    `${repos.length} public projects, ${mlRepos} of them involving machine learning or computer vision,`,
    `written mostly in ${listJoin(topLangs)}.`,
  ];

  return {
    login: config.login,
    displayName: config.displayName || data.user.name || config.login,
    headline: data.user.bio || config.headline,
    repos,
    languages: shown,
    allLanguages: langs,
    langRank,
    years,
    totalContributions,
    since: monthYear(data.user.createdAt),
    busiest,
    techs,
    matrixRepos,
    matrixTechs: techs,
    summaryLines,
    ledger: [
      { value: String(repos.length), label: 'public repositories' },
      { value: totalContributions.toLocaleString('en-US'), label: `contributions since ${created.getUTCFullYear()}` },
      { value: String(mlRepos), label: 'projects with ML or vision' },
      { value: String(busiest.year), label: `busiest year, ${busiest.total} contributions` },
      { value: String(techs.length), label: 'technologies in use' },
    ],
  };
}

function themed(s, t) {
  return { ...s, langColor: (name) => t.series[Math.min(s.langRank.get(name) ?? 6, 6)] };
}

function picture(login, name, alt, v) {
  // Absolute URLs: GitHub doesn't reliably rewrite relative srcset paths.
  const base = `https://raw.githubusercontent.com/${login}/${login}/main/assets/profile`;
  return `<picture>
  <source media="(prefers-color-scheme: dark)" srcset="${base}/${name}-dark.svg?v=${v}">
  <img alt="${alt}" src="${base}/${name}-light.svg?v=${v}" width="100%">
</picture>`;
}

const mdCell = (s) => String(s).replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();

function readme(config, s, now) {
  const v = now.toISOString().slice(0, 10).replace(/-/g, '');
  const web = s.techs.filter((t) => t.group === 'web').slice(0, 4).map((t) => t.label);
  const VISION_FIRST = ['YOLO', 'MediaPipe', 'TensorFlow', 'OpenCV', 'PyTorch', 'ONNX Runtime'];
  const rank = (t) => (VISION_FIRST.includes(t.label) ? VISION_FIRST.indexOf(t.label) : 99);
  const ml = s.techs.filter((t) => t.group === 'ml').sort((a, b) => rank(a) - rank(b)).slice(0, 4)
    .map((t) => (t.label === 'OpenAI API' ? 'the OpenAI API' : t.label));

  const featured = [...s.repos]
    .filter((r) => r.stack.length && r.descriptionSource !== 'detected' || r.stack.length >= 3)
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt))
    .slice(0, config.featuredCount);
  const rows = featured.map((r) => {
    const built = r.stack.filter((t) => !['TypeScript', 'pandas'].includes(t.label)).slice(0, 5).map((t) => t.label).join(', ');
    const desc = r.description.charAt(0).toUpperCase() + r.description.slice(1);
    return `| [**${mdCell(r.name)}**](${r.url}) | ${mdCell(desc)} | ${mdCell(built || r.language || '')} | ${monthYear(r.pushedAt)} |`;
  });

  const links = config.links.map((l) => `[${l.label}](${l.url})`).join(' and ');
  const date = `${now.getUTCDate()} ${MONTHS[now.getUTCMonth()]} ${now.getUTCFullYear()}`;

  return `<!-- Generated by .github/profile/generate.mjs. Edits here are overwritten daily; change config.json or the generator instead. -->

${picture(config.login, 'hero', `${s.displayName}, ${s.headline}`, v)}

I build web products with ${listJoin(web)}, and computer-vision and machine-learning systems with ${listJoin(ml)}. Several projects join the two: models running inside the browser, next to the interface that uses them.

${config.focus}

Reach me on ${links}.

${picture(config.login, 'skyline', `Contribution history: ${s.totalContributions} contributions since ${s.since}`, v)}

${picture(config.login, 'stack', 'Technologies detected in each repository', v)}

${picture(config.login, 'languages', 'Language mix across repositories', v)}

### Recent work

| Project | What it does | Built with | Last push |
| :-- | :-- | :-- | :-- |
${rows.join('\n')}

${picture(config.login, 'timeline', 'Timeline of every public repository', v)}

<sub>Everything above is generated from the GitHub API and my repositories' code, refreshed daily. Last run ${date}.</sub>
`;
}

async function main() {
  const now = new Date();
  const config = JSON.parse(await readFile(join(here, 'config.json'), 'utf8'));
  // PROFILE_DATA=<file.json> reuses a saved snapshot (handy offline or when rate-limited).
  let data;
  if (process.env.PROFILE_DATA) {
    try { data = JSON.parse(await readFile(process.env.PROFILE_DATA, 'utf8')); } catch { /* not saved yet */ }
  }
  if (!data) {
    data = await collect(config, now);
    if (process.env.PROFILE_DATA) await writeFile(process.env.PROFILE_DATA, JSON.stringify(data));
  }
  if (!data.repos.length) throw new Error('No repositories returned; refusing to overwrite the profile.');
  const s = derive(config, data, now);

  await mkdir(outDir, { recursive: true });
  const renders = { hero, skyline, languages, stack, timeline };
  for (const [themeName, t] of Object.entries(THEMES)) {
    const ts = themed(s, t);
    for (const [name, fn] of Object.entries(renders)) {
      await writeFile(join(outDir, `${name}-${themeName}.svg`), fn(t, ts, now));
    }
  }
  await writeFile(join(root, 'README.md'), readme(config, s, now));
  console.log(`Profile rebuilt: ${s.repos.length} repos, ${s.totalContributions} contributions (${data.calendarSource}), ${s.techs.length} technologies.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
