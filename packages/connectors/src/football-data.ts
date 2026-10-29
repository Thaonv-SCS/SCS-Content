/**
 * football-data.org v4 — kết quả trận đấu. Gói miễn phí: 10 request/phút, có tỉ số nhưng KHÔNG có người ghi bàn.
 * Không trả về RawItem (không phải bài viết) mà là kết quả trận, lưu vào bảng `matches`.
 */

export interface MatchResult {
  id: number;
  competition: string;
  home: string;
  away: string;
  homeScore: number | null;
  awayScore: number | null;
  playedAt: Date;
  raw: unknown;
}

type ApiMatch = {
  id: number;
  utcDate: string;
  status: string;
  competition: { code: string };
  homeTeam: { name: string; shortName: string | null };
  awayTeam: { name: string; shortName: string | null };
  score: { fullTime: { home: number | null; away: number | null } };
};

const ymd = (d: Date) => d.toISOString().slice(0, 10);

export async function fetchMatches(token: string, competitions: string[], from: Date, to: Date): Promise<MatchResult[]> {
  const url =
    `https://api.football-data.org/v4/matches?status=FINISHED` +
    `&dateFrom=${ymd(from)}&dateTo=${ymd(to)}&competitions=${competitions.join(',')}`;
  const res = await fetch(url, { headers: { 'X-Auth-Token': token }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`football-data HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const body = (await res.json()) as { matches: ApiMatch[] };
  return body.matches.map((m) => ({
    id: m.id,
    competition: m.competition.code,
    home: m.homeTeam.shortName ?? m.homeTeam.name,
    away: m.awayTeam.shortName ?? m.awayTeam.name,
    homeScore: m.score.fullTime.home,
    awayScore: m.score.fullTime.away,
    playedAt: new Date(m.utcDate),
    raw: m,
  }));
}
