# 警告：程序已无法正常运行，代码仅供参考！

LilyWhiteBot
===

[繁體中文版](https://github.com/mrhso/LilyWhiteBot-Ishisashi/blob/master/README.md)

在三个（或以上）群组间传话的机器人。

## 如何安装
目前支持 QQ、Telegram 和 IRC 三种群组互联，不过亦可以选择两群互联或三个以上群互联。

### 必需步骤
* 根据实际需要准备机器人账号（具体方法见后面）
* 安装 Node.js，版本要求：>=7.x
* 下载源代码
* 运行
```
npm install
node main.js
```
* 如果担心 crash 的话请直接写个死循环，例如`while true; do node main.js; done`或者
```batch
:a
node main.js
goto a
```
* 根据实际需要修改 config.example.js，并改名为 config.js。
* QQ 群格式`qq/QQ 群号`；Telegram 群格式`telegram/一串数字`（该数字可通过`/thisgroupid`获取，后面有说明，而且请注意该数字是**负数**；IRC 频道格式`irc/#频道名`，别忘了`#`。

### 设置 QQ 机器人
1. 在正式启用互联之前，建议提前注册一个 QQ 马甲，挂机挂到一定等级，并往钱包里塞一点钱，以减小被腾讯封杀的可能性。不过从实践情况来看，只有一颗星或不塞钱也无妨。
2. **下载[酷 Q](https://cqp.cc/)**，启动一下以便完成安装。
3. 进入 [mrhso/cqsocketapi](https://bintray.com/mrhso/cqsocketapi-nodejs/nodejs/_latestVersion)，下载 org.dazzyd.cqsocketapi.cpk，并放到酷 Q 的 app 目录中。
4. 再次启动酷 Q，登录机器人账号，然后在插件设置中启用“cqsocket”。
5. 根据实际需要修改 badwords.example.js，并改名为 badwords.js。“敏感词”功能仅对 QQ 机器人有效。
6. 请记得定期清除缓存。
7. 因为目前没做监控功能，所以还请自己盯一下酷 Q 的状态。

注意：
1. 本程序需要酷 Q Air/Pro 和这个专门的 cqsocketapi 才能收发 QQ 群消息。
2. 在服务器运行程序时，酷 Q 会有很大机率要求你开启 QQ 的设备锁，因此注册马甲时请不要乱填电话号。
3. 酷 Q 模拟的是安卓 QQ，而且 QQ 不允许多个手机同时登录。如果已经开启酷 Q，而且需要直接操作机器人账号，请用电脑登录。
4. 酷 Q 是私有软件，和我没关系。
5. 酷 Q 可以通过 wine 在 Linux/Mac 系统中运行，可以参考[这篇教程](https://cqp.cc/t/30970)进行设置。

### 设置 Telegram 机器人
@BotFather，与其交互，按照屏幕提示进行操作，创建一个机器人账号。设置完成后，BotFather 会给一个 Token，你需要把这个 Token 填到 config.js 中。

之后请记得执行`/setprivacy`命令，将机器人的隐私模式设为 DISABLED 以便于让它看到群组内的消息。

在刚开始的时候，可以保留 config.js 之内“plugins”中的“groupid-tg”，然后运行程序，并且在群组中输入`/thisgroupid`，这样机器人会自动给出群组 ID 以便设置互联。如果没看懂前面那句话，你也可以把 @combot 拉进群中，然后输入`/stat`，看机器人给出的数字是多少。注意，数字是负数。

### 设置 IRC 机器人
IRC 没有什么特别之处。如果你有 Cloak，请在 config.js 中输入正确的 userName、sasl_password，并将 sasl 设为 true。

## 提示

1. 如果把 config.js 中的`paeeye`设为`//`，那么在消息之前加入`//`（例如“//隐藏”）可防止被其他群组看见。
2. 如果允许 IRC 接受命令（plugins 中有“irccommand”），那么可在 Telegram 和 QQ 中使用`/command 命令`。该命令并非 IRC 命令，而是为配合 IRC 频道中的机器人而设。
3. 如果允许查询 IRC 的情况（plugins 中有“ircquery”），那么可在 Telegram 和 QQ 中使用`/names`（获取在线用户列表）、`/whois 昵称`（whois）和`/topic`（获取 Topic）。
4. “敏感词”功能仅在 QQ 有效，而且仅对机器人自己“张嘴”有效。启用之后，程序会自动把敏感词列表中的词语转为“*”，可使用正则表达式。具体的政治敏感词汇可参照中文维基百科“中华人民共和国审查辞汇列表”条目制作，本项目不再提供。详情见 badwords.example.js。

### 其他功能
以下各功能的设置方法均为改 config.js。
* [filter](https://github.com/vjudge1/LilyWhiteBot/blob/master/plugins/filter.js)：过滤符合指定规则的消息。
* [qqxiaoice](https://github.com/vjudge1/LilyWhiteBot/blob/master/plugins/qqxiaoice.js)：召唤 QQ 群的小冰（备注：需要 QQ 群群主开启小冰/BabyQ 功能）
