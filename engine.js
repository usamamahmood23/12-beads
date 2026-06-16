// =====================================================================
//  Bead 12 / 12 Guti — Pure Rules Engine
//  Framework-agnostic. Same module runs in the browser (UI) and in
//  Node (server authority + tests). No DOM, no globals, no I/O.
// =====================================================================

export const EMPTY = 0;
export const A = 1; // bottom player
export const B = 2; // top player

export const SIZE = 5;          // 5x5 grid of points
export const POINTS = SIZE * SIZE; // 25 nodes (ids 0..24)
export const BEADS_PER_SIDE = 12;

// ---- geometry helpers -------------------------------------------------
export const rc = (id) => [Math.floor(id / SIZE), id % SIZE];
export const id = (r, c) => r * SIZE + c;
const inBounds = (r, c) => r >= 0 && r < SIZE && c >= 0 && c < SIZE;

// A point has diagonal lines only when (row + col) is even — the classic
// Alquerque pattern. Orthogonal lines exist on every point.
const hasDiagonals = (r, c) => ((r + c) % 2) === 0;

// Build adjacency once. For each point we store {dr, dc} step vectors
// to every linked neighbour. Captures reuse the same vectors: the
// landing point is exactly one more step in the same direction.
export const NEIGHBORS = (() => {
  const dirsOrtho = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  const dirsDiag  = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  const adj = [];
  for (let p = 0; p < POINTS; p++) {
    const [r, c] = rc(p);
    const dirs = hasDiagonals(r, c) ? dirsOrtho.concat(dirsDiag) : dirsOrtho;
    const links = [];
    for (const [dr, dc] of dirs) {
      const nr = r + dr, nc = c + dc;
      if (inBounds(nr, nc)) links.push({ dr, dc, to: id(nr, nc) });
    }
    adj.push(links);
  }
  return adj;
})();

const opponent = (player) => (player === A ? B : A);

// ---- initial state ----------------------------------------------------
// 24 beads on 25 points, centre (2,2) empty so the first move exists.
// Symmetric split: B fills the top, A fills the bottom, the middle row
// splits left/right around the empty centre.
export function initialBoard() {
  const board = new Int8Array(POINTS).fill(EMPTY);
  // Top half -> B
  for (let r = 0; r <= 1; r++) for (let c = 0; c < SIZE; c++) board[id(r, c)] = B;
  // Bottom half -> A
  for (let r = 3; r <= 4; r++) for (let c = 0; c < SIZE; c++) board[id(r, c)] = A;
  // Middle row (r=2): cols 0,1 -> A side ; cols 3,4 -> B side ; col 2 empty
  board[id(2, 0)] = A; board[id(2, 1)] = A;
  board[id(2, 3)] = B; board[id(2, 4)] = B;
  board[id(2, 2)] = EMPTY;
  return board;
}

export function newGame(captureRule = 'free') {
  // captureRule: 'free' (capture optional), 'forced' (must capture if able)
  return {
    board: initialBoard(),
    turn: A,
    captureRule,
    chainFrom: null,   // when mid-multi-capture, only this bead may move
    scores: countBeads(initialBoard()),
    history: [],       // {player, from, to, captured[]}
    result: null,      // null | {winner: A|B|'draw', reason}
    movesSinceCapture: 0,
  };
}

export function countBeads(board) {
  let a = 0, b = 0;
  for (let i = 0; i < POINTS; i++) { if (board[i] === A) a++; else if (board[i] === B) b++; }
  return { [A]: a, [B]: b };
}

// ---- move generation --------------------------------------------------
// A capture: own bead at `from`, opponent on a linked neighbour `over`,
// and the collinear point just beyond (`to`) is empty.
function capturesFrom(board, from, player) {
  const out = [];
  const [r, c] = rc(from);
  for (const { dr, dc, to: over } of NEIGHBORS[from]) {
    if (board[over] !== opponent(player)) continue;
    const lr = r + dr * 2, lc = c + dc * 2;
    if (!inBounds(lr, lc)) continue;
    const land = id(lr, lc);
    // landing must be a real linked continuation from `over` and empty
    const overLinks = NEIGHBORS[over].some(n => n.to === land && n.dr === dr && n.dc === dc);
    if (overLinks && board[land] === EMPTY) out.push({ from, over, to: land });
  }
  return out;
}

function simpleMovesFrom(board, from) {
  const out = [];
  for (const { to } of NEIGHBORS[from]) if (board[to] === EMPTY) out.push({ from, to });
  return out;
}

// All legal moves for the side to move, honouring capture chains + rule.
export function legalMoves(state) {
  if (state.result) return [];
  const { board, turn, chainFrom, captureRule } = state;

  // Mid-chain: only the chaining bead, and only further captures.
  if (chainFrom != null) {
    return capturesFrom(board, chainFrom, turn).map(m => ({ ...m, type: 'capture' }));
  }

  // Gather all available captures across all own beads.
  const allCaptures = [];
  for (let p = 0; p < POINTS; p++) {
    if (board[p] !== turn) continue;
    for (const cap of capturesFrom(board, p, turn)) allCaptures.push({ ...cap, type: 'capture' });
  }

  if (captureRule === 'forced' && allCaptures.length > 0) return allCaptures;

  // Otherwise captures + simple moves are both allowed.
  const simples = [];
  for (let p = 0; p < POINTS; p++) {
    if (board[p] !== turn) continue;
    for (const mv of simpleMovesFrom(board, p)) simples.push({ ...mv, type: 'move' });
  }
  return allCaptures.concat(simples);
}

// ---- applying a move --------------------------------------------------
// Returns a NEW state (immutable-style; cheap enough for this board).
export function applyMove(state, move) {
  const legal = legalMoves(state);
  const match = legal.find(m => m.from === move.from && m.to === move.to && (m.type ? m.type === (move.type || m.type) : true));
  if (!match) throw new Error(`Illegal move ${move.from}->${move.to}`);

  const board = state.board.slice();
  const player = state.turn;
  board[match.to] = player;
  board[match.from] = EMPTY;
  const captured = [];
  if (match.type === 'capture') { board[match.over] = EMPTY; captured.push(match.over); }

  const history = state.history.concat([{ player, from: match.from, to: match.to, captured }]);
  const scores = countBeads(board);
  const movesSinceCapture = captured.length ? 0 : state.movesSinceCapture + 1;

  // Capture chain: same bead can keep jumping.
  let chainFrom = null, turn = opponent(player);
  if (match.type === 'capture') {
    const more = capturesFrom(board, match.to, player);
    if (more.length > 0) { chainFrom = match.to; turn = player; }
  }

  let next = { ...state, board, turn, chainFrom, scores, history, movesSinceCapture, result: null };
  next.result = checkResult(next);
  return next;
}

// ---- terminal detection ----------------------------------------------
export function checkResult(state) {
  const { scores } = state;
  if (scores[A] === 0) return { winner: B, reason: 'no beads left' };
  if (scores[B] === 0) return { winner: A, reason: 'no beads left' };

  // Side to move with no legal move loses (stalemate = loss, hunt-game convention).
  if (state.chainFrom == null) {
    const moves = legalMoves({ ...state, result: null });
    if (moves.length === 0) return { winner: opponent(state.turn), reason: 'no legal moves' };
  }

  // 50 half-moves without a capture -> draw.
  if (state.movesSinceCapture >= 50) return { winner: 'draw', reason: '50-move rule' };
  return null;
}

// Convenience for UIs: legal destinations from a given point this turn.
export function movesFromPoint(state, from) {
  return legalMoves(state).filter(m => m.from === from);
}
