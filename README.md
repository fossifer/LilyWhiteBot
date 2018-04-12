# 警告：程式已無法正常執行，代碼僅供參考！

LilyWhiteBot
===

[简体中文版](https://github.com/mrhso/LilyWhiteBot-Ishisashi/blob/master/README-hans.md)

在三個（或以上）群組間傳話的機器人。

## 如何安裝
目前支援 QQ、Telegram 和 IRC 三種群組互聯，不過亦可以選擇兩群互聯或三個以上群互聯。

### 必需步驟
* 根據實際需要準備機器人帳號（具體方法見後面）
* 安裝 Node.js，版本要求：>=7.x
* 下載原始碼
* 執行
```
npm install
node main.js
```
* 如果擔心 crash 的話請直接寫個無窮迴圈，例如`while true; do node main.js; done`或者
```batch
:a
node main.js
goto a
```
* 根據實際需要修改 config.example.js，並改名為 config.js。
* QQ 群格式`qq/QQ 群號`；Telegram 群格式`telegram/一串數字`（該數字可透過`/thisgroupid`取得，後面有說明，而且請注意該數字是**負數**；IRC 頻道格式`irc/#頻道名`，別忘了`#`。

### 設定 QQ 機器人
1. 在正式啟用互聯之前，建議提前註冊一個 QQ 馬甲，掛機掛到一定等級，並往錢包裡塞一點錢，以減小被騰訊封殺的可能性。不過從實踐情況來看，只有一顆星或不塞錢也無妨。
2. **下載[酷 Q](https://cqp.cc/)**，啟動一下以便完成安裝。
3. 進入 [mrhso/cqsocketapi](https://bintray.com/mrhso/cqsocketapi-nodejs/nodejs/_latestVersion)，下載 org.dazzyd.cqsocketapi.cpk，並放到酷 Q 的 app 目錄中。
4. 再次啟動酷 Q，登入機器人帳號，然後在插件設定中啟用「cqsocket」。
5. 根據實際需要修改 badwords.example.js，並改名為 badwords.js。「敏感詞」功能僅對 QQ 機器人有效。
6. 請記得定期清除快取。
7. 因為目前沒做監控功能，所以還請自己盯一下酷 Q 的狀態。

注意：
1. 本程式需要酷 Q Air/Pro 和這個專門的 cqsocketapi 才能收發 QQ 群訊息。
2. 在伺服器執行程式時，酷 Q 會有很大機率要求你開啟 QQ 的設備鎖，因此註冊馬甲時請不要亂填電話號。
3. 酷 Q 模擬的是安卓 QQ，而且 QQ 不允許多個手機同時登入。如果已經開啟酷 Q，而且需要直接操作機器人帳號，請用電腦登入。
4. 酷 Q 是私有軟體，和我沒關係。
5. 酷 Q 可以透過 wine 在 Linux/Mac 系統中執行，可以參考[這篇教程](https://cqp.cc/t/30970)進行設定。

### 設定 Telegram 機器人
@BotFather，與其交互，按照熒幕提示進行操作，建立一個機器人帳號。設定完成後，BotFather 會給一個 Token，你需要把這個 Token 填到 config.js 中。

之後請記得執行`/setprivacy`命令，將機器人的私隱模式設為 DISABLED 以便於讓它看到群組內的訊息。

在剛開始的時候，可以保留 config.js 之內「plugins」中的「groupid-tg」，然後執行程式，並且在群組中輸入`/thisgroupid`，這樣機器人會自動給出群組 ID 以便設定互聯。如果沒看懂前面那句話，你也可以把 @combot 拉進群中，然後輸入`/stat`，看機器人給出的數字是多少。注意，數字是負數。

### 設定 IRC 機器人
IRC 沒有什麼特別之處。如果你有 Cloak，請在 config.js 中輸入正確的 userName、sasl_password，並將 sasl 設為 true。

## 提示

1. 如果把 config.js 中的`paeeye`設為`//`，那麼在訊息之前加入`//`（例如「//隱藏」）可防止被其他群組看見。
2. 如果允許 IRC 接受命令（plugins 中有「irccommand」），那麼可在 Telegram 和 QQ 中使用`/command 命令`。該命令並非 IRC 命令，而是為配合 IRC 頻道中的機器人而設。
3. 如果允許查詢 IRC 的情況（plugins 中有「ircquery」），那麼可在 Telegram 和 QQ 中使用`/names`（取得在線用戶清單）、`/whois 暱稱`（whois）和`/topic`（取得 Topic）。
4. 「敏感詞」功能僅在 QQ 有效，而且僅對機器人自己「張嘴」有效。啟用之後，程式會自動把敏感詞清單中的詞語轉為「*」，可使用正規表示式。具體的政治敏感詞彙可參照中文維基百科「中華人民共和國審查辭彙列表」條目製作，本專案不再提供。詳情見 badwords.example.js。

### 其他功能
以下各功能的設定方法均為改 config.js。
* [filter](https://github.com/vjudge1/LilyWhiteBot/blob/master/plugins/filter.js)：過濾符合指定規則的訊息。
* [qqxiaoice](https://github.com/vjudge1/LilyWhiteBot/blob/master/plugins/qqxiaoice.js)：召喚 QQ 群的小冰（備註：需要 QQ 群群主開啟小冰/BabyQ 功能）
