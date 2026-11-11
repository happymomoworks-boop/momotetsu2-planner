/* 画面の描画と操作。データは data.js / plan-data.js / maps.js にあります。 */

const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("mt2p." + k); return v === null ? d : v; } catch (e) { return d; } },
  set(k, v) { try { if (v === null || v === undefined) localStorage.removeItem("mt2p." + k); else localStorage.setItem("mt2p." + k, v); } catch (e) {} },
};
const VIEWS = ["plan", "year", "map", "heroes", "props", "cards"];
/* month: 1〜12 か null（未設定）。cards: 登録したカードのid配列か null（未登録＝手持ちを考えない）。other: 登録外のカードの枚数 */
const state = { cardN: {}, cardF: "進行系", cardRegQ: "", ed: "east", N: 17, year: 1, region: "all", filter: "all", sel: null, view: "plan", from: null, to: null, money: null, mapPick: null,
  month: null, playMode: "solo", goal: "balance", cards: null, other: 0, mapq: "", heroq: "", heroF: "all", propq: "", propF: "all", cardq: "" };
const GOALS = { balance: "バランス", asset: "物件・ヒーロー重視", card: "カード重視" };
const MAXCARDS = 20;
/* HTMLに入れる文字列はすべてこれを通す（駅名の入力やバックアップの読み込みに備える） */
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
/* ---------- 盤面（公式「まるっと全駅！マップ」の座標。単位はマス） ---------- */
const STN_T = "PNSADTLKY";
const placeCache = {};
/* その版の全部の場所。公式の全駅（js/stations.js）に、攻略データ（PINS）の種類と説明を重ね、駅ではない場所（OFFSTATION）を足す。
   t＝アプリでの種類（助言があればそちら）、st＝公式マップでの種類、off＝駅ではない場所 */
function places() {
  const ed = state.ed; if (placeCache[ed]) return placeCache[ed];
  const over = new Map(PINS[ed].concat(ed === "west" ? PINS.oki : []).map((p) => [p[0], p]));
  const out = STN[ed].map((s) => { const o = over.get(s[0]); return { n: s[0], yomi: s[1], x: s[2] / 4, y: s[3] / 4, t: o ? o[1] : STN_T[s[4]], st: STN_T[s[4]], d: o ? o[2] : "", c: o ? o[3] : null, props: s[6] }; });
  const byName = new Map(out.map((p) => [p.n, p]));
  OFFSTATION[ed].forEach(([n, a, b, c]) => {
    const A = byName.get(a), o = over.get(n); if (!A || !o) return;
    const B = typeof b === "string" ? byName.get(b) : null;
    out.push({ n, yomi: "", x: B ? (A.x + B.x) / 2 : A.x + b, y: B ? (A.y + B.y) / 2 : A.y + c, t: o[1], st: "", d: o[2], c: o[3], off: true, props: "" });
  });
  return (placeCache[ed] = out);
}
const getPlace = (which) => (state[which] ? places().find((p) => p.n === state[which]) || null : null);
const selectable = (p) => !p.off;
/* 距離の単位はマス。dist＝盤面上の直線（寄り道の判定に使う）。masu＝たて＋よこ（線路がまっすぐ通っている場合の最短の目安） */
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const masu = (a, b) => Math.max(1, Math.round(Math.abs(a.x - b.x) + Math.abs(a.y - b.y)));
const boardCache = {};
function boardBox() {
  const ed = state.ed; if (boardCache[ed]) return boardCache[ed];
  const P = places(), xs = P.map((p) => p.x), ys = P.map((p) => p.y), pad = 3;
  const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
  return (boardCache[ed] = [x0, y0, Math.max(...xs) + pad - x0, Math.max(...ys) + pad - y0]);
}
function loadEd() {
  const has = (n) => !!n && places().some((p) => p.n === n && selectable(p));
  const f = store.get("from." + state.ed, START[state.ed]), t = store.get("to." + state.ed, null);
  state.from = has(f) ? f : START[state.ed];   // 以前の版の「◯◯付近」など、駅にない名前は初期値に戻す
  state.to = has(t) ? t : null;
}
function restore() {
  const ed = store.get("ed", "east"); state.ed = ED[ed] ? ed : "east";
  const n = parseInt(store.get("N", "17"), 10); state.N = n >= 1 && n <= 100 ? n : 17;
  const y = parseInt(store.get("year", "1"), 10); state.year = y >= 1 && y <= state.N ? y : 1;
  const m = parseFloat(store.get("money", "")); state.money = m >= 0 && m < 1e5 ? m : null;
  const ms = store.get("month", null), mo = parseInt(ms, 10); state.month = mo >= 1 && mo <= 12 ? mo : ms === null ? 4 : null;  // 初めては4月。「わからない」を選んだら null
  state.playMode = store.get("playMode", "solo") === "multi" ? "multi" : "solo";
  const g = store.get("goal", "balance"); state.goal = GOALS[g] ? g : "balance";
  state.cards = null;
  try { const c = JSON.parse(store.get("cards", "null")); if (Array.isArray(c)) state.cards = c.filter((id) => !!CARD_BY[id]); } catch (e) {}
  state.cardN = {};
  try { const n = JSON.parse(store.get("cardn", "{}")) || {}; (state.cards || []).forEach((id) => { const v = parseInt(n[id], 10); state.cardN[id] = v >= 1 && v <= 9 ? v : 1; }); } catch (e) { (state.cards || []).forEach((id) => { state.cardN[id] = 1; }); }
  const o = parseInt(store.get("other", "0"), 10); state.other = o >= 0 && o <= MAXCARDS ? o : 0;
  loadEd();
}
restore();
const cardCount = () => (state.cards ? state.cards.reduce((n, id) => n + (state.cardN[id] || 1), 0) + state.other : null);
const hasCard = (id) => !!state.cards && state.cards.includes(id);
const hasTour = () => !!state.cards && state.cards.some((id) => CARD_BY[id] && CARD_BY[id].tour);

const phaseIndex = (y) => PHASES.findIndex((p) => y >= p.from && y <= p.to);
const oku = (c) => { const man = Math.round(c * 10000); const o = Math.floor(man / 10000); const r = man % 10000; return (o ? o + "億" : "") + (r ? r + "万" : "") || "0"; };
const GLYPH = { good: "＋", warn: "！", bad: "×" };
/* 公式素材の場所。1ファイル版（tools/build_single.py）では window.INLINE_IMG に埋め込みデータが入る */
const imgSrc = (f) => (window.INLINE_IMG && window.INLINE_IMG[f]) || "img/official/" + f;
/* ボンビーの画像（公式サイトの素材。KONAMIの許可を得て使用） */
const BONBI_IMG = { "貧乏神": "bonbi_main.webp", "ミニボンビー": "mini_main.webp", "キングボンビー": "king_main.webp", "ポコン": "pokon_main.webp", "デストロイ号": "destroy_main.webp", "バクレツボンビー": "bakuretsu_main.webp", "パーセントボンビー": "percent_main.webp", "マイナスボンビー": "minus_main.webp", "デビルボンビー": "devil_main.webp" };
function yearEvents(ed, y) {
  const N = state.N;
  let ev = (COMMON_EVENTS[y] || []).concat(ED[ed].events[y] || []).filter((e) => e.minN == null || N >= e.minN);
  if (y === N) ev = ev.concat([{ k: "warn", t: "最終年。3月の決算までに現金を物件へ" }]);
  return ev;
}
/* 月で決まるタスク（いまの年の表示で、月を入れたときだけ足す）。内容は data.js の月ごとの注意と同じ。 */
function monthTasks(ed, mo, y, N) {
  const out = [];
  if (mo === 3 || (mo === 2 && y === N)) out.push({ k: "prop", pr: 106, t: "決算前：現金を物件に変える", d: "3月の決算で収益が入る。月末までに買える物件を買っておく", why: "決算月" });
  if (mo === 8) out.push({ k: "event", pr: 58, t: "8月は青マスを踏む", d: "青マスでもらえる額が1年でいちばん多い月", why: "8月" });
  if (mo === 12 || mo === 1 || mo === 2) out.push({ k: "warn", pr: 57, t: "冬は赤マスを避ける", d: "12〜2月は赤マスの損が最大", why: "冬" });
  if (ed === "east" && mo === 7) out.push({ k: "warn", pr: 64, t: "7月は軽井沢に止まらない", d: "ヒショッチが高確率で出て2か月動けない", why: "7月" });
  if (ed === "east" && (mo === 10 || mo === 11)) out.push({ k: "card", pr: 55, t: "豪雪に備えてラッセル車", d: "11月は北海道などが豪雪地帯になることがあり、出目が1〜2になる。新青森・苗穂で買える", why: "11月前後" });
  if (ed === "west" && mo === 8) out.push({ k: "warn", pr: 62, t: "8月は徳島に止まらない", d: "アワオドレーが高確率で出て1か月動けない", why: "8月" });
  if (ed === "west" && mo === 9) out.push({ k: "warn", pr: 62, t: "9月は岸和田に止まらない", d: "ダンジリンに修理費を取られる", why: "9月" });
  return out;
}
const GOAL_BOOST = { balance: {}, asset: { hero: 8, prop: 8, card: -6 }, card: { card: 10, hero: -4, prop: -4 } };
/* ctx（いまの年の表示でだけ渡す）：money（億）で届かないタスクの優先度を下げ、month で月のタスクを足し、goal で種類ごとに重みを変える。
   cost＝そのタスクで挙げている中でいちばん安い独占額・価格。 */
function tasksFor(ed, y, N, max, ctx) {
  const left = N - y, c = ctx || {}, money = c.money;
  const ok = (t) => y >= t.from && y <= t.to && (t.minN == null || N >= t.minN) && (t.minLeft == null || left >= t.minLeft) && (t.maxLeft == null || left <= t.maxLeft) && (t.minYear == null || y >= t.minYear);
  const boost = GOAL_BOOST[c.goal] || {};
  const fit = (t) => {
    let d = typeof t.d === "function" ? t.d(N, y) : t.d;
    if (t.m) d = t.m[state.playMode === "multi" ? 1 : 0];
    let pr = t.pr + (boost[t.k] || 0);
    if (money == null || t.cost == null || t.cost <= money) return { pr, d };
    const gap = oku(Math.round((t.cost - money) * 100) / 100);
    return t.cost <= money * 2 ? { pr: pr - 10, d: `${d}（あと${gap}）` } : { pr: pr - 40, d: `${d}（まず${oku(t.cost)}まで貯める）` };
  };
  const list = TASKS[ed].concat(CLOSING).filter(ok).concat(c.month ? monthTasks(ed, c.month, y, N) : []);
  if (c.cards != null && c.cards <= 1) list.push({ k: "card", pr: 89, t: "カードを補充する", d: `手持ちが${c.cards}枚。目的地へ急ぐより先に、黄色のカード駅かカード売り場に止まる（切れる前に補充するのが基本）` });
  return list.map((t) => ({ k: t.k, t: t.t, ...fit(t) })).sort((a, b) => b.pr - a.pr).slice(0, max || 6).map(({ k, t, d }) => ({ k, t, d }));
}
const nowCtx = () => ({ money: state.money, month: state.month, goal: state.goal, cards: cardCount() });
/* 年別のチェックリスト（終えたやること）。キーは chk.<ed>.<年> */
function checks(y) { try { const a = JSON.parse(store.get(`chk.${state.ed}.${y}`, "[]")); return Array.isArray(a) ? a.filter((x) => typeof x === "string") : []; } catch (e) { return []; } }
function setCheck(y, title, on) {
  const a = checks(y).filter((x) => x !== title); if (on) a.push(title);
  store.set(`chk.${state.ed}.${y}`, a.length ? JSON.stringify(a) : null);
}
const segments = (N) => PHASES.filter((p) => p.from <= N).map((p, i) => ({ i, from: p.from, to: Math.min(p.to, N), name: p.short }));
const spanText = (a, b) => (b >= INF ? `${a}年目〜` : `${a}〜${b}年目`);

