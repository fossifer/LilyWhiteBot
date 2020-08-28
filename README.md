LilyWhiteBot
===
在多个群组间传话的机器人。原名为“qq-tg-irc”。

## 关于QQ的重要说明
2020年7月22日，晨风机器人作者被警方喝茶，随后酷Q作者迫于压力跑路。<s>本程序QQ部分依赖酷Q运行，因此也不再支持QQ传话，直到有其他解决方案为止。</s><br />
暫時備選解決方案為 [OICQ](https://github.com/takayama-lily/oicq) 或 [Mirai](https://github.com/mamoe/mirai)/[Mirai Api Http插件](https://github.com/project-mirai/mirai-api-http)。

## 功能
* QQ（实验性）、Telegram、IRC、Discord 等多组聊天群之间互联。
* 可根据需要配置单向互联，或者将同一聊天软件的多个分群互联到一起。
* 支持图片转发。如不能发送图片（IRC），程序可将图片上传到图床并提供图片链接。
* 支持自定义转发消息样式。
* 支持 Docker 部署。
* 可支持扩展（备注：目前接口尚不完善，请尽量避免自己写插件）。

## 部署操作指南
### 准备机器人账号
#### QQ（<s>已停止</s>实验性支持）
由于全新的 QQ 号无法直接进群，故建议提前两周注册 QQ 账号，并保持在线。尽量实名注册并绑定手机，以免在触发验证时无法验证账号。

#### Telegram
1. 与 @BotFather 私聊，输入`/newbot`命令，按照屏幕指示进行操作，创建机器人账号。
2. 记录 BotFather 给出的 Token。
3. 输入`/setprivacy`命令，根据屏幕提示选择机器人账号，然后选择`Disable`，关闭隐私模式。

#### IRC
IRC 不需要注册。为了提高安全性，您可以采取注册 Nick、增加 Cloak 等措施，需要的话请自行搜索教程。

#### Discord
1. 进入 [Discord Developer Portal](https://discordapp.com/developers/applications/)，创建 Application。创建完成后记录 CLIENT ID。
2. 进入 Bot 页面，点击 Add Bot，创建机器人。创建成功后记录 Token。
3. 进入 OAuth2 页面，往下翻到“OAuth2 URL Generator”，找到 SCOPES 并勾选 bot，然后再继续勾选 BOT PERMISSIONS 中的权限（例如 Administrator），系统会生成一个链接。访问生成的链接，按照屏幕提示将机器人拉入到你的服务器与频道中。
<!--
#### 微信
**警告：微信极容易被封号，请认真阅读[注意事项](https://github.com/Joch2520/LilyWhiteBot/wiki/%E5%BE%AE%E4%BF%A1%E6%B3%A8%E6%84%8F%E4%BA%8B%E9%A1%B9%EF%BC%88%E4%BD%BF%E7%94%A8%E5%89%8D%E5%BF%85%E8%AF%BB%EF%BC%81%EF%BC%89)之后再进行操作！**

1. 准备专用手机。除机器人账号外，不要登录其他账号。
2. 启动微信，实名制注册。
2. 绑定银行卡，并往微信钱包中塞一块钱。
3. 加三个真实的好友。
4. 在专用手机上挂机三周，以规避风控。
-->

### 配置互联程序（Docker）
推荐在 Docker 中运行互联机器人程序。具体配置方法见 [Docker说明](https://github.com/Joch2520/LilyWhiteBot/blob/master/README_Docker.md)。

### 配置互联程序（手工操作）
#### 配置 LilyWhiteBot
1. 安装 Node.js，最小版本 12。
2. 下载代码
```
git clone https://github.com/Joch2520/LilyWhiteBot
```
3. 修改配置文件：
    * 将 config.example.yml 改名为 config.yml，按照配置文件中的提示填入参数。默认情况下各机器人都是关闭的，您需要将需要的机器人的 `disabled` 改为 `false`。
    * 为避免群友乱说话导致封号，本程序有敏感词机制。需将 badwords.example.yml 改名为 badwords.yml。但是请注意，本程序未提供具体词库，且过滤机制较为简单，词库太大的话会影响性能。
4. 运行
```
npm install
node main.js
```
5. 检查互联机器人是否正常运行。

如果已正常工作，建议使用 [forever](https://github.com/foreversd/forever) 启动机器人，保证程序随时运行。

如何获取群组ID？
* IRC、QQ：分别为频道名称（以 `#` 开头）和 QQ 群号码。在 LilyWhiteBot 配置文件中分别为 `irc/#频道名称` 与 `qq/群号`，例如 `irc/#test`、`qq/12345678`。
* Telegram：将 [@GroupIDbot](https://t.me/GroupIDbot) 拉入到您的聊天群，然后输入 `/id`，机器人会返回聊天群的 ID。这个 ID 是一个负数，在 LilyWhiteBot 配置文件中需要写成类似 `telegram/-1234567890` 的格式。
* Discord：进入 Discord 的用户设置（User Settings），找到 Appearance，启用“Enable Developer Mode”选项。然后右击聊天频道，在弹出菜单中选择“Copy ID”。在 LilyWhiteBot 配置文件中需要写成类似 `discord/1234567890` 的格式。

### 从其他版本升级
如果您从其他版本升级，请注意以下三点：

1. Node.js 最低版本为 12。
2. 配置文件格式由 json 换成了 yaml。json 配置文件仍然可用，但您会收到一条警告信息。
3. 程序不再支持酷 Q。

## 实验性插件
以下各功能的设定方法均为改 config.yml。接口与功能可能会有所调整。详细内容参见[插件](https://github.com/Joch2520/LilyWhiteBot/wiki/%E6%8F%92%E4%BB%B6)。
* [filter](https://github.com/Joch2520/LilyWhiteBot/blob/master/plugins/filter.js)：过滤符合指定规则的信息。
* [qqxiaoice](https://github.com/Joch2520/LilyWhiteBot/blob/master/plugins/qqxiaoice.js)：召唤 QQ 群的小冰。（需要 QQ 群群主开启小冰/BabyQ 功能）
* [wikilinky](https://github.com/Joch2520/LilyWhiteBot/blob/master/plugins/wikilinky.js)
