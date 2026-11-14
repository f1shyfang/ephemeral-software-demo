import type { Section } from './schema.js';
export type GithubItem = { number: number; title: string; url: string; state: string; labels: string[]; assignees: string[]; updated: string; repository: string; description: string; kind: 'issue'|'pull' };
export type GithubResult = { items: GithubItem[]; total: number; incomplete: boolean; query: string };
export function searchQuery(repository: string, section: Section, login: string) {
  const q = section.query;
  const quote = (value: string) => JSON.stringify(value.replace(/[\r\n]/g, ' '));
  const terms = [`repo:${repository}`, q.kind === 'pulls' ? 'is:pr' : 'is:issue'];
  if (q.state !== 'all') terms.push(`is:${q.state}`);
  for (const label of q.labels) terms.push(`label:${quote(label)}`);
  if (q.assignee) {
    const assignee = q.assignee === '@me' ? login : q.assignee.replace(/^@/, '');
    if (!assignee || !/^[\w-]+$/.test(assignee)) throw Error('A GitHub account is needed to filter by assignee. Connect GitHub and try again.');
    terms.push(`assignee:${assignee}`);
  }
  if (q.reviewRequested) {
    if (!login) throw Error('Connect GitHub to find PRs waiting for your review.');
    terms.push(`review-requested:${login}`);
  }
  // Plain search text is quoted so it cannot override the selected repository scope.
  if (q.text.trim()) terms.push(quote(q.text.trim()));
  return terms.join(' ');
}
export async function githubJson(path: string, token: string, signal?: AbortSignal, fetcher = fetch): Promise<any> {
  const res = await fetcher(`https://api.github.com${path}`, { headers: {
    accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', 'user-agent': 'Ephemeral-GitHub-Demo', ...(token ? { authorization: `Bearer ${token}` } : {}),
  }, signal: signal ?? AbortSignal.timeout(15000) });
  if (!res.ok) {
    if (res.status === 403 || res.status === 429) throw Error('GitHub rate limit or access restriction. Wait a minute, or check repository access, then retry.');
    if (res.status === 401) throw Error('GitHub authentication expired. Run gh auth login and restart the demo.');
    if (res.status === 422 || res.status === 404) throw Error('GitHub could not search this repository. Check its name and your access.');
    throw Error(`GitHub request failed (${res.status}). Try again.`);
  }
  return res.json();
}
export async function searchGithub(repository: string, section: Section, token: string, login: string, signal?: AbortSignal, fetcher = fetch): Promise<GithubResult> {
  const query = searchQuery(repository, section, login);
  const params = new URLSearchParams({ q: query, sort: section.query.sort, order: 'desc', per_page: '100' });
  const data = await githubJson(`/search/issues?${params}`, token, signal, fetcher);
  if (!Array.isArray(data.items)) throw Error('GitHub returned an unexpected response.');
  return { total: data.total_count, incomplete: !!data.incomplete_results, query, items: data.items.map((x: any) => ({
    number: x.number, title: String(x.title), url: `https://github.com/${repository}/${x.pull_request ? 'pull' : 'issues'}/${x.number}`,
    state: String(x.state), labels: (x.labels ?? []).map((l: any) => typeof l === 'string' ? l : String(l.name)),
    assignees: (x.assignees ?? []).map((a: any) => String(a.login)), updated: String(x.updated_at), repository,
    description: String(x.body ?? '').slice(0, 400), kind: x.pull_request ? 'pull' : 'issue',
  })) };
}