/* ---------- 年別 ---------- */
/* 年の路線。画面幅に合わせて折り返す。年数が多いとき（31年以上）は、いまの年のまわり30年分だけ出す */
function renderLine() {
  const N = state.N, y = state.year, pi = phaseIndex(y), el = $("line");
  let a = 1, b = N;
  if (N > 30) { a = Math.max(1, Math.floor((y - 1) / 10) * 10 - 9); b = Math.min(N, a + 29); a = Math.max(1, b - 29); }
  let h = "";
  for (let yy = a; yy <= b; yy++) {
    const ev = yearEvents(state.ed, yy).length > 0, ph = phaseIndex(yy), first = yy === a || PHASES[ph].from === yy;
    h += `<button type="button" class="st ph${ph}${ev ? " ev" : ""}${ph === pi ? " cur" : ""}" data-y="${yy}" aria-pressed="${yy === y}" aria-label="${yy}年目${ev ? "（この年だけの出来事あり）" : ""}"><span class="pl">${first ? PHASES[ph].short : ""}</span><span class="dot"></span><span class="n">${yy}</span><span class="tick"></span></button>`;
  }
  el.innerHTML = h;
  $("line-note").textContent = N > 30 ? `${a}〜${b}年目を表示中（全${N}年）。ほかの年は上のボタンか◀▶で移れます。` : "";
}
function signTitle() {
  const d = ED[state.ed], y = state.year, pi = phaseIndex(y), P = PHASES[pi];
  return { small: `${P.short}（${P.to >= INF || P.to > state.N ? P.from + "年目〜" : P.from + "〜" + P.to + "年目"}）`, title: y === state.N ? "最終年：現金を物件に変える" : d.phases[pi].title };
}
function renderSign() {
  const d = ED[state.ed], y = state.year, N = state.N, st = signTitle();
  const evs = yearEvents(state.ed, y);
  const threats = d.threats.filter((t) => t.spans.some(([a, b]) => y >= a && y <= b)).sort((a, b) => b.sev - a.sev);
  const avoid = d.avoid.filter((a) => y >= a.from && y <= a.to);
  const sevName = { 3: "大", 2: "中", 1: "小" };
  $("sign").innerHTML = `
    <div class="sign-main">
      <span class="sign-y num">${y}<small>年目</small></span>
      <p class="sign-t"><small>${st.small}・残り${N - y}年</small>${st.title}</p>
    </div>
    <div class="sign-band">
      <button type="button" data-step="-1" ${y === 1 ? "disabled" : ""} aria-label="前の年へ">◀ ${y > 1 ? y - 1 + "年目" : "始発"}</button>
      <span>${d.label}・全${N}年</span>
      <button type="button" data-step="1" ${y === N ? "disabled" : ""} aria-label="次の年へ">${y < N ? y + 1 + "年目" : "終点"} ▶</button>
    </div>`;
  $("flags").innerHTML = evs.map((e) => `<li class="flag ${e.k}"><i aria-hidden="true">${GLYPH[e.k]}</i><span>${e.t}</span></li>`).join("");
  $("flags").hidden = evs.length === 0;
  const done = checks(y);
  $("todo").innerHTML = tasksFor(state.ed, y, N, 6, nowCtx()).map((t) => { const on = done.includes(t.t); return `<li class="${on ? "done" : ""}"><span class="tag ${t.k}">${KIND[t.k]}</span><b>${esc(t.t)}</b><label class="tick"><input type="checkbox" data-check="${esc(t.t)}" ${on ? "checked" : ""} aria-label="${esc(t.t)}を終えた"></label><span class="d">${esc(t.d)}</span></li>`; }).join("");
  const starts = [...new Set(segments(N).map((s) => s.from).concat(N >= 32 ? [32] : []).concat([N]))].sort((a, b) => a - b);
  $("jump").innerHTML = starts.map((s) => `<button type="button" class="chip" data-y="${s}" aria-pressed="${s === y}">${s === N ? "最終年" : s + "年目"}</button>`).join("");
  $("bonbi").innerHTML = threats.map((t) => `<li class="${BONBI_IMG[t.n] ? "withimg" : ""}">${BONBI_IMG[t.n] ? `<img class="bimg" src="${imgSrc(BONBI_IMG[t.n])}" alt="" loading="lazy">` : ""}<span class="sev s${t.sev}" aria-label="危険度${sevName[t.sev]}">${sevName[t.sev]}</span><b>${t.n}</b><span class="d">${t.d}</span></li>`).join("");
  $("avoid").innerHTML = avoid.map((a) => `<li><span class="x" aria-hidden="true">×</span><b>${a.t}</b><span class="d">${a.why}</span></li>`).join("");
  $("ynow").textContent = y; $("ytot").textContent = `/${N}年`;
  $("y-prev").disabled = y === 1; $("y-next").disabled = y === N;
}
function renderTimeline() {
  const d = ED[state.ed], N = state.N, el = $("tl");
  el.style.gridTemplateColumns = `minmax(7.2em, max-content) repeat(${N}, minmax(0, 1fr))`;
  const rows = d.threats.length + 2, stepN = N <= 20 ? 1 : N <= 50 ? 5 : 10;
  let h = `<div class="tl-col on" style="grid-column:${state.year + 1};grid-row:1 / ${rows}"></div>`;
  for (let y = 1; y <= N; y++) if (stepN === 1 || y === 1 || y % stepN === 0 || y === state.year) h += `<div class="tl-h${y === state.year ? " on" : ""}" style="grid-column:${y + 1};justify-self:center;white-space:nowrap">${y}</div>`;
  d.threats.forEach((t, i) => {
    const row = i + 2;
    h += `<div class="tl-n" style="grid-row:${row};grid-column:1">${BONBI_IMG[t.n] ? `<img src="${imgSrc(BONBI_IMG[t.n])}" alt="" loading="lazy">` : ""}${t.n}</div>`;
    t.spans.forEach(([a, b]) => { if (a > N) return; h += `<div class="tl-b s${t.sev}" style="grid-row:${row};grid-column:${a + 1} / ${Math.min(b, N) + 2}" title="${t.n}：${spanText(a, b)}。${t.d}"></div>`; });
  });
  for (let y = 1; y <= N; y++) h += `<button type="button" class="tl-hit" data-y="${y}" style="grid-column:${y + 1};grid-row:1 / ${rows}" aria-label="${y}年目を選ぶ" tabindex="-1"></button>`;
  el.innerHTML = h;
  const never = d.threats.filter((t) => t.spans.every(([a]) => a > N)).map((t) => `${t.n}（${t.spans[0][0]}年目〜）`);
  $("tl-note").textContent = (never.length ? `${never.join("・")}は、${N}年プレイでは出ません。` : "") + "黄色の列がいまの年です。列をタップすると年を変えられます。";
}

