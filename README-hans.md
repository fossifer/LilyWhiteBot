QQ-Telegram-IRC
===

在三个（或以上）群组间传话的机器人。

## 如何安装
目前支持QQ、Telegram和IRC三种群组互联，不过亦可以选择两群互联或三个以上群互联。

### 必需步驟
* 根据实际需要准备机器人账号（具体方法见后面）
* 安装Node.js，版本要求：>=7.x
* 下载源代码
* 运行
```
npm install
node main.js
```
* 如果担心crash的话请直接写个死循环，例如`while true; do node main.js; done`或者
```batch
:a
node main.js
goto a
```
* 根据实际需要修改 config.example.js，并改名为 config.js。
* QQ群格式`qq/QQ群号`；Telegram群格式`telegram/一串数字`（该数字可通过`/thisgroupid`获取，后面有说明，而且请注意该数字是**负数**；IRC频道格式`irc/#频道名`，別忘了`#`。

### 设置QQ机器人
1. 在正式启用互联之前，建议提前注册一个QQ马甲，挂机挂到一定等级，并往钱包里面塞一点钱，以减小被腾讯封杀的可能性。不过从实践情况来看，只有一顆星或不塞钱也无妨。
2. **下载[酷Q](https://cqp.cc/)**，启动一下以便完成安装。
3. 进入[vjudge1/cqsocketapi](https://github.com/vjudge1/cqsocketapi/releases)，下载org.dazzyd.cqsocketapi.cpk，并且放到酷Q的app目录中。
4. 再次启动酷Q，登录机器人账号，然后在插件设置中启用“cqsocket”。
5. 根据实际需要修改 badwords.example.js，并改名为 badwords.js。“敏感词”功能仅对QQ机器人有效。
6. 请记得定期清除缓存。
7. 因为目前没做监控功能，所以还请自己盯一下酷Q的状态。

注意：
1. 本程序需要酷Q Air/Pro和这个专门的cqsocketapi才能收发QQ群消息。
2. 在服务器运行程序时，酷Q会有很大机率要求你开启QQ的设备锁，因此注册马甲时请不要乱填电话号。
3. 酷Q模拟的是安卓QQ，而且QQ不允许多个手机同時登录。如果已经开启酷Q，而且需要直接操作机器人账号，请用电脑登录。
4. 酷Q是私有软件，和我没关系。
5. 酷Q可以通过wine在Linux/Mac系统中运行，可以参考[这篇教程](https://cqp.cc/t/30970)进行设置。

### 设置Telegram机器人
@BotFather，与其交互，按照屏幕提示进行操作，建立一个机器人账号。设置完成后，BotFather会给你一个Token，你需要把这个Token填到config.js中。

之后请记得执行`/setprivacy`命令，把机器人的隐私模式设为DISABLED以便让它看到群内消息。

在刚开始的时候，可以保留config.js之内“plugins”中的“groupid-tg”，然后运行程序，并且在群中输入`/thisgroupid`，这样机器人会自动给出群组ID以便设置互联。如果没看懂前面那句话，你也可以把@combot拉进群中，然后输入`/stat`，看机器人给出的数字是多少。注意，数字是负数。

### 设置IRC机器人
IRC没有什么特别之处。如果你有Cloak，请在config.js中输入正确的userName、sasl_password，并将sasl设为true。

## 提示

1. 如果把config.json中的`paeeye`设为`//`，那么在消息之前加入`//`（例如“//隐藏”）可防止被其他群组看见。
2. 如果允许IRC接受命令（plugins中有“irccommand”），那么可在Telegram和QQ中使用`/command 命令`。该命令并非IRC命令，而是为配合IRC频道中的机器人而设。
3. 如果允许查询IRC的情况（plugins中有“ircquery”），那么可在Telegram和QQ中使用`/names`（获取在线用户名列表）、`/whois 昵称`（whois）和`/topic`（获取Topic）。
4. “敏感词”功能仅在QQ有效，而且仅对机器人自己“张嘴”有效。启用之后，程序会自动把敏感词列表中的词语转为“*”，可使用正则表达式。具体的政治敏感词汇可参照中文维基百科“中华人民共和国审查词汇列表”词条制作，本项目不再提供。详情见badwords.example.js。

### 其他功能
以下各功能的设置方法均为改config.js。
* [filter](https://github.com/vjudge1/qq-tg-irc/blob/master/plugins/filter.js)：过滤符合指定规则的消息。
* [qqxiaoice](https://github.com/vjudge1/qq-tg-irc/blob/master/plugins/qqxiaoice.js)：召唤QQ群的小冰（备注：需要QQ群群主开启小冰/BabyQ功能）
