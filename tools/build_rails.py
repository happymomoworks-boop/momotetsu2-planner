"""公式「まるっと全駅！マップ」の盤面画像から、マス（駅・赤・青・黄）と線路のつながりを読み取って js/rails.js を作る。
使い方: python -I tools/build_rails.py <画像キャッシュ用フォルダ> [--check]
  画像（ズーム0の小片。東17×26枚・西20×18枚）は、キャッシュに無ければ公式サイトから1枚ずつ取得する。
  --check を付けると、つながりを描き込んだ確認用の画像を <キャッシュ>/check_<版>.png に出す。
出典: https://www.konami.com/games/momotetsu/2/map/area/east/ ・ /west/（KONAMIの許可を得て使用）

読み取り方（2026-11-12 に東京湾まわりで目視確認して決めた）：
- マスは 12px 格子の上にある（原点のずれ 10）。駅は js/stations.js の位置をそのまま使う。
- 駅以外のマスは色で判定：中心 7×7px のうち4割以上が 赤／青／黄。
- 同じ行（列）で隣り合う2マスの間を見て、線路（中心線が灰色・両側に黒いレール）か、
  海の航路（細い白線・両側が海）なら「つながっている」。両端11pxはマスの枠にかかるので見ない。
- 斜めの線・ワープ・カード移動は読み取らない。
これは画像からの自動読み取りで、ゲーム内で全区間を確かめたものではない。
"""
import sys, io, json, colorsys, pathlib, urllib.request, collections, datetime
from PIL import Image, ImageDraw

root = pathlib.Path(__file__).resolve().parent.parent
cache = pathlib.Path(sys.argv[1]); check = "--check" in sys.argv
DEBUG = set()   # 調べたい区間の始点（左か上のマス）
# 自動では読み取れなかったが、地図を拡大して線が見えることを目で確かめたつながり（離島の駅と、隣の港のマス）。2026-11-12
MANUAL = {"east": [((1426, 3874), (1426, 3922))],                       # 佐渡の港（黄）― 佐渡
          "west": [((1714, 1282), (1714, 1330)),                         # 萩の沖の赤マス ― 萩（見島への航路）
                   ((838, 3790), (838, 3838)), ((598, 3982), (598, 4030))]}  # 大宜味の沖の青マス ― 大宜味、那覇の沖の青マス ― 那覇
ed_now = [None]
SIZE = {"east": (17, 26), "west": (20, 18)}
URL = "https://www.konami.com/games/momotetsu/2/map/area/images/map/%s/0/%d-%d.webp"

def stations():
    s = (root / "js" / "stations.js").read_text(encoding="utf-8")
    return json.loads(s[s.index("const STN = ") + 12:].rstrip().rstrip(";"))

def board(ed):
    nx, ny = SIZE[ed]; d = cache / ed / "0"; d.mkdir(parents=True, exist_ok=True)
    im = Image.new("RGB", (nx * 256, ny * 256), (0, 0, 0))
    for x in range(nx):
        for y in range(ny):
            f = d / f"{x}-{y}.webp"
            if not f.exists():
                req = urllib.request.Request(URL % (ed, x, y), headers={"User-Agent": "Mozilla/5.0"})
                try: f.write_bytes(urllib.request.urlopen(req, timeout=60).read())
                except Exception as e: print("取得できない", ed, x, y, e); continue
            im.paste(Image.open(f).convert("RGB"), (x * 256, y * 256))
    return im

def hsv(p): return colorsys.rgb_to_hsv(p[0] / 255, p[1] / 255, p[2] / 255)