/* ---------- 地図の共通部品 ---------- */
const groupColor = (g) => g === "plain" ? "var(--neutral-mark)" : g === "card" ? "var(--c-card)" : g === "hero" ? "var(--c-hero)" : g === "event" ? "var(--c-event)" : "var(--crit)";
function dotShape(g, R) {
  const col = groupColor(g);
  if (g === "avoid") return `<circle r="${R + 1.5}" fill="var(--surface)"/><path d="M-4,-4L4,4M4,-4L-4,4" stroke="${col}" stroke-width="2.8" stroke-linecap="round" fill="none"/>`;
  if (g === "hero") return `<path d="M0,-6.4L6,4.6L-6,4.6Z" fill="${col}" stroke="var(--surface)" stroke-width="1.4" stroke-linejoin="round"/>`;
  if (g === "event") return `<rect x="-4.8" y="-4.8" width="9.6" height="9.6" rx="1.8" fill="${col}" stroke="var(--surface)" stroke-width="1.4"/>`;
  return `<circle r="${R}" fill="${col}" stroke="var(--surface)" stroke-width="1.4"/>`;
}
function relax(items, s, R, cap) {
  items.forEach((p) => { p.ox = 0; p.oy = 0; });
  const need = R * 2 + 3;
  for (let it = 0; it < 60; it++) {
    let moved = false;
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      let dx = (b.x - a.x) * s + b.ox - a.ox, dy = (b.y - a.y) * s + b.oy - a.oy, dist = Math.hypot(dx, dy);
      if (dist >= need) continue;
      if (dist < 0.01) { const ang = (i * 2.4 + j) % 6.28; dx = Math.cos(ang); dy = Math.sin(ang); dist = 1; }
      const push = (need - dist) / 2 + 0.2, ux = dx / dist, uy = dy / dist;
      a.ox -= ux * push; a.oy -= uy * push; b.ox += ux * push; b.oy += uy * push; moved = true;
    }
    if (!moved) break;
  }
  items.forEach((p) => { const m2 = Math.hypot(p.ox, p.oy); if (m2 > cap) { p.ox *= cap / m2; p.oy *= cap / m2; } p.dx = p.x + p.ox / s; p.dy = p.y + p.oy / s; });
}
function placeLabels(items, vb, s, R, FS) {
  const boxes = items.map((p) => ({ x: (p.dx - vb[0]) * s - R, y: (p.dy - vb[1]) * s - R, w: R * 2, h: R * 2 }));
  const hit = (b) => boxes.some((o) => b.x < o.x + o.w && b.x + b.w > o.x && b.y < o.y + o.h && b.y + b.h > o.y);
  const Wpx = vb[2] * s, Hpx = vb[3] * s;
  items.slice().reverse().forEach((p) => {
    p.L = null; if (p.inset || p.nolabel) return;
    const w = p.n.length * FS + 4, hh = FS + 3, px = (p.dx - vb[0]) * s, py = (p.dy - vb[1]) * s;
    const cands = [
      { x: px + R + 2, y: py - hh / 2, a: "start", tx: R + 3, ty: FS * 0.35 },
      { x: px - R - 2 - w, y: py - hh / 2, a: "end", tx: -R - 3, ty: FS * 0.35 },
      { x: px - w / 2, y: py + R + 1, a: "middle", tx: 0, ty: R + FS + 0.5 },
      { x: px - w / 2, y: py - R - 1 - hh, a: "middle", tx: 0, ty: -R - 4 },
    ];
    for (const c of cands) {
      const b = { x: c.x, y: c.y, w, h: hh };
      if (b.x < 1 || b.y < 1 || b.x + w > Wpx - 1 || b.y + hh > Hpx - 1) continue;
      if (hit(b)) continue;
      boxes.push(b); p.L = c; break;
    }
  });
}
function leader(p) { return Math.hypot(p.ox, p.oy) > 4 ? `<path d="M0,0L${(-p.ox).toFixed(1)},${(-p.oy).toFixed(1)}" stroke="var(--ink-3)" stroke-width="1.2" fill="none"/><circle cx="${(-p.ox).toFixed(1)}" cy="${(-p.oy).toFixed(1)}" r="2.2" fill="var(--ink-3)"/>` : ""; }
function labelSvg(p, FS, bold) { const L = p.L; return L ? `<text x="${L.tx}" y="${L.ty}" text-anchor="${L.a}" font-size="${FS}" font-weight="${bold ? 900 : 700}" fill="var(--ink)" stroke="var(--sea)" stroke-width="3.2" paint-order="stroke" stroke-linejoin="round">${p.n}</text>` : ""; }
/* 盤面の下地：全駅のまわりを陸として塗り、駅を小さなマスで描く（版ごとに1回だけ作る） */
const landCache = {};
function landSvg() {
  const ed = state.ed; if (landCache[ed]) return landCache[ed];
  const P = places().filter((p) => !p.off);
  const ring = (r, cls) => P.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="${r}" class="${cls}"/>`).join("");
  return (landCache[ed] = `<g class="board" aria-hidden="true">${ring(2.35, "coast")}${ring(1.95, "land")}${P.map((p) => `<rect x="${(p.x - 0.32).toFixed(2)}" y="${(p.y - 0.32).toFixed(2)}" width="0.64" height="0.64" rx="0.14" class="bsq bsq-${p.st}"/>`).join("")}</g>`);
}

/* ---------- 駅マップ（一覧用） ---------- */
const curRegion = () => REGIONS[state.ed].find((r) => r.id === state.region) || REGIONS[state.ed][0];
const regionVB = (reg) => (reg.box ? [reg.box[0], reg.box[2], reg.box[1] - reg.box[0], reg.box[3] - reg.box[2]] : boardBox());
const inVB = (p, vb) => p.x >= vb[0] && p.x <= vb[0] + vb[2] && p.y >= vb[1] && p.y <= vb[1] + vb[3];
let drawn = { pins: [], s: 1, all: [] };
/* 「すべて」は助言のある駅だけ。駅名（漢字・よみ）で探したときは、どの種類の駅も出す */
function matchFilter(p) {
  if (state.mapq) return p.n.includes(state.mapq) || (p.yomi && p.yomi.includes(state.mapq));
  return state.filter === "all" ? ADVICE_TYPES.includes(p.t) : p.t === state.filter;
}
/* 地図タブにも、プランで入れたいまいる駅（発）と目的地（着）を出す */
function endMarks(vb, s) {
  return [["from", "発"], ["to", "着"]].map(([w, ch]) => {
    const p = getPlace(w); if (!p || !inVB(p, vb)) return "";
    const start = w === "from";
    return `<g transform="translate(${p.x} ${p.y}) scale(${(1 / s).toFixed(4)})" pointer-events="none"><circle r="11" fill="${start ? "var(--ink)" : "var(--yellow)"}" stroke="${start ? "var(--surface)" : "var(--ink)"}" stroke-width="2"/><text y="4.4" text-anchor="middle" font-size="12" font-weight="900" fill="${start ? "var(--surface)" : "var(--on-yellow)"}">${ch}</text></g>`;
  }).join("");
}
function renderMap() {
  if (state.view !== "map") return;
  const reg = curRegion(), svg = $("mapsvg"), vb = regionVB(reg);
  svg.setAttribute("viewBox", vb.map((v) => v.toFixed(2)).join(" "));
  svg.style.aspectRatio = vb[2].toFixed(2) + " / " + vb[3].toFixed(2);
  const rect = svg.getBoundingClientRect();
  const s = Math.min((rect.width || 360) / vb[2], (rect.height || 9999) / vb[3]);
  const all = places();
  const pins = all.filter(matchFilter).filter((p) => inVB(p, vb)).map((p) => ({ ...p }));
  const badge = pins.length <= 60 && (reg.id !== "all" || pins.length <= 36);
  let h = landSvg();
  const R = badge ? 10.5 : 5, FS = 12;
  const order = (p) => (p.n === state.sel ? 9 : p.t === "X" ? 3 : p.t === "H" ? 2 : 1);
  const sorted = pins.sort((a, b) => order(a) - order(b));
  if (badge) { relax(sorted, s, R, 34); placeLabels(sorted, vb, s, R, FS); }
  else sorted.forEach((p) => { p.ox = 0; p.oy = 0; p.dx = p.x; p.dy = p.y; p.L = null; });
  sorted.forEach((p) => {
    const g = TYPES[p.t].g, col = groupColor(g), sel = p.n === state.sel;
    let inner = leader(p);
    if (sel) inner += `<circle r="${R + 4.5}" fill="none" stroke="var(--yellow)" stroke-width="4"/><circle r="${R + 7}" fill="none" stroke="var(--ink)" stroke-width="1.2"/>`;
    if (badge) {
      inner += g === "hero" || g === "event"
        ? `<rect x="${-R}" y="${-R}" width="${R * 2}" height="${R * 2}" rx="4.5" fill="var(--surface)" stroke="${col}" stroke-width="2.6"/>`
        : `<circle r="${R}" fill="var(--surface)" stroke="${col}" stroke-width="2.6"/>`;
      inner += `<text y="4.2" text-anchor="middle" font-size="11.5" font-weight="900" fill="var(--ink)">${p.c || TYPES[p.t].c}</text>` + labelSvg(p, FS);
    } else inner += dotShape(g, R);
    h += `<g transform="translate(${p.dx.toFixed(2)} ${p.dy.toFixed(2)}) scale(${(1 / s).toFixed(4)})"><title>${esc(p.n)}（${TYPES[p.t].n}）${esc(p.d)}</title>${inner}</g>`;
  });
  // 助言のない駅（物件駅など）を選んだときの目印
  const selP = state.sel && !sorted.some((p) => p.n === state.sel) ? all.find((p) => p.n === state.sel) : null;
  if (selP && inVB(selP, vb)) h += `<g transform="translate(${selP.x} ${selP.y}) scale(${(1 / s).toFixed(4)})" pointer-events="none"><circle r="9" fill="none" stroke="var(--yellow)" stroke-width="4"/><circle r="11.5" fill="none" stroke="var(--ink)" stroke-width="1.2"/></g>`;
  h += endMarks(vb, s);
  svg.innerHTML = h;
  drawn = { pins: sorted, s, all, vb };
  const Lg = [["card", "カード関連", "N"], ["hero", "ヒーロー", "英"], ["event", "イベント・物件", "物"], ["avoid", "止まらない", "×"]];
  $("pinlegend").innerHTML = Lg.map(([g, n, c]) => badge
    ? `<span><i class="bd${g === "card" ? "" : " " + g}">${c}</i>${n}</span>`
    : `<span><svg viewBox="-8 -8 16 16">${dotShape(g, 5)}</svg>${n}</span>`).join("") + `<span><svg viewBox="-8 -8 16 16"><rect x="-4" y="-4" width="8" height="8" rx="1.6" class="bsq bsq-P"/></svg>小さなマス＝駅</span>` + (badge ? "" : `<span>エリアを選ぶと駅名が出ます</span>`);
}
function renderMapChrome() {
  const d = ED[state.ed], o = ED[state.ed === "east" ? "west" : "east"];
  const T = [["N", "ナイス"], ["D", "ダビング駅"], ["L", "周遊駅"], ["K", "刀狩り駅"]];
  $("tiles").innerHTML = T.map(([k, n]) => `<div class="panel tile"><b class="num">${d.counts[k]}</b><span>${n}</span><small>${o.label.slice(0, 1)}は${o.counts[k]}</small></div>`).join("");
  $("base").innerHTML = `拠点にするなら<b>${d.base}</b>。${d.baseWhy}。`;
  $("regions").innerHTML = REGIONS[state.ed].map((r) => `<button type="button" class="chip" data-region="${r.id}" aria-pressed="${r.id === state.region}">${r.n}</button>`).join("");
  const cls = (t) => { const g = TYPES[t].g; return g === "card" ? "" : " " + g; };
  $("filters").innerHTML = `<button type="button" class="chip" data-filter="all" aria-pressed="${state.filter === "all"}">すべて</button>` +
    TYPE_ORDER.map((t) => `<button type="button" class="chip" data-filter="${t}" aria-pressed="${state.filter === t}"><i class="bd${cls(t)}" aria-hidden="true">${TYPES[t].c}</i>${TYPES[t].n}</button>`).join("");
  $("regnote").textContent = curRegion().note;
}
function badgeHtml(p) { const g = TYPES[p.t].g; return `<i class="bd${g === "card" ? "" : " " + g}" aria-hidden="true">${p.c || TYPES[p.t].c}</i>`; }
function renderDetail() {
  const p = drawn.all.find((q) => q.n === state.sel), el = $("detail");
  el.classList.toggle("empty", !p);
  if (!p) { el.innerHTML = `<p class="sub">地図の駅か、下の一覧をタップすると、その駅の内容がここに出ます。小さなマス（物件駅など）もタップできます。</p>`; return; }
  const near = drawn.pins.filter((q) => q.n !== p.n && Math.hypot(q.x - p.x, q.y - p.y) * drawn.s < 34).slice(0, 8);
  const A = getPlace("from");
  const props = p.props ? p.props.split("|") : [];
  el.innerHTML = `<h3>${badgeHtml(p)}${esc(p.n)}<small>${p.yomi ? esc(p.yomi) + "・" : ""}${TYPES[p.t].n}</small></h3>` +
    (p.d ? `<p>${esc(p.d)}</p>` : "") +
    (A && A.n !== p.n ? `<p class="note">いまいる${esc(A.n)}から、マス目で約${masu(A, p)}マス</p>` : "") +
    (props.length ? `<div class="proplist"><span>この駅の物件（公式マップより・${props.length}種）</span>${props.map((x) => `<i>${esc(x)}</i>`).join("")}</div>` : "") +
    (near.length ? `<div class="near"><span>近くの駅</span>${near.map((q) => `<button type="button" data-pin="${esc(q.n)}">${badgeHtml(q)}${esc(q.n)}</button>`).join("")}</div>` : "") +
    (selectable(p) ? `<button type="button" class="cta" data-goto="${esc(p.n)}">ここを目的地にしてプランを作る</button>` : "");
}
function renderGroups() {
  const vb = regionVB(curRegion());
  const list = drawn.all.filter(matchFilter).filter((p) => inVB(p, vb));
  const open = state.filter !== "all" || !!state.mapq || list.length <= 14;
  const h = TYPE_ORDER.map((t) => {
    const ps = list.filter((p) => p.t === t); if (!ps.length) return "";
    return `<details class="panel grp"${(open && ps.length <= 60) || ps.some((p) => p.n === state.sel) ? " open" : ""}><summary>${badgeHtml({ t })}${TYPES[t].n}<em>${ps.length}か所</em></summary><ul class="plist">${ps.map((p) => `<li><button type="button" data-pin="${esc(p.n)}" aria-pressed="${p.n === state.sel}"><b>${esc(p.n)}</b><span>${esc(p.d || p.yomi)}</span></button></li>`).join("")}</ul></details>`;
  }).join("");
  $("groups").innerHTML = h || `<p class="sub">${state.mapq ? `「${esc(state.mapq)}」を含む駅は、この範囲にありません。エリアを「全体」にして探してください。` : "この範囲には、選んだ種類の駅がありません。"}</p>`;
}
function renderMapAll() { if (state.view !== "map") return; renderMapChrome(); renderMap(); renderDetail(); renderGroups(); }

/* ---------- プランナー ---------- */
function stopValue(p) {
  const y = state.year, N = state.N, left = N - y, pi = phaseIndex(y), money = state.money, ed = state.ed;
  const afford = (c) => (c <= money ? 1 : c <= money * 2 ? 0.5 : 0.15);
  const aTag = (c, a) => (a === 1 ? "いま買える" : a === 0.5 ? `あと${oku(c - money)}` : "下見だけ");
  switch (p.t) {
    case "F": return { v: y <= 3 ? 100 : y <= 7 ? 55 : 22, why: p.d, tag: y <= 3 ? "早い者勝ち" : "まだ誰も止まっていなければ", go: y <= 3 };
    case "H": {
      const h = ED[ed].heroes.find((x) => x.s === p.n); if (!h) return null;
      if (h.fromY && N < h.fromY) return null;
      const base = { SS: 92, S: 76, A: 56, B: 34, "推": 50 }[h.r] || 40;
      let f, tag, go = false;
      if (h.c == null) { f = 1; tag = "物件1つで仲間に"; go = true; }
      else if (money != null) { const a = afford(h.c); f = a; tag = a === 1 ? "独占額に届く" : aTag(h.c, a); go = a === 1; }
      else { f = h.ph <= pi ? 1 : 0.3; tag = h.ph <= pi ? "狙い目" : "まだ先"; go = h.ph <= pi; }
      if (left < 1) f *= 0.4;
      if (h.c != null && h.c >= 100 && left < 3) { f *= 0.4; tag = "残り年数が少ない"; go = false; }
      return { v: base * f, why: `${h.n}（${h.c == null ? "茶道具グッズ屋を買う" : "独占 " + oku(h.c)}）。${h.e}`, tag, go };
    }
    case "S": {
      const r = (p.d.match(/^評価([SAB])/) || [])[1]; let v = { S: 62, A: 50, B: 36 }[r] || 30, tag = "カード補充";
      if (state.cards && !hasTour() && /周遊/.test(p.d)) { v += 14; tag = "周遊カードを買える"; }
      return { v, why: p.d, tag };
    }
    case "D": {
      if (!state.cards) return { v: y >= 2 ? 48 : 30, why: "周遊カードや刀狩りをもう1枚に増やせる", tag: "カードを増やす" };
      const good = state.cards.map((id) => CARD_BY[id]).filter((c) => c && (c.tour || c.id === "katana" || c.id === "hoshi")).map((c) => c.n);
      return good.length ? { v: 64, why: `手持ちの${good.join("・")}を増やせる（周遊カードは回数も初期化）`, tag: "いま増やせる", go: true } : { v: 14, why: "増やす価値のあるカード（周遊・刀狩りなど）を持っていない", tag: "増やすカードなし" };
    }
    case "L": {
      if (!state.cards) return { v: y >= 2 ? 40 : 20, why: "周遊カードの使用回数を全回復", tag: "周遊カード回復" };
      return hasTour() ? { v: 60, why: "手持ちの周遊カードの使用回数を全回復", tag: "いま回復できる", go: true } : { v: 8, why: "周遊カードを持っていないので効果なし", tag: "周遊カードなし" };
    }
    case "N": return { v: 44, why: "強いカードが出やすい（デビル系も混ざる）", tag: "強カード狙い" };
    case "K": return { v: 38, why: "他の社長のカードを奪える", tag: "カードを奪う" };
    case "E": {
      if (p.c === "句") { if (left < 2) return null; return { v: 52 * Math.min(1, left / 5) * (y < 4 ? 0.6 : 1), why: "芭蕉の句。8駅そろうと物件の収益率が2倍", tag: "芭蕉の句" }; }
      if (p.c === "畑") { if (N < 16) return null; return y < 16 ? { v: 60, why: "ニンニク畑を全部買っておく（16年目の229マスカード用）", tag: "仕込み" } : { v: 85, why: "畑を全部買ってあれば、再訪で229マスカード", tag: "229マスカード", go: true }; }
      const c = PIN_COST[p.n]; let f = 1, tag = "物件", go = false;
      if (money != null && c != null) { const a = afford(c); f = a; tag = aTag(c, a); go = a === 1; }
      return { v: 46 * f, why: p.d, tag, go };
    }
  }
  return null;
}
/* 止まらない場所が「いま」効くかどうか。月・手持ち枚数が未入力なら、念のため出す。 */
const inMonths = (ms) => state.month == null || ms.includes(state.month);
const X_RULE = {
  "小田原": () => state.year <= 9,
  "夕張": () => state.year >= 8 && (cardCount() == null || cardCount() >= 4),
  "軽井沢": () => inMonths([7]),
  "網走〜斜里": () => inMonths([12, 1, 2]),
  "岸和田": () => inMonths([9]),
  "徳島": () => inMonths([8]),
  "門司港": () => cardCount() == null || cardCount() >= 5,
};
const xActive = (p) => { const f = X_RULE[p.n]; return !f || f(); };
const GOAL_MUL = { balance: {}, asset: { hero: 1.3, event: 1.3, card: 0.75 }, card: { card: 1.3, hero: 0.8, event: 0.8 } };
/* 寄り道の計算。距離はすべて盤面のマス（公式の全駅マップの位置）。線路のつながりは入っていない。
   候補＝寄り道距離（AC＋CB−AB、直線）が max(4マス, AB×22%) 以内。点数＝価値×作戦の倍率÷(1＋寄り道距離/3)。 */
function computePlan() {
  const A = getPlace("from"), B = getPlace("to");
  if (!A || !B || A.n === B.n) return null;
  const P = places(), AB = dist(A, B), lim = Math.max(4, AB * 0.22), cands = [];
  P.forEach((p) => {
    if (p.n === A.n || p.n === B.n || !"NDLSKFHE".includes(p.t)) return;
    const a = dist(A, p), b = dist(p, B), det = a + b - AB; if (det > lim) return;
    const sv = stopValue(p); if (!sv || sv.v <= 0) return;
    const mul = (GOAL_MUL[state.goal] || {})[TYPES[p.t].g] || 1;
    cands.push({ p, det, score: (sv.v * mul) / (1 + det / 3), ...sv });
  });
  cands.sort((x, y) => y.score - x.score);
  const picked = [], cnt = {}, cap = { S: 2, N: 2, H: 3, E: 2, D: 1, L: 1, F: 3, K: 1 };
  for (const c of cands) { if (picked.length >= 6) break; if (c.score < 18) continue; if ((cnt[c.p.t] || 0) >= cap[c.p.t]) continue; cnt[c.p.t] = (cnt[c.p.t] || 0) + 1; picked.push(c); }
  /* 並べ方：いまいる駅→目的地の向きに沿って、手前にある駅から順に（行ったり来たりしない） */
  const ux = (B.x - A.x) / (AB || 1), uy = (B.y - A.y) / (AB || 1), along = (c) => (c.p.x - A.x) * ux + (c.p.y - A.y) * uy;
  const order = picked.slice().sort((p, q) => along(p) - along(q));
  const avoid = P.filter((p) => p.t === "X" && p.n !== B.n && xActive(p) && dist(A, p) + dist(p, B) - AB <= Math.max(1.8, AB * 0.05));
  return { A, B, AB, masu: masu(A, B), picked: order, avoid };
}
let routeDrawn = { s: 1, vb: [0, 0, 1, 1] };
function renderRouteMap(plan) {
  const svg = $("routesvg"); if (!svg) return;
  const picking = !!state.mapPick;
  let vb = boardBox(), items = [];
  if (plan && !picking) {
    items.push({ n: plan.A.n, x: plan.A.x, y: plan.A.y, ch: "発", role: "start" });
    plan.picked.forEach((c, i) => items.push({ n: c.p.n, x: c.p.x, y: c.p.y, ch: String(i + 1), role: TYPES[c.p.t].g }));
    items.push({ n: plan.B.n, x: plan.B.x, y: plan.B.y, ch: "着", role: "goal" });
    const xs = items.map((p) => p.x), ys = items.map((p) => p.y);
    let x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const pad = Math.max(x1 - x0, y1 - y0) * 0.2 + 3.5; x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    let w = Math.max(x1 - x0, 16), h = Math.max(y1 - y0, 16); const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    if (w / h > 1.5) h = w / 1.5; if (w / h < 0.85) w = h * 0.85;
    vb = [cx - w / 2, cy - h / 2, w, h];
    plan.avoid.forEach((p) => items.push({ n: p.n, x: p.x, y: p.y, ch: "×", role: "avoid" }));
  }
  svg.setAttribute("viewBox", vb.map((v) => v.toFixed(2)).join(" "));
  svg.style.aspectRatio = vb[2].toFixed(2) + " / " + vb[3].toFixed(2);
  const rect = svg.getBoundingClientRect();
  const s = Math.min((rect.width || 360) / vb[2], (rect.height || 9999) / vb[3]);
  let h = landSvg();
  const R = 12, FS = 13;
  if (items.length) {
    const routePts = items.filter((p) => p.role !== "avoid");
    const pts = routePts.map((p) => p.x.toFixed(2) + "," + p.y.toFixed(2)).join(" ");
    h += `<polyline points="${pts}" fill="none" stroke="var(--surface)" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    h += `<polyline points="${pts}" fill="none" stroke="var(--ink)" stroke-width="3" stroke-dasharray="1 7" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>`;
    relax(items, s, R, 30); placeLabels(items, vb, s, R, FS);
    items.forEach((p) => {
      let inner = leader(p);
      if (p.role === "start") inner += `<circle r="${R}" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/><text y="4.6" text-anchor="middle" font-size="12.5" font-weight="900" fill="var(--surface)">${p.ch}</text>`;
      else if (p.role === "goal") inner += `<circle r="${R + 1.5}" fill="var(--yellow)" stroke="var(--ink)" stroke-width="2.4"/><text y="4.6" text-anchor="middle" font-size="12.5" font-weight="900" fill="var(--on-yellow)">${p.ch}</text>`;
      else if (p.role === "avoid") inner += `<circle r="${R - 2}" fill="var(--surface)" stroke="var(--crit)" stroke-width="2.6"/><path d="M-4,-4L4,4M4,-4L-4,4" stroke="var(--crit)" stroke-width="2.6" stroke-linecap="round" fill="none"/>`;
      else {
        const col = groupColor(p.role);
        inner += (p.role === "hero" || p.role === "event" ? `<rect x="${-R}" y="${-R}" width="${R * 2}" height="${R * 2}" rx="5" fill="var(--surface)" stroke="${col}" stroke-width="3"/>` : `<circle r="${R}" fill="var(--surface)" stroke="${col}" stroke-width="3"/>`) +
          `<text y="4.8" text-anchor="middle" font-size="13.5" font-weight="900" fill="var(--ink)">${p.ch}</text>`;
      }
      inner += labelSvg(p, FS, p.role === "start" || p.role === "goal");
      h += `<g transform="translate(${p.dx.toFixed(2)} ${p.dy.toFixed(2)}) scale(${(1 / s).toFixed(4)})">${inner}</g>`;
    });
  } else {
    [[getPlace("from"), "発", "start"], [getPlace("to"), "着", "goal"]].forEach(([p, ch, role]) => {
      if (!p) return;
      h += `<g transform="translate(${p.x} ${p.y}) scale(${(1 / s).toFixed(4)})"><circle r="${R}" fill="${role === "start" ? "var(--ink)" : "var(--yellow)"}" stroke="${role === "start" ? "var(--surface)" : "var(--ink)"}" stroke-width="2"/><text y="4.6" text-anchor="middle" font-size="12.5" font-weight="900" fill="${role === "start" ? "var(--surface)" : "var(--on-yellow)"}">${ch}</text></g>`;
    });
  }
  svg.innerHTML = h;
  routeDrawn = { s, vb };
}
const MONTH_ALERT = {
  3: ["🌸", "3月は決算", "月末までに現金を物件に変えておく。決算で物件の収益が入る"],
  8: ["☀️", "8月は青マスの稼ぎどき", "青マスでもらえる額が1年でいちばん多い月"],
  12: ["❄️", "冬は赤マスに注意", "12〜2月は赤マスの損が最大。迂回も考える"],
};
MONTH_ALERT[1] = MONTH_ALERT[2] = MONTH_ALERT[12];
function renderSetup() {
  const d = ED[state.ed], y = state.year, N = state.N;
  $("plan-ed").textContent = `${d.label}・${y}年目${state.month ? state.month + "月" : ""}／全${N}年`;
  if (document.activeElement !== $("in-n")) $("in-n").value = N;
  if (document.activeElement !== $("in-from")) $("in-from").value = state.from || "";
  if (document.activeElement !== $("in-to")) $("in-to").value = state.to || "";
  if (document.activeElement !== $("in-money")) $("in-money").value = state.money == null ? "" : state.money;
  $("in-month").value = state.month == null ? "" : String(state.month);
  $("in-playmode").value = state.playMode;
  $("in-goal").value = state.goal;
  $("now-y").textContent = `${y}年目`;
  $("game-sum").textContent = `${d.label}・${N}年・${state.playMode === "multi" ? "複数人" : "ひとり"}`;
  $("presets").innerHTML = [3, 5, 10, 17, 20, 30, 50, 100].map((n) => `<button type="button" class="chip" data-nset="${n}" aria-pressed="${n === N}">${n}年</button>`).join("");
  document.querySelectorAll("[data-mappick]").forEach((b) => b.setAttribute("aria-pressed", String(state.mapPick === b.dataset.mappick)));
  /* カードの登録：全114種（公式の一覧）。分類か「持っている」で切り替え、名前で探せる */
  const F = state.cardF, cq = kata2hira(state.cardRegQ || "");
  const tabs = [["have", `持っている（${(state.cards || []).length}）`]].concat(CARD_GROUPS.map(([g, l]) => [g, `${g}（${l.length}）`]));
  $("cardtabs").innerHTML = tabs.map(([k, n]) => `<button type="button" class="chip" data-cardf="${k}" aria-pressed="${!cq && F === k}">${n}</button>`).join("");
  const shown = CARDS.filter((c) => (c.id !== "m229" || state.ed === "east") && (cq ? kata2hira(c.n).includes(cq) : F === "have" ? hasCard(c.id) : c.g === F));
  $("cardreg").innerHTML = shown.length ? shown.map((c) => { const n = hasCard(c.id) ? state.cardN[c.id] || 1 : 0; return `<div class="crow"><button type="button" class="card-toggle" data-card="${esc(c.id)}" aria-pressed="${n > 0}">${esc(c.n)}</button><button type="button" class="cstep" data-cardd="${esc(c.id)}" data-d="-1" aria-label="${esc(c.n)}を1枚減らす"${n ? "" : " disabled"}>−</button><b class="num">${n}</b><button type="button" class="cstep" data-cardd="${esc(c.id)}" data-d="1" aria-label="${esc(c.n)}を1枚増やす">＋</button></div>`; }).join("")
    : `<p class="note">${cq ? "その名前のカードは見つかりません。" : "まだ何も持っていません。分類を選んで、持っているカードを足してください。"}</p>`;
  $("other-n").textContent = state.other;
  const cc = cardCount();
  $("cardreg-note").textContent = cc == null
    ? "まだ登録していません。登録すると、ダビング駅・周遊駅・売り場のおすすめと、夕張・門司港（カードの枚数で起きるイベント）の判定、カードの使いどころが変わります。"
    : `いま合計${cc}枚。` + (hasTour() ? "周遊カードあり：周遊駅とダビング駅を優先します。" : "周遊カードなし：周遊カードを買える売り場を優先します。");
  $("more-sum").textContent = [cc == null ? "カード：未登録" : `カード${cc}枚`, GOALS[state.goal]].join("・");
}
/* 所持金で買える物件・独占額に届く駅（持ち主がだれかは分からないので「未購入なら」の前提） */
function buyList() {
  const d = ED[state.ed], m = state.money;
  if (m == null) return `<div class="panel empty small">所持金を入れると、買える物件と、独占額に届く駅がここに出ます。</div>`;
  const props = d.props.map((p) => ({ ...p, inc: (p.c * p.r) / 100 })).filter((p) => p.c <= m).sort((a, b) => b.inc - a.inc || a.c - b.c).slice(0, 3);
  const rk = { SS: 0, S: 1, A: 2, "推": 3, B: 4 };
  const heroes = d.heroes.filter((x) => x.c != null && x.c <= m && !(x.fromY && state.N < x.fromY)).sort((a, b) => (rk[a.r] ?? 5) - (rk[b.r] ?? 5) || b.c - a.c).slice(0, 2);
  const li = (k, t, dd) => `<li><span class="tag ${k}">${KIND[k]}</span><b>${esc(t)}</b><span class="d">${esc(dd)}</span></li>`;
  const rows = props.map((p) => li("prop", `${p.s} ${p.n}`, `${oku(p.c)}・収益率${p.r}%・年${oku(p.inc)}`)).concat(heroes.map((x) => li("hero", `${x.s}を独占 → ${x.n}`, `独占額 ${oku(x.c)}。${x.e}`)));
  if (!rows.length) { const cheap = d.props.slice().sort((a, b) => a.c - b.c)[0]; return `<div class="panel empty small">${oku(m)}で買える高収益物件はありません。いちばん安いのは ${esc(cheap.s)} ${esc(cheap.n)}（${oku(cheap.c)}）です。</div>`; }
  return `<ul class="panel todo">${rows.join("")}</ul><p class="note">高収益物件の一覧と、独占額が所持金以内のヒーロー駅から選んでいます。ほかの社長がすでに買っている物件は買えません（持ち主はこのアプリでは分かりません）。</p>`;
}
function taskLi(t) { return `<li><span class="tag ${t.k}">${KIND[t.k]}</span><b>${esc(t.t)}</b><span class="d">${esc(t.d)}</span></li>`; }
function renderPlan() {
  if (state.view !== "plan") return;
  renderSetup();
  const y = state.year, N = state.N, plan = computePlan(), A = getPlace("from"), B = getPlace("to");
  const tasks = tasksFor(state.ed, y, N, 6, nowCtx());
  const doT = tasks.filter((t) => t.k !== "warn").slice(0, 3), ngT = tasks.filter((t) => t.k === "warn").slice(0, 2);
  // 最優先：やることの1位。寄り道の中に「いま」効く駅があれば添える
  const top = doT[0] || tasks[0];
  const goStop = plan && (plan.picked.find((c) => c.go) || plan.picked[0]);
  $("focus").innerHTML = top ? `<span class="ic" aria-hidden="true">🚩</span><small>いま${y}年目の最優先</small><b>${esc(top.t)}</b><p>${esc(top.d)}${goStop ? `<br>この区間なら：${esc(goStop.p.n)}（${esc(goStop.tag)}）に寄る` : ""}</p>` : "";
  let h = "";
  const ma = state.month && MONTH_ALERT[state.month];
  if (ma) h += `<div class="month-alert"><span class="emoji" aria-hidden="true">${ma[0]}</span><span><strong>${ma[1]}</strong><br>${ma[2]}</span></div>`;
  if (state.mapPick) h += `<div class="hint"><span>地図をタップして${state.mapPick === "from" ? "いまいる場所" : "目的地"}を選んでください</span><button type="button" data-mappick="off">やめる</button></div>`;
  if (plan || state.mapPick) {
    if (plan) h += `<div class="routehead"><b>${esc(plan.A.n)} → ${esc(plan.B.n)}</b><span>マス目で約${plan.masu}マス</span></div><p class="route-warning">※盤面のたて＋よこのマス数（公式の全駅マップの位置から計算）。線路の回り道で、実際はこれより増えることがあります。</p>`;
    h += `<div class="mapbox"><svg id="routesvg" role="img" aria-label="${plan ? `${esc(plan.A.n)}から${esc(plan.B.n)}までの寄り道を示した地図。下の一覧に同じ内容があります。` : "場所を選ぶための地図"}"></svg></div>`;
  }
  if (plan) {
    const dl = (det) => (det < 1.5 ? "通り道" : `${det < 4.5 ? "少し寄り道" : "寄り道"}（＋約${Math.round(det)}マス）`);
    const nbCls = (t) => { const g = TYPES[t].g; return g === "card" ? "" : " " + g; };
    if (plan.picked.length) {
      h += `<h3>寄る駅（この順番で）</h3><ol class="panel rlist">` +
        `<li><span class="nb start">発</span><b>${esc(plan.A.n)}</b><span class="d">いまいる駅</span></li>` +
        plan.picked.map((c, i) => `<li><span class="nb${nbCls(c.p.t)}">${i + 1}</span><b>${esc(c.p.n)}</b><span class="pills"><span class="pill type">${TYPES[c.p.t].n}</span><span class="pill${c.go ? " go" : ""}">${esc(c.tag)}</span><span class="pill">${dl(c.det)}</span></span><span class="d">理由：${esc(c.why)}</span></li>`).join("") +
        `<li><span class="nb goal">着</span><b>${esc(plan.B.n)}</b><span class="d">${plan.B.d ? esc(plan.B.d) : "目的地。着くと援助金がもらえる"}</span></li></ol>`;
    } else {
      h += `<div class="panel empty">この区間には、寄る価値の高い駅が見つかりませんでした。まっすぐ目的地へ向かいましょう。</div>`;
    }
    if (plan.avoid.length) h += `<h3>この区間で止まらない場所</h3><ul class="panel mini avoidlist">${plan.avoid.map((p) => `<li><span class="x" aria-hidden="true">×</span><b>${esc(p.n)}</b><span class="d">${esc(p.d)}</span></li>`).join("")}</ul>`;
    h += `<div class="actionline"><button type="button" class="copy-route" data-copyroute="1">今回の作戦をコピー</button><button type="button" class="cta" data-arrive="1">${esc(plan.B.n)}に着いた → 次の目的地へ</button></div>`;
  } else if (!state.mapPick) {
    h += `<div class="panel empty">${A && B && A.n === B.n ? "いまいる駅と目的地が同じです。次の目的地を入れてください。" : "目的地を入れると、通り道で寄る駅を順番に出します。"}</div>`;
  }
  const st = signTitle(), evs = yearEvents(state.ed, y);
  h += `<h3>${oku(state.money ?? 0) === "0" && state.money == null ? "所持金で買えるもの" : `所持金${oku(state.money)}で買えるもの`}</h3>${buyList()}`;
  h += `<h3>いま${y}年目${state.month ? state.month + "月" : ""}にやること</h3><div class="panel nowcard split"><p class="sub"><b>${st.title}</b>（残り${N - y}年）</p>` +
    (evs.length ? `<ul class="flags">${evs.map((e) => `<li class="flag ${e.k}"><i aria-hidden="true">${GLYPH[e.k]}</i><span>${esc(e.t)}</span></li>`).join("")}</ul>` : "") +
    `<h4>やること</h4><ul class="todo" style="margin:0 -14px">${doT.map(taskLi).join("")}</ul>` +
    (ngT.length ? `<h4 class="ng">避けること</h4><ul class="todo" style="margin:0 -14px">${ngT.map(taskLi).join("")}</ul>` : "") +
    `<a href="#year">${y}年目をくわしく見る ▶</a></div>`;
  $("planout").innerHTML = h;
  renderRouteMap(plan);
  const segs = segments(N), pi = phaseIndex(y);
  $("ov-title").textContent = `${N}年プランの全体像`;
  $("ov").innerHTML = segs.map((sg) => {
    const ts = tasksFor(state.ed, sg.from, N, 3, { goal: state.goal });
    const ev = []; for (let yy = sg.from; yy <= sg.to && ev.length < 2; yy++) yearEvents(state.ed, yy).forEach((e) => { if (e.k !== "good" && ev.length < 2 && yy !== N) ev.push(`${yy}年目 ${e.t}`); });
    return `<li class="${sg.i === pi ? "cur" : ""}"><button type="button" data-y="${sg.from}"><span class="yr">${sg.from === sg.to ? sg.from + "年目" : sg.from + "〜" + sg.to + "年目"}<small>${sg.name}${sg.i === pi ? "・いまここ" : ""}</small></span><ol>${ts.map((t) => `<li><i class="${t.k}" aria-hidden="true"></i>${esc(t.t)}</li>`).join("")}</ol>${ev.length ? `<span class="ev">${esc(ev.join("／"))}</span>` : ""}</button></li>`;
  }).join("") + (N >= 2 ? `<li class="${y === N ? "cur" : ""}"><button type="button" data-y="${N}"><span class="yr">${N}年目<small>最終年</small></span><ol>${tasksFor(state.ed, N, N, 2).map((t) => `<li><i class="${t.k}" aria-hidden="true"></i>${esc(t.t)}</li>`).join("")}</ol></button></li>` : "");
}

