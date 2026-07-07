/**
 * BBRef data collection layer.
 *
 * Basketball-Reference has no official API and blocks direct cross-origin
 * requests from a browser, so every request goes through a public CORS proxy.
 * Some BBRef tables (advanced, shooting) are shipped wrapped inside an HTML
 * comment when JS hasn't run server-side to "reveal" them — getTable() below
 * unwraps those comments before parsing.
 */

const BBREF_BASE = 'https://www.basketball-reference.com';

class ProxyError extends Error {}
class PlayerNotFoundError extends Error {}

// Requests go through our own Vercel serverless function (/api/bbref), which
// fetches Basketball-Reference server-to-server. This avoids the browser's
// CORS restriction entirely and removes the dependency on free public CORS
// proxies (corsproxy.io / allorigins / codetabs), which were unreliable and
// caused "tous les proxys CORS ont échoué" errors.
async function fetchViaProxy(url) {
  let res;
  try {
    res = await fetch(`/api/bbref?url=${encodeURIComponent(url)}`);
  } catch (e) {
    throw new ProxyError('Basketball-Reference inaccessible — vérifiez votre connexion et réessayez dans quelques instants');
  }
  if (res.status === 404) throw new PlayerNotFoundError('Joueur non trouvé sur Basketball-Reference');
  if (!res.ok) {
    let detail = res.status;
    try {
      const body = await res.json();
      detail = body.error || detail;
    } catch (e) {
      // response wasn't JSON, keep the status code
    }
    throw new ProxyError(`Basketball-Reference inaccessible (${detail}), réessayez dans quelques instants`);
  }
  return res.text();
}

