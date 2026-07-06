/**
 * Chart.js radar ("Kiviat") rendering for the 4 profiles.
 * Every axis is always plotted in percentile space (0-100); raw values only
 * ever appear in tooltips and the detail table, never on the chart itself.
 */

const PLAYER_COLORS = ['#58A6FF', '#FF6B6B', '#4ECDC4'];
const PLAYER_BG = ['rgba(88,166,255,0.15)', 'rgba(255,107,107,0.15)', 'rgba(78,205,196,0.15)'];

const kiviatCharts = {}; // profileKey -> Chart instance

function formatValue(value, unit) {
  if (value == null) return 'N/D';
  const rounded = Math.abs(value) < 10 ? Math.round(value * 10) / 10 : Math.round(value);
  return `${rounded}${unit || ''}`;
}

function buildTooltipLines(profileKey, axisIndex, playersMeta, minMinutes) {
  const axis = PROFILES[profileKey].axes[axisIndex];
  const lines = [`📊 ${axis.label}`];
  playersMeta.forEach(({ player, results }, i) => {
    const r = results[axis.key];
    if (!r || r.na) {
      lines.push(`${player.name}: N/D`);
      return;
    }
    let line = `${player.name} — Valeur: ${formatValue(r.value, axis.unit)}`;
    if (r.percentile != null) line += ` | Centile: ${r.percentile}e`;
    lines.push(line);
  });
  const refRow = playersMeta[0] && playersMeta[0].results[axis.key];
  if (refRow && refRow.leagueAvg != null) lines.push(`Moy. référence: ${formatValue(refRow.leagueAvg, axis.unit)}`);
  if (axis.approx) lines.push('⚠ Centile approximatif (taille moyenne par poste)');
  if (axis.combine && refRow && refRow.na) lines.push('Donnée Draft Combine non disponible');
  lines.push(`Min. filtre: ≥ ${minMinutes} min/match`);
  return lines;
}

/**
 * playersMeta: [{ player, results }] where results = { statKey: computeAxisResult(...) }
 */
function renderProfile(profileKey, canvasId, playersMeta, minMinutes) {
  const profile = PROFILES[profileKey];
  const labels = profile.axes.map(a => a.label);

  const datasets = playersMeta.map(({ player, results }, i) => {
    const data = profile.axes.map(axis => {
      const r = results[axis.key];
      if (!r || r.na || r.percentile == null) return 0;
      return r.percentile;
    });
    const pointColors = profile.axes.map(axis => {
      const r = results[axis.key];
      return (!r || r.na) ? 'rgba(139,148,158,0.6)' : PLAYER_COLORS[i];
    });
    return {
      label: player.name,
      data,
      borderColor: PLAYER_COLORS[i],
      backgroundColor: PLAYER_BG[i],
      pointBackgroundColor: pointColors,
      pointBorderColor: pointColors,
      borderWidth: 2
    };
  });

  datasets.push({
    label: 'Moyenne référence (50e centile)',
    data: labels.map(() => 50),
    borderColor: 'rgba(255,255,255,0.3)',
    backgroundColor: 'transparent',
    borderDash: [5, 5],
    pointRadius: 0,
    borderWidth: 1
  });

  const config = {
    type: 'radar',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        r: {
          min: 0, max: 100,
          ticks: { stepSize: 25, display: true, color: '#8B949E', font: { size: 10 }, backdropColor: 'transparent' },
          grid: { color: 'rgba(255,255,255,0.1)' },
          pointLabels: { color: '#E6EDF3', font: { size: 11 } },
          angleLines: { color: 'rgba(255,255,255,0.15)' }
        }
      },
      plugins: {
        legend: { display: true, labels: { color: '#E6EDF3', boxWidth: 12, font: { size: 11 } } },
        tooltip: {
          callbacks: {
            title: (items) => `${profile.icon} ${profile.label}`,
            label: () => '', // replaced by afterBody for full multi-player breakdown
            afterBody: (items) => {
              if (!items.length) return [];
              return buildTooltipLines(profileKey, items[0].dataIndex, playersMeta, minMinutes);
            }
          }
        }
      },
      elements: { line: { borderWidth: 2 }, point: { radius: 4, hoverRadius: 7 } }
    }
  };

  if (kiviatCharts[profileKey]) {
    const chart = kiviatCharts[profileKey];
    chart.data = config.data;
    chart.options = config.options;
    chart.update();
  } else {
    const ctx = document.getElementById(canvasId).getContext('2d');
    kiviatCharts[profileKey] = new Chart(ctx, config);
  }

  const missing = profile.axes.filter(axis => {
    return playersMeta.every(({ results }) => {
      const r = results[axis.key];
      return !r || r.na;
    });
  }).length;

  return { total: profile.axes.length, missing };
}

function destroyAllCharts() {
  Object.values(kiviatCharts).forEach(c => c.destroy());
  Object.keys(kiviatCharts).forEach(k => delete kiviatCharts[k]);
}

if (typeof module !== 'undefined') {
  module.exports = { renderProfile, destroyAllCharts, PLAYER_COLORS };
}
