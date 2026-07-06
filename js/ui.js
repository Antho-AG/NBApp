/**
 * DOM rendering + event wiring. Pure UI layer — app.js owns state and data fetching,
 * this module only reads/writes the DOM and forwards user actions via callbacks.
 */

const UI = {
  els: {},
  callbacks: {},

  init(callbacks) {
    this.callbacks = callbacks;
    this.els = {
      searchZone: document.getElementById('searchZone'),
      btnAddPlayer: document.getElementById('btnAddPlayer'),
      playerLegend: document.getElementById('playerLegend'),
      seasonSelect: document.getElementById('seasonSelect'),
      minMinutesSlider: document.getElementById('minMinutesSlider'),
      minMinutesValue: document.getElementById('minMinutesValue'),
      btnRefresh: document.getElementById('btnRefresh'),
      positionWarning: document.getElementById('positionWarning'),
      playerCards: document.getElementById('playerCards'),
      appState: document.getElementById('appState'),
      stateEmpty: document.getElementById('stateEmpty'),
      stateLoading: document.getElementById('stateLoading'),
      stateError: document.getElementById('stateError'),
      loadingMessage: document.getElementById('loadingMessage'),
      errorMessage: document.getElementById('errorMessage'),
      kiviatGrid: document.getElementById('kiviatGrid'),
      statsTableSection: document.getElementById('statsTableSection'),
      statsTable: document.getElementById('statsTable')
    };

    for (let slot = 0; slot < MAX_PLAYERS; slot++) {
      const input = this.els.searchZone.querySelector(`.player-search-input[data-slot="${slot}"]`);
      const clearBtn = this.els.searchZone.querySelector(`.btn-clear-player[data-slot="${slot}"]`);
      let debounceTimer;
      input.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const value = input.value;
        debounceTimer = setTimeout(() => this.callbacks.onSearchInput(slot, value), 300);
      });
      clearBtn.addEventListener('click', () => this.callbacks.onClearPlayer(slot));
    }

    this.els.btnAddPlayer.addEventListener('click', () => this.callbacks.onAddPlayerSlot());
    this.els.seasonSelect.addEventListener('change', (e) => this.callbacks.onSeasonChange(e.target.value));
    document.querySelectorAll('input[name="compareMode"]').forEach(radio => {
      radio.addEventListener('change', (e) => { if (e.target.checked) this.callbacks.onCompareModeChange(e.target.value); });
    });
    this.els.minMinutesSlider.addEventListener('input', (e) => {
      this.els.minMinutesValue.textContent = e.target.value;
    });
    this.els.minMinutesSlider.addEventListener('change', (e) => this.callbacks.onMinMinutesChange(parseInt(e.target.value, 10)));
    this.els.btnRefresh.addEventListener('click', () => this.callbacks.onRefresh());
    document.querySelectorAll('.btn-example').forEach(btn => {
      btn.addEventListener('click', () => {
        const [slug, name] = btn.dataset.example.split('|');
        this.callbacks.onExampleClick(slug, name);
      });
    });

    document.addEventListener('click', (e) => {
      if (!e.target.closest('.search-input-wrap')) {
        document.querySelectorAll('.autocomplete-list').forEach(ul => ul.hidden = true);
      }
    });
  },

  populateSeasons(seasons, defaultLabel) {
    this.els.seasonSelect.innerHTML = seasons.map(s => `<option value="${s.label}">${s.label}</option>`).join('');
    this.els.seasonSelect.value = defaultLabel;
  },

  renderAutocomplete(slot, results, query) {
    const ul = this.els.searchZone.querySelector(`.autocomplete-list[data-slot="${slot}"]`);
    if (!query || query.trim().length < 2) { ul.hidden = true; ul.innerHTML = ''; return; }
    if (results.length === 0) {
      ul.innerHTML = `<li class="ac-empty">Aucun joueur trouvé</li>`;
      ul.hidden = false;
      return;
    }
    ul.innerHTML = results.map(r => `<li data-slug="${r.slug}" data-name="${r.name}">${r.name}<span class="ac-meta">${r.slug}</span></li>`).join('');
    ul.hidden = false;
    ul.querySelectorAll('li[data-slug]').forEach(li => {
      li.addEventListener('click', () => {
        this.callbacks.onSelectSuggestion(slot, li.dataset.slug, li.dataset.name);
        ul.hidden = true;
      });
    });
  },

  setSlotValue(slot, name) {
    const input = this.els.searchZone.querySelector(`.player-search-input[data-slot="${slot}"]`);
    const clearBtn = this.els.searchZone.querySelector(`.btn-clear-player[data-slot="${slot}"]`);
    input.value = name;
    input.disabled = true;
    clearBtn.hidden = false;
  },

  resetSlot(slot) {
    const input = this.els.searchZone.querySelector(`.player-search-input[data-slot="${slot}"]`);
    const clearBtn = this.els.searchZone.querySelector(`.btn-clear-player[data-slot="${slot}"]`);
    input.value = '';
    input.disabled = false;
    clearBtn.hidden = true;
  },

  showSlot(slot) {
    const slotEl = this.els.searchZone.querySelector(`.player-slot[data-slot="${slot}"]`);
    slotEl.hidden = false;
  },

  hideSlot(slot) {
    const slotEl = this.els.searchZone.querySelector(`.player-slot[data-slot="${slot}"]`);
    slotEl.hidden = slot > 0 ? true : false;
    this.resetSlot(slot);
  },

  setAddButtonVisible(visible) {
    this.els.btnAddPlayer.hidden = !visible;
  },

  renderPlayerLegend(players) {
    if (players.length < 2) { this.els.playerLegend.hidden = true; this.els.playerLegend.innerHTML = ''; return; }
    this.els.playerLegend.hidden = false;
    this.els.playerLegend.innerHTML = players.map((p, i) =>
      `<span class="legend-item"><span class="legend-dot" style="background:${PLAYER_COLORS[i]}"></span>${p.name}</span>`
    ).join('');
  },

  renderPositionWarning(text) {
    if (!text) { this.els.positionWarning.hidden = true; return; }
    this.els.positionWarning.hidden = false;
    this.els.positionWarning.textContent = text;
  },

  renderPlayerCards(players) {
    this.els.playerCards.innerHTML = players.map((p, i) => `
      <div class="player-card" style="border-left-color:${PLAYER_COLORS[i]}">
        <div class="pc-name">${['🔵','🔴','🟢'][i]} ${p.name} — ${p.position || '?'} — ${p.team || '?'}</div>
        <div class="pc-stats">
          Saison ${p.season} | ${fmt(p.perGame.PTS)} PPG | ${fmt(p.perGame.DRB)} RPG | ${fmt(p.perGame.AST)} APG |
          ${fmt(p.perGame.FG_PCT)}% FG | ${fmt(p.perGame.THREE_PCT)}% 3P
          ${p.heightCm ? ` | Taille : ${p.heightCm}cm` : ''}${p.weightKg ? ` | Poids : ${p.weightKg}kg` : ''}${p.age ? ` | ${p.age} ans` : ''}
        </div>
      </div>`).join('');

    function fmt(v) { return v == null ? 'N/D' : v; }
  },

  showState(state) {
    this.els.stateEmpty.hidden = state !== 'empty';
    this.els.stateLoading.hidden = state !== 'loading';
    this.els.stateError.hidden = state !== 'error';
    this.els.appState.hidden = state === 'ready';
    this.els.kiviatGrid.hidden = state !== 'ready';
    this.els.statsTableSection.hidden = state !== 'ready';
  },

  setLoadingMessage(msg) {
    this.els.loadingMessage.textContent = msg;
  },

  setErrorMessage(msg) {
    this.els.errorMessage.textContent = msg;
  },

  updateAxisBadge(profileKey, total, missing) {
    const span = document.getElementById(`axisCount${capitalize(profileKey)}`);
    if (!span) return;
    span.innerHTML = `${total} axes` + (missing > 0 ? `<span class="badge-partial">${missing} sans données</span>` : '');
  },

  renderStatsTable(playersMeta, minMinutes) {
    const thead = this.els.statsTable.querySelector('thead');
    const tbody = this.els.statsTable.querySelector('tbody');
    const headerCols = ['Stat', ...playersMeta.map(pm => pm.player.name), 'Moy. référence', `Centile ${playersMeta[0].player.name}`];
    thead.innerHTML = `<tr>${headerCols.map(h => `<th>${h}</th>`).join('')}</tr>`;

    const rows = [];
    Object.values(PROFILES).forEach(profile => {
      profile.axes.forEach(axis => {
        const cells = playersMeta.map(pm => {
          const r = pm.results[axis.key];
          return (!r || r.na) ? 'N/D' : `${formatValue(r.value, axis.unit)}`;
        });
        const first = playersMeta[0].results[axis.key];
        const leagueAvg = (first && first.leagueAvg != null) ? formatValue(first.leagueAvg, axis.unit) : 'N/D';
        const pctl = (first && first.percentile != null) ? `${first.percentile}e` : 'N/D';
        const pctlClass = pctlColorClass(first && first.percentile);
        rows.push(`<tr>
          <td>${profile.icon} ${axis.label}</td>
          ${cells.map(c => `<td>${c}</td>`).join('')}
          <td>${leagueAvg}</td>
          <td class="${pctlClass}">${pctl}</td>
        </tr>`);
      });
    });
    tbody.innerHTML = rows.join('');
  }
};

function pctlColorClass(pctl) {
  if (pctl == null) return '';
  if (pctl >= 75) return 'cell-high';
  if (pctl >= 50) return 'cell-mid';
  if (pctl >= 25) return 'cell-low';
  return 'cell-verylow';
}

function capitalize(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

if (typeof module !== 'undefined') {
  module.exports = { UI };
}