function parseHtml(html) {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** Find a table by id, unwrapping BBRef's HTML-comment-hidden tables if needed. */
function getTable(doc, rawHtml, tableId) {
  let table = doc.getElementById(tableId);
  if (table) return table;

  const commentRegex = /<!--([\s\S]*?)-->/g;
  let match;
  while ((match = commentRegex.exec(rawHtml))) {
    if (match[1].includes(`id="${tableId}"`)) {
      const innerDoc = parseHtml(match[1]);
      table = innerDoc.getElementById(tableId);
      if (table) return table;
    }
  }
  return null;
}

/** Parse a BBRef table's <tbody> rows into objects keyed by data-stat, skipping repeated header rows. */
function parseTableRows(table) {
  if (!table) return [];
  const tbody = table.querySelector('tbody');
  if (!tbody) return [];
  const rows = [...tbody.querySelectorAll('tr')].filter(tr => !tr.classList.contains('thead'));
  return rows.map(tr => {
    const obj = {};
    tr.querySelectorAll('[data-stat]').forEach(cell => {
      const stat = cell.getAttribute('data-stat');
      obj[stat] = cell.textContent.trim();
    });
    const link = tr.querySelector('[data-stat="name_display"] a, th[data-stat="player"] a, td[data-stat="player"] a');
    if (link) {
      const m = link.getAttribute('href').match(/\/players\/\w\/([\w]+)\.html/);
      if (m) obj._slug = m[1];
    }
    return obj;
  });
}

function num(v) {
  if (v == null || v === '') return null;
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

/** ---- Player search / autocomplete ---- */
async function searchPlayers(query) {
  if (!query || query.trim().length < 2) return [];
  const url = `${BBREF_BASE}/search/search.fcgi?search=${encodeURIComponent(query)}`;
  const html = await fetchViaProxy(url);
  const doc = parseHtml(html);

  const results = [];
  const seen = new Set();
  doc.querySelectorAll('a[href*="/players/"]').forEach(a => {
    const m = a.getAttribute('href').match(/\/players\/(\w)\/(\w+)\.html$/);
    if (!m) return;
    const slug = m[2];
    if (seen.has(slug)) return;
    const name = a.textContent.trim();
    if (!name) return;
    seen.add(slug);
    results.push({ slug, name });
  });

  // If BBRef redirected straight to a single player page (unambiguous match),
  // build a single suggestion from the page title instead.
  if (results.length === 0) {
    const h1 = doc.querySelector('h1 span');
    const m = html.match(/\/players\/\w\/(\w+)\.html/);
    if (h1 && m) results.push({ slug: m[1], name: h1.textContent.trim() });
  }

  return results.slice(0, 8);
}

/** ---- Season helpers ---- */
function currentSeasonEndYear(now = new Date()) {
  const month = now.getMonth(); // 0-indexed
  return month >= 9 ? now.getFullYear() + 1 : now.getFullYear();
}
function seasonLabel(endYear) {
  const start = endYear - 1;
  return `${start}-${String(endYear).slice(-2)}`;
}
function listSeasons() {
  const latest = currentSeasonEndYear();
  const seasons = [];
  for (let y = latest; y >= 1980; y--) seasons.push({ endYear: y, label: seasonLabel(y) });
  return seasons;
}

/** ---- Bio / physical parsing from a player's main page ---- */
function parseBio(doc, html, seasonLabelStr) {
  const meta = doc.querySelector('#meta');
  const text = meta ? meta.textContent : html;

  const bio = { heightCm: null, weightKg: null, age: null, position: null, team: null };

  const hw = text.match(/\((\d{2,3})cm,\s*(\d{2,3})kg\)/);
  if (hw) {
    bio.heightCm = parseInt(hw[1], 10);
    bio.weightKg = parseInt(hw[2], 10);
  }

  const posMatch = text.match(/Position:\s*([A-Za-z\-\/ ]+?)(?:▪|▪|\n|Shoot)/);
  if (posMatch) {
    const raw = posMatch[1].trim();
    const abbrevMap = { 'Point Guard': 'PG', 'Shooting Guard': 'SG', 'Small Forward': 'SF', 'Power Forward': 'PF', 'Center': 'C' };
    const firstWord = Object.keys(abbrevMap).find(k => raw.includes(k));
    bio.position = firstWord ? abbrevMap[firstWord] : raw.split(/[\s\-\/]/)[0].slice(0, 2).toUpperCase();
  }

  // Age as of the selected season: derive from birth date + season start year.
  const birthMatch = html.match(/data-birth="(\d{4})-(\d{2})-(\d{2})"/);
  if (birthMatch && seasonLabelStr) {
    const birthYear = parseInt(birthMatch[1], 10);
    const seasonStartYear = parseInt(seasonLabelStr.split('-')[0], 10);
    bio.age = seasonStartYear - birthYear;
  }

  const teamLink = meta ? meta.querySelector('a[href*="/teams/"]') : null;
  bio.team = teamLink ? teamLink.textContent.trim() : null;

  // Draft Combine measurements are not published per-player on BBRef in a
  // stable, reliably-scrapable location — never fabricated, always N/D unless found.
  bio.wingspanCm = null;
  bio.handLengthCm = null;
  bio.handWidthCm = null;
  bio.maxVerticalCm = null;

  return bio;
}

function findSeasonRow(rows, seasonStr) {
  const matches = rows.filter(r => r.season === seasonStr);
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0];
  return matches.find(r => r.team_id === 'TOT') || matches[matches.length - 1];
}

function extractPerGame(rows, seasonStr) {
  const row = findSeasonRow(rows, seasonStr);
  if (!row) return null;
  return {
    PTS: num(row.pts_per_g), G: num(row.g), MP: num(row.mp_per_g),
    FG_PCT: num(row.fg_pct) != null ? num(row.fg_pct) * 100 : null,
    THREE_PCT: num(row.fg3_pct) != null ? num(row.fg3_pct) * 100 : null,
    FT_PCT: num(row.ft_pct) != null ? num(row.ft_pct) * 100 : null,
    AST: num(row.ast_per_g), BLK: num(row.blk_per_g), STL: num(row.stl_per_g),
    TOV: num(row.tov_per_g), ORB: num(row.orb_per_g), DRB: num(row.drb_per_g)
  };
}

function extractAdvanced(rows, seasonStr) {
  const row = findSeasonRow(rows, seasonStr);
  if (!row) return null;
  return {
    PER: num(row.per),
    TS_PCT: num(row.ts_pct) != null ? num(row.ts_pct) * 100 : null,
    USG_PCT: num(row.usg_pct),
    BPM: num(row.bpm), DBPM: num(row.dbpm), WS_48: num(row.ws_per_48), DWS: num(row.dws),
    BLK_PCT: num(row.blk_pct), STL_PCT: num(row.stl_pct),
    DREB_PCT: num(row.drb_pct), OREB_PCT: num(row.orb_pct), TRB_PCT: num(row.trb_pct),
    AST_PCT: num(row.ast_pct), TOV_PCT: num(row.tov_pct),
    FT_RATE: num(row.fta_per_fga_pct)
  };
}

function extractShooting(rows, seasonStr) {
  const row = findSeasonRow(rows, seasonStr);
  if (!row) return { DUNK_PCT: null, TWO_PCT: null, THREE_PCT_SHARE: null, CS_PCT: null, PU_PCT: null, AST_RATIO: null };
  const pctAst2 = num(row.fg_pct_ast_2p);
  const pctAst3 = num(row.fg_pct_ast_3p);
  const astRatio = (pctAst2 != null || pctAst3 != null)
    ? ((pctAst2 || 0) + (pctAst3 || 0)) / ((pctAst2 != null ? 1 : 0) + (pctAst3 != null ? 1 : 0)) * 100
    : null;
  return {
    DUNK_PCT: num(row.pct_fga_dunk) != null ? num(row.pct_fga_dunk) * 100 : null,
    TWO_PCT: num(row.pct_fga_02p) != null ? num(row.pct_fga_02p) * 100 : null,
    THREE_PCT_SHARE: num(row.pct_fga_03p) != null ? num(row.pct_fga_03p) * 100 : null,
    // NBA.com/Synergy tracking stats (Catch&Shoot%, Pull-Up%) are not published on
    // Basketball-Reference at all — always N/D, never approximated.
    CS_PCT: null,
    PU_PCT: null,
    AST_RATIO: astRatio
  };
}

/** Fetch full profile for one player+season. Uses sessionStorage cache. */
async function fetchPlayerProfile(slug, seasonStr) {
  const cacheKey = `nba-player:${slug}:${seasonStr}`;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) return JSON.parse(cached);

  const initial = slug[0];
  const playerUrl = `${BBREF_BASE}/players/${initial}/${slug}.html`;
  const shootingUrl = `${BBREF_BASE}/players/${initial}/${slug}/shooting/${seasonStr.split('-')[0]}`;

  const html = await fetchViaProxy(playerUrl);
  const doc = parseHtml(html);

  const nameEl = doc.querySelector('h1 span');
  const name = nameEl ? nameEl.textContent.trim() : slug;

  const perGameTable = getTable(doc, html, 'per_game');
  const advancedTable = getTable(doc, html, 'advanced');
  const perGameRows = parseTableRows(perGameTable);
  const advancedRows = parseTableRows(advancedTable);

  const bio = parseBio(doc, html, seasonStr);

  let shooting = { DUNK_PCT: null, TWO_PCT: null, THREE_PCT_SHARE: null, CS_PCT: null, PU_PCT: null, AST_RATIO: null };
  try {
    const shootingHtml = await fetchViaProxy(shootingUrl);
    const shootingDoc = parseHtml(shootingHtml);
    const shootingRows = parseTableRows(getTable(shootingDoc, shootingHtml, 'shooting'));
    shooting = extractShooting(shootingRows, seasonStr);
  } catch (e) {
    // Shooting detail is a nice-to-have; missing it degrades to N/D axes, not a hard failure.
  }

  const perGame = extractPerGame(perGameRows, seasonStr);
  const advanced = extractAdvanced(advancedRows, seasonStr);

  if (!perGame && !advanced) {
    throw new PlayerNotFoundError(`Aucune statistique pour ${name} en saison ${seasonStr}`);
  }

  const seasonRow = findSeasonRow(perGameRows, seasonStr) || findSeasonRow(advancedRows, seasonStr);

  const profile = {
    slug, name, season: seasonStr,
    team: seasonRow ? seasonRow.team_name_abbr || seasonRow.team_id : bio.team,
    position: (seasonRow && seasonRow.pos) || bio.position,
    age: bio.age,
    heightCm: bio.heightCm, weightKg: bio.weightKg,
    wingspanCm: bio.wingspanCm, handLengthCm: bio.handLengthCm, handWidthCm: bio.handWidthCm, maxVerticalCm: bio.maxVerticalCm,
    perGame: perGame || {}, advanced: advanced || {}, shooting
  };

  sessionStorage.setItem(cacheKey, JSON.stringify(profile));
  return profile;
}

