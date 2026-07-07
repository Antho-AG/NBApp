/**
 * Server-side proxy for Basketball-Reference requests.
 *
 * Runs as a Vercel serverless function (server-to-server fetch), so the
 * browser's CORS restriction never applies and we no longer depend on
 * free public CORS proxies (corsproxy.io / allorigins / codetabs), which
 * were rate-limited / going down and causing "tous les proxys CORS ont
 * échoué" errors for users.
 */

const ALLOWED_HOST = 'www.basketball-reference.com';

module.exports = async function handler(req, res) {
  const { url } = req.query;

  if (!url || typeof url !== 'string') {
    res.status(400).json({ error: 'missing_url' });
    return;
  }

  let target;
  try {
    target = new URL(url);
  } catch (e) {
    res.status(400).json({ error: 'invalid_url' });
    return;
  }

  if (target.hostname !== ALLOWED_HOST) {
    res.status(400).json({ error: 'host_not_allowed' });
    return;
  }

  try {
    const upstream = await fetch(target.toString(), {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,fr;q=0.8'
      }
    });

    if (upstream.status === 404) {
      res.status(404).json({ error: 'not_found' });
      return;
    }
    if (!upstream.ok) {
      res.status(upstream.status).json({ error: 'upstream_error', status: upstream.status });
      return;
    }

    const html = await upstream.text();
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Cache at Vercel's edge so repeat lookups (same player/season/league page)
    // don't hit Basketball-Reference again for an hour.
    res.setHeader('Cache-Control', 's-maxage=3600, stale-while-revalidate=86400');
    res.status(200).send(html);
  } catch (e) {
    res.status(502).json({ error: 'fetch_failed', message: String(e && e.message || e) });
  }
};
