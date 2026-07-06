/**
 * Multi-player comparison state: up to 3 players, slot 0 is mandatory.
 */

const MAX_PLAYERS = 3;

class CompareState {
  constructor() {
    this.players = [null, null, null]; // player profile objects, indexed by slot
  }

  setPlayer(slot, player) {
    this.players[slot] = player;
  }

  clearPlayer(slot) {
    this.players[slot] = null;
  }

  /** Remove a slot's player and compact the remaining ones so filled slots stay 0..n-1. */
  removeSlot(slot) {
    this.players.splice(slot, 1);
    this.players.push(null);
  }

  activePlayers() {
    return this.players.filter(Boolean);
  }

  activeCount() {
    return this.activePlayers().length;
  }

  canAddSlot() {
    return this.activeCount() < MAX_PLAYERS && this.activeCount() > 0;
  }

  /** Next slot index that is currently empty and should be revealed, or -1. */
  nextEmptySlot() {
    for (let i = 0; i < MAX_PLAYERS; i++) if (!this.players[i]) return i;
    return -1;
  }

  /** Warning shown when comparing by position across players with different positions. */
  positionWarning() {
    const active = this.activePlayers();
    if (active.length < 2) return null;
    const positions = new Set(active.map(p => p.position).filter(Boolean));
    if (positions.size <= 1) return null;
    return `⚠️ Joueurs de postes différents — la comparaison par poste utilise le poste du Joueur 1 (${active[0].position || '?'})`;
  }
}

if (typeof module !== 'undefined') {
  module.exports = { CompareState, MAX_PLAYERS };
}