/** ---- League-wide reference population for percentile computation ---- */
async function fetchLeagueDataset(seasonStr, minMinutes) {
  const endYear = parseInt(seasonStr.split('-')[0], 10) + 1;
  const cacheKey = `nba-league-raw:${seasonStr}`;
  let raw = null;
  const cached = sessionStorage.getItem(cacheKey);
  if (cached) {
    raw = JSON.parse(cached);
  } else {
    const [perGameHtml, advancedHtml] = await Promise.all([
      fetchViaProxy(`${BBREF_BASE}/leagues/NBA_${endYear}_per_game.html`),
      fetchViaProxy(`${BBREF_BASE}/leagues/NBA_${endYear}_advanced.html`)
    ]);
    const perGameDoc = parseHtml(perGameHtml);
    const advancedDoc = parseHtml(advancedHtml);
    const perGameRows = parseTableRows(getTable(perGameDoc, perGameHtml, 'per_game_stats') || getTable(perGameDoc, perGameHtml, 'totals_stats'));
    const advancedRows = parseTableRows(getTable(advancedDoc, advancedHtml, 'advanced_stats') || getTable(advancedDoc, advancedHtml, 'advanced'));

    // A traded player has one row per team plus a combined "TOT" row; prefer TOT.
    const bySlug = {};
    perGameRows.forEach(r => {
      if (!r._slug) return;
      const existing = bySlug[r._slug];
      if (!existing || r.team_id === 'TOT') bySlug[r._slug] = { ...existing, pg: r };
    });
    advancedRows.forEach(r => {
      if (!r._slug) return;
      const existing = bySlug[r._slug] || {};
      if (!existing.adv || r.team_id === 'TOT') bySlug[r._slug] = { ...existing, adv: r };
    });

    raw = Object.entries(bySlug)
      .filter(([, v]) => v.pg && v.adv)
      .map(([slug, v]) => ({
        slug, position: v.pg.pos || v.adv.pos, name: v.pg.name_display || v.pg.player,
        perGame: extractPerGameFlat(v.pg),
        advanced: extractAdvancedFlat(v.adv)
      }));

    sessionStorage.setItem(cacheKey, JSON.stringify(raw));
  }

  return raw.filter(r => r.perGame && r.perGame.MP != null && r.perGame.MP >= minMinutes);
}

