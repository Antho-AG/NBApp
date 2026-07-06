/**
 * Entry point: wires UI events to the scraper/stats/kiviat/compare modules.
 */

const compareState = new CompareState();
let currentSeason = seasonLabel(currentSeasonEndYear());
let minMinutes = 15;
let compareMode = 'global'; // 'global' | 'position'
let revealedSlots = 1;

function refreshAddButton() {
  const visible = revealedSlots === compareState.activeCount() && compareState.activeCount() < MAX_PLAYERS;
  UI.setAddButtonVisible(visible);
}

function syncSlotsAfterChange() {
  revealedSlots = Math.max(1, compareState.activeCount());
  for (let i = 1; i < MAX_PLAYERS; i++) {
    if (i < revealedSlots || compareState.players[i]) UI.showSlot(i);
    else UI.hideSlot(i);
  }
  refreshAddButton();
}

async function onSearchInput(slot, query) {
  if (!query || query.trim().length < 2) { UI.renderAutocomplete(slot, [], query); return; }
  try {
    const results = await searchPlayers(query);
    UI.renderAutocomplete(slot, results, query);
  } catch (e) {
    UI.renderAutocomplete(slot, [], query);
  }
}

async function onSelectSuggestion(slot, slug, name) {
  UI.setSlotValue(slot, name);
  await loadPlayerIntoSlot(slot, slug);
}

async function onExampleClick(slug, name) {
  UI.setSlotValue(0, name);
  await loadPlayerIntoSlot(0, slug);
}

function onClearPlayer(slot) {
  compareState.removeSlot(slot);
  UI.resetSlot(slot);
  syncSlotsAfterChange();
  if (compareState.activeCount() === 0) {
    UI.showState('empty');
    UI.renderPlayerLegend([]);
    UI.renderPositionWarning(null);
    UI.renderPlayerCards([]);
    return;
  }
  recomputeAndRender();
}

function onAddPlayerSlot() {
  if (revealedSlots >= MAX_PLAYERS) return;
  UI.showSlot(revealedSlots);
  revealedSlots++;
  refreshAddButton();
}

function onSeasonChange(value) {
  currentSeason = value;
  reloadAllPlayersForNewSeason();
}

function onCompareModeChange(mode) {
  compareMode = mode;
  recomputeAndRender();
}

function onMinMinutesChange(value) {
  minMinutes = value;
  recomputeAndRender();
}

function onRefresh() {
  Object.keys(sessionStorage).forEach(k => { if (k.startsWith('nba-league-raw:')) sessionStorage.removeItem(k); });
  recomputeAndRender();
}

async function loadPlayerIntoSlot(slot, slug) {
  UI.showState('loading');
  UI.setLoadingMessage('Collecte des données BBRef...');
  try {
    const player = await fetchPlayerProfile(slug, currentSeason);
    compareState.setPlayer(slot, player);
    syncSlotsAfterChange();
    await recomputeAndRender();
  } catch (e) {
    UI.showState('error');
    UI.setErrorMessage(e.message || 'Une erreur est survenue');
    UI.resetSlot(slot);
    compareState.clearPlayer(slot);
    syncSlotsAfterChange();
  }
}

async function reloadAllPlayersForNewSeason() {
  const slugs = compareState.players.map(p => p && p.slug);
  if (slugs.every(s => !s)) return;
  UI.showState('loading');
  UI.setLoadingMessage('Collecte des données BBRef...');
  try {
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!slugs[i]) continue;
      const player = await fetchPlayerProfile(slugs[i], currentSeason);
      compareState.setPlayer(i, player);
      UI.setSlotValue(i, player.name);
    }
    await recomputeAndRender();
  } catch (e) {
    UI.showState('error');
    UI.setErrorMessage(e.message || 'Une erreur est survenue');
  }
}

async function recomputeAndRender() {
  const players = compareState.activePlayers();
  if (players.length === 0) { UI.showState('empty'); return; }

  UI.showState('loading');
  UI.setLoadingMessage('Calcul des centiles...');

  try {
    let leagueRows = await fetchLeagueDataset(currentSeason, minMinutes);

    if (compareMode === 'position') {
      const primaryPos = players[0].position;
      if (primaryPos) leagueRows = leagueRows.filter(r => r.position === primaryPos);
    }

    const distributions = buildDistributions(leagueRows);

    const playersMeta = players.map(player => {
      const results = {};
      Object.values(PROFILES).forEach(profile => {
        profile.axes.forEach(axis => {
          results[axis.key] = computeAxisResult(player, axis, distributions);
        });
      });
      return { player, results };
    });

    UI.renderPlayerLegend(players);
    UI.renderPositionWarning(compareMode === 'position' ? compareState.positionWarning() : null);
    UI.renderPlayerCards(players);
    UI.renderStatsTable(playersMeta, minMinutes);

    Object.keys(PROFILES).forEach(profileKey => {
      const canvasId = `chart${capitalize(profileKey)}`;
      const { total, missing } = renderProfile(profileKey, canvasId, playersMeta, minMinutes);
      UI.updateAxisBadge(profileKey, total, missing);
    });

    UI.showState('ready');
  } catch (e) {
    UI.showState('error');
    UI.setErrorMessage(e.message || 'Une erreur est survenue lors du calcul des centiles');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  UI.init({
    onSearchInput, onSelectSuggestion, onClearPlayer, onAddPlayerSlot,
    onSeasonChange, onCompareModeChange, onMinMinutesChange, onRefresh, onExampleClick
  });

  const seasons = listSeasons();
  UI.populateSeasons(seasons, currentSeason);
  UI.showState('empty');
});
