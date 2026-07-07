/**
 * Stat definitions for the 4 Kiviat profiles + percentile engine.
 *
 * A player object has the shape:
 * {
 *   slug, name, team, position, season, age,
 *   heightCm, weightKg, wingspanCm, handLengthCm, handWidthCm, maxVerticalCm, // combine fields may be null
 *   perGame: { PTS, G, MP, FG_PCT, THREE_PCT, FT_PCT, AST, BLK, STL, TOV, ORB, DRB },
 *   advanced: { PER, TS_PCT, USG_PCT, BPM, DBPM, WS_48, DWS, BLK_PCT, STL_PCT, DREB_PCT, OREB_PCT, TRB_PCT, AST_PCT, TOV_PCT },
 *   shooting: { DUNK_PCT, TWO_PCT, THREE_PCT_SHARE, FT_RATE, CS_PCT, PU_PCT, AST_RATIO }
 * }
 */

// Approximate average height (cm) by position, used ONLY to model the league-wide
// height distribution for the DRB_HT derived stat (BBRef season tables do not expose
// player height, so per-player heights for ~500 league rows cannot be scraped cheaply).
// This is a documented modeling approximation, never used to fabricate an individual
// player's own stats.
const POSITION_AVG_HEIGHT_CM = {
  PG: 188, SG: 196, SF: 201, PF: 206, C: 211
};
// Same rationale as above, for the WEIGHT axis's league-wide reference distribution.
const POSITION_AVG_WEIGHT_KG = {
  PG: 84, SG: 97, SF: 104, PF: 111, C: 118
};

/**
 * Build a deterministic synthetic sample (mean +/- 2 standard deviations, evenly
 * spaced) representing the league-wide distribution of a physical measurement,
 * since BBRef's bulk season tables do not expose player height/weight and
 * fetching every league player's bio page individually is not viable client-side.
 * This never touches an individual player's own displayed value, only the
 * reference population used to compute a percentile.
 */
function buildApproxPhysicalDistribution(positionAverages, stdDev, samplesPerPosition = 21) {
  const values = [];
  Object.values(positionAverages).forEach(mean => {
    for (let i = 0; i < samplesPerPosition; i++) {
      const z = -2 + (4 * i) / (samplesPerPosition - 1);
      values.push(mean + z * stdDev);
    }
  });
  return values.sort((a, b) => a - b);
}
const APPROX_HEIGHT_DISTRIBUTION = buildApproxPhysicalDistribution(POSITION_AVG_HEIGHT_CM, 7);
const APPROX_WEIGHT_DISTRIBUTION = buildApproxPhysicalDistribution(POSITION_AVG_WEIGHT_KG, 10);

function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

// Derived stats computed on-the-fly from a raw player/league row.
const DERIVED = {
  AST_TO: (row) => {
    const ast = getPath(row, 'perGame.AST');
    const tov = getPath(row, 'perGame.TOV');
    if (ast == null || tov == null || tov === 0) return null;
    return ast / tov;
  },
  DRB_HT: (row) => {
    const drebPct = getPath(row, 'advanced.DREB_PCT');
    const height = row.heightCm != null ? row.heightCm : (POSITION_AVG_HEIGHT_CM[row.position] || null);
    if (drebPct == null || !height) return null;
    return (drebPct / height) * 100;
  }
};

function readStat(row, statKey, path) {
  if (DERIVED[statKey]) return DERIVED[statKey](row);
  return getPath(row, path);
}

