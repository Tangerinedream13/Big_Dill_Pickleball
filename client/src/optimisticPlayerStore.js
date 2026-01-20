// src/optimisticPlayerStore.js

let optimisticPlayer = null;

/**
 * Store a player temporarily for optimistic UI
 */
export function setOptimisticPlayer(player) {
  optimisticPlayer = player;
}

/**
 * Read + clear the optimistic player (one-time use)
 */
export function consumeOptimisticPlayer() {
  const p = optimisticPlayer;
  optimisticPlayer = null;
  return p;
}