/* ---------- 入力 ---------- */
function setN(n) {
  n = Math.max(1, Math.min(100, Math.round(n) || 1));
  state.N = n; store.set("N", String(n)); $("in-n").value = n;
  if (state.year > n) { state.year = n; store.set("year", String(n)); }
  renderYear(); renderPlan();
}
function setPlace(which, p) {
  state[which] = p ? p.n : null;
  store.set(which + "." + state.ed, state[which]);
  state.mapPick = null;
  $("sugg-" + which).hidden = true;
  $("in-" + which).value = state[which] || "";
  renderPlan();
}
/* 駅名の候補。漢字でも、ひらがな・カタカナのよみでも探せる（よみは公式の全駅マップより） */
const kata2hira = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
const MAJOR = { east: ["東京", "札幌", "仙台", "新潟", "名古屋", "横浜", "金沢", "函館"], west: ["大阪", "京都", "神戸", "広島", "福岡", "高松", "鹿児島", "那覇"] };
function showSugg(which) {
  const inp = $("in-" + which), q = kata2hira(inp.value.trim()), ul = $("sugg-" + which), P = places().filter(selectable);
  let list;
  if (!q || q === state[which]) list = MAJOR[state.ed].map((n) => P.find((p) => p.n === n)).filter(Boolean);
  else {
    const rank = (p) => (p.n === q ? 0 : p.n.startsWith(q) ? 1 : p.yomi.startsWith(q) ? 2 : p.n.includes(q) ? 3 : 4);
    list = P.filter((p) => p.n.includes(q) || p.yomi.includes(q)).sort((a, b) => rank(a) - rank(b) || a.n.length - b.n.length).slice(0, 8);
  }
  ul.innerHTML = list.length ? list.map((p) => `<li><button type="button" data-sugg="${which}" data-name="${esc(p.n)}"><span>${esc(p.n)}</span><small>${esc(p.yomi)}・${TYPES[p.t].n}</small></button></li>`).join("")
    : `<li><p>「${esc(q)}」という駅は見つかりません。駅名を漢字かひらがなで入れるか、「地図で指定」を使ってください。</p></li>`;
  ul.hidden = false;
}
["from", "to"].forEach((which) => {
  const inp = $("in-" + which);
  let closeT = 0;  // フォーカスが外れたら少し待って候補を閉じる。その前に戻ってきたら閉じない
  inp.addEventListener("focus", () => { clearTimeout(closeT); inp.select(); showSugg(which); });
  inp.addEventListener("input", () => { clearTimeout(closeT); showSugg(which); });
  inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { const b = $("sugg-" + which).querySelector("button"); if (b) { e.preventDefault(); b.click(); inp.blur(); } } if (e.key === "Escape") { $("sugg-" + which).hidden = true; inp.blur(); } });
  inp.addEventListener("blur", () => { clearTimeout(closeT); closeT = setTimeout(() => { if (document.activeElement === inp) return; $("sugg-" + which).hidden = true; inp.value = state[which] || ""; }, 180); });
  $("sugg-" + which).addEventListener("pointerdown", (e) => { if (e.target.closest("button")) e.preventDefault(); });
});
$("in-n").addEventListener("change", (e) => setN(parseInt(e.target.value, 10)));
$("in-money").addEventListener("input", (e) => {
  const v = parseFloat(e.target.value);
  state.money = v >= 0 && v < 1e5 ? Math.round(v * 10000) / 10000 : null;
  store.set("money", state.money == null ? null : String(state.money)); renderPlan(); renderHeroes(); renderProps();
});
$("in-month").addEventListener("change", (e) => {
  const mo = parseInt(e.target.value, 10); state.month = mo >= 1 && mo <= 12 ? mo : null;
  store.set("month", state.month == null ? "none" : String(state.month)); renderPlan(); renderSign(); renderCal(); renderCards();
});
$("in-playmode").addEventListener("change", (e) => { state.playMode = e.target.value === "multi" ? "multi" : "solo"; store.set("playMode", state.playMode); renderPlan(); renderCards(); });
$("in-goal").addEventListener("change", (e) => { state.goal = GOALS[e.target.value] ? e.target.value : "balance"; store.set("goal", state.goal); renderPlan(); renderSign(); });
function saveCards() { store.set("cards", state.cards ? JSON.stringify(state.cards) : null); store.set("cardn", state.cards ? JSON.stringify(state.cardN) : null); store.set("other", String(state.other)); renderPlan(); renderCards(); }
["hero-q", "prop-q", "card-q", "map-q"].forEach((id) => $(id).addEventListener("input", (e) => {
  const q = e.target.value.trim().slice(0, 20);
  if (id === "hero-q") { state.heroq = q; renderHeroes(); }
  else if (id === "prop-q") { state.propq = q; renderProps(); }
  else if (id === "card-q") { state.cardq = q; renderCards(); }
  else { state.mapq = kata2hira(q); const all = places(), exact = all.find((p) => p.n === state.mapq), hits = state.mapq ? all.filter(matchFilter) : []; state.sel = exact ? exact.n : hits.length === 1 ? hits[0].n : null; renderMap(); renderDetail(); renderGroups(); }
}));
$("cardreg-q").addEventListener("input", (e) => { state.cardRegQ = e.target.value.trim().slice(0, 20); renderSetup(); });
$("todo").addEventListener("change", (e) => { const c = e.target.closest("[data-check]"); if (!c) return; setCheck(state.year, c.dataset.check, c.checked); c.closest("li").classList.toggle("done", c.checked); });