const PROFILES = {
  general: {
    label: 'Général',
    icon: '🏆',
    color: '#F6AD55',
    axes: [
      { key: 'PTS', label: 'PTS', path: 'perGame.PTS', unit: '' },
      { key: 'G', label: 'G', path: 'perGame.G', unit: '' },
      { key: 'MP', label: 'MP', path: 'perGame.MP', unit: '' },
      { key: 'FG_PCT', label: 'FG%', path: 'perGame.FG_PCT', unit: '%' },
      { key: 'THREE_PCT', label: '3P%', path: 'perGame.THREE_PCT', unit: '%' },
      { key: 'AST', label: 'AST', path: 'perGame.AST', unit: '' },
      { key: 'BLK', label: 'BLK', path: 'perGame.BLK', unit: '' },
      { key: 'STL', label: 'STL', path: 'perGame.STL', unit: '' },
      { key: 'TOV', label: 'TOV', path: 'perGame.TOV', unit: '', inversed: true },
      { key: 'ORB', label: 'ORB', path: 'perGame.ORB', unit: '' },
      { key: 'DRB', label: 'DRB', path: 'perGame.DRB', unit: '' }
    ]
  },
  physique: {
    label: 'Physique',
    icon: '💪',
    color: '#68D391',
    axes: [
      { key: 'HEIGHT', label: 'Taille', path: 'heightCm', unit: 'cm', physical: true, approx: true },
      { key: 'WEIGHT', label: 'Poids', path: 'weightKg', unit: 'kg', physical: true, approx: true },
      { key: 'AGE', label: 'Âge', path: 'age', unit: 'ans', noPercentile: true },
      { key: 'WINGSPAN', label: 'Envergure', path: 'wingspanCm', unit: 'cm', physical: true, combine: true },
      { key: 'HAND_LEN', label: 'Main (long.)', path: 'handLengthCm', unit: 'cm', physical: true, combine: true },
      { key: 'HAND_WID', label: 'Main (larg.)', path: 'handWidthCm', unit: 'cm', physical: true, combine: true },
      { key: 'MAX_VERT', label: 'Saut vertical', path: 'maxVerticalCm', unit: 'cm', physical: true, combine: true }
    ]
  },
  offensif: {
    label: 'Offensif',
    icon: '⚔️',
    color: '#63B3ED',
    axes: [
      { key: 'USG_PCT', label: 'USG%', path: 'advanced.USG_PCT', unit: '%' },
      { key: 'TS_PCT', label: 'TS%', path: 'advanced.TS_PCT', unit: '%' },
      { key: 'AST_PCT', label: 'AST%', path: 'advanced.AST_PCT', unit: '%' },
      { key: 'AST_TO', label: 'AST/TO', path: null, unit: '' },
      { key: 'TOV_PCT', label: 'TOV%', path: 'advanced.TOV_PCT', unit: '%', inversed: true },
      { key: 'FTr', label: 'FTr', path: 'advanced.FT_RATE', unit: '' },
      { key: 'DUNK_PCT', label: 'Dunk%', path: 'shooting.DUNK_PCT', unit: '%' },
      { key: 'TWO_PCT', label: '2P%(tirs)', path: 'shooting.TWO_PCT', unit: '%' },
      { key: 'THREE_PCT_SHARE', label: '3P%(tirs)', path: 'shooting.THREE_PCT_SHARE', unit: '%' },
      { key: 'CS_PCT', label: 'Catch&Shoot%', path: 'shooting.CS_PCT', unit: '%' },
      { key: 'PU_PCT', label: 'Pull-Up%', path: 'shooting.PU_PCT', unit: '%' },
      { key: 'AST_RATIO', label: '% Tirs assistés', path: 'shooting.AST_RATIO', unit: '%' }
    ]
  },
  defensif: {
    label: 'Défensif',
    icon: '🛡️',
    color: '#FC8181',
    axes: [
      { key: 'BLK_PCT', label: 'BLK%', path: 'advanced.BLK_PCT', unit: '%' },
      { key: 'STL_PCT', label: 'STL%', path: 'advanced.STL_PCT', unit: '%' },
      { key: 'DREB_PCT', label: 'DREB%', path: 'advanced.DREB_PCT', unit: '%' },
      { key: 'OREB_PCT', label: 'OREB%', path: 'advanced.OREB_PCT', unit: '%' },
      { key: 'TRB_PCT', label: 'TRB%', path: 'advanced.TRB_PCT', unit: '%' },
      { key: 'DBPM', label: 'DBPM', path: 'advanced.DBPM', unit: '' },
      { key: 'DWS', label: 'DWS', path: 'advanced.DWS', unit: '' },
      { key: 'DRB_HT', label: 'DREB%/Taille', path: null, unit: '', approx: true }
    ]
  }
};

/**
 * Compute the percentile of `value` inside a sorted ascending array of numeric values.
 * Uses (count of values <= v) / total, matching "rang / total x 100".
 */
function percentileOf(sortedAsc, value) {
  if (value == null || Number.isNaN(value) || sortedAsc.length === 0) return null;
  let lo = 0, hi = sortedAsc.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedAsc[mid] <= value) lo = mid + 1;
    else hi = mid;
  }
  return Math.round((lo / sortedAsc.length) * 100);
}

/**
 * Build { statKey: sortedAsc[] } distributions from a league dataset (array of rows),
 * for every axis across all 4 profiles (skipping physical/noPercentile axes).
 */
function buildDistributions(leagueRows) {
  const dist = {};
  dist.HEIGHT = APPROX_HEIGHT_DISTRIBUTION;
  dist.WEIGHT = APPROX_WEIGHT_DISTRIBUTION;
  Object.values(PROFILES).forEach(profile => {
    profile.axes.forEach(axis => {
      if (axis.noPercentile || dist[axis.key]) return;
      const values = leagueRows
        .map(row => readStat(row, axis.key, axis.path))
        .filter(v => v != null && !Number.isNaN(v));
      values.sort((a, b) => a - b);
      dist[axis.key] = values;
    });
  });
  return dist;
}

/**
 * Compute per-axis result for one player against a distributions map.
 * Returns { value, percentile, leagueAvg, available }
 */
function computeAxisResult(player, axis, distributions) {
  const value = readStat(player, axis.key, axis.path);
  const available = value != null && !Number.isNaN(value);

  if (axis.physical && (axis.combine) && !available) {
    return { value: null, percentile: null, leagueAvg: null, available: false, na: true };
  }
  if (!available) {
    return { value: null, percentile: null, leagueAvg: null, available: false, na: true };
  }
  if (axis.noPercentile) {
    return { value, percentile: null, leagueAvg: null, available: true, na: false };
  }

  const dist = distributions[axis.key] || [];
  let percentile = percentileOf(dist, value);
  if (percentile != null && axis.inversed) percentile = 100 - percentile;

  const leagueAvg = dist.length ? dist.reduce((a, b) => a + b, 0) / dist.length : null;

  return { value, percentile, leagueAvg, available: true, na: false };
}

if (typeof module !== 'undefined') {
  module.exports = { PROFILES, percentileOf, buildDistributions, computeAxisResult, readStat, POSITION_AVG_HEIGHT_CM };
}
