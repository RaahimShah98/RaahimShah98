// Collects everything the profile shows, straight from GitHub.
// With a token (GitHub Actions) the contribution calendar comes from GraphQL;
// without one (local runs) it is read from the public contributions page.

const API = 'https://api.github.com';
const RAW = 'https://raw.githubusercontent.com';

const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
const headers = {
  'User-Agent': 'profile-generator',
  Accept: 'application/vnd.github+json',
  ...(token ? { Authorization: `Bearer ${token}` } : {}),
};
const anon = { 'User-Agent': headers['User-Agent'], Accept: headers.Accept };

let authFailed = false;

async function getJSON(url) {
  let res = await fetch(url, { headers: authFailed ? anon : headers });
  if (res.status === 401 && !authFailed) {
    // An expired personal token shouldn't stop the daily run; public data needs no auth.
    console.warn('Token rejected; continuing with public, unauthenticated requests.');
    authFailed = true;
    res = await fetch(url, { headers: anon });
  }
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res.json();
}

async function getText(url, maxBytes = 2_000_000) {
  const res = await fetch(url, { headers: { 'User-Agent': 'profile-generator' } });
  if (!res.ok) return null;
  const text = await res.text();
  return text.length > maxBytes ? text.slice(0, maxBytes) : text;
}

// ---------------------------------------------------------------- stack detection