/* ---------- ヒーロー・物件・カード・月 ---------- */
const hit = (q, ...xs) => !q || xs.some((x) => String(x ?? "").includes(q));
function renderHeroes() {
  const d = ED[state.ed], o = ED[state.ed === "east" ? "west" : "east"], pi = phaseIndex(state.year), money = state.money, q = state.heroq, F = state.heroF;
  const fl = [["all", "すべて"], ["now", "いまの時期"], ["top", "SS・S"]].concat(money != null ? [["buy", "独占額に届く"]] : []);
  if (money == null && F === "buy") state.heroF = "all";
  $("hero-filter").innerHTML = fl.map(([k, n]) => `<button type="button" class="chip" data-heroF="${k}" aria-pressed="${state.heroF === k}">${n}</button>`).join("");
  const names = ["序盤（1〜3年目）に狙う", "中盤前半（4〜7年目）に狙う", "中盤後半（8年目〜）に狙う"];
  const keep = (x) => hit(q, x.n, x.s, x.p, x.e) && (state.heroF === "all" || (state.heroF === "now" && x.ph === Math.min(pi, 2)) || (state.heroF === "top" && (x.r === "SS" || x.r === "S")) || (state.heroF === "buy" && x.c != null && x.c <= money));
  const html = names.map((nm, i) => {
    const hs = d.heroes.filter((x) => x.ph === i && keep(x)).sort((a, b) => (a.c ?? 0) - (b.c ?? 0));
    if (!hs.length) return "";
    const now = i === Math.min(pi, 2);
    return `<div class="panel hgroup${now ? " now" : ""}"><header>${nm}${now ? `<span class="now-pill">いま${state.year}年目</span>` : ""}</header>${hs.map((x) => {
      const twin = o.heroes.find((z) => z.n === x.n);
      const late = x.fromY && state.N < x.fromY ? `<span class="pill">${state.N}年プレイでは効果が出ない</span>` : "";
      return `<div class="hrow"><span class="rk ${x.r}">${x.r}</span><b>${esc(x.n)}${money != null && x.c != null && x.c <= money ? `<span class="buy">独占額に届く</span>` : ""}</b><span class="cost">${x.c == null ? "物件1つ" : oku(x.c)}</span><span class="where">${esc(x.s)}（${esc(x.p)}）を独占 ${late}</span><p>${esc(x.e)}</p>${twin ? `<span class="other">東西：${o.label}では${esc(twin.s)}（${twin.c == null ? "物件1つ" : oku(twin.c)}）。効果の細部は東西で違うことがある</span>` : ""}</div>`;
    }).join("")}</div>`;
  }).join("");
  $("herolist").innerHTML = html || `<div class="panel empty small">条件に合うヒーローがいません。</div>`;
  $("heroavoid").innerHTML = d.heroAvoid.map((a) => `<li><span class="x" aria-hidden="true">×</span><b>${esc(a.n)}　<span style="font-weight:700;font-size:13.5px;color:var(--ink-3)">${esc(a.s)}</span></b><span class="d">${esc(a.e)}</span></li>`).join("");
}
function renderProps() {
  const d = ED[state.ed], money = state.money, q = state.propq;
  if (money == null && state.propF === "buy") state.propF = "all";
  $("prop-filter").innerHTML = [["all", "すべて"], ["fast", "元が早く取れる"]].concat(money != null ? [["buy", `所持金${oku(money)}で買える`]] : []).map(([k, n]) => `<button type="button" class="chip" data-propF="${k}" aria-pressed="${state.propF === k}">${n}</button>`).join("");
  let rows = d.props.map((p) => ({ ...p, inc: (p.c * p.r) / 100 })).filter((r) => hit(q, r.s, r.n));
  if (state.propF === "buy") rows = rows.filter((r) => r.c <= money);
  if (state.propF === "fast") rows = rows.slice().sort((a, b) => b.r - a.r || b.inc - a.inc);
  else rows.sort((a, b) => b.inc - a.inc || a.c - b.c);
  const max = Math.max(1, ...rows.map((r) => r.inc));
  $("bars").innerHTML = rows.length ? rows.map((r) => {
    const pay = 100 / r.r, can = money != null && r.c <= money;
    return `<div class="brow"><b>${esc(r.s)} ${esc(r.n)}</b><span class="v">年${oku(r.inc)}</span><div class="track"><div class="fill" style="width:${((r.inc / max) * 100).toFixed(1)}%"></div></div><span class="m">価格${oku(r.c)}・収益率${r.r}%</span><span class="why"><span class="pill${pay <= 0.5 ? " go" : ""}">元が取れるまで約${pay < 1 ? pay.toFixed(2).replace(/0$/, "") : pay}年</span>${can ? `<span class="pill go">いま買える</span>` : money != null ? `<span class="pill">あと${oku(Math.round((r.c - money) * 100) / 100)}</span>` : ""}</span></div>`;
  }).join("") : `<p class="sub">条件に合う物件がありません。</p>`;
  $("propnote").textContent = d.propNote;
  $("spec").innerHTML = d.propSpecial.map((s) => `<li><b>${esc(s.t)}</b><span>${esc(s.d)}</span></li>`).join("");
}
function cardAdvice() {
  const y = state.year, mo = state.month, ed = state.ed, out = [];
  if (!state.cards) out.push(["🎴", "手持ちのカードを登録する", "プラン画面の「くわしい状況」で登録すると、ダビング駅・周遊駅・売り場のおすすめが手持ちに合わせて変わります。"]);
  else {
    if (!hasTour()) out.push(["🚅", "周遊カードを買う", ed === "east" ? "大原（評価S）か福生（評価A）の売り場で。周遊カードは何回も使える毎月の足" : "西大寺（評価S）か王寺（評価A）の売り場で。宮本武蔵駅（1〜3年目、最初の1人）ならリニア周遊も"]);
    else out.push(["♻️", "周遊カードの回数を回復・複製", ed === "east" ? "大網白里の周遊駅で回数を全回復。千原台などのダビング駅で1枚増やせる" : "永原の周遊駅で回数を全回復。沖縄のダビング駅4つか竹生島で増やせる"]);
    if (!hasCard("katana") && y >= 4) out.push(["⚔️", "刀狩りを持っておく", ed === "east" ? "福生・袋田で買える。相手の強いカードを1枚奪える" : "福崎・中百舌鳥などで買える。相手の強いカードを1枚奪える"]);
    const cc = cardCount();
    if (ed === "east" && y >= 8 && cc >= 4) out.push(["⚠️", `いま${cc}枚：夕張に止まらない`, "カード4枚以上で夕張に止まると、メロメロンにカードを配られることがある"]);
    if (ed === "west" && cc >= 5) out.push(["⚠️", `いま${cc}枚：門司港に止まらない`, "カード5枚以上だとタタッキーにカードを安く売られる"]);
  }
  if (ed === "east" && (mo === 10 || mo === 11) && !hasCard("russell")) out.push(["❄️", "ラッセル車を用意", "11月は豪雪で出目が1〜2になることがある。新青森・苗穂で買える（最初の豪雪では全員に1枚配られる）"]);
  if ([5, 10, 15, 20, 30].includes(y)) out.push(["🎁", `${y}年目：売り場の無料サービス`, "この年は売り場で購入が無料になる可能性がある"]);
  if (y % 10 === 0) out.push(["💰", `${y}年目：ポイント還元20%`, "高額カードはこの年に買うと得"]);
  if (y <= 3) out.push(["🆓", "最初に止まるともらえる駅を回る", ED[ed].free.slice(0, 3).map((f) => f.s).join("・") + "など（下の一覧）"]);
  return out;
}
function renderCards() {
  const d = ED[state.ed], HOT = ["☆飛び", "刀狩り", "ダビング", "特急周遊", "新幹線周遊", "テレポート", "リニア", "ラッセル車"], q = state.cardq;
  $("cardadvice").innerHTML = cardAdvice().map(([ic, t, s]) => `<li><span class="ic" aria-hidden="true">${ic}</span><b>${esc(t)}</b><span>${esc(s)}</span></li>`).join("");
  const list = CARD_INFO.filter((c) => (c.id !== "m229" || state.ed === "east") && hit(q, c.n, c.e, c.get));
  list.sort((a, b) => hasCard(b.id) - hasCard(a.id));   // 手持ちを上に
  /* 効果を収録していないカードを持っているときは、名前と枚数だけ出す */
  const others = (state.cards || []).map((id) => CARD_BY[id]).filter((c) => c && !c.info && hit(q, c.n));
  const otherHtml = others.map((c) => `<li><b>${esc(c.n)}<span class="own">手持ち ${state.cardN[c.id] || 1}枚</span><span class="conf un">効果は未収録</span></b><span>${esc(c.g)}のカード。公式の一覧にあるのは名前だけで、効果はまだ確認できていません。</span></li>`).join("");
  $("cardinfo").innerHTML = otherHtml + (list.length ? list.map((c) => `<li><b>${esc(c.n)}${hasCard(c.id) ? `<span class="own">手持ち ${state.cardN[c.id] || 1}枚</span>` : ""}<span class="conf ${c.st === "ok" ? "ok" : c.st === "est" ? "est" : "un"}">${CONF[c.st]}</span></b><span>${esc(c.e)}</span><span>使いどころ：${esc(c.use)}（目安）</span><span>入手：${esc(c.get)}</span></li>`).join("") : otherHtml ? "" : `<li><span>条件に合うカードがありません。</span></li>`);
  $("steps").innerHTML = d.loop.map((s) => `<li><span>${esc(s)}</span></li>`).join("");
  $("free").innerHTML = d.free.map((f) => `<li><b>${esc(f.s)}<small>${esc(f.p)}</small></b><span>${esc(f.m ? f.m[state.playMode === "multi" ? 1 : 0] : f.c)}</span></li>`).join("");
  $("shop").innerHTML = d.shops.filter((s) => hit(q, s.st, ...s.cards)).map((s) => `<li><span class="rk ${s.r === "—" ? "B" : s.r}" ${s.r === "—" ? 'aria-label="評価なし"' : ""}>${s.r}</span><b>${esc(s.st)}</b><div class="cs">${s.cards.map((c) => `<span${HOT.some((x) => c.startsWith(x)) ? ' class="hot"' : ""}>${esc(c)}</span>`).join("")}</div></li>`).join("");
  $("shopnote").textContent = "S・A・BはGame8の評価。青い枠は優先して買いたいカードです。" + d.shopNote + (state.playMode === "multi" && state.ed === "east" ? "複数人プレイでは一部の売り場で品が変わることがあります（未収録）。" : "") + (q ? "（売り場も検索語で絞っています）" : "");
}
function renderCal() {
  const d = ED[state.ed], order = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  $("cal").innerHTML = order.map((mo) => { const c = d.cal[mo]; return `<div class="mo${c ? " " + c.k : ""}${mo === state.month ? " now" : ""}"${mo === state.month ? ' aria-current="date"' : ""}><b>${mo}月</b><span>${c ? c.l : "　"}</span></div>`; }).join("");
  $("calnotes").innerHTML = d.calNotes.map((n) => { const i = n.indexOf("："); return `<li><b>${n.slice(0, i)}</b>　${n.slice(i + 1)}</li>`; }).join("");
}

