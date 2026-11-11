/* 攻略データの確認状況とカードの効果。確認日はすべて 2026-11-12。
   st: ok=確認済み（出典の文言で確認）／est=推定（言い換え・出典で食い違い）／un=未確認（出典が見つからない）
   ここに無い数値は、元データ（Game8 等、2025年11月〜2026年1月更新）のままで、個別の再照合はしていない。 */
const CHECKED = "2026-11-12";
const CONF = { ok: "確認済み", est: "推定", un: "未確認" };

/* 主なカード。効果と入手は出典の要約。use＝使いどころ（効果から考えたこのアプリの目安で、出典の文言ではない）。own: 手持ち登録のキー（plan の「いま持っているカード」と共通） */
const CARD_INFO = [
  { id: "tokkyu", use: "毎月の移動に。回数が減ったら周遊駅で回復する", n: "特急周遊", e: "サイコロ3個で進む。5〜7回使える", get: "東：恐山・大原・北濃・寸又峡など多数／西：西大寺・七類・福崎・智頭など", tour: true, st: "ok", u: "https://gamepedia.jp/momotetsu2/card/799" },
  { id: "shinkan", use: "遠い目的地へ急ぐときに。回数が減ったら周遊駅で回復する", n: "新幹線周遊", e: "サイコロ5個で進む。5〜7回使える", get: "東：福生・新札幌・真駒内・鷺宮／西：中百舌鳥・王寺・虎姫・大和八木・橋杭岩など", tour: true, st: "ok", u: "https://gamepedia.jp/momotetsu2/card/800" },
  { id: "linear", use: "いちばん遠い目的地のときに。回数が残り少なくなる前に、周遊駅かダビングで戻す", n: "リニア周遊", e: "サイコロ10個で進む。9〜15回使える", get: "1〜49年目は売り場なし。ナイスカード駅などで出る。西の宮本武蔵駅（最初の1人・1人プレイ）", tour: true, st: "ok", u: "https://gamepedia.jp/momotetsu2/card/803" },
  { id: "katana", use: "相手が周遊カードなど強いカードを持っているときに", n: "刀狩り", e: "指定した社長のカードを1枚奪う（低確率で2枚）", get: "東：福生・袋田／西：福崎・中百舌鳥など。刀狩り駅（三方・大江）でも同じ効果", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/870" },
  { id: "hoshi", use: "カードが減ってきたときに（売り場へ飛んで補充）", n: "☆飛び", e: "その月のカード売り場4か所から選んで移動", get: "東：恐山・大原・北濃・寸又峡／西：西大寺・御厨・赤嶺・七類・光・山鹿", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/830" },
  { id: "bukken", use: "所持金が独占額に届いたときに（独占できる物件駅へ飛ぶ）", n: "物件飛び", e: "所持金で独占できる物件駅5つから選んで移動", get: "東：女満別・恐山・福生・千歳など／西：西大寺・中百舌鳥・智頭など", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/804" },
  { id: "goudatsu", use: "相手が高い物件を持っているときに", n: "強奪飛び", e: "他の社長の物件駅へ移動し、物件を1つ奪う", get: "東：女満別・福生など／西：福崎・西大寺・中百舌鳥など", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/835" },
  { id: "teleport", use: "目的地の近くにいる相手のそばへ行きたいときに", n: "テレポート", e: "指定した社長の1〜3マス以内へ移動", get: "東：千歳／西：智頭・大田・若松", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/859" },
  { id: "tokusei", use: "所持金がマイナスになったときに", n: "徳政令", e: "所持金がマイナスの全員を0円にする。使ったあと続けて行動できる", get: "東：五稜郭・宗谷・二本松・千歳など／西：宇治山田・熊野本宮・七類・智頭など。価格0円は推定", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/881" },
  { id: "dubbing", use: "周遊カードを持っているときに（複製すると回数も初期化される）", n: "ダビング", e: "手持ちのカードを1枚複製。周遊カードは回数が初期化", get: "西：福崎・法隆寺・若桜・井原・吹上浜・宜野湾。斑鳩は15年目3月まで（出典で1年ずれあり）", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/885" },
  { id: "russell", use: "豪雪（11月ごろ）で出目が1〜2になったときに", n: "ラッセル車", e: "豪雪中でも12か月、サイコロの出目が1〜6に戻る", get: "東：苗穂・新青森。最初の豪雪のとき全員に1枚配られる", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/905" },
  { id: "m229", use: "遠い目的地が続くときに（進むカードを選んで使える）", n: "229マス", e: "合計229マス進むまで、進むカードを選んで使える", get: "東：田子の畑5つを買い、16年目以降に田子に止まると低確率で出る", st: "ok", u: "https://gamepedia.jp/momotetsu2/card/902" },
];

/* 照合の記録（重要な項目と、直したもの・確認できなかったもの） */
const VERIFY = [
  { t: "物件の価格・収益率（東西22件）", st: "ok", note: "すべて一致", u: "https://game8.jp/momotetsu-2/742161" },
  { t: "原宿の物件", st: "ok", note: "パンケーキ屋・あんバター屋は別々の物件（各2億・100%）に修正", u: "https://game8.jp/momotetsu-2/742161" },
  { t: "近江八幡・北浜の製薬会社", st: "ok", note: "40億・4%／35億・8%。デビル系消去の「一定確率」は出典になく削除", u: "https://game8.jp/momotetsu-2/744153" },
  { t: "西陣の独占額・収益", st: "ok", note: "独占32億・収益13億6000万", u: "https://game8.jp/momotetsu-2/743091" },
  { t: "芭蕉の句の8駅と収益率2倍", st: "ok", note: "", u: "https://gamepedia.jp/momotetsu2/archives/3849" },
  { t: "229マスカード（田子）", st: "ok", note: "畑5つ購入・16年目以降・低確率に修正", u: "https://gamepedia.jp/momotetsu2/card/902" },
  { t: "オダワラー（小田原）", st: "ok", note: "8年目4月〜9年目3月は必ず、1〜7年目は（中）", u: "https://game8.jp/momotetsu-2/737487" },
  { t: "宮本武蔵駅の無料カード", st: "ok", note: "最初の1人だけ。1人＝リニア周遊、複数人＝リニア", u: "https://game8.jp/momotetsu-2/738005" },
  { t: "カード売り場（1〜49年目）", st: "ok", note: "高輪ゲートウェイ（東・評価S）を追加。橋杭岩の品を7枚に修正", u: "https://game8.jp/momotetsu-2/742169" },
  { t: "ナイス・ダビング・周遊・刀狩り駅の数と駅名", st: "ok", note: "東 6/8/4/1、西 25/5/4/1", u: "https://game8.jp/momotetsu-2/744254" },
  { t: "テレポートカードの効果", st: "ok", note: "「緊急回避」から「指定した社長の1〜3マス以内へ移動」に修正", u: "https://gamepedia.jp/momotetsu2/card/859" },
  { t: "11月の豪雪と援助金5倍", st: "ok", note: "", u: "https://gamepedia.jp/momotetsu2/archives/377" },
  { t: "歴史ヒーローの独占額（東17人・西15人＋仲間にしない7人）", st: "ok", note: "すべて一致", u: "https://game8.jp/momotetsu-2/737482" },
  { t: "伊能忠敬（佐原）の効果時期", st: "ok", note: "50年目1月以降にしか出ない。序盤〜中盤のおすすめから外した", u: "https://game8.jp/momotetsu-2/742646" },
  { t: "徳川家康（岡崎）の効果", st: "ok", note: "物件は無料ではなく自分のお金で買う。「丸ごともらって独占」を修正", u: "https://game8.jp/momotetsu-2/743038" },
  { t: "デストロイ号の出る年", st: "ok", note: "東16〜31年目・西8〜31年目（32年目以降は出ない）に修正", u: "https://game8.jp/momotetsu-2/737934" },
  { t: "武蔵坊弁慶（御坊）の効果", st: "ok", note: "奪えるのは列車カードと周遊カード。防御は源義経も仲間のとき", u: "https://game8.jp/momotetsu-2/742704" },
  { t: "松江の無料カード", st: "ok", note: "所持1枚以下で止まると翌月7枚", u: "https://gamewith.jp/momotetsu2/528844" },
  { t: "国定忠治の出る条件", st: "ok", note: "源内・与一・ネズミ小僧・黄門・頼朝の5人が仲間のとき低確率", u: "https://gamepedia.jp/momotetsu2/archives/2196" },
  { t: "鹿嶋（駅名）", st: "ok", note: "「鹿島」から出典の表記「鹿嶋」に修正", u: "https://game8.jp/momotetsu-2/742933" },
  { t: "ボンビーの解禁年（キング4年目・マイナス1〜7/16年目〜・デビル32年目〜・パーセント1〜31年目）", st: "ok", note: "", u: "https://game8.jp/momotetsu-2/737934" },
  { t: "松永弾正の謀反（16年目4月以降）・村上水軍の宝箱（3億5000万×年数）", st: "ok", note: "", u: "https://game8.jp/momotetsu-2/742702" },
  { t: "オダワラーが必ず出る期間", st: "est", note: "「8年目4月〜9年目3月」。ファミ通は「8〜9年目」。8年目だけと読む解釈もあり", u: "https://www.famitsu.com/article/202511/57412" },
  { t: "平賀源内の「3か月動けない」発明", st: "est", note: "自分か他の社長か、出典で食い違う", u: "https://gamepedia.jp/momotetsu2/hero/hero-26" },
  { t: "長浜：COMが先に止まると出ない", st: "est", note: "GameWithのみ記載", u: "https://gamewith.jp/momotetsu2/529653" },
  { t: "福岡の無料カード（スペシャル）", st: "est", note: "GameWithのみ記載", u: "https://gamewith.jp/momotetsu2/528844" },
  { t: "那須与一「終盤ほど高額」・信玄の風林火山の中身・ポコン「毎ターン」", st: "un", note: "出典で確認できず", u: "" },
  { t: "西の岩崎弥太郎（安芸）・豊臣秀長（大和郡山）", st: "un", note: "一覧にあるが効果を確認できず、未収録", u: "https://game8.jp/momotetsu-2/737482" },
  { t: "斑鳩のダビングカード販売期間", st: "est", note: "Game8は15年目3月まで、別資料は1〜16年。15年目3月までで表示", u: "https://game8.jp/momotetsu-2/742547" },
  { t: "Ver1.0.6（2026/3/3）の物件駅の配置・表記変更", st: "un", note: "公式は「一部」とだけ記載。どの駅か未確認。照合した攻略記事は2026年1月以前の更新", u: "https://www.konami.com/games/momotetsu/2/update.php" },
  { t: "西 千里の売り場", st: "un", note: "Game8に駅名のみ。品ぞろえ不明のため未収録", u: "https://game8.jp/momotetsu-2/742169" },
  { t: "ナイスカード駅のカード出現確率", st: "un", note: "どの出典にも数値なし", u: "" },
  { t: "「京都府は臨時収入が多い」", st: "un", note: "根拠未確認", u: "" },
];
