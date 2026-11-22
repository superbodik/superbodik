import { writeFileSync, mkdirSync } from 'node:fs';

const token = process.env.GITHUB_TOKEN;
const login = process.env.PROFILE_USER || 'superbodik';
if (!token) throw new Error('GITHUB_TOKEN is required');

const now = new Date();
const from = new Date(now.getTime() - 30 * 24 * 3600 * 1000);

const query = `query($login: String!, $from: DateTime!, $to: DateTime!) {
  user(login: $login) {
    contributionsCollection {
      contributionCalendar {
        totalContributions
        weeks { contributionDays { date contributionCount contributionLevel } }
      }
    }
    recent: contributionsCollection(from: $from, to: $to) {
      totalCommitContributions
      restrictedContributionsCount
      commitContributionsByRepository(maxRepositories: 10) {
        repository { name isPrivate primaryLanguage { name color } }
        contributions { totalCount }
      }
      repositoryContributions(first: 10) {
        nodes { occurredAt repository { name isPrivate primaryLanguage { name color } } }
      }
    }
  }
}`;

const response = await fetch('https://api.github.com/graphql', {
  method: 'POST',
  headers: { Authorization: `bearer ${token}`, 'Content-Type': 'application/json', 'User-Agent': 'profile-renderer' },
  body: JSON.stringify({ query, variables: { login, from: from.toISOString(), to: now.toISOString() } })
});
const payload = await response.json();
if (payload.errors) throw new Error(JSON.stringify(payload.errors));
const user = payload.data.user;

const bg = '#0D1117';
const border = '#30363D';
const text = '#E6EDF3';
const dim = '#8B949E';
const accent = '#FF8FC7';
const sans = "-apple-system,'Segoe UI','Noto Sans',Helvetica,Arial,sans-serif";
const levels = { NONE: '#161B22', FIRST_QUARTILE: '#3D1F30', SECOND_QUARTILE: '#7A2F5A', THIRD_QUARTILE: '#C4568F', FOURTH_QUARTILE: '#FF8FC7' };
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const fmt = d => `${months[d.getUTCMonth()]} ${d.getUTCDate()}`;

const calendar = user.contributionsCollection.contributionCalendar;
const days = calendar.weeks.flatMap(week => week.contributionDays);

let longest = 0, run = 0, longestEnd = null, best = days[0];
for (const day of days) {
  run = day.contributionCount > 0 ? run + 1 : 0;
  if (run > longest) { longest = run; longestEnd = day.date; }
  if (day.contributionCount > best.contributionCount) best = day;
}
let current = 0;
for (let i = days.length - 1; i >= 0; i--) {
  if (days[i].contributionCount > 0) current++;
  else if (i === days.length - 1) continue;
  else break;
}

const cell = 12, gap = 3, left = 44, top = 140;
const width = left + calendar.weeks.length * (cell + gap) + 24;
const height = top + 7 * (cell + gap) + 46;
const cells = [];
const monthLabels = [];
let lastMonth = -1;
calendar.weeks.forEach((week, w) => {
  week.contributionDays.forEach(day => {
    const date = new Date(`${day.date}T00:00:00Z`);
    const x = left + w * (cell + gap);
    const y = top + date.getUTCDay() * (cell + gap);
    cells.push(`<rect x="${x}" y="${y}" width="${cell}" height="${cell}" rx="3" fill="${levels[day.contributionLevel]}"><title>${day.contributionCount} on ${day.date}</title></rect>`);
  });
  const first = new Date(`${week.contributionDays[0].date}T00:00:00Z`);
  if (first.getUTCMonth() !== lastMonth && w < calendar.weeks.length - 1) {
    lastMonth = first.getUTCMonth();
    monthLabels.push(`<text x="${left + w * (cell + gap)}" y="${top - 10}" font-family="${sans}" font-size="11" fill="${dim}">${months[lastMonth]}</text>`);
  }
});

const stat = (x, value, label, sub) => `
  <text x="${x}" y="58" font-family="${sans}" font-size="26" font-weight="600" fill="${accent}">${esc(value)}</text>
  <text x="${x}" y="78" font-family="${sans}" font-size="12" fill="${text}">${esc(label)}</text>
  <text x="${x}" y="94" font-family="${sans}" font-size="11" fill="${dim}">${esc(sub)}</text>`;

