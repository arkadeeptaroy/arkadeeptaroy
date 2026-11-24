import { mkdir, writeFile } from 'node:fs/promises';

const user = process.env.GRAPH_USER || 'arkadeeptaroy';
const token = process.env.GITHUB_TOKEN;
if (!token) throw new Error('GITHUB_TOKEN is required');

const end = new Date();
const start = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - 30));
const query = `query($user: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $user) {
    contributionsCollection(from: $from, to: $to) {
      contributionCalendar { weeks { contributionDays { date contributionCount } } }
    }
  }
}`;
const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'arka-profile' },
  body: JSON.stringify({ query, variables: { user, from: start.toISOString(), to: end.toISOString() } }),
});
if (!response.ok) throw new Error('GitHub GraphQL HTTP ' + response.status);
const result = await response.json();
if (result.errors?.length) throw new Error(result.errors.map(e => e.message).join('; '));
const weeks = result.data?.user?.contributionsCollection?.contributionCalendar?.weeks;
if (!Array.isArray(weeks)) throw new Error('No contribution calendar returned');
const counts = new Map(weeks.flatMap(w => w.contributionDays).map(d => [d.date, d.contributionCount]));
const days = Array.from({ length: 31 }, (_, i) => {
  const date = new Date(start.getTime() + i * 86400000).toISOString().slice(0, 10);
  if (!counts.has(date)) throw new Error('Missing contribution day: ' + date);
  return { date, count: counts.get(date) };
});
const total = days.reduce((s, d) => s + d.count, 0);
const active = days.filter(d => d.count > 0).length;
const peak = Math.max(...days.map(d => d.count));
const top = Math.max(4, Math.ceil(peak / 4) * 4);
const left = 55, right = 812, base = 190, height = 116;
const x = i => left + i * (right - left) / 30;
const y = count => base - count / top * height;
const line = days.map((d, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(d.count).toFixed(1)).join(' ');
const area = line + ' L' + right + ' ' + base + ' L' + left + ' ' + base + ' Z';
const grid = Array.from({ length: 5 }, (_, i) => {
  const n = top * i / 4, yy = y(n);
  return '<path d="M'+left+' '+yy+'H'+right+'" stroke="#26303c" stroke-dasharray="3 5"/><text x="42" y="'+(yy+4)+'" text-anchor="end" font-size="10" fill="#8b949e">'+n+'</text>';
}).join('');
const dateLabel = date => date.slice(5).replace('-', '/');
const labels = [0, 7, 14, 21, 30].map(i => '<text x="'+x(i)+'" y="214" text-anchor="'+(i===0?'start':i===30?'end':'middle')+'" font-size="11" fill="#8b949e">'+dateLabel(days[i].date)+'</text>').join('');
const points = days.map((d,i) => '<circle cx="'+x(i).toFixed(1)+'" cy="'+y(d.count).toFixed(1)+'" r="2.4" fill="#58a6ff"><title>'+d.date+': '+d.count+'</title></circle>').join('');
const svg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 840 242" role="img" aria-label="GitHub activity over 31 UTC calendar days: '+total+' contributions, '+active+' active days, peak '+peak+'"><defs><linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop stop-color="#58a6ff" stop-opacity=".23"/><stop offset="1" stop-color="#58a6ff" stop-opacity="0"/></linearGradient></defs><rect x="1" y="1" width="838" height="240" rx="10" fill="#0d1117" stroke="#30363d"/><g font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"><text x="24" y="30" font-size="16" fill="#58a6ff">~/activity</text><text x="816" y="30" text-anchor="end" font-size="11" fill="#8b949e">31 days / UTC</text><text x="24" y="52" font-size="12" fill="#c9d1d9">'+total+' contributions / '+active+' active days / '+peak+' peak</text>'+grid+'<path d="'+area+'" fill="url(#shade)"/><path d="'+line+'" fill="none" stroke="#58a6ff" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'+points+labels+'<text x="816" y="231" text-anchor="end" font-size="10" fill="#8b949e">through '+days[30].date+'</text></g></svg>\n';
await mkdir('assets', { recursive: true });
await writeFile('assets/activity-graph.svg', svg);
