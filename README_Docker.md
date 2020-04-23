在 Docker 中运行
===

注意：如果使用酷 Q，其插件需要使用 CoolQ HTTP API 而非 cqsockertapi，否则程序无法连接。

下面是一个基于 Docker Compose 的示例配置方法：

## 1. 配置机器人账号
参见[README.md](https://github.com/infnan/LilyWhiteBot/blob/master/README.md)。

## 2. 安装必要的软件
需要在服务器上安装Docker、Docker Compose、git，具体操作步骤略。

如使用中国国内服务器，需配置好Docker镜像源，否则拉镜像时网络会非常卡。

## 3. 下载必要的文件
下面命令在服务器执行，会在家目录建立一个子目录bot，相关文件均会放到该目录中。
```
cd
mkdir bot
cd bot

# 互联机器人源码
git clone https://github.com/infnan/LilyWhiteBot

# 酷Q插件（酷Q本体会自动下载，我们只需把插件配置好）
mkdir -p coolq/app
cd coolq/app
wget https://github.com/richardchien/coolq-http-api/releases/download/v4.15.0/io.github.richardchien.coolqhttpapi.cpk
```

## 4. 修改配置文件
### LilyWhiteBot 配置文件
执行
```
cd ~/bot/LilyWhiteBot
cp config.example.yml config.yml
cp badwords.example.yml badwords.yml
```

如果您是从旧版本升级而来，您可以继续使用json文件（然而程序会优先读取yaml文件，注意处理冲突）。因yaml更适合维护配置，建议花点时间转一下格式。

根据示例配置文件中的注释修改两个配置文件。其中，config.yml的 QQ 部分有几处需要留意的地方：

1. `qq.apiRoot`设置为`http://coolq:5700`。
2. `qq.accessToken`与`qq.secret`内容随意填写，但必须和 Cool HTTP API 配置文件中的 token 与 secret 保持一致。
3. `qq.listen.host`设置为`0.0.0.0`。
4. `qq.host`与`qq.port`参数需删除。
5. 如需转发图片，建议使用图床（`transport.options.servemedia.type`不设置为`self`），因容器取文件比较麻烦。
6. 如需将 Telegram Sticker 转为图片（`transport.options.servemedia.webp2png = true`），那么`transport.options.servemedia.webpPath`需设置为`/usr/local/bin/dwebp`。

### CoolQ HTTP API 配置
执行
```
cd ~/bot/coolq/app
mkdir io.github.richardchien.coolqhttpapi
```

创建config.json文件，内容大体如下（请根据实际情况修改）：

```json
{
    "general": {
        "host": "0.0.0.0",
        "use_http": true,
        "use_ws": false,
        "use_ws_reverse": false,
        "post_url": "http://lilywhitebot:11234",
        "log_level": "info",
        "show_log_console": false,
        "disable_coolq_log": false,
        "serve_data_files": true,
        "access_token": "随便一个字符串",
        "secret": "随便一个字符串"
    },
    "机器人的QQ号": {
        "port": 5700
    }
}
```

注意 access\_token 与 secret 两参数需要和 LilyWhiteBot 的 config.yml 保持一致。

### docker-compose.yaml
在bot目录创建docker-compose.yaml文件，可参照以下配置文件进行设置（注意修改下面的 VNC 密码与机器人 QQ 号）：

```yaml
version: "3"

services:
  coolq:
    image: coolq/wine-coolq
    restart: always
    volumes:
      - ./coolq:/home/user/coolq
    ports:
      # 使用9000作为运维端口，HTTP协议
      - "9000:9000"
    environment:
      VNC_PASSWD: VNC密码
      COOLQ_ACCOUNT: 你的机器人账号

  lilywhitebot:
    build: ./LilyWhiteBot
    restart: always
    user: node
    working_dir: /home/node/app
    volumes:
      - ./LilyWhiteBot:/home/node/app
    command: "npm run install-start"
```

## 5. 启动
执行
```
docker-compose up -d
```

第一次启动时，需安装配置酷 Q。调整服务器防火墙，放行9000端口，然后使用浏览器访问`http://你的服务器IP:9000`，输入VNC密码，进行酷 Q 的安装与登录操作。登录成功后，启用 CoolQ HTTP API 插件，然后在界面中重启酷 Q。

配置完成后，检查机器人是否正常运行。酷 Q 与 CoolQ HTTP API 插件可在酷 Q 软件中查看，而互联机器人日志可通过`docker logs bot_lilywhitebot_1`命令查看。

