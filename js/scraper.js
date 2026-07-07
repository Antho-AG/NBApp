/**
 * Server-side proxy for NBA.com's internal stats API (stats.nba.com/stats/leaguedashptstats),
 * used for player-tracking stats — Catch & Shoot% and Pull-Up% — that Basketball-Reference
 * does not publish at all.
 *
 * There is no official public API / API key for stats.nba.com; it's the same undocumented
 * endpoint nba.com/stats itself calls client-side. It rejects requests that don't look like
 * they come from a browser on nba.com, hence the header set below (Referer/Origin/
 * x-nba-stats-* headers). Note: NBA.com is known to block requests from some cloud/datacenter
 * IP ranges (including AWS, which Vercel functions run on) — if that happens here, this
 * endpoint returns a normal error response and the app degrades to "N/D" for these two axes
 * only, exactly like any other missing stat. It never breaks the rest of the app.
 */

const ALLOWED_MEASURE_TYPES = new Set(['CatchShoot', 'PullUpShot']);

module.exports = async function handler(req, res) {
  const { season, measureType, seasonType } = req.query;

  if (!season || typeof season !== 'string') {
    res.status(400).json({ error: 'missing_season' });
    return;
  }
  if (!measureType || typeof measureType !== 'string' || !ALLOWED_MEASURE_TYPES.has(measureType)) {
    res.status(400).json({ error: 'invalid_measure_type' });
    return;
  }

  const params = new URLSearchParams({
    College: '', Conference: '', Country: '', DateFrom: '', DateTo: '', Division: '',
    DraftPick: '', DraftYear: '', GameScope: '', Height: '', ISTRound: '', LastNGames: '0',
    LeagueID: '00', Location: '', Month: '0', OpponentTeamID: '0', Outcome: '', PORound: '0',
    PerMode: 'PerGame', PlayerExperience: '', PlayerOrTeam: 'Player', PlayerPosition: '',
    PtMeasureType: measureType, Season: season, SeasonSegment: '',
    SeasonType: seasonType || 'Regular Season', StarterBench: '', TeamID: '0',
    VsConference: '', VsDivision: '', Weight: ''
  });

  const url = `https://stats.nba.com/stats/leaguedashptstats?${params.toString()}`;

  try {
    const upstream = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'application/json, text/plain, */*',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://www.nba.com/',
        'Origin': 'https://www.nba.com',
        'x-nba-stats-origin': 'stats',
        'x-nba-stats-token': 'true'
      }
    });

    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'upstream_error', status: upstream.status });
      return;
    }

    const json = await upstream.json();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    // League-wide tracking numbers move at most once a day; cache for 6h at the edge.
    res.setHeader('Cache-Control', 's-maxage=21600, stale-while-revalidate=86400');
    res.status(200).json(json);
  } catch (e) {
    res.status(502).json({ error: 'fetch_failed', message: String(e && e.message || e) });
  }
};
