/**
 * Generates assets/stats.svg from the GitHub GraphQL API.
 *
 * Usage:
 *   GITHUB_TOKEN=<token> node scripts/gen-stats.mjs          # fetch live
 *   node scripts/gen-stats.mjs path/to/graphql-response.json # from a saved file
 *
 * The card is a plain SVG with an internal <style> block, so it follows the
 * viewer's light/dark mode and needs no third-party rendering service.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";

const USER = "shima78";

const QUERY = `{
  user(login: "${USER}") {
    followers { totalCount }
    contributionsCollection {
      totalCommitContributions
      totalPullRequestContributions
    }
    repositories(first: 100, ownerAffiliations: OWNER, isFork: false, orderBy: {field: STARGAZERS, direction: DESC}) {
      totalCount
      nodes {
        stargazerCount
        forkCount
        languages(first: 10, orderBy: {field: SIZE, direction: DESC}) {
          edges { size node { name color } }
        }
      }
    }
  }
}`;

async function getData() {
  const fileArg = process.argv[2];
  if (fileArg) return JSON.parse(readFileSync(fileArg, "utf8"));

  const token = process.env.GITHUB_TOKEN || process.env.ACCESS_TOKEN;
  if (!token) throw new Error("Set GITHUB_TOKEN, or pass a saved JSON response as arg 1.");

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: { Authorization: `bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: QUERY }),
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  return res.json();
}

const raw = await getData();
const u = raw.data.user;
const repos = u.repositories.nodes;

const stars = repos.reduce((s, r) => s + r.stargazerCount, 0);
const forks = repos.reduce((s, r) => s + r.forkCount, 0);
const commits = u.contributionsCollection.totalCommitContributions;
const prs = u.contributionsCollection.totalPullRequestContributions;
const followers = u.followers.totalCount;
const repoCount = u.repositories.totalCount;

// Language mix: cap each repo's per-language bytes and drop notebook noise so a
// single vendored bundle can't dominate.
const CAP = 300_000;
const SKIP = new Set(["Jupyter Notebook"]);
const bytes = {};
const color = {};
for (const r of repos) {
  for (const e of r.languages.edges) {
    if (SKIP.has(e.node.name)) continue;
    bytes[e.node.name] = (bytes[e.node.name] || 0) + Math.min(e.size, CAP);
    color[e.node.name] = e.node.color || "#8b5cf6";
  }
}
const total = Object.values(bytes).reduce((a, b) => a + b, 0) || 1;
const top = Object.entries(bytes)
  .sort((a, b) => b[1] - a[1])
  .slice(0, 6)
  .map(([name, b]) => ({ name, pct: (b / total) * 100, color: color[name] }));

const W = 470, H = 238;
const fmt = (n) => n.toLocaleString("en-US");

const statRows = [
  ["Repositories", repoCount],
  ["Stars earned", stars],
  ["Forks", forks],
  ["Followers", followers],
  ["Commits (past year)", commits],
  ["Pull requests", prs],
];

const stats = statRows
  .map(([label, val], i) => {
    const x = 28 + (i % 2) * 220;
    const y = 74 + Math.floor(i / 2) * 30;
    return `
    <text x="${x}" y="${y}" class="label">${label}</text>
    <text x="${x + 200}" y="${y}" class="value" text-anchor="end">${fmt(val)}</text>`;
  })
  .join("");

const barX = 28, barW = W - 56, barY = 178, barH = 9;
let acc = 0;
const segs = top
  .map((l) => {
    const w = (l.pct / 100) * barW;
    const seg = `<rect x="${(barX + acc).toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${l.color}" />`;
    acc += w;
    return seg;
  })
  .join("");

const legend = top
  .map((l, i) => {
    const x = 28 + (i % 3) * 148;
    const y = 202 + Math.floor(i / 3) * 16;
    return `
    <circle cx="${x + 4}" cy="${y - 3}" r="4" fill="${l.color}" />
    <text x="${x + 14}" y="${y}" class="legend">${l.name} ${l.pct.toFixed(1)}%</text>`;
  })
  .join("");

const svg = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" fill="none" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="GitHub statistics for Zahra">
  <style>
    .bg     { fill: #fffefe; stroke: #e4e2e2; }
    .title  { fill: #8b5cf6; font: 600 18px 'Segoe UI', Ubuntu, Sans-Serif; }
    .name   { fill: #768390; font: 400 12px 'Segoe UI', Ubuntu, Sans-Serif; }
    .label  { fill: #434d58; font: 400 13px 'Segoe UI', Ubuntu, Sans-Serif; }
    .value  { fill: #434d58; font: 700 13px 'Segoe UI', Ubuntu, Sans-Serif; }
    .legend { fill: #434d58; font: 400 11px 'Segoe UI', Ubuntu, Sans-Serif; }
    .track  { fill: #ededed; }
    .divider{ stroke: #e4e2e2; }
    @media (prefers-color-scheme: dark) {
      .bg     { fill: #0d1117; stroke: #21262d; }
      .title  { fill: #a78bfa; }
      .label  { fill: #adbac7; }
      .value  { fill: #adbac7; }
      .legend { fill: #adbac7; }
      .track  { fill: #21262d; }
      .divider{ stroke: #21262d; }
    }
  </style>
  <rect class="bg" x="0.5" y="0.5" rx="8" width="${W - 1}" height="${H - 1}" />
  <text x="28" y="36" class="title">GitHub Overview</text>
  <text x="28" y="52" class="name">@${USER} · updated ${new Date().toISOString().slice(0, 10)}</text>
  ${stats}
  <line x1="28" y1="153" x2="${W - 28}" y2="153" class="divider" />
  <text x="28" y="171" class="name">Top languages</text>
  <rect class="track" x="${barX}" y="${barY}" rx="4.5" width="${barW}" height="${barH}" />
  <clipPath id="r"><rect x="${barX}" y="${barY}" rx="4.5" width="${barW}" height="${barH}" /></clipPath>
  <g clip-path="url(#r)">${segs}</g>
  ${legend}
</svg>
`;

mkdirSync("assets", { recursive: true });
writeFileSync("assets/stats.svg", svg);
console.log(`assets/stats.svg written — repos ${repoCount}, stars ${stars}, commits ${commits}`);
console.log("languages:", top.map((l) => `${l.name} ${l.pct.toFixed(1)}%`).join(", "));
