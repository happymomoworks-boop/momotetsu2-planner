"""公式サイト「まるっと全駅！マップ」から、全駅の名前・よみ・盤面上の位置・種類・物件名を取り出して js/stations.js を作る。
使い方: python -I tools/build_stations.py [キャッシュ用フォルダ]
出典: https://www.konami.com/games/momotetsu/2/map/area/east/ ・ /west/（KONAMIの許可を得て使用）

座標：公式ページの data-x / data-y は盤面画像上の位置（12単位刻み、原点のずれ82）。1マス＝48単位。
ここでは (x-82)/12 の整数（＝4で割るとマス数）で持つ。
種類（data-icon）：0物件駅 1ナイスカード駅 2カード売り場駅 3ヘリポート駅 4ダビング駅 5宝くじ駅 6周遊駅 7刀狩り駅 8空港駅。"s"（雪の売り場＝苗穂・新青森）は2として扱う
"""
import re, sys, json, pathlib, urllib.request, collections, datetime

root = pathlib.Path(__file__).resolve().parent.parent
cache = pathlib.Path(sys.argv[1]) if len(sys.argv) > 1 else None
BASE = "https://www.konami.com/games/momotetsu/2/map/area/%s/"
TYPES = "PNSADTLKY"  # data-icon の順

def page(ed):
    if cache and (cache / f"{ed}.html").exists():
        return (cache / f"{ed}.html").read_text(encoding="utf-8", errors="replace")
    req = urllib.request.Request(BASE % ed, headers={"User-Agent": "Mozilla/5.0"})
    html = urllib.request.urlopen(req, timeout=60).read().decode("utf-8", errors="replace")
    if cache:
        cache.mkdir(parents=True, exist_ok=True); (cache / f"{ed}.html").write_text(html, encoding="utf-8")
    return html

def parse(html):
    out = []
    blocks = html.split('<li class="station"')[1:]
    for b in blocks:
        m = re.match(r'\s*data-name="([^"]*)" data-num="(\d+)" data-x="(\d+)" data-y="(\d+)" data-new="(\d)"', b)
        icon = re.search(r'<div class="name" data-icon="(\w)"', b)
        yomi = re.search(r"<rt[^>]*>([^<]*)</rt>", b)
        if not (m and icon):
            raise SystemExit("駅のデータの形が変わっています: " + b[:120])
        name, num, x, y, new = m.group(1), int(m.group(2)), int(m.group(3)), int(m.group(4)), int(m.group(5))
        if (x - 82) % 12 or (y - 82) % 12:
            raise SystemExit(f"座標がマス目に乗っていません: {name} {x},{y}")
        props = re.findall(r'<li class="prop"[^>]*>\s*<ruby[^>]*>\s*<span[^>]*>([^<]*)</span>', b)
        cnt = collections.Counter(props)
        ptxt = "|".join(n + (f"×{c}" if c > 1 else "") for n, c in cnt.items())
        out.append([name, yomi.group(1) if yomi else "", (x - 82) // 12, (y - 82) // 12, 2 if icon.group(1) == "s" else int(icon.group(1)), new, ptxt])  # "s"＝雪の売り場（ラッセル車）
    return out

sys.stdout.reconfigure(encoding="utf-8")
# 同名の駅は県名を付けて区別する（キーは 版・駅名・x）。アプリの攻略データが指す側（深川＝東京、野田＝千葉、福山＝広島）は素の名前のまま
RENAME = {("east", "深川", 245): "深川（北海道）", ("east", "日高", 245): "日高（北海道）", ("east", "日高", 153): "日高（埼玉）",
          ("east", "野田", 249): "野田（岩手）", ("west", "福山", 106): "福山（鹿児島）"}
data = {ed: parse(page(ed)) for ed in ("east", "west")}
for ed, st in data.items():
    for s in st:
        s[0] = RENAME.get((ed, s[0], s[2]), s[0])
    dup = [n for n, k in collections.Counter(s[0] for s in st).items() if k > 1]
    if dup: raise SystemExit("同名の駅が残っています。RENAME に足してください: " + " ".join(dup))
for ed, st in data.items():
    c = collections.Counter(TYPES[s[4]] for s in st)
    print(ed, len(st), dict(c), "x", min(s[2] for s in st), max(s[2] for s in st), "y", min(s[3] for s in st), max(s[3] for s in st))

js = ("/* 自動生成（tools/build_stations.py）。手で編集しない。\n"
      "   出典：KONAMI「桃太郎電鉄2」公式サイト まるっと全駅！マップ（許可を得て使用）。取得日 %s\n"
      "   1駅＝[駅名, よみ, x, y, 種類, 新駅フラグ, 物件名（|区切り）]。x・y は盤面上の位置で、4で割るとマス数（1マス＝4）。\n"
      "   種類：0物件駅 1ナイスカード駅 2カード売り場駅 3ヘリポート駅 4ダビング駅 5宝くじ駅 6周遊駅 7刀狩り駅 8空港駅 */\n"
      "const STN = %s;\n") % (datetime.date.today().isoformat(), json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("]],", "]],\n").replace("],[", "],\n["))
(root / "js" / "stations.js").write_text(js, encoding="utf-8")
print("wrote js/stations.js", len(js), "chars")