def build(im, stn):
    px = im.load(); W, H = im.size
    def get(x, y): return px[x, y] if 0 <= x < W and 0 <= y < H else None
    nodes = {}
    for i, s in enumerate(stn):
        nodes[(s[2] * 12 + 82, s[3] * 12 + 82)] = ("駅", i)
    for y in range(22, H - 12, 12):
        for x in range(22, W - 12, 12):
            if (x, y) in nodes: continue
            cnt = {"R": 0, "B": 0, "Y": 0}
            for yy in range(y - 3, y + 4):
                for xx in range(x - 3, x + 4):
                    h, s, v = hsv(px[xx, yy]); h *= 360
                    if s > 0.75 and v > 0.55 and (h > 335 or h < 12): cnt["R"] += 1
                    elif s > 0.75 and v > 0.6 and 212 < h < 242: cnt["B"] += 1
                    elif s > 0.65 and v > 0.8 and 33 < h < 52: cnt["Y"] += 1
            k = max(cnt, key=cnt.get)
            if cnt[k] >= 20: nodes[(x, y)] = (k, None)   # 49画素の4割
    def gray(p): return p is not None and hsv(p)[1] < 0.2
    def dark(p): return p is not None and hsv(p)[2] < 0.36
    def water(p):
        if p is None: return False
        h, s, v = hsv(p); return 0.5 < h < 0.62 and s > 0.6
    def white(p): return p is not None and hsv(p)[1] < 0.15 and hsv(p)[2] > 0.85
    def light(p): return p is not None and hsv(p)[1] < 0.3 and hsv(p)[2] > 0.7
    edges = {}
    for (x, y) in nodes:
        for dx, dy in ((1, 0), (0, 1)):
            nxt = next((st for st in range(12, 400, 12) if (x + dx * st, y + dy * st) in nodes), None)
            if not nxt: continue
            tot = r = sl = g = th = wl = 0
            for st in range(11, nxt - 10):
                cx, cy = x + dx * st, y + dy * st
                tot += 1
                c = get(cx, cy)
                g += gray(c) or any(light(get(cx + dy * o, cy + dx * o)) for o in (-2, -1, 1, 2))
                r += any(dark(get(cx - dy * o, cy - dx * o)) for o in (2, 3, 4)) and any(dark(get(cx + dy * o, cy + dx * o)) for o in (2, 3, 4))
                w = any(white(get(cx + dy * o, cy + dx * o)) for o in (-1, 0, 1))
                wl += w or any((lambda q: q is not None and hsv(q)[1] < 0.14 and hsv(q)[2] > 0.55)(get(cx + dy * o, cy + dx * o)) for o in (-1, 0, 1))   # 白い線か、桟橋の灰色
                th += w and not white(get(cx + dy * 6, cy + dx * 6)) and not white(get(cx - dy * 6, cy - dx * 6))   # 白くて細い線（航路）
                sl += any(light(get(cx + dy * o, cy + dx * o)) for o in (-2, -1, 0, 1, 2)) and water(get(cx + dy * 6, cy + dx * 6)) and water(get(cx - dy * 6, cy - dx * 6))
            if tot < 4: continue
            if (x, y) in DEBUG: print('debug', (x, y), (dx, dy), nxt, 'tot', tot, 'rail', r, 'sea', sl, 'gray', g, 'thin', th, 'line', wl)
            if r / tot >= 0.2 and g / tot >= 0.85: edges[((x, y), (x + dx * nxt, y + dy * nxt))] = "r"
            elif sl / tot >= 0.4 and g / tot >= 0.8: edges[((x, y), (x + dx * nxt, y + dy * nxt))] = "s"
            elif sl / tot >= 0.85: edges[((x, y), (x + dx * nxt, y + dy * nxt))] = "s"   # 線が薄い色でも、ずっと海の上を通っている
            elif th / tot >= 0.85 and r / tot < 0.2: edges[((x, y), (x + dx * nxt, y + dy * nxt))] = "s"   # 浅瀬や岸の近くを通る航路
            elif wl / tot >= 0.9 and th / tot >= 0.25 and r / tot < 0.2: edges[((x, y), (x + dx * nxt, y + dy * nxt))] = "s"   # 桟橋に上がる区間
            elif sl / tot >= 0.12 and g / tot >= 0.9: edges[((x, y), (x + dx * nxt, y + dy * nxt))] = "s"   # 航路が岸・桟橋に上がる区間（一部だけ海の上）
    for a, b in MANUAL.get(ed_now[0], []):
        if a in nodes and b in nodes: edges[(a, b)] = "s"
        else: print("手で足すつながりの端にマスが無い", a, b)
    return nodes, edges