// Each rule: label, group ('web' | 'ml'), and patterns matched against
// dependency names, notebook/python imports and README text.
const TECH = [
  ['Next.js', 'web', { deps: [/^next$/], text: [/\bnext\.?js\b/i] }],
  ['React', 'web', { deps: [/^react$/, /^react-scripts$/], text: [/\breact(\.js)?\b/i] }],
  ['Vue', 'web', { deps: [/^vue$/], text: [/\bvue(\.js)?\b/i] }],
  ['Node.js', 'web', { deps: [/^express$/, /^nodemon$/, /^node-fetch$/], text: [/\bnode\.?js\b/i] }],
  ['Express', 'web', { deps: [/^express$/], text: [/\bexpress(\.js)?\b/i] }],
  ['TypeScript', 'web', { deps: [/^typescript$/], text: [] }],
  ['Tailwind CSS', 'web', { deps: [/^tailwindcss$/], text: [/\btailwind/i] }],
  ['Firebase', 'web', { deps: [/^firebase(-admin)?$/], text: [/\bfirebase\b/i] }],
  ['Auth0', 'web', { deps: [/^@auth0\//], text: [/\bauth0\b/i] }],
  ['MongoDB', 'web', { deps: [/^mongoose$/, /^mongodb$/], text: [/\bmongo(db)?\b/i] }],
  ['MySQL', 'web', { deps: [/^mysql2?$/], text: [/\bmysql\b/i] }],
  ['PostgreSQL', 'web', { deps: [/^pg$/, /^@supabase\//, /^postgres$/], text: [/\bpostgres(ql)?\b/i, /\bsupabase\b/i] }],
  ['Quarkus', 'web', { deps: [], text: [/\bquarkus\b/i] }],
  ['Chart.js', 'web', { deps: [/^chart\.js$/, /^react-chartjs/], text: [] }],
  ['OpenAI API', 'ml', { deps: [/^openai$/], py: [/^openai$/], text: [/\bopenai\b/i] }],
  ['Whisper', 'ml', { deps: [], py: [/^whisper$/], text: [/\bwhisper\b/i] }],
  ['YOLO', 'ml', { deps: [], py: [/^ultralytics$/], text: [/\byolo(v\d+)?\b/i] }],
  ['MediaPipe', 'ml', { deps: [/^@mediapipe\//], py: [/^mediapipe$/], text: [/\bmediapipe\b/i] }],
  ['TensorFlow', 'ml', { deps: [/^@tensorflow\//], py: [/^tensorflow$/, /^keras$/], text: [/\btensorflow\b/i, /\bkeras\b/i] }],
  ['PyTorch', 'ml', { deps: [], py: [/^torch$/], text: [/\bpytorch\b/i] }],
  ['ONNX Runtime', 'ml', { deps: [/^onnxruntime/], py: [/^onnxruntime$/], text: [/\bonnx\b/i] }],
  ['OpenCV', 'ml', { deps: [], py: [/^cv2$/], text: [/\bopencv\b/i] }],
  ['scikit-learn', 'ml', { deps: [], py: [/^sklearn$/], text: [/\bscikit-learn\b/i] }],
  ['Roboflow', 'ml', { deps: [], py: [/^roboflow$/], text: [/\broboflow\b/i] }],
  ['pandas', 'ml', { deps: [], py: [/^pandas$/], text: [] }],
];

function detectStack({ deps, pyImports, text }) {
  const found = [];
  for (const [label, group, rule] of TECH) {
    const hit =
      deps.some((d) => rule.deps.some((re) => re.test(d))) ||
      pyImports.some((m) => (rule.py || []).some((re) => re.test(m))) ||
      (text && rule.text.some((re) => re.test(text)));
    if (hit) found.push({ label, group });
  }
  return found;
}

function pythonImports(source) {
  const mods = new Set();
  // Notebooks store code as JSON strings, so imports may follow "\n or a quote.
  const re = /(?:^|\\n|"|\n)\s*(?:from|import)\s+([A-Za-z_][\w]*)/g;
  let m;
  while ((m = re.exec(source))) mods.add(m[1]);
  return [...mods];
}

// ---------------------------------------------------------------- descriptions

const BOILERPLATE = [
  /bootstrapped with/i, /getting started/i, /create react app/i, /create-next-app/i,
  /here[’']s your readme/i, /npm (run|install|start)/i, /^open \[?http/i, /learn more/i,
  /start editing/i, /localhost/i, /runs the app/i, /development mode/i,
];

// First real sentence of a README, skipping scaffold boilerplate.
function readmeSummary(md) {
  // Untouched framework scaffolds say nothing about the project itself.
  if (!md || /bootstrapped with \[?`?(create-next-app|create react app)/i.test(md)) return null;
  const clean = md
    .replace(/```[\s\S]*?```/g, '')
    .replace(/<[^>]+>/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  const paragraphs = clean
    .split(/\n\s*\n/)
    .map((p) => p.replace(/^#+\s.*$/gm, '').replace(/[*_`>#-]+/g, ' ').replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 50 && !BOILERPLATE.some((re) => re.test(p)) && !/^\d+\./.test(p));
  if (!paragraphs.length) return null;
  const sentence = paragraphs[0].match(/^.*?[.!?](\s|$)/)?.[0].trim() || paragraphs[0];
  return sentence.length > 180 ? sentence.slice(0, 177).replace(/\s\S*$/, '') + '…' : sentence;
}

function fallbackDescription(repo) {
  const kind = repo.stack.some((s) => s.label === 'Next.js')
    ? 'Next.js app'
    : repo.stack.some((s) => s.label === 'React')
      ? 'React app'
      : repo.language === 'Jupyter Notebook' || repo.language === 'Python'
        ? 'Python notebook project'
        : `${repo.language || 'Software'} project`;
  const skip = ['Next.js', 'React', 'TypeScript', 'Tailwind CSS', 'Chart.js', 'pandas'];
  const tools = [...repo.stack].sort((a, b) => (a.group === b.group ? 0 : a.group === 'ml' ? -1 : 1))
    .filter((s) => !skip.includes(s.label)).map((s) => (s.label === 'OpenAI API' ? 'the OpenAI API' : s.label));
  return tools.length ? `${kind} built with ${listJoin(tools.slice(0, 4))}.` : `${kind}.`;
}

export function listJoin(items) {
  if (items.length <= 1) return items.join('');
  return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;
}

// ---------------------------------------------------------------- repositories

// File contents: raw.githubusercontent for public repos, the authenticated
// contents API (raw media type) for private ones.
function fileReader(r) {
  if (!r.private) {
    const base = `${RAW}/${r.full_name}/${r.default_branch}`;
    return (path, max) => getText(`${base}/${path.split('/').map(encodeURIComponent).join('/')}`, max);
  }
  return async (path, max = 2_000_000) => {
    const res = await fetch(`${API}/repos/${r.full_name}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
      { headers: { ...headers, Accept: 'application/vnd.github.raw' } });
    if (!res.ok) return null;
    const text = await res.text();
    return text.length > max ? text.slice(0, max) : text;
  };
}

// Commits on the default branch authored by the user. With per_page=1 the
// "last" page number in the Link header equals the count.
async function authoredCommits(r, login) {
  const res = await fetch(`${API}/repos/${r.full_name}/commits?author=${encodeURIComponent(login)}&per_page=1`,
    { headers: authFailed ? anon : headers });
  if (!res.ok) return 0; // 409 for empty repositories
  const last = res.headers.get('link')?.match(/[?&]page=(\d+)>; rel="last"/);
  if (last) return Number(last[1]);
  const arr = await res.json();
  return Array.isArray(arr) ? arr.length : 0;
}

// Dates (YYYY-MM-DD, UTC) of the user's commits on the default branch.
async function commitDates(r, login, count) {
  const dates = [];
  const pages = Math.min(30, Math.ceil(count / 100));
  for (let page = 1; page <= pages; page++) {
    const res = await fetch(`${API}/repos/${r.full_name}/commits?author=${encodeURIComponent(login)}&per_page=100&page=${page}`,
      { headers: authFailed ? anon : headers });
    if (!res.ok) break;
    const batch = await res.json();
    for (const c of batch) {
      const d = c.commit?.author?.date || c.commit?.committer?.date;
      if (d) dates.push(d.slice(0, 10));
    }
    if (batch.length < 100) break;
  }
  return dates;
}

async function enrichRepo(login, r) {
  const read = fileReader(r);
  const [languages, tree, readme, pkg, commits] = await Promise.all([
    getJSON(r.languages_url).catch(() => ({})),
    getJSON(`${API}/repos/${r.full_name}/contents`).catch(() => []),
    read('README.md'),
    read('package.json'),
    authoredCommits(r, login),
  ]);

  let deps = [];
  if (pkg) {
    try {
      const p = JSON.parse(pkg);
      deps = Object.keys({ ...p.dependencies, ...p.devDependencies });
    } catch { /* not valid JSON, ignore */ }
  }

  const names = Array.isArray(tree) ? tree.map((f) => f.name) : [];
  const pySources = [];
  if (names.includes('requirements.txt')) {
    const req = await read('requirements.txt');
    if (req) pySources.push(req.split('\n').map((l) => `import ${l.split(/[=<>~\[ ]/)[0].trim().replace(/-/g, '_')}`).join('\n'));
  }
  const notebooks = names.filter((n) => n.endsWith('.ipynb') || n.endsWith('.py')).slice(0, 2);
  for (const nb of notebooks) {
    const src = await read(nb, 5_000_000);
    if (src) pySources.push(src);
  }
  const pyImports = pySources.flatMap(pythonImports).map((m) => m.toLowerCase());

  const text = [r.description, readme, (r.topics || []).join(' ')].filter(Boolean).join('\n');
  const repo = {
    name: r.name,
    url: r.html_url,
    homepage: r.homepage || null,
    language: r.language,
    stars: r.stargazers_count,
    forks: r.forks_count,
    size: r.size,
    createdAt: r.created_at,
    pushedAt: r.pushed_at,
    topics: r.topics || [],
    private: Boolean(r.private),
    archived: Boolean(r.archived),
    owned: r.owner?.login?.toLowerCase() === login.toLowerCase(),
    commits,
    commitDates: commits ? await commitDates(r, login, commits) : [],
    languages,
    stack: detectStack({ deps, pyImports, text }),
  };
  if (repo.language == null) {
    const top = Object.entries(languages).sort((a, b) => b[1] - a[1])[0];
    repo.language = top ? top[0] : null;
  }
  repo.description = r.description?.trim() || readmeSummary(readme) || fallbackDescription(repo);
  repo.descriptionSource = r.description?.trim() ? 'description' : readmeSummary(readme) ? 'readme' : 'detected';
  return repo;
}

// Private repositories only ever feed aggregates. Strip anything that could
// identify them before the data leaves this module.
function anonymise(repo, i) {
  return {
    ...repo,
    name: `private-${i + 1}`,
    url: null,
    homepage: null,
    topics: [],
    description: null,
    descriptionSource: 'private',
  };
}

// With a personal token for this account, list every repository it can see:
// owned (public and private), plus collaborator and organisation repositories.
async function listRepos(login) {
  if (token) {
    try {
      const me = await getJSON(`${API}/user`);
      if (me.login?.toLowerCase() === login.toLowerCase()) {
        const all = [];
        for (let page = 1; page <= 10; page++) {
          const batch = await getJSON(`${API}/user/repos?per_page=100&page=${page}&visibility=all&affiliation=owner,collaborator,organization_member&sort=pushed`);
          all.push(...batch);
          if (batch.length < 100) break;
        }
        return { repos: all, mode: 'personal-token' };
      }
      console.warn(`Token belongs to ${me.login ?? 'an app'}, not ${login}; private repositories are skipped.`);
    } catch (err) {
      console.warn(`Could not list private repositories (${err.message}); using public ones.`);
    }
  }
  return { repos: await getJSON(`${API}/users/${login}/repos?per_page=100&type=owner&sort=pushed`), mode: 'public' };
}

// ---------------------------------------------------------------- contributions

async function calendarGraphQL(login, years, now) {
  const out = [];
  let restricted = 0;
  for (const year of years) {
    const q = `query($login:String!,$from:DateTime!,$to:DateTime!){user(login:$login){contributionsCollection(from:$from,to:$to){
      restrictedContributionsCount totalCommitContributions totalPullRequestContributions totalIssueContributions totalPullRequestReviewContributions
      contributionCalendar{weeks{contributionDays{date contributionCount}}}}}}`;
    const res = await fetch(`${API}/graphql`, {
      method: 'POST',
      headers: { ...headers, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: q, variables: { login, from: `${year}-01-01T00:00:00Z`, to: year === now.getUTCFullYear() ? now.toISOString() : `${year}-12-31T23:59:59Z` } }),
    });
    const json = await res.json();
    if (!res.ok || json.errors) throw new Error(`GraphQL: ${JSON.stringify(json.errors || json.message)}`);
    const c = json.data.user.contributionsCollection;
    restricted += c.restrictedContributionsCount;
    for (const w of c.contributionCalendar.weeks) for (const d of w.contributionDays) out.push({ date: d.date, count: d.contributionCount });
  }
  if (restricted) console.log(`${restricted} private contributions are hidden from this token.`);
  return out;
}

async function calendarScrape(login, years) {
  const out = [];
  for (const year of years) {
    const html = await getText(`https://github.com/users/${login}/contributions?from=${year}-01-01&to=${year}-12-31`);
    if (!html) continue;
    // Each day cell has an id, and a <tool-tip for="id"> carrying the count.
    const dates = new Map();
    for (const m of html.matchAll(/data-date="(\d{4}-\d{2}-\d{2})"[^>]*id="([^"]+)"/g)) dates.set(m[2], m[1]);
    for (const m of html.matchAll(/<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g)) {
      const date = dates.get(m[1]);
      if (!date) continue;
      const n = m[2].match(/^(\d+) contribution/);
      out.push({ date, count: n ? Number(n[1]) : 0 });
    }
  }
  return out;
}

// ---------------------------------------------------------------- entry

export async function collect(config, now = new Date()) {
  const login = config.login;
  const user = await getJSON(`${API}/users/${login}`);
  const { repos: rawRepos, mode: repoSource } = await listRepos(login);
  const eligible = rawRepos.filter((r) => !r.fork && !config.exclude.includes(r.name));
  const enriched = [];
  for (let i = 0; i < eligible.length; i += 8) {
    enriched.push(...(await Promise.all(eligible.slice(i, i + 8).map((r) => enrichRepo(login, r)))));
  }
  // Repositories owned by others only count if this user actually committed to them.
  const kept = enriched.filter((r) => r.owned || r.commits > 0);
  let p = 0;
  const repos = kept.map((r) => (r.private ? anonymise(r, p++) : r));
  // Public repositories owned by someone else stay out of the named lists.
  for (const r of repos) if (!r.private && !r.owned) r.contributedOnly = true;

  const firstYear = new Date(user.created_at).getUTCFullYear();
  const years = [];
  for (let y = firstYear; y <= now.getUTCFullYear(); y++) years.push(y);

  let calendar;
  let calendarSource = 'graphql';
  try {
    if (!token || authFailed) throw new Error('no usable token');
    calendar = await calendarGraphQL(login, years, now);
  } catch (err) {
    if (token) console.warn(`GraphQL calendar failed (${err.message}); falling back to the public page.`);
    calendarSource = token && !authFailed ? `public-page (graphql failed: ${String(err.message).slice(0, 120)})` : 'public-page';
    calendar = await calendarScrape(login, years);
  }
  // GitHub's calendar leaves out private work unless the profile opts in, so
  // merge in authored commits from every repository. Taking the larger count
  // per day means nothing is counted twice.
  const commitDays = new Map();
  for (const r of repos) {
    for (const d of r.commitDates) commitDays.set(d, (commitDays.get(d) || 0) + 1);
    delete r.commitDates;
  }
  const merged = new Map(calendar.map((d) => [d.date, d.count]));
  for (const [date, n] of commitDays) merged.set(date, Math.max(merged.get(date) || 0, n));
  calendar = [...merged].map(([date, count]) => ({ date, count }));
  if (commitDays.size) calendarSource += '+commits';

  const today = now.toISOString().slice(0, 10);
  calendar = calendar.filter((d) => d.date <= today).sort((a, b) => a.date.localeCompare(b.date));

  return {
    generatedAt: now.toISOString(),
    user: {
      login,
      name: user.name,
      bio: user.bio,
      followers: user.followers,
      publicRepos: user.public_repos,
      createdAt: user.created_at,
      url: user.html_url,
    },
    repos,
    repoSource,
    calendar,
    calendarSource,
  };
}
