// =====================================================================
//  Bead 12 / 12 Guti — CPU Opponent
//  Minimax + alpha-beta pruning over the pure rules engine.
//  No DOM. Imports the SAME engine the UI and server use.
// =====================================================================
import {
  A, B, POINTS, rc, NEIGHBORS,
  legalMoves, applyMove, countBeads,
} from './engine.js';

const opp = p => (p === A ? B : A);

// ---- positional weights ----------------------------------------------
// Center control matters (the central point is 8-connected, the most
// mobile square on the board). Back-row safety: beads on your own far
// edge can't be captured from behind. We precompute a per-point
// "connectivity" score = how many lines run through it.
const CONNECTIVITY = NEIGHBORS.map(n => n.length); // 3..8
const MAX_CONN = 8;

// Manhattan-ish distance from center, normalized — used for a mild
// center-gravity term.
const CENTER = 12; // id(2,2)
const CENTER_BONUS = NEIGHBORS.map((_, p) => {
  const [r, c] = rc(p);
  const d = Math.abs(r - 2) + Math.abs(c - 2); // 0..4
  return (4 - d) / 4; // 1 at center, 0 at corners
});

// ---- evaluation -------------------------------------------------------
// Score is from `player`'s perspective: positive = good for player.
// Terms: material (dominant), mobility, center control, connectivity.
export function evaluate(state, player) {
  if (state.result) {
    if (state.result.winner === player) return 100000;
    if (state.result.winner === opp(player)) return -100000;
    return 0; // draw
  }
  const b = state.board;
  let material = 0, center = 0, conn = 0;
  for (let p = 0; p < POINTS; p++) {
    const occ = b[p];
    if (occ === 0) continue;
    const sign = occ === player ? 1 : -1;
    material += sign * 100;
    center += sign * CENTER_BONUS[p] * 6;
    conn += sign * (CONNECTIVITY[p] / MAX_CONN) * 4;
  }
  // Mobility: how many moves each side has from THIS position.
  // (Cheap proxy — count moves for the side to move, sign accordingly.)
  const myMob = legalMoves({ ...state, turn: player, chainFrom: null, result: null }).length;
  const oppMob = legalMoves({ ...state, turn: opp(player), chainFrom: null, result: null }).length;
  const mobility = (myMob - oppMob) * 1.5;

  return material + center + conn + mobility;
}

// ---- move ordering ----------------------------------------------------
// Try captures first (and bigger captures first) to maximize alpha-beta cuts.
function orderMoves(state) {
  const moves = legalMoves(state);
  return moves.sort((m1, m2) => {
    const c1 = m1.type === 'capture' ? 1 : 0;
    const c2 = m2.type === 'capture' ? 1 : 0;
    if (c1 !== c2) return c2 - c1;
    // mild center gravity tie-break
    return CENTER_BONUS[m2.to] - CENTER_BONUS[m1.to];
  });
}

// ---- minimax with alpha-beta -----------------------------------------
// Returns {score, move}. `me` is the maximizing player (the CPU).
function search(state, depth, alpha, beta, me) {
  if (state.result || depth === 0) {
    return { score: evaluate(state, me), move: null };
  }
  const maximizing = state.turn === me;
  const moves = orderMoves(state);
  if (moves.length === 0) {
    return { score: evaluate(state, me), move: null };
  }

  let best = null;
  if (maximizing) {
    let value = -Infinity;
    for (const m of moves) {
      const child = applyMove(state, m);
      // Capture chains keep the same player to move; let the search
      // recurse naturally (depth still decrements to bound work).
      const r = search(child, depth - 1, alpha, beta, me);
      if (r.score > value) { value = r.score; best = m; }
      alpha = Math.max(alpha, value);
      if (alpha >= beta) break; // beta cutoff
    }
    return { score: value, move: best };
  } else {
    let value = Infinity;
    for (const m of moves) {
      const child = applyMove(state, m);
      const r = search(child, depth - 1, alpha, beta, me);
      if (r.score < value) { value = r.score; best = m; }
      beta = Math.min(beta, value);
      if (alpha >= beta) break; // alpha cutoff
    }
    return { score: value, move: best };
  }
}

// ---- difficulty -------------------------------------------------------
export const DIFFICULTY = {
  easy:   { depth: 2, randomness: 0.45 }, // shallow + often picks a non-best move
  medium: { depth: 4, randomness: 0.12 },
  hard:   { depth: 6, randomness: 0.0  },
};

// Public API: pick a move for the side to move.
// `level` ∈ 'easy'|'medium'|'hard'. Deterministic when randomness=0.
export function chooseMove(state, level = 'medium', rng = Math.random) {
  const cfg = DIFFICULTY[level] || DIFFICULTY.medium;
  const me = state.turn;
  const moves = orderMoves(state);
  if (moves.length === 0) return null;
  if (moves.length === 1) return moves[0];

  // Easy/medium: with some probability, don't play optimally — pick from
  // the top-N by a 1-ply look so the CPU feels beatable but not random.
  if (cfg.randomness > 0 && rng() < cfg.randomness) {
    // shallow rank: evaluate each move at depth-1
    const ranked = moves.map(m => {
      const child = applyMove(state, m);
      const s = search(child, 1, -Infinity, Infinity, me).score;
      return { m, s };
    }).sort((x, y) => y.s - x.s);
    // pick randomly among a small window of decent moves (avoid blunders that hang material for free, but allow suboptimal)
    const windowSize = level === 'easy' ? Math.min(4, ranked.length) : Math.min(2, ranked.length);
    const idx = Math.floor(rng() * windowSize);
    return ranked[idx].m;
  }

  const { move } = search(state, cfg.depth, -Infinity, Infinity, me);
  return move || moves[0];
}

// Expose internals for tests/benchmarks.
export const _internal = { search, orderMoves };