const legendX = width - 24 - 5 * (cell + gap) - 70;
const calendarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect x="0.5" y="0.5" width="${width - 1}" height="${height - 1}" rx="10" fill="${bg}" stroke="${border}"/>
  ${stat(24, calendar.totalContributions, 'contributions', 'in the last year')}
  ${stat(214, `${current} ${current === 1 ? 'day' : 'days'}`, 'current streak', current > 0 ? 'keep it going' : 'start a new one today')}
  ${stat(404, `${longest} ${longest === 1 ? 'day' : 'days'}`, 'longest streak', longestEnd ? `ended ${fmt(new Date(`${longestEnd}T00:00:00Z`))}` : '-')}
  ${stat(594, best.contributionCount, 'best day', fmt(new Date(`${best.date}T00:00:00Z`)))}
  ${monthLabels.join('\n  ')}
  <text x="12" y="${top + 1 * (cell + gap) + 10}" font-family="${sans}" font-size="10" fill="${dim}">Mon</text>
  <text x="12" y="${top + 3 * (cell + gap) + 10}" font-family="${sans}" font-size="10" fill="${dim}">Wed</text>
  <text x="12" y="${top + 5 * (cell + gap) + 10}" font-family="${sans}" font-size="10" fill="${dim}">Fri</text>
  ${cells.join('\n  ')}
  <text x="${legendX - 8}" y="${height - 16}" font-family="${sans}" font-size="11" fill="${dim}" text-anchor="end">less</text>
  ${Object.values(levels).map((color, i) => `<rect x="${legendX + i * (cell + gap)}" y="${height - 26}" width="${cell}" height="${cell}" rx="3" fill="${color}"/>`).join('')}
  <text x="${legendX + 5 * (cell + gap) + 6}" y="${height - 16}" font-family="${sans}" font-size="11" fill="${dim}">more</text>
</svg>
`;

const recent = user.recent;
const publicRepos = recent.commitContributionsByRepository.filter(entry => !entry.repository.isPrivate);
const privateCommits = recent.commitContributionsByRepository
  .filter(entry => entry.repository.isPrivate)
  .reduce((sum, entry) => sum + entry.contributions.totalCount, 0) + recent.restrictedContributionsCount;
const created = recent.repositoryContributions.nodes.filter(node => !node.repository.isPrivate);
const maxCommits = Math.max(1, ...publicRepos.map(entry => entry.contributions.totalCount));

const rowHeight = 30;
let y = 92;
const commitRows = publicRepos.map(entry => {
  const count = entry.contributions.totalCount;
  const barWidth = Math.max(6, Math.round(300 * count / maxCommits));
  const color = entry.repository.primaryLanguage?.color || dim;
  const row = `
  <circle cx="30" cy="${y - 4}" r="5" fill="${color}"/>
  <text x="44" y="${y}" font-family="${sans}" font-size="14" fill="${text}">${esc(entry.repository.name)}</text>
  <text x="330" y="${y}" font-family="${sans}" font-size="13" fill="${dim}" text-anchor="end">${count} ${count === 1 ? 'commit' : 'commits'}</text>
  <rect x="350" y="${y - 10}" width="300" height="8" rx="4" fill="#161B22"/>
  <rect x="350" y="${y - 10}" width="${barWidth}" height="8" rx="4" fill="${accent}"/>`;
  y += rowHeight;
  return row;
});
if (privateCommits > 0) {
  commitRows.push(`
  <text x="44" y="${y}" font-family="${sans}" font-size="13" fill="${dim}">+ ${privateCommits} ${privateCommits === 1 ? 'contribution' : 'contributions'} in private repositories</text>`);
  y += rowHeight;
}

let createdBlock = '';
if (created.length > 0) {
  y += 18;
  createdBlock += `
  <text x="24" y="${y}" font-family="${sans}" font-size="12" fill="${dim}" letter-spacing="1">NEW REPOSITORIES</text>`;
  y += 30;
  for (const node of created) {
    const color = node.repository.primaryLanguage?.color || dim;
    createdBlock += `
  <circle cx="30" cy="${y - 4}" r="5" fill="${color}"/>
  <text x="44" y="${y}" font-family="${sans}" font-size="14" fill="${text}">${esc(node.repository.name)}</text>
  <text x="330" y="${y}" font-family="${sans}" font-size="13" fill="${dim}" text-anchor="end">${esc(node.repository.primaryLanguage?.name || '')}</text>
  <text x="650" y="${y}" font-family="${sans}" font-size="13" fill="${dim}" text-anchor="end">${fmt(new Date(node.occurredAt))}</text>`;
    y += rowHeight;
  }
}

const totalCommits = recent.totalCommitContributions + recent.restrictedContributionsCount;
const repoCount = recent.commitContributionsByRepository.length;
const activityHeight = y + 6;
const activitySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="674" height="${activityHeight}" viewBox="0 0 674 ${activityHeight}">
  <rect x="0.5" y="0.5" width="673" height="${activityHeight - 1}" rx="10" fill="${bg}" stroke="${border}"/>
  <text x="24" y="36" font-family="${sans}" font-size="12" fill="${dim}" letter-spacing="1">LAST 30 DAYS</text>
  <text x="24" y="62" font-family="${sans}" font-size="18" font-weight="600" fill="${text}"><tspan fill="${accent}">${totalCommits}</tspan> commits in <tspan fill="${accent}">${repoCount}</tspan> ${repoCount === 1 ? 'repository' : 'repositories'}</text>
  ${commitRows.join('')}
  ${createdBlock}
</svg>
`;

mkdirSync('assets', { recursive: true });
writeFileSync('assets/calendar.svg', calendarSvg);
writeFileSync('assets/activity.svg', activitySvg);
console.log(`calendar: ${calendar.totalContributions} contributions, streak ${current}/${longest}, best ${best.contributionCount} on ${best.date}`);
console.log(`activity: ${totalCommits} commits in ${repoCount} repos, ${publicRepos.length} public shown, ${privateCommits} private, ${created.length} new public repos`);
