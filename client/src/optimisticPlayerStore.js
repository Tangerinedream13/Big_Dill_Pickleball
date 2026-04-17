// src/optimisticPlayerStore.js

let optimisticPlayer = null;


export function setOptimisticPlayer(player) {
  optimisticPlayer = player;
}

export function consumeOptimisticPlayer() {
  const p = optimisticPlayer;
  optimisticPlayer = null;
  return p;
}