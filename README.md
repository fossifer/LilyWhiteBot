LilyWhiteBot
===
在多个群组间传话的机器人。原名为“qq-tg-irc”。

## 旧版升级说明
如果您从旧版本升级，请注意以下三点：

1. Node.js 最低版本为 8。
2. 配置文件格式由 json 换成了 yaml。json 配置文件仍然可用，但您会收到一条警告信息。
3. 程序不再支持酷 Q 的 [me.cqp.ishisashi.cqsocketapi.cpk](https://dl.bintray.com/mrhso/cqsocketapi/me.cqp.ishisashi.cqsocketapi.cpk)插件，建议尽快更换成 [CoolQ HTTP API](https://cqhttp.cc/)。

如需使用新插件，请按照以下形式重新设置：
```yaml
QQ:
  # 以下参数用于与 CoolQ HTTP API 插件连接，需要和其设置一致
  apiRoot: "http://127.0.0.1:5700/"
  accessToken: "123"
  secret: "abc"
  listen:                                   # 用于接收消息，需要同步修改 CoolQ HTTP API 插件中 post_url 参数
    host: "127.0.0.1"                       # 使用Docker时请设置成0.0.0.0
    port: 11234
  # ...
```

CoolQ HTTP API 也需要调整对应设置（详见[此页](https://cqhttp.cc/docs/4.11/#/Configuration)），例如：
```json
{
    "host": "0.0.0.0",                      // 使用Docker时请设置成0.0.0.0
    "post_url": "http://127.0.0.1:11234",   // 与上面 listen 保持一致
    "serve_data_files": true,               // 需要设置为 true 否则无法获取图片消息内容
    ...
}
```

不修改设置的话则会继续使用旧的 cqsocketapi 插件。

为方便容器化，以新接口形式配置之后，程序不再直接访问酷 Q 目录，任何指定酷 Q 目录的设置都将失效（例如 servemedia 部分的 coolqCache 参数）。

## 如何安装
目前支持 QQ、Telegram、IRC 和 Discord（[试验中](https://github.com/mrhso/LilyWhiteBot/issues/4)）四种群组互联。

### 必需步骤
* 根据实际需要准备机器人账号。（具体方法见后面）
* 安装 Node.js，版本要求：>=8.x。
* 下载机器人本体。
* 运行：
```
npm install
node main.js
```
* 建议借助[forever](https://github.com/foreversd/forever)等能够常驻内存的工具来启动、监控程序。
* 根据实际需要修改 config.example.yml，并改名为 config.yml。
* QQ 群格式 `qq/QQ 群号`；Telegram 群格式 `telegram/一串数字`（该数字可通过`/thisgroupid`取得，后面有说明，而且请注意该数字是**负数**）；IRC 频道格式 `irc/#频道名`，别忘了`#`；Discord 频道格式 `discord/频道 ID`。

### 设置 QQ 机器人
1. 在正式启用互联之前，建议提前注册一个 QQ 小号，挂机挂到一定等级，并往钱包里塞一点钱，以减小被腾讯封杀的可能性。不过从实践情况来看，只有一颗星或不塞钱也无妨。
2. **下载[酷 Q](https://cqp.cc/)**，启动一下以便完成安装。
3. 下載 [CoolQ HTTP API](https://cqhttp.cc/)，并放到酷 Q 的 app 目录中。
4. 根据 [CoolQ HTTP API 文档](https://cqhttp.cc/docs/4.15/#/Configuration)配置插件，另外请留意前文“旧版升级说明”。
5. 再次启动酷 Q，登录机器人账号，然后在插件设置中启用「CoolQ Socket API (Node.js)」。
6. 根据实际需要修改 badwords.example.yml，并改名为 badwords.yml。「敏感词」功能仅对 QQ 机器人有效。
7. 请记得定期清除缓存。
8. 如果需要，可自行搜索监控或自动重启插件，或者将插件提供的 HTTP 接口纳入到 Zabbix 等监控系统中。

注意：
1. 本程序需要酷 Q Air 和这个专门的 HTTP API 才能收发 QQ 群信息。
2. 如无特殊需求，不建议使用 Pro，因本程序不支持 Pro 的附加功能。
3. 不支持讨论组互联，如有需要，请将讨论组转成群。
4. 运行程序时，酷 Q 会有很大机率要求你开启 QQ 的设备锁，因此注册小号时请不要乱填电话号。
5. 酷 Q 模拟的是安卓 QQ，而且 QQ 不允许多个手机同时登录。如果已经开启酷 Q，而且需要直接操作机器人账号，请用电脑登录。
6. 酷 Q 是私有软件，和腾讯、CoolQ HTTP API、本程序等均无关系。
7. 酷 Q 可以通过 wine 在 Linux/Mac 系统中运行，可以参考[这篇教程](https://cqp.cc/t/30970)进行设置。
8. 酷 Q 可以通过 Docker 运行，参见[其 GitHub 页面](https://github.com/CoolQ/docker-wine-coolq)。

### 设置 Telegram 机器人
@BotFather，与其交互，按照屏幕提示进行操作，建立一个机器人账号。设置完成后，BotFather 会给一个 Token，你需要把这个 Token 填到 config.yml 中。

之后请记得运行 `/setprivacy` 命令，将机器人的 Privacy 设为 DISABLED，以便于让它看到群组内的信息。

将 @GroupIDbot 拉入您的群组中，然后输入“/id”，便可获取群组的 ID。

### 设置 IRC 机器人
IRC 没有什么特别之处。如果你有 Cloak，请在 config.js 中输入正确的 userName、sasl_password，并将 sasl 设为 true。

### 设置 Discord 机器人
进入 [Discord Developer Portal](https://discordapp.com/developers/applications/)，创建 Application。在 Bot 页面中 Add Bot。将 Token 填到 config.js 中。

频道 ID 可以在网页版之 URL 看到，最后面的那串神秘数字便是。

## 在 Docker 中运行
注意：如果使用酷 Q，其插件需要使用 CoolQ HTTP API 而非 cqsockertapi，否则程序无法连接。

## 提示
1. 如果把 config.yml 中的 `paeeye` 设为 `//`，那么在信息之前加入 `//`（例如「//隐藏」）可防止被其他群组看见。
2. 如果允许 IRC 接受命令（plugins 中有「irccommand」），那么可在 Telegram 和 QQ 中使用 `/command 命令`。该命令并非 IRC 命令，而是为配合 IRC 频道中的机器人而设。
3. 如果允许查询 IRC 的情况（plugins 中有「ircquery」），那么可在 Telegram 和 QQ 中使用 `/names`（取得在线用户清单）、`/whois 昵称`（whois）和 `/topic`（取得 Topic）。

## 关于 QQ 的特别提醒
为保护机器人操作者，程序提供了「敏感词」功能，启用之后，程序会自动把敏感词清单中的词语转为「*」。然而**程序并未提供词库**，您需要自行去 GitHub 等网站搜集敏感词并制作词典。建议在启用机器人之前把敏感词功能设置好，除非您不在中国，或者能够保证没有群友会利用敏感词来陷害您。

### 其他功能
以下各功能的设定方法均为改 config.yml。
* [filter](https://github.com/mrhso/LilyWhiteBot/blob/master/plugins/filter.js)：过滤符合指定规则的信息。
* [qqxiaoice](https://github.com/mrhso/LilyWhiteBot/blob/master/plugins/qqxiaoice.js)：召唤 QQ 群的小冰。（需要 QQ 群群主开启小冰/BabyQ 功能）
* [wikilinky](https://github.com/mrhso/LilyWhiteBot/blob/master/plugins/wikilinky.js)
