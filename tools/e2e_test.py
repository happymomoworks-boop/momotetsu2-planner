"""桃鉄2 攻略プランナーの操作テスト（file:// で開く＝ダブルクリックと同じ条件）。
使い方: python -I tools/e2e_test.py index.html <スクショ出力先フォルダ>
必要なもの: pip install playwright と、PCの Microsoft Edge（channel="msedge" で起動）。
入力内容は一時的なブラウザ環境で消去するので、普段のブラウザの保存データには触れない。
"""
import sys, json, pathlib
sys.stdout.reconfigure(encoding="utf-8")
from playwright.sync_api import sync_playwright

INDEX = pathlib.Path(sys.argv[1]).resolve()
OUT = pathlib.Path(sys.argv[2]); OUT.mkdir(parents=True, exist_ok=True)
URL = INDEX.as_uri()
results = []
def check(name, ok, detail=""):
    results.append((name, bool(ok), detail))
    print(("PASS " if ok else "FAIL ") + name + (("  — " + str(detail)) if detail and not ok else ""))

def text(pg, sel): return pg.locator(sel).inner_text()
def pick(pg, which, q):
    inp = pg.locator(f"#in-{which}")
    inp.click(); inp.fill(q)
    pg.locator(f"#sugg-{which} button", has_text=q).first.click()
    pg.wait_for_timeout(80)

