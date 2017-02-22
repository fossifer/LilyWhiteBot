QQ-Telegram-IRC
===

在三個群組間傳話的機器人。

## 如何配置
目前支援QQ、Telegram和IRC三種群組互聯，不過亦可以選擇兩群互聯。

Node.js版本要求：>=7.x

### QQ
如果不使用QQ機器人的話可忽略本節。

在正式啟用互聯之前，建議提前註冊一個QQ馬甲，將其掛機掛到一定等級，並往錢包裡塞一點錢，以減小被封殺的可能性。

目前僅支援[酷Q](https://cqp.cc/)。酷Q支援Windows與Wine，在Wine中配置酷Q的方法可參照[這裡](https://cqp.cc/t/30970)。搞定之後需要安裝[vjudge1/cqsocketapi](https://github.com/vjudge1/cqsocketapi)擴充套件。

### Telegram
需要與BotFather交互，建立一個機器人帳號。設定完成後，BotFather會給一個Token。

不要忘記`/setprivacy`，將機器人的私隱模式設為DISABLED以便於讓它看到群組內的訊息。

### 互聯
機器人帳號準備完畢後，請將其加入到指定群組中，並參照config.example.js配置互聯。準備完畢後，先啟動酷Q（如果需要QQ機器人的話），然後

```
npm install
node main.js
```

## 提示

1. 如果把config.json中的`paeeye`設為`//`，那麼在訊息之前加入`//`（例如「//隱藏」）可防止被其他群組看見。
2. 如果允許IRC接受命令，那麼可在Telegram和QQ中使用`/irccommand 命令`。該命令並非IRC命令，而是為配合IRC頻道中的機器人而設。
3. 如果允許查詢IRC的情況，那麼可在Telegram和QQ中使用`/ircnames`（取得在線使用者名稱列表）、`/ircwhois 暱稱`（whois）和`/irctopic`（取得Topic）。
4. 「敏感詞」功能會將敏感詞列表中的詞語轉為「*」，可使用正規表示式。具體的政治敏感詞彙可參照中文維基百科「中華人民共和國審查辭彙列表」條目製作，本專案不再提供。詳情見badwords.example.js。

## 注意事項

1. 您需要定期清理酷Q（如果使用的話）的快取。
2. 作者不作任何擔保。
