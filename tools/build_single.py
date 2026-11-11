"""index.html と css/js を1つのHTMLにまとめる（1ファイルで配りたいとき用）。
使い方: python tools/build_single.py  →  dist/momotetsu2-planner.html
画像（icons/ と img/official/）は data URI で埋め込む。JS で組み立てる画像（ボンビー）は window.INLINE_IMG 経由。
manifest（ホーム画面用の設定）は別ファイルが必要なので、1ファイル版では外す。
"""
import re, json, base64, pathlib
root = pathlib.Path(__file__).resolve().parent.parent

def data_uri(path):
    mime = {".webp": "image/webp", ".jpg": "image/jpeg"}.get(path.suffix, "image/png")
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode("ascii")

html = (root / "index.html").read_text(encoding="utf-8")
html = html.replace('<link rel="stylesheet" href="css/app.css">', "<style>\n" + (root / "css/app.css").read_text(encoding="utf-8") + "</style>")
html = re.sub(r'url\(\.\./(img/official/[\w\-]+\.(?:png|webp|jpg))\)', lambda m: f'url({data_uri(root / m.group(1))})', html)
html = re.sub(r'<script src="(js/[^"]+)"></script>', lambda m: "<script>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "</script>", html)
html = re.sub(r'((?:href|src)=)"((?:icons|img/official)/[\w\-]+\.(?:png|webp))"', lambda m: f'{m.group(1)}"{data_uri(root / m.group(2))}"', html)
inline = {f.name: data_uri(f) for f in sorted((root / "img/official").glob("*_main.webp"))}
html = html.replace('<script>\n', "<script>\nwindow.INLINE_IMG = " + json.dumps(inline) + ";\n", 1)
html = re.sub(r'<link rel="manifest"[^>]*>\n?', "", html)
out = root / "dist"; out.mkdir(exist_ok=True)
(out / "momotetsu2-planner.html").write_text(html, encoding="utf-8")
print("wrote", out / "momotetsu2-planner.html", len(html), "chars")