with sync_playwright() as p:
    b = p.chromium.launch(channel="msedge")
    ctx = b.new_context(viewport={"width": 390, "height": 844}, device_scale_factor=2, has_touch=True, accept_downloads=True)
    ctx.route("**/fonts.googleapis.com/**", lambda r: r.abort())  # 操作テストはフォントなし（オフライン相当）
    pg = ctx.new_page()
    errs = []
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.on("console", lambda m: m.type == "error" and "fonts.g" not in (m.location or {}).get("url", "") + m.text and errs.append(m.text))  # テストで止めたフォントの読み込みは除く
    pg.goto(URL, wait_until="domcontentloaded"); pg.evaluate("localStorage.clear()"); pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(500)

    # 1. 東・17年・1年目・東京→仙台
    pick(pg, "to", "仙台")
    out = text(pg, "#planout")
    seq = out[out.find("寄る駅"):]
    check("東京→仙台で深川・浦和・鹿嶋が出る", all(s in seq for s in ["深川", "浦和", "鹿嶋"]), seq[:300])
    check("最優先の表示が出る", "最優先" in text(pg, "#focus"), text(pg, "#focus"))
    # 2. 8年目・所持金15
    for _ in range(7): pg.click("#y-next")
    pg.fill("#in-money", "15"); pg.wait_for_timeout(100)
    out = text(pg, "#planout")
    rl = text(pg, ".rlist")
    check("8年目・15億で深川・米沢が『独占額に届く』", "深川\n歴史ヒーロー\n独占額に届く" in rl and "米沢\n歴史ヒーロー\n独占額に届く" in rl, rl[:400])
    check("8年目・15億で家康が最優先にならない", "徳川家康" not in text(pg, "#focus"), text(pg, "#focus"))
    check("8年目は小田原の注意（避けること）が出る", "小田原" in out, "")
    # 9年目の小田原
    pg.click("#y-next"); pg.wait_for_timeout(80)
    check("9年目も小田原の『必ず出る』が出る", "必ず出る最後の年" in text(pg, "#planout"))
    pg.click("#y-prev")
    # 3. 着いた
    pg.click("[data-arrive]"); pg.wait_for_timeout(100)
    check("着いた：現在地が仙台、目的地が空", pg.input_value("#in-from") == "仙台" and pg.input_value("#in-to") == "", (pg.input_value("#in-from"), pg.input_value("#in-to")))
    # 4. 5年
    pg.click("[data-nset='5']"); pg.wait_for_timeout(80)
    check("5年にすると5年目へ切り詰め・最終年タスク", pg.text_content("#ynow") == "5" and "最終年。現金を物件に変える" in pg.inner_text("body"))
    # 入れ替え
    pick(pg, "to", "東京")
    pg.click("[data-swap]"); pg.wait_for_timeout(80)
    check("入れ替え：いまいる駅=東京・目的地=仙台", pg.input_value("#in-from") == "東京" and pg.input_value("#in-to") == "仙台", (pg.input_value("#in-from"), pg.input_value("#in-to")))
    # 5. 西・1年目・大阪→博多
    pg.click("[data-nset='17']"); pg.click("#ed-west"); pg.wait_for_timeout(100)
    while pg.text_content("#ynow") != "1": pg.click("#y-prev")
    pg.fill("#in-money", ""); pg.dispatch_event("#in-money", "input")
    pick(pg, "to", "福岡")
    seq = text(pg, ".rlist")
    check("大阪→福岡で宮本武蔵・さぬき・因島", all(s in seq for s in ["宮本武蔵", "さぬき", "因島"]), seq[:300])
    check("1人プレイ：宮本武蔵はリニア周遊", "リニア周遊カード（1人プレイ）" in text(pg, "#planout") or "リニア周遊" in seq)
    pg.click("summary:has-text('カードと作戦')")
    pg.select_option("#in-playmode", "multi"); pg.wait_for_timeout(80)
    check("複数人：宮本武蔵はリニアカード", "リニアカード" in text(pg, "#planout"), text(pg, "#planout")[:200])
    pg.select_option("#in-playmode", "solo")
    # 月：8月→徳島が避ける場所に、9月→岸和田
    pick(pg, "to", "那覇")
    pg.select_option("#in-month", "9"); pg.wait_for_timeout(80)
    o9 = text(pg, "#planout")
    pg.select_option("#in-month", "8"); pg.wait_for_timeout(80)
    o8 = text(pg, "#planout")
    check("月で止まらない場所が変わる（9月に岸和田・8月は出ない）", "岸和田" in o9 and "岸和田" not in o8.split("止まらない場所")[-1][:200], "")
    check("8月の注意（青マス）が出る", "8月は青マスの稼ぎどき" in o8)
    # カード登録：周遊なし→周遊駅が価値を失う（滋賀の永原）、ありで出る
    pg.select_option("#in-month", "")
    pg.click("#ed-east"); pg.wait_for_timeout(80)
    while pg.text_content("#ynow") != "4": pg.click("#y-next")
    pick(pg, "from", "東京"); pick(pg, "to", "茂原")
    before = text(pg, ".rlist") if pg.locator(".rlist").count() else ""
    pg.click("[data-card='tokkyu']"); pg.wait_for_timeout(80)
    with_tour = text(pg, ".rlist") if pg.locator(".rlist").count() else ""
    pg.click("[data-card='tokkyu']"); pg.click("[data-card='katana']"); pg.wait_for_timeout(80)
    no_tour = text(pg, ".rlist") if pg.locator(".rlist").count() else ""
    check("周遊カードありで大網白里（周遊駅）が『いま回復できる』", "大網白里" in with_tour and "いま回復できる" in with_tour, with_tour[:400])
    check("周遊カードなしだと大網白里を寄り道に出さない", "大網白里" not in no_tour, no_tour[:400])
    pg.click("[data-card='katana']")
    # 作戦
    pg.select_option("#in-goal", "card"); pg.wait_for_timeout(60)
    g_card = text(pg, ".rlist")
    pg.select_option("#in-goal", "asset"); pg.wait_for_timeout(60)
    g_asset = text(pg, ".rlist")
    check("作戦で寄り道が変わる", g_card != g_asset, "")
    pg.select_option("#in-goal", "balance")
    # 境界値・不正入力
    pg.fill("#in-n", "0"); pg.dispatch_event("#in-n", "change"); pg.wait_for_timeout(60)
    check("年数0→1に補正", pg.input_value("#in-n") == "1")
    pg.fill("#in-n", "250"); pg.dispatch_event("#in-n", "change"); pg.wait_for_timeout(60)
    check("年数250→100に補正", pg.input_value("#in-n") == "100")
    pg.fill("#in-money", "-5"); pg.dispatch_event("#in-money", "input")
    check("所持金マイナスは未入力扱い", pg.evaluate("state.money") is None)
    pg.locator("#in-to").click(); pg.locator("#in-to").fill("<img src=x onerror=alert(1)>")
    pg.wait_for_timeout(80)
    check("駅名入力のタグは実行されない", pg.locator("#sugg-to img").count() == 0)
    pg.keyboard.press("Escape")
    pg.fill("#in-n", "17"); pg.dispatch_event("#in-n", "change")
    # 年別：チェックリスト・100年
    pg.click("a[data-tab='year']"); pg.wait_for_timeout(100)
    cb = pg.locator("#todo input[type=checkbox]").first; cb.check(); pg.wait_for_timeout(50)
    check("チェックリストを付けられる", pg.locator("#todo li.done").count() == 1)
    # 月を進める・所持金ボタン・カード枚数・買えるもの・新しいゲーム
    pg.click("a[data-tab='plan']"); pg.select_option("#in-month", "2"); y0 = pg.evaluate("state.year")
    pg.click("[data-nextmonth]"); pg.click("[data-nextmonth]"); pg.wait_for_timeout(80)
    check("次の月へ：2月→3月→翌年4月", pg.evaluate("state.month") == 4 and pg.evaluate("state.year") == y0 + 1, (pg.evaluate("state.month"), pg.evaluate("state.year")))
    check("3月は決算のやることが出る", pg.evaluate("(state.month=3, renderPlan(), document.getElementById('planout').innerText.includes('決算前'))"))
    pg.evaluate("state.month=4; store.set('month','4'); setYear(%d)" % y0)
    pg.click("[data-money='clear']"); pg.click("[data-money='10']"); pg.click("[data-money='1']"); pg.click("[data-money='1']"); pg.wait_for_timeout(80)
    check("所持金ボタン：+10 +1 +1 = 12億", pg.evaluate("state.money") == 12 and pg.input_value("#in-money") == "12")
    buy = text(pg, "#planout")
    check("12億で買えるものが出る（かほく 高級ブドウ園）", "所持金12億で買えるもの" in buy and "高級ブドウ園" in buy, buy[:200])
    pg.click("[data-money='clear']"); pg.wait_for_timeout(60)
    pg.click("[data-cardd='tokkyu'][data-d='1']"); pg.click("[data-cardd='tokkyu'][data-d='1']"); pg.wait_for_timeout(60)
    check("カード枚数：特急周遊を2枚", pg.evaluate("cardCount()") == 2 and pg.evaluate("state.cardN.tokkyu") == 2)
    pg.click("[data-cardd='tokkyu'][data-d='-1']"); pg.wait_for_timeout(60)
    check("カード1枚以下で『カードを補充する』が出る", "カードを補充する" in text(pg, "#planout"))
    pg.click("[data-cardd='tokkyu'][data-d='-1']"); pg.wait_for_timeout(60)
    check("0枚にすると持っていない扱い", pg.evaluate("JSON.stringify(state.cards)") == "[]")
    pg.click("a[data-tab='cards']"); check("カード画面に使いどころが出る", "使いどころ" in text(pg, "#cardinfo")); pg.click("a[data-tab='plan']")
    # 保存と再読み込み
    pg.reload(wait_until="domcontentloaded"); pg.wait_for_timeout(400)
    pg.click("a[data-tab='year']"); pg.wait_for_timeout(100)
    check("再読み込みで年・チェックが戻る", pg.text_content("#ynow") == "1" and pg.locator("#todo li.done").count() == 1, pg.text_content("#ynow"))
    check("再読み込みで手持ちカード・作戦が戻る", pg.evaluate("JSON.stringify(state.cards)") == "[]" and pg.evaluate("state.goal") == "balance", pg.evaluate("JSON.stringify(state.cards)"))
    pg.click("a[data-tab='plan']"); pg.click("[data-nset='100']"); pg.wait_for_timeout(150)
    pg.click("a[data-tab='year']"); pg.wait_for_timeout(150)
    check("100年：年の路線は30年分を折り返して表示", pg.locator("#line .st").count() == 30 and "表示中" in pg.text_content("#line-note"))
    # タブ切替：非表示の画面が同時に出ない
    for t in ["plan", "year", "map", "heroes", "props", "cards"]:
        pg.click(f"a[data-tab='{t}']"); pg.wait_for_timeout(80)
        vis = pg.evaluate("[...document.querySelectorAll('[data-view]')].filter(s=>!s.hidden).map(s=>s.dataset.view)")
        check(f"タブ{t}：表示は1画面だけ", vis == [t], vis)
    # 検索
    pg.click("a[data-tab='heroes']"); pg.fill("#hero-q", "家康"); pg.wait_for_timeout(60)
    check("ヒーロー検索（家康）", pg.locator("#herolist .hrow").count() == 1 and "徳川家康" in text(pg, "#herolist"))
    pg.fill("#hero-q", "")
    pg.click("a[data-tab='props']"); pg.fill("#prop-q", "原宿"); pg.wait_for_timeout(60)
    check("物件検索（原宿は2件）", pg.locator("#bars .brow").count() == 2)
    pg.fill("#prop-q", "")
    pg.click("a[data-tab='cards']"); pg.fill("#card-q", "テレポート"); pg.wait_for_timeout(60)
    check("カード検索（テレポートの効果が正しい）", "1〜3マス以内" in text(pg, "#cardinfo"))
    pg.fill("#card-q", "")
    pg.click("a[data-tab='map']"); pg.fill("#map-q", "大原"); pg.wait_for_timeout(120)
    check("地図検索（大原が選ばれる）", "大原" in text(pg, "#detail"), text(pg, "#detail")[:80])
    pg.click("#detail [data-goto]"); pg.wait_for_timeout(120)
    check("地図→ここを目的地に：プランへ移る", pg.evaluate("state.view") == "plan" and pg.input_value("#in-to") == "大原")
    # 地図で指定
    pg.click("[data-nset='17']")
    pg.click("[data-mappick='to']"); pg.wait_for_timeout(300)
    box = pg.locator("#routesvg").bounding_box()
    check("地図で指定：地図が画面内に来る", 60 <= box["y"] <= 400, box["y"])
    pg.mouse.click(box["x"] + box["width"] * 0.5, box["y"] + 200); pg.wait_for_timeout(120)
    check("地図で指定：目的地が入る", pg.input_value("#in-to") not in ("", "大原"), pg.input_value("#in-to"))
    # バックアップ書き出し→消去→復元
    pg.click("summary:has-text('データの保存と復元')")
    with pg.expect_download() as dl: pg.click("[data-backup='export']")
    path = dl.value.path(); data = json.loads(pathlib.Path(path).read_text(encoding="utf-8"))
    check("バックアップを書き出せる", data.get("kind") == "momotetsu2-planner-backup" and "mt2p.N" in data["data"])
    pg.on("dialog", lambda d: d.accept())
    pg.click("[data-backup='reset']"); pg.click("[data-backup='reset']"); pg.wait_for_timeout(100)  # 2回押して実行
    check("すべて消す：初期値に戻る", pg.input_value("#in-n") == "17" and pg.input_value("#in-from") == "東京" and pg.evaluate("state.cards") is None)
    pg.set_input_files("#restore-file", path); pg.wait_for_timeout(300)
    check("ファイルから戻す", pg.evaluate("state.cards") == [] and pg.evaluate("state.N") == 17 and pg.input_value("#in-to") != "", (pg.evaluate("state.cards"), pg.evaluate("state.year")))
    bad = OUT / "bad.json"; bad.write_text('{"kind":"x"}', encoding="utf-8")
    pg.set_input_files("#restore-file", str(bad)); pg.wait_for_timeout(200)
    check("違うファイルは読み込まない", "バックアップではありません" in pg.text_content("#toast"))
    evil = OUT / "evil.json"; evil.write_text(json.dumps({"kind": "momotetsu2-planner-backup", "data": {"mt2p.custom.east": json.dumps({"to": {"n": "<img src=x onerror=window.__x=1>", "la": 36, "lo": 140}}), "mt2p.to.east": "<img src=x onerror=window.__x=1>", "evil": "1"}}), encoding="utf-8")
    pg.set_input_files("#restore-file", str(evil)); pg.wait_for_timeout(300)
    check("悪意のある復元データでもスクリプトが動かない", pg.evaluate("window.__x") is None and pg.evaluate("localStorage.getItem('evil')") is None)
    pg.evaluate("document.getElementById('gamesetup').open = true"); pg.fill("#in-money", "30"); pg.dispatch_event("#in-money", "input")
    n0 = pg.evaluate("state.N"); pg.click("[data-newgame]"); pg.wait_for_timeout(100)
    check("新しいゲーム：1回目は消さない", pg.evaluate("state.money") == 30)
    pg.click("[data-newgame]"); pg.wait_for_timeout(150)
    check("新しいゲーム：2回目で年・月・所持金・駅が最初に戻り、年数の設定は残る", pg.evaluate("state.year") == 1 and pg.evaluate("state.month") == 4 and pg.evaluate("state.money") is None and pg.evaluate("state.N") == n0 and pg.input_value("#in-to") == "", (pg.evaluate("state.year"), pg.evaluate("state.month")))
    pg.click("[data-startgame]"); pg.wait_for_timeout(80)
    check("この設定で始める：設定が閉じる", pg.evaluate("document.getElementById('gamesetup').open") is False)
    check("JavaScriptエラーなし", not errs, errs[:3])
    ctx.close()

    # 表示幅ごと・ライト/ダーク：横はみ出し・タップ対象・スクショ
    for scheme in ["light", "dark"]:
        for w in [320, 360, 375, 390, 412, 430, 768, 1024, 1280]:
            c = b.new_context(viewport={"width": w, "height": 860}, device_scale_factor=1, color_scheme=scheme, has_touch=True)
            q = c.new_page(); e2 = []
            q.on("pageerror", lambda e: e2.append(str(e)))
            q.goto(URL, wait_until="domcontentloaded"); q.evaluate("localStorage.clear()"); q.reload(wait_until="domcontentloaded")
            q.evaluate("Promise.race([document.fonts.ready, new Promise(r => setTimeout(r, 4000))])"); q.wait_for_timeout(400)  # Webフォントを最大4秒待つ
            pick(q, "to", "仙台"); q.fill("#in-money", "15"); q.click("summary:has-text('カードと作戦')")
            over = []
            for t in ["plan", "year", "map", "heroes", "props", "cards"]:
                q.click(f"a[data-tab='{t}']"); q.wait_for_timeout(150)
                sw = q.evaluate("document.documentElement.scrollWidth")
                if sw > w: over.append((t, sw))
                bad_el = q.evaluate("""(w)=>[...document.querySelectorAll('body *')].filter(e=>{const r=e.getBoundingClientRect(); return r.width&&e.offsetParent!==null&&(r.right>w+1)&&!e.closest('.mapbox,svg,.top')}).slice(0,3).map(e=>e.tagName+'.'+e.className+':'+Math.round(e.getBoundingClientRect().right))""", w)
                if bad_el: over.append((t, bad_el))
                small = q.evaluate("""()=>[...document.querySelectorAll('[data-view]:not([hidden]) button, [data-view]:not([hidden]) select, [data-view]:not([hidden]) input:not([type=checkbox]), .todo .tick, .tabs a, .bar button')].filter(e=>e.offsetParent!==null&&!e.closest('svg,.tl-grid')).filter(e=>{const r=e.getBoundingClientRect(); return r.height<40||r.width<36}).slice(0,4).map(e=>e.tagName+'['+(e.textContent||e.id||e.type).trim().slice(0,10)+']'+Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height))""")
                if small and scheme == "light": results.append((f"{w}px {t} タップ対象40px未満", False, small)); print("WARN", w, t, small)
                clipped = q.evaluate("""()=>[...document.querySelectorAll('[data-view]:not([hidden]) *, .bar *, .tabs *')].filter(e=>e.offsetParent!==null&&!e.closest('svg')&&e.clientWidth>0).filter(e=>{const c=getComputedStyle(e); return (c.overflowX==='hidden'||c.overflowX==='clip'||c.textOverflow==='ellipsis'||c.whiteSpace==='nowrap')&&e.scrollWidth>e.clientWidth+1&&c.overflowX!=='visible'}).slice(0,4).map(e=>e.tagName+'.'+String(e.className).slice(0,24)+'['+(e.textContent||'').trim().slice(0,12)+']')""")
                if clipped: over.append((t, "文字切れ", clipped))
                overlap = q.evaluate("""()=>{const bs=[...document.querySelectorAll('[data-view]:not([hidden]) button, [data-view]:not([hidden]) select, [data-view]:not([hidden]) input')].filter(e=>e.offsetParent!==null&&!e.closest('svg,.tl-grid,details:not([open])')&&e.type!=='file').map(e=>[e,e.getBoundingClientRect()]); const out=[]; for(let i=0;i<bs.length;i++)for(let k=i+1;k<bs.length;k++){const [a,r]=bs[i],[b,s]=bs[k]; if(a.contains(b)||b.contains(a))continue; const w=Math.min(r.right,s.right)-Math.max(r.left,s.left),h=Math.min(r.bottom,s.bottom)-Math.max(r.top,s.top); if(w>2&&h>2){out.push((a.textContent||a.id).trim().slice(0,8)+'×'+(b.textContent||b.id).trim().slice(0,8)); if(out.length>3)return out;}} return out}""")
                if overlap: over.append((t, "重なり", overlap))
                if not (scheme == "light" and w in (320, 390, 768, 1280) or scheme == "dark" and w == 390): continue
                try: q.screenshot(path=str(OUT / f"{scheme}-{w}-{t}.png"), full_page=(t == "plan"), timeout=60000)
                except Exception as ex: print("SHOT-SKIP", scheme, w, t, str(ex)[:60])
            check(f"{scheme} {w}px はみ出し・文字切れ・重なりなし", not over, over)
            check(f"{scheme} {w}px エラーなし", not e2, e2[:2])
            # 入力欄の文字サイズ（iPhoneの自動拡大を防ぐ16px以上）
            if scheme == "light" and w == 390:
                q.click("a[data-tab='plan']")
                fs = q.evaluate("[...document.querySelectorAll('input,select')].filter(e=>e.offsetParent!==null&&e.type!=='checkbox'&&e.type!=='file').map(e=>parseFloat(getComputedStyle(e).fontSize)).filter(s=>s<16)")
                check("入力欄はすべて16px以上（iPhoneで拡大されない）", not fs, fs)
            c.close()
    b.close()

fails = [r for r in results if not r[1]]
print(f"\n{len(results) - len(fails)}/{len(results)} passed")
(OUT / "results.json").write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")