function renderYear() { renderLine(); renderSign(); renderTimeline(); renderHeroes(); }
function renderAll() {
  document.documentElement.dataset.ed = state.ed;
  document.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.ed === state.ed)));
  $("rules").innerHTML = COMMON_RULES.map((r) => `<li>${r}</li>`).join("");
  renderYear(); renderMapAll(); renderProps(); renderCards(); renderCal(); renderPlan();
}
function setYear(y) { state.year = Math.max(1, Math.min(state.N, y)); store.set("year", String(state.year)); renderYear(); renderPlan(); renderCards(); }
function showView(v, scroll) {
  if (!VIEWS.includes(v)) v = "plan";
  state.view = v;
  document.querySelectorAll("[data-view]").forEach((s) => { s.hidden = s.dataset.view !== v; });
  document.querySelectorAll("[data-tab]").forEach((a) => { if (a.dataset.tab === v) a.setAttribute("aria-current", "page"); else a.removeAttribute("aria-current"); });
  if (v === "map") renderMapAll();
  if (v === "plan") renderPlan();
  if (v === "year") { renderLine(); renderTimeline(); }
  if (scroll) window.scrollTo(0, 0);
}
function go(v) { if (location.hash !== "#" + v) location.hash = v; showView(v, state.view !== v); }