stn = stations(); out = {}; report = []
for ed in ("east", "west"):
    im = board(ed)
    ed_now[0] = ed
    nodes, edges = build(im, stn[ed])
    # つながっていない部分を数える
    adj = collections.defaultdict(list)
    for a, b in edges: adj[a].append(b); adj[b].append(a)
    seen = {}; comps = []
    for n in nodes:
        if n in seen: continue
        q = [n]; seen[n] = len(comps); members = []
        while q:
            c = q.pop(); members.append(c)
            for m in adj[c]:
                if m not in seen: seen[m] = len(comps); q.append(m)
        comps.append(members)
    comps.sort(key=len, reverse=True)
    main = set(comps[0])
    lone_st = [stn[ed][nodes[n][1]][0] for n in nodes if nodes[n][0] == "駅" and n not in main]
    kinds = collections.Counter(v[0] for v in nodes.values())
    report.append(f"{ed}: マス {len(nodes)}（{dict(kinds)}） つながり {len(edges)}（線路 {sum(1 for v in edges.values() if v == 'r')}・航路 {sum(1 for v in edges.values() if v == 's')}） "
                  f"ひとかたまり {len(comps)}（最大 {len(comps[0])}マス） 本線につながらない駅 {len(lone_st)}: {' '.join(lone_st)}")
    idx = {}; N = []
    for (x, y), (k, si) in sorted(nodes.items(), key=lambda t: (t[0][1], t[0][0])):
        idx[(x, y)] = len(N); N.append([(x - 82) // 12 if (x - 82) % 12 == 0 else (x - 82) / 12, (y - 82) // 12 if (y - 82) % 12 == 0 else (y - 82) / 12, k, -1 if si is None else si])
    E = [[idx[a], idx[b], 1 if v == "s" else 0] for (a, b), v in edges.items()]
    out[ed] = {"n": N, "e": E}
    if check:
        d = ImageDraw.Draw(im)
        for (a, b), v in edges.items(): d.line((a, b), fill=(255, 0, 255) if v == "r" else (0, 200, 0), width=4)
        for n in nodes:
            if n not in main: d.ellipse((n[0] - 10, n[1] - 10, n[0] + 10, n[1] + 10), outline=(0, 255, 255), width=3)
        im.save(cache / f"check_{ed}.png")

js = ("/* 自動生成（tools/build_rails.py）。手で編集しない。取得日 %s\n"
      "   公式「まるっと全駅！マップ」の盤面画像から読み取ったマスと線路のつながり（KONAMIの許可を得て使用）。\n"
      "   n＝マス [x, y, 種類(駅/R赤/B青/Y黄), 駅の番号(STNの添字。駅でなければ-1)]（x・y は js/stations.js と同じ単位）\n"
      "   e＝つながり [マスa, マスb, 航路なら1]。隣り合うマスどうしで、1本＝1マス。\n"
      "   画像からの自動読み取りで、ゲーム内で全区間を確かめたものではない（斜めの線・ワープは入っていない）。\n%s */\n"
      "const RAILS = %s;\n") % (datetime.date.today().isoformat(), "\n".join("   " + r for r in report), json.dumps(out, ensure_ascii=False, separators=(",", ":")))
(root / "js" / "rails.js").write_text(js, encoding="utf-8")
sys.stdout.reconfigure(encoding="utf-8")
print("\n".join(report)); print("wrote js/rails.js", len(js), "chars")
