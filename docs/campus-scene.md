# 唐津と早稲田の3D案内

5ページの本文は GitHub main の a236037014de07eb4b02b0afbf6fab32b238b677 を基準に保持しています。ブログ44記事の順序、本文、カテゴリー、記事IDも保持しています。

共通デザインは public/css/campus.css、案内・記事の開閉は public/js/campus-ui.js、描画と操作は public/js/campus-scene.js、独立した模型は public/js/models/ にあります。GitHub Pages では public の内容をリポジトリ直下に反映します。Sites は同じ public/index.html をルートで配信します。

| ページ | 模型 | 主な外観の特徴 |
| --- | --- | --- |
| ホーム | 大隈講堂 | 左側の時計塔、石造装飾の塔頂、浅い尖頭アーチの三連入口、鉄扉、れんが目地 |
| プロフィール | 唐津城 | 現在の五層の天守、反りのある屋根、破風、上部の欄干、石垣 |
| 研究・活動 | 大隈重信立像 | 1932年の大学服姿の立像、角帽、垂れた袖、衣のひだ、右手の杖 |
| ブログ | 旧唐津銀行 | 赤れんがと白い石の帯、大窓のアーチ、両端の玄関、銅色の隅飾り |
| お問い合わせ | ３模型の展示 | 唐津城・立像・銀行を並べた場面 |

模型は写真と建築解説から作成した独自の解釈です。実測図面、測量データ、ストリートビューの3Dデータは使用していません。ユーザー提供の Maps 短縮リンクは作業環境では開けず、ストリートビュー自体を確認できませんでした。寸法、背面、地形、周辺の建物・植栽は画面に合わせて簡略化しています。参照写真そのものを新しい模型のテクスチャとして配布していません。

## 外観資料

- 大隈講堂：早稲田大学の建築・文化解説 https://www.waseda.jp/culture/news/2020/04/20/10208/ 、https://www.waseda.jp/inst/weekly/feature/2017/10/09/34727/
- 大隈講堂：正面外観写真（高田馬場経済新聞） https://images.keizai.biz/takadanobaba_keizai/photonews/1634612891_b.jpg
- 唐津城：公式外観写真 https://karatsujo.com/images/top-about1.jpg 、唐津市 https://www.city.karatsu.lg.jp/page/1041.html 、https://www.city.karatsu.lg.jp/page/4527.html
- 大隈重信立像：早稲田大学の解説 https://www.waseda.jp/inst/weekly/column/2011/06/02/56864/
- 立像全身写真 https://cdn.japan-forward.com/wp-content/uploads/2023/06/wo-270_waseda-okuma-statue-230526_110127_020127939_pxl.jpg 、顔の写真 https://images.keizai.biz/takadanobaba_keizai/headline/1597975936_photo.jpg
- 旧唐津銀行：施工者の建築アーカイブ・外観写真 https://www.shimzarchives.jp/heritage/heritage_566/ 、施設の歴史 https://karatsu-bank.jp/history.html 、公式観光案内 https://www.karatsu-kankou.jp/sp/spots/detail/194/
- 日本語書体 Zen Kaku Gothic New https://fonts.google.com/specimen/Zen+Kaku+Gothic+New

## 描画と操作

Three.js 0.185.0 はローカル配信し、MITライセンスを public/js/vendor/THREE-LICENSE.txt に保持しています。Google Fonts は必要な文字の分割フォントを読み込み、利用できない場合は端末の日本語フォントを使います。EN は現在のページを Google 翻訳で開きます。

各ページは必要な模型だけを動的に読み込みます。通常の3D描画は最大30fps、画素密度はPC1.6・スマートフォン1.25まで。静的形状はインスタンシングし、影は初回だけ描画します。画面外・非表示タブでは描画を停止します。単独模型は約2.9万〜4.4万三角形、３模型の展示は約9.9万三角形です。

WebGLが使えない環境では同じ模型をCanvasで投影し、初期状態は静止して操作時に描画します。頂点カラーも反映して立像の青銅色を維持します。OSの視差効果を減らす設定とユーザーの動き停止設定を尊重します。描画が使えない場合もHTMLのリンクが残ります。

回転はドラッグまたは左右キー、拡大縮小はボタンまたは上下キー、初期位置はリセットボタンまたはHomeキー。通常のナビゲーションは3D処理に依存しません。スマートフォンでは見出しと模型を上下に分けています。