/* ---------- 小さな通知・コピー・バックアップ ---------- */
function toast(msg) {
  const el = $("toast"); el.textContent = msg; el.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { el.hidden = true; }, 2600);
}
async function copyRoute() {
  const plan = computePlan(); if (!plan) return;
  const lines = [`【桃鉄2 攻略プランナー（非公式）】${ED[state.ed].label} ${state.year}/${state.N}年目${state.month ? "・" + state.month + "月" : ""}`,
    `いまいる駅：${plan.A.n} → 目的地：${plan.B.n}（マス目で約${plan.masu}マス）`,
    `寄る駅：${plan.picked.length ? plan.picked.map((c, i) => `${i + 1}.${c.p.n}（${c.tag}）`).join(" → ") : "なし（まっすぐ目的地へ）"}`,
    plan.avoid.length ? `止まらない：${plan.avoid.map((p) => p.n).join("・")}` : "",
    `いまやること：${tasksFor(state.ed, state.year, state.N, 3, nowCtx()).map((x) => x.t).join("／")}`,
    "※距離は盤面のマス目（たて＋よこ）の目安です。線路のつながりは入っていないので、経路はゲーム画面で確認してください。"].filter(Boolean);
  const txt = lines.join("\n");
  try {
    if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(txt);
    else { const ta = document.createElement("textarea"); ta.value = txt; ta.setAttribute("readonly", ""); ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select(); const ok = document.execCommand("copy"); ta.remove(); if (!ok) throw new Error("copy"); }
    toast("作戦をコピーしました");
  } catch (err) { toast("コピーできませんでした"); }
}
const BACKUP_KIND = "momotetsu2-planner-backup";
function exportBackup() {
  const data = {};
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.startsWith("mt2p.")) data[k] = localStorage.getItem(k); } } catch (e) { toast("この環境では保存データを読めません"); return; }
  const blob = new Blob([JSON.stringify({ kind: BACKUP_KIND, version: 1, saved: new Date().toISOString(), data }, null, 1)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `momotetsu2-planner-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  toast(`書き出しました（${Object.keys(data).length}項目）`);
}
/* 読み込むのは mt2p. で始まるキーの文字列だけ。値は restore() で範囲を確かめてから使う。 */
function importBackup(text) {
  let obj; try { obj = JSON.parse(text); } catch (e) { toast("ファイルを読めませんでした（JSONではありません）"); return; }
  if (!obj || obj.kind !== BACKUP_KIND || typeof obj.data !== "object" || !obj.data) { toast("このアプリのバックアップではありません"); return; }
  const entries = Object.entries(obj.data).filter(([k, v]) => /^mt2p\.[\w.\-]{1,40}$/.test(k) && typeof v === "string" && v.length <= 4000).slice(0, 2000);
  if (!entries.length) { toast("戻せるデータがありませんでした"); return; }
  try {
    Object.keys(localStorage).filter((k) => k.startsWith("mt2p.")).forEach((k) => localStorage.removeItem(k));
    entries.forEach(([k, v]) => localStorage.setItem(k, v));
  } catch (e) { toast("この環境では保存できません"); return; }
  restore(); state.region = "all"; state.sel = null; state.mapPick = null;
  renderAll(); toast(`復元しました（${entries.length}項目）`);
}
/* 確認ダイアログの代わり：1回目で文言が変わり、5秒以内にもう一度押したら実行（true を返す） */
function armed(btn, msg) {
  if (btn.dataset.armed) { clearTimeout(armed.t); delete btn.dataset.armed; btn.textContent = btn.dataset.label; return true; }
  btn.dataset.label = btn.textContent; btn.dataset.armed = "1"; btn.textContent = msg;
  armed.t = setTimeout(() => { if (btn.dataset.armed) { delete btn.dataset.armed; btn.textContent = btn.dataset.label; } }, 5000);
  return false;
}
function resetAll() {
  try { Object.keys(localStorage).filter((k) => k.startsWith("mt2p.")).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  restore(); state.mapPick = null; $("gamesetup").open = true; renderAll(); toast("入力を消しました");
}
/* 新しいゲーム：年・月・駅・所持金・カード・チェックを消す。東西・年数・人数・作戦の設定は残す */
function newGame() {
  try { Object.keys(localStorage).filter((k) => /^mt2p\.(year|month|money|cards|cardn|other|started|from\.|to\.|custom\.|chk\.)/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  restore(); state.mapPick = null; $("gamesetup").open = true; renderAll(); window.scrollTo(0, 0); toast("新しいゲームの準備ができました");
}
/* 月を1つ進める。3月の次は、年が1つ進んで4月 */
function nextMonth() {
  let mo = state.month, y = state.year;
  if (mo == null) mo = 4;
  else if (mo === 3) { if (y >= state.N) { toast("最終年の3月です。ゲーム終了です"); return; } y += 1; mo = 4; }
  else mo = (mo % 12) + 1;
  state.month = mo; store.set("month", String(mo));
  if (y !== state.year) setYear(y); else { renderPlan(); renderSign(); renderCal(); renderCards(); }
  toast(`${state.year}年目 ${mo}月`);
}
$("restore-file").addEventListener("change", (e) => {
  const f = e.target.files && e.target.files[0]; e.target.value = ""; if (!f) return;
  if (f.size > 512 * 1024) { toast("ファイルが大きすぎます"); return; }
  const r = new FileReader(); r.onload = () => importBackup(String(r.result)); r.onerror = () => toast("ファイルを読めませんでした"); r.readAsText(f);
});

document.addEventListener("click", (e) => {
  const tab = e.target.closest("a[href^='#']");
  if (tab) { e.preventDefault(); go(tab.getAttribute("href").slice(1)); return; }
  const svg = e.target.closest("#routesvg");
  if (svg && state.mapPick) {
    const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; const ctm = svg.getScreenCTM(); if (!ctm) return;
    const q = pt.matrixTransform(ctm.inverse());
    let best = null, bd = 1e9;
    places().filter(selectable).forEach((p) => { const dd = dist(p, q); if (dd < bd) { bd = dd; best = p; } });
    const which = state.mapPick;
    if (best) { setPlace(which, best); toast(`${best.n}を${which === "from" ? "いまいる駅" : "目的地"}にしました`); }
    return;
  }
  const b = e.target.closest("button"); if (!b) return;
  const ds = b.dataset;
  if (ds.ed) { if (ds.ed === state.ed) return; state.ed = ds.ed; state.region = "all"; state.sel = null; state.mapPick = null; state.mapq = ""; $("map-q").value = ""; store.set("ed", state.ed); loadEd(); renderAll(); }
  else if (ds.y) { setYear(parseInt(ds.y, 10)); if (b.closest("#ov")) go("year"); }
  else if (ds.step) { const inSign = !!b.closest("#sign"); setYear(state.year + parseInt(ds.step, 10)); if (inSign) { const nb = $("sign").querySelector(`[data-step="${ds.step}"]`); if (nb && !nb.disabled) nb.focus(); } }
  else if (ds.n) setN(state.N + parseInt(ds.n, 10));
  else if (ds.nset) setN(parseInt(ds.nset, 10));
  else if (ds.sugg) setPlace(ds.sugg, places().find((p) => p.n === ds.name));
  else if (ds.mappick) { state.mapPick = ds.mappick === "off" || state.mapPick === ds.mappick ? null : ds.mappick; renderPlan(); if (state.mapPick) { const el = $("routesvg") || $("planout"); window.scrollTo(0, Math.max(0, el.getBoundingClientRect().top + window.scrollY - 140)); } }
  else if (ds.arrive) { const B = getPlace("to"); if (B) { state.to = null; store.set("to." + state.ed, null); setPlace("from", B); $("in-to").value = ""; $("in-to").focus(); toast(`${B.n}を、いまいる駅にしました`); } }
  else if (ds.goto) { const p = places().find((x) => x.n === ds.goto); if (p) { setPlace("to", p); go("plan"); } }
  else if (ds.region) { state.region = ds.region; state.sel = null; renderMapAll(); }
  else if (ds.filter) { state.filter = ds.filter; state.sel = null; renderMapAll(); }
  else if (ds.pin) { state.sel = ds.pin; renderMap(); renderDetail(); renderGroups(); }
  else if (ds.card) {
    const cur = state.cards ? state.cards.slice() : [];
    if (cur.includes(ds.card)) { state.cards = cur.filter((x) => x !== ds.card); delete state.cardN[ds.card]; }
    else { state.cards = cur.concat([ds.card]); state.cardN[ds.card] = 1; }
    saveCards();
  }
  else if (ds.cardd) {   // 枚数の＋−。0枚になったら「持っていない」に戻す
    const n = Math.max(0, Math.min(9, (state.cardN[ds.cardd] || 0) + parseInt(ds.d, 10))), cur = (state.cards || []).filter((x) => x !== ds.cardd);
    if (n > 0) { cur.push(ds.cardd); state.cardN[ds.cardd] = n; } else delete state.cardN[ds.cardd];
    state.cards = cur; saveCards();
  }
  else if (ds.money) {
    const v = ds.money === "clear" ? null : Math.max(0, Math.min(99999, Math.round(((state.money || 0) + parseFloat(ds.money)) * 10000) / 10000));
    state.money = v; store.set("money", v == null ? null : String(v)); $("in-money").value = v == null ? "" : v; renderPlan(); renderHeroes(); renderProps();
  }
  else if (ds.cardf) { state.cardF = ds.cardf; state.cardRegQ = ""; $("cardreg-q").value = ""; renderSetup(); }
  else if (ds.nextmonth) nextMonth();
  else if (ds.startgame) { store.set("started", "1"); $("gamesetup").open = false; renderSetup(); toast(`${ED[state.ed].label}・${state.N}年で始めます`); }
  else if (ds.newgame) { if (armed(b, "もう一度押すと、入力を消して最初から")) newGame(); }
  else if (ds.other) { if (!state.cards) state.cards = []; state.other = Math.max(0, Math.min(MAXCARDS, state.other + parseInt(ds.other, 10))); saveCards(); }
  else if (ds.swap) {
    const f = state.from; state.from = state.to || START[state.ed]; state.to = f;
    store.set("from." + state.ed, state.from); store.set("to." + state.ed, state.to);
    renderPlan(); toast("いまいる駅と目的地を入れ替えました");
  }
  else if (ds.copyroute) copyRoute();
  else if (ds.herof) { state.heroF = ds.herof; renderHeroes(); }
  else if (ds.propf) { state.propF = ds.propf; renderProps(); }
  else if (ds.backup === "export") exportBackup();
  else if (ds.backup === "reset") { if (armed(b, "もう一度押すと、すべて消します")) resetAll(); }
});
$("mapsvg").addEventListener("click", (e) => {
  const svg = $("mapsvg"), pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY;
  const ctm = svg.getScreenCTM(); if (!ctm) return;
  const q = pt.matrixTransform(ctm.inverse());
  let best = null, bd = 28;
  drawn.pins.forEach((p) => { const dd = Math.hypot((p.dx ?? p.x) - q.x, (p.dy ?? p.y) - q.y) * drawn.s; if (dd < bd) { bd = dd; best = p; } });
  if (!best) { bd = 22; drawn.all.forEach((p) => { const dd = dist(p, q) * drawn.s; if (dd < bd) { bd = dd; best = p; } }); }
  state.sel = best ? best.n : null; renderMap(); renderDetail(); renderGroups();
});
$("line").addEventListener("keydown", (e) => {
  if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
  e.preventDefault(); setYear(state.year + (e.key === "ArrowRight" ? 1 : -1));
  const b = $("line").querySelector(`[data-y="${state.year}"]`); if (b) b.focus();
});
let rz, lastW = window.innerWidth;
window.addEventListener("resize", () => { if (window.innerWidth === lastW) return; lastW = window.innerWidth; clearTimeout(rz); rz = setTimeout(() => { renderMap(); if (state.view === "plan") renderRouteMap(computePlan()); }, 150); });
window.addEventListener("hashchange", () => showView(location.hash.slice(1), true));

/* 出典と確認状況 */
const EXTRA_SOURCES = [
  ["公式 アップデート履歴（KONAMI）", "https://www.konami.com/games/momotetsu/2/update.php"],
  ["歴史ヒーロー一覧（Game8）", "https://game8.jp/momotetsu-2/737482"],
  ["名産怪獣一覧（Game8）", "https://game8.jp/momotetsu-2/737487"],
  ["高収益物件（Game8）", "https://game8.jp/momotetsu-2/742161"],
  ["カード個別ページ（攻略大百科）", "https://gamepedia.jp/momotetsu2/card/799"],
  ["プレイスタイル・年数（Game8）", "https://game8.jp/momotetsu-2/737969"],
  ["ゲームモードとプレイ年数（攻略大百科）", "https://gamepedia.jp/momotetsu2/archives/665"],
];
$("sources").innerHTML = SOURCES.concat(EXTRA_SOURCES).map(([t, u]) => `<li><a href="${u}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("");
$("verify").innerHTML = `<p class="note">確認日：${CHECKED}。確認済み＝出典の文言で確認／推定＝言い換えや出典の食い違いあり／未確認＝出典が見つからない。ここに無い数値は元の攻略記事のままです。</p><table class="vtable"><thead><tr><th>項目</th><th>状況</th><th>内容</th></tr></thead><tbody>${VERIFY.map((v) => `<tr><td>${v.u ? `<a href="${v.u}" target="_blank" rel="noopener">${esc(v.t)}</a>` : esc(v.t)}</td><td><span class="conf ${v.st}">${CONF[v.st]}</span></td><td>${esc(v.note)}</td></tr>`).join("")}</tbody></table>`;
$("srcnote").textContent = "攻略サイト（2025年11月〜2026年1月更新）をもとに、2026年11月12日に主な数値を照合した参考プランです。公式Ver1.0.6（2026年3月3日）で一部の物件駅の配置・表記が変わっていますが、どの駅かは未確認です。32年目より先の助言は大まかです。";
$("gamesetup").open = store.get("started", "") !== "1";
renderAll();
showView(location.hash.slice(1) || "plan", false);
if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { renderMap(); if (state.view === "plan") renderRouteMap(computePlan()); });
