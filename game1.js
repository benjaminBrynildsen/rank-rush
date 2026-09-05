const FILES = "abcdefgh";
const VAL = { P: 1, N: 3, B: 3, R: 5, Q: 9, K: 25 };
const GLYPH = {
  w: { K: "\u2654", Q: "\u2655", R: "\u2656", B: "\u2657", N: "\u2658", P: "\u2659" },
  b: { K: "\u265A", Q: "\u265B", R: "\u265C", B: "\u265D", N: "\u265E", P: "\u265F" },
};
const VISIBLE = 12;
const RANK_MAX = 1000000;
const NDIRS = [[1,2],[2,1],[2,-1],[1,-2],[-1,-2],[-2,-1],[-2,1],[-1,2]];
const KDIRS = [[1,0],[1,1],[0,1],[-1,1],[-1,0],[-1,-1],[0,-1],[1,-1]];
const BDIR = [[1,1],[1,-1],[-1,1],[-1,-1]];
const RDIR = [[1,0],[-1,0],[0,1],[0,-1]];
let S = null;
let pendingPromo = null;
let legalCache = [];
function mulberry(seed) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}
function chunkSeed(seed, chunk) {
  return (Math.imul(seed ^ 0x9E3779B9, chunk + 1) >>> 0);
}
function newRun(seed) {
  seed = seed ?? ((Date.now() ^ (Math.random() * 1e9)) >>> 0) || 1;
  S = {
    seed, moveIndex: 0, generationId: 1, wakeRank: 0,
    movesUntilPawn: 8, movesUntilWake: 3, pieces: [], nextId: 1,
    score: 0, captures: 0, streak: 0, lastPackRank: -1,
    generated: new Set(), gameOver: null, selectedId: null, busy: false,
    msg: "Tap the knight. Climb the road.",
  };
  addPiece("K", "w", 4, 2);
  addPiece("N", "w", 6, 2);
  for (let c = 0; c <= 4; c++) generateChunk(c);
  render();
}
function addPiece(type, side, file, rank, extra) {
  extra = extra || {};
  const p = {
    id: S.nextId++, type: type, side: side, file: file, rank: rank,
    originRank: extra.originRank != null ? extra.originRank : rank,
    neverMoved: extra.neverMoved !== false,
    stunned: !!extra.stunned,
  };
  S.pieces.push(p);
  return p;
}
function living() { return S.pieces.filter(function(p) { return p.rank > S.wakeRank; }); }
function at(f, r) { return living().find(function(p) { return p.file === f && p.rank === r; }) || null; }
function king(side) { return living().find(function(p) { return p.type === "K" && p.side === side; }) || null; }
function inBoard(f, r) { return f >= 0 && f < 8 && r > S.wakeRank && r <= RANK_MAX; }
function playerQueenCount() { return living().filter(function(p) { return p.side === "w" && p.type === "Q"; }).length; }
function vanguardRank() {
  const mine = living().filter(function(p) { return p.side === "w"; });
  return mine.reduce(function(m, p) { return Math.max(m, p.rank); }, 1);
}
function rearRank() {
  const mine = living().filter(function(p) { return p.side === "w"; });
  if (!mine.length) return S.wakeRank + 1;
  return mine.reduce(function(m, p) { return Math.min(m, p.rank); }, 999999);
}
function viewRange() {
  const k = king("w");
  const vg = vanguardRank();
  const focus = k ? Math.max(k.rank, vg - 2) : vg;
  let lo = Math.max(S.wakeRank + 1, focus - 4);
  let hi = lo + VISIBLE - 1;
  if (k && k.rank < lo) lo = k.rank;
  if (vg > hi) { hi = vg + 3; lo = hi - VISIBLE + 1; }
  lo = Math.max(S.wakeRank + 1, lo);
  hi = lo + VISIBLE - 1;
  return { lo: lo, hi: hi };
}
function generateChunk(chunk) {
  if (S.generated.has(chunk)) return;
  S.generated.add(chunk);
  if (chunk <= 0) return;
  const base = chunk * 8;
  const rng = mulberry(chunkSeed(S.seed, chunk));
  const pick = function(arr) { return arr[Math.floor(rng() * arr.length)]; };
  const empty = function(f, r) { return inBoard(f, r) && !at(f, r); };
  const pack = [];
  if (base < 16) {
    const n = 2 + Math.floor(rng() * 3);
    for (let i = 0; i < n; i++) pack.push(["P", Math.floor(rng() * 8), base + Math.floor(rng() * 3)]);
    if (rng() < 0.7) pack.push(["N", Math.floor(rng() * 8), base + 1 + Math.floor(rng() * 2)]);
  } else if (base < 32) {
    pack.push(["N", Math.floor(rng() * 8), base]);
    for (let i = 0; i < 3; i++) pack.push(["P", Math.floor(rng() * 8), base + Math.floor(rng() * 3)]);
    if (rng() < 0.5) pack.push(["B", Math.floor(rng() * 8), base + 2]);
  } else if (base < 48) {
    pack.push([pick(["B", "B", "R"]), Math.floor(rng() * 8), base + 1]);
    pack.push(["N", Math.floor(rng() * 8), base]);
    for (let i = 0; i < 2; i++) pack.push(["P", i * 3 + Math.floor(rng() * 2), base]);
  } else if (base % 48 === 0) {
    pack.push(["K", 4, base + 3]);
    pack.push(["Q", 3, base + 2]);
    pack.push(["R", 0, base + 1]);
    pack.push(["R", 7, base + 1]);
    pack.push(["N", 2, base]);
    pack.push(["N", 5, base]);
  } else {
    pack.push(["Q", Math.floor(rng() * 8), base + 2]);
    pack.push(["R", Math.floor(rng() * 8), base + 1]);
    pack.push(["B", Math.floor(rng() * 8), base]);
    for (let i = 0; i < 3; i++) pack.push(["P", Math.floor(rng() * 8), base + Math.floor(rng() * 2)]);
  }
  const byRank = {};
  for (let i = 0; i < pack.length; i++) {
    const t = pack[i][0], f = pack[i][1], r = pack[i][2];
    if (!empty(f, r)) continue;
    if (!byRank[r]) byRank[r] = new Set();
    if (byRank[r].size >= 7 && t === "P") continue;
    byRank[r].add(f);
    addPiece(t, "b", f, r, { stunned: true, neverMoved: true, originRank: r });
  }
}
function ensureGenerated() {
  const hi = viewRange().hi;
  const maxChunk = Math.floor((hi + 8) / 8);
  for (let c = 0; c <= maxChunk; c++) generateChunk(c);
}
function slideMoves(p, dirs, captureOnly, oneStep) {
  const out = [];
  for (let i = 0; i < dirs.length; i++) {
    const df = dirs[i][0], dr = dirs[i][1];
    let f = p.file + df, r = p.rank + dr, steps = 0;
    while (inBoard(f, r) && steps < VISIBLE + 2) {
      steps++;
      const hit = at(f, r);
      if (!hit) { if (!captureOnly) out.push({ f: f, r: r, cap: null }); }
      else { if (hit.side !== p.side) out.push({ f: f, r: r, cap: hit }); break; }
      if (oneStep) break;
      f += df; r += dr;
    }
  }
  return out;
}
function rawMoves(p) {
  const out = [];
  if (p.type === "N") {
    for (let i = 0; i < NDIRS.length; i++) {
      const f = p.file + NDIRS[i][0], r = p.rank + NDIRS[i][1];
      if (!inBoard(f, r)) continue;
      const hit = at(f, r);
      if (!hit || hit.side !== p.side) out.push({ f: f, r: r, cap: hit });
    }
  } else if (p.type === "K") {
    out.push.apply(out, slideMoves(p, KDIRS, false, true));
  } else if (p.type === "B") {
    out.push.apply(out, slideMoves(p, BDIR));
  } else if (p.type === "R") {
    out.push.apply(out, slideMoves(p, RDIR));
  } else if (p.type === "Q") {
    out.push.apply(out, slideMoves(p, BDIR.concat(RDIR)));
  } else if (p.type === "P") {
    const dir = p.side === "w" ? 1 : -1;
    const f1 = p.file, r1 = p.rank + dir;
    if (inBoard(f1, r1) && !at(f1, r1)) {
      out.push({ f: f1, r: r1, cap: null });
      const r2 = p.rank + dir * 2;
      if (p.neverMoved && inBoard(f1, r2) && !at(f1, r2)) out.push({ f: f1, r: r2, cap: null });
    }
    for (let df = -1; df <= 1; df += 2) {
      const f = p.file + df, r = p.rank + dir;
      if (!inBoard(f, r)) continue;
      const hit = at(f, r);
      if (hit && hit.side !== p.side) out.push({ f: f, r: r, cap: hit });
    }
  }
  return out;
}
function squareAttacked(f, r, bySide) {
  const list = living();
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.side !== bySide) continue;
    if (p.type === "P") {
      const dir = p.side === "w" ? 1 : -1;
      if (p.rank + dir === r && Math.abs(p.file - f) === 1) return true;
      continue;
    }
    const moves = rawMoves(p);
    for (let j = 0; j < moves.length; j++) {
      if (moves[j].f === f && moves[j].r === r) return true;
    }
  }
  return false;
}
function kingInCheck(side) {
  const k = king(side);
  if (!k) return true;
  return squareAttacked(k.file, k.rank, side === "w" ? "b" : "w");
}
function withMove(p, m, fn) {
  const saved = { file: p.file, rank: p.rank, neverMoved: p.neverMoved };
  const capIdx = m.cap ? S.pieces.indexOf(m.cap) : -1;
  let held = null;
  if (capIdx >= 0) { held = S.pieces[capIdx]; S.pieces.splice(capIdx, 1); }
  p.file = m.f; p.rank = m.r; p.neverMoved = false;
  const res = fn();
  p.file = saved.file; p.rank = saved.rank; p.neverMoved = saved.neverMoved;
  if (held) S.pieces.splice(capIdx, 0, held);
  return res;
}
function legalMovesFor(p) {
  if (p.side !== "w") return rawMoves(p);
  return rawMoves(p).filter(function(m) { return withMove(p, m, function() { return !kingInCheck("w"); }); });
}
function allLegalWhite() {
  const list = [];
  const liv = living();
  for (let i = 0; i < liv.length; i++) {
    const p = liv[i];
    if (p.side !== "w") continue;
    const moves = legalMovesFor(p);
    for (let j = 0; j < moves.length; j++) list.push({ p: p, m: moves[j] });
  }
  return list;
}
function findRearSpawn() {
  const k = king("w");
  if (!k) return null;
  let rr = rearRank();
  if (rr <= S.wakeRank + 1) rr = S.wakeRank + 2;
  const order = [k.file];
  for (let d = 1; d < 8; d++) {
    if (k.file + d < 8) order.push(k.file + d);
    if (k.file - d >= 0) order.push(k.file - d);
  }
  function tryRank(rank) {
    for (let i = 0; i < order.length; i++) {
      const f = order[i];
      if (!inBoard(f, rank)) continue;
      if (at(f, rank)) continue;
      const ghost = { id: -1, type: "P", side: "w", file: f, rank: rank, originRank: rank, neverMoved: true, stunned: false };
      S.pieces.push(ghost);
      const bad = kingInCheck("w");
      S.pieces.pop();
      if (!bad) return { f: f, r: rank };
    }
    return null;
  }
  return tryRank(rr) || tryRank(rr + 1);
}
function spawnAtRear(type) {
  if (type === "K") return false;
  if (type === "Q" && playerQueenCount() >= 1) type = "N";
  const spot = findRearSpawn();
  if (!spot) { S.msg = "No room at the rear — recruit skipped."; return false; }
  addPiece(type, "w", spot.f, spot.r, { originRank: spot.r, neverMoved: true });
  S.msg = nameOf(type) + " joins at " + FILES[spot.f] + spot.r + ".";
  return true;
}