// League bulk tables don't carry a `season` column per row (one row = one season already),
// so these flat extractors read fields directly instead of matching a season string.
function extractPerGameFlat(row) {
  return {
    PTS: num(row.pts_per_g), G: num(row.g), MP: num(row.mp_per_g),
    FG_PCT: num(row.fg_pct) != null ? num(row.fg_pct) * 100 : null,
    THREE_PCT: num(row.fg3_pct) != null ? num(row.fg3_pct) * 100 : null,
    FT_PCT: num(row.ft_pct) != null ? num(row.ft_pct) * 100 : null,
    AST: num(row.ast_per_g), BLK: num(row.blk_per_g), STL: num(row.stl_per_g),
    TOV: num(row.tov_per_g), ORB: num(row.orb_per_g), DRB: num(row.drb_per_g)
  };
}
function extractAdvancedFlat(row) {
  return {
    PER: num(row.per),
    TS_PCT: num(row.ts_pct) != null ? num(row.ts_pct) * 100 : null,
    USG_PCT: num(row.usg_pct),
    BPM: num(row.bpm), DBPM: num(row.dbpm), WS_48: num(row.ws_per_48), DWS: num(row.dws),
    BLK_PCT: num(row.blk_pct), STL_PCT: num(row.stl_pct),
    DREB_PCT: num(row.drb_pct), OREB_PCT: num(row.orb_pct), TRB_PCT: num(row.trb_pct),
    AST_PCT: num(row.ast_pct), TOV_PCT: num(row.tov_pct),
    FT_RATE: num(row.fta_per_fga_pct)
  };
}

if (typeof module !== 'undefined') {
  module.exports = {
    fetchPlayerProfile, fetchLeagueDataset, searchPlayers, listSeasons, seasonLabel, currentSeasonEndYear,
    ProxyError, PlayerNotFoundError
  };
}
