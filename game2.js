function nameOf(t) {
  return { K: "King", Q: "Queen", R: "Rook", B: "Bishop", N: "Knight", P: "Pawn" }[t];
}
function applyPlayerMove(p, m) {
  const cap = m.cap;
  const recruiter = (p.type === "K" || p.type === "N") && cap && cap.type !== "K";
  const trophyType = cap ? cap.type : null;
  const packRank = cap ? cap.rank : null;
  p.file = m.f;
  p.rank = m.r;
  p.neverMoved = false;
  if (cap) {
    S.pieces = S.pieces.filter(function(x) { return x.id !== cap.id; });
    S.captures += 1;
    S.score += VAL[cap.type] || 0;
    if (S.lastPackRank === packRank || S.lastPackRank === -1) S.streak += 1;
    else S.streak = 1;
    S.lastPackRank = packRank;
    if (S.streak >= 3) S.score += Math.floor((VAL[cap.type] || 0) * 0.5);
    S.msg = cap.type === "K" ? "Court broken." : "Took " + nameOf(cap.type).toLowerCase() + ".";
  } else {
    S.streak = 0;
    S.msg = nameOf(p.type) + " to " + FILES[m.f] + m.r + ".";
  }
  if (recruiter) spawnAtRear(trophyType);
  if (p.type === "P" && p.rank >= p.originRank + 8) return { needPromo: p };
  return { needPromo: null };
}
function afterPlayerResolved() {
  S.movesUntilPawn -= 1;
  if (S.movesUntilPawn <= 0) {
    S.movesUntilPawn = 8;
    spawnAtRear("P");
    if (S.msg.indexOf("joins") === -1) S.msg = "A pawn steps onto the tail.";
  }
  enemyPhase();
  if (S.gameOver) return finishOver();
  const k = king("w");
  if (!k) return die("The king is gone.");
  if (allLegalWhite().length === 0) return die(kingInCheck("w") ? "No escape." : "No moves left.");
  S.movesUntilWake -= 1;
  if (S.movesUntilWake <= 0) {
    S.movesUntilWake = 3;
    S.wakeRank += 1;
    const fallen = S.pieces.filter(function(p) { return p.rank <= S.wakeRank; });
    S.pieces = S.pieces.filter(function(p) { return p.rank > S.wakeRank; });
    if (fallen.some(function(p) { return p.side === "w" && p.type === "K"; })) return die("The wake took the king.");
    if (!king("w")) return die("The wake took the king.");
    if (fallen.some(function(p) { return p.side === "w"; })) S.msg = "The wake swallowed a piece.";
  }
  if (king("w").rank > RANK_MAX - 2) {
    S.score += king("w").rank * 15;
    return die("The map ends.", "The road ends");
  }
  S.moveIndex += 1;
  S.generationId += 1;
  ensureGenerated();
  S.busy = false;
  S.selectedId = null;
  render();
}
function enemyPhase() {
  const foes = living().filter(function(p) { return p.side === "b"; });
  foes.sort(function(a, b) { return a.rank - b.rank || a.file - b.file; });
  const active = foes.slice(0, 24);
  for (let i = 0; i < active.length; i++) {
    const p = active[i];
    if (living().indexOf(p) === -1) continue;
    if (p.stunned) { p.stunned = false; continue; }
    const k = king("w");
    if (!k) { die("The king is gone."); return; }
    const caps = rawMoves(p).filter(function(m) { return m.cap; });
    const takeKing = caps.find(function(m) { return m.cap.type === "K" && m.cap.side === "w"; });
    let choice = null;
    if (takeKing) choice = takeKing;
    else if (caps.length) {
      caps.sort(function(a, b) { return (VAL[b.cap.type] || 0) - (VAL[a.cap.type] || 0) || a.f - b.f; });
      choice = caps[0];
    } else {
      const stepDirs = p.type === "B" ? BDIR : p.type === "R" ? RDIR : p.type === "Q" ? BDIR.concat(RDIR) : null;
      const quiet = stepDirs ? slideMoves(p, stepDirs, false, true) : rawMoves(p).filter(function(m) { return !m.cap; });
      let best = null, bestD = Infinity;
      for (let j = 0; j < quiet.length; j++) {
        const m = quiet[j];
        const back = p.rank - m.r;
        if (back > 1) continue;
        const d = Math.max(Math.abs(m.f - k.file), Math.abs(m.r - k.rank));
        if (d < bestD || (d === bestD && m.f < (best ? best.f : 99))) { bestD = d; best = m; }
      }
      choice = best;
    }
    if (!choice) continue;
    if (choice.cap) {
      if (choice.cap.side === "w" && choice.cap.type === "K") {
        S.pieces = S.pieces.filter(function(x) { return x.id !== choice.cap.id; });
        p.file = choice.f; p.rank = choice.r; p.neverMoved = false;
        die("An enemy took the king.");
        return;
      }
      S.pieces = S.pieces.filter(function(x) { return x.id !== choice.cap.id; });
    }
    p.file = choice.f;
    p.rank = choice.r;
    p.neverMoved = false;
  }
}
function die(reason, title) {
  const k = king("w");
  const dist = k ? k.rank : S.wakeRank;
  S.score += dist * 15;
  S.score += living().filter(function(p) { return p.side === "w"; }).length;
  S.gameOver = reason;
  S.busy = true;
  finishOver(title);
}
function finishOver(title) {
  document.getElementById("overTitle").textContent = title || "Fallen";
  document.getElementById("overBody").textContent =
    S.gameOver + "  \u00b7  King rank " + (king("w") ? king("w").rank : "\u2014") + "  \u00b7  Captures " + S.captures + "  \u00b7  Score " + S.score;
  document.getElementById("overOv").classList.remove("hidden");
  render();
}
function tryMove(p, m) {
  if (S.busy || S.gameOver) return;
  S.busy = true;
  const res = applyPlayerMove(p, m);
  if (res.needPromo) {
    pendingPromo = res.needPromo;
    showPromo();
    return;
  }
  afterPlayerResolved();
}
function showPromo() {
  const box = document.getElementById("promoChoices");
  box.innerHTML = "";
  const opts = ["N", "B", "R", "Q"];
  for (let i = 0; i < opts.length; i++) {
    const t = opts[i];
    const b = document.createElement("button");
    const qBlocked = t === "Q" && playerQueenCount() >= 1;
    b.textContent = GLYPH.w[qBlocked ? "N" : t];
    b.title = nameOf(qBlocked ? "N" : t);
    b.onclick = function() {
      pendingPromo.type = qBlocked ? "N" : t;
      pendingPromo = null;
      document.getElementById("promoOv").classList.add("hidden");
      afterPlayerResolved();
    };
    box.appendChild(b);
  }
  document.getElementById("promoOv").classList.remove("hidden");
}
function onSquare(f, r) {
  if (S.busy || S.gameOver) return;
  const piece = at(f, r);
  if (S.selectedId != null) {
    const sel = living().find(function(p) { return p.id === S.selectedId; });
    const mv = legalCache.find(function(m) { return m.f === f && m.r === r; });
    if (sel && mv) { tryMove(sel, mv); return; }
  }
  if (piece && piece.side === "w") {
    S.selectedId = piece.id;
    legalCache = legalMovesFor(piece);
    S.msg = nameOf(piece.type) + " \u00b7 " + legalCache.length + " moves";
    render();
    return;
  }
  S.selectedId = null;
  legalCache = [];
  render();
}
function render() {
  if (!S) return;
  const k = king("w");
  document.getElementById("hRank").textContent = k ? k.rank : "\u2014";
  document.getElementById("hCap").textContent = S.captures;
  document.getElementById("hScore").textContent = S.score + (k ? k.rank * 15 : 0);
  document.getElementById("hPawn").textContent = S.movesUntilPawn;
  document.getElementById("hWake").textContent = S.movesUntilWake;
  document.getElementById("seedLabel").textContent = "seed " + S.seed.toString(16);
  document.getElementById("msg").textContent = S.msg;
  ensureGenerated();
  const range = viewRange();
  const lo = range.lo, hi = range.hi;
  const board = document.getElementById("board");
  board.innerHTML = "";
  board.style.gridTemplateRows = "repeat(" + (hi - lo + 1) + ", 1fr)";
  const dest = new Set(legalCache.map(function(m) { return m.f + "," + m.r; }));
  const caps = new Set(legalCache.filter(function(m) { return m.cap; }).map(function(m) { return m.f + "," + m.r; }));
  for (let r = hi; r >= lo; r--) {
    const lab = document.createElement("div");
    lab.className = "rank-label";
    lab.textContent = r;
    board.appendChild(lab);
    for (let f = 0; f < 8; f++) {
      const sq = document.createElement("div");
      const light = (f + r) % 2 === 1;
      sq.className = "sq " + (light ? "l" : "d");
      if (r <= S.wakeRank) sq.classList.add("wake");
      const key = f + "," + r;
      if (S.selectedId != null && dest.has(key)) sq.classList.add(caps.has(key) ? "atk" : "mv");
      const piece = at(f, r);
      if (piece && piece.id === S.selectedId) sq.classList.add("sel");
      if (piece) {
        const g = document.createElement("div");
        g.className = "piece " + piece.side;
        g.textContent = GLYPH[piece.side][piece.type];
        sq.appendChild(g);
      }
      sq.addEventListener("click", (function(ff, rr) { return function() { onSquare(ff, rr); }; })(f, r));
      board.appendChild(sq);
    }
  }
  document.getElementById("files").innerHTML = "<span></span>" + FILES.split("").map(function(c) { return "<span>" + c + "</span>"; }).join("");
}
function hide(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add("hidden");
}
function show(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove("hidden");
}
window.startMarch = function() {
  hide("startOv"); hide("overOv"); hide("promoOv");
  pendingPromo = null;
  try { newRun(); } catch (err) {
    const m = document.getElementById("msg");
    if (m) m.textContent = String(err);
    console.error(err);
  }
};
window.showRules = function() { show("startOv"); };
window.againRun = function() { hide("overOv"); window.startMarch(); };
function bind(id, fn) {
  const el = document.getElementById(id);
  if (!el) return;
  let last = 0;
  const go = function(e) {
    const now = Date.now();
    if (now - last < 400) return;
    last = now;
    e.preventDefault();
    e.stopPropagation();
    fn();
  };
  el.addEventListener("click", go);
  el.addEventListener("pointerup", go);
}
bind("btnGo", window.startMarch);
bind("btnAgain", window.againRun);
bind("btnRestart", window.startMarch);
bind("btnHelp", window.showRules);
document.getElementById("startOv").addEventListener("click", function(e) {
  if (e.target && (e.target.id === "btnGo" || (e.target.closest && e.target.closest("#btnGo")))) window.startMarch();
});
try { newRun(); }
catch (err) {
  console.error(err);
  const m = document.getElementById("msg");
  if (m) m.textContent = String(err);
}
