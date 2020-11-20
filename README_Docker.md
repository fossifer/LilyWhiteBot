在 Docker 中运行
===

## 关于QQ的重要说明

2020年7月22日，晨风机器人作者被警方喝茶，随后酷Q作者迫于压力跑路。<s>本程序QQ部分依赖酷Q运行，因此也不再支持QQ传话，直到有其他解决方案为止。</s><br />
本倉庫已移除酷Q ，改為使用 [OICQ](https://github.com/takayama-lily/oicq)，因此 Docker 可完全使用命令行配置本倉庫。

下面是一个基于 Docker Compose 的示例配置方法：

## 1. 配置机器人账号
参见[README.md](https://github.com/Joch2520/LilyWhiteBot/blob/master/README.md)。

## 2. 安装必要的软件
需要在服务器上安装Docker、Docker Compose、git，具体操作步骤略。

<!-- 如使用中国国内服务器：
1. 需配置好Docker镜像源，否则拉镜像时网络会非常卡。
2. Dockerfile中的网址需要翻墙。如果已配置代理，需要增加
```Dockerfile
ENV HTTP_PROXY http://192.168.1.100:1080
ENV HTTPS_PROXY http://192.168.1.100:1080
```

如果未配置代理，需要找个墙外网站（例如Docker Hub）把容器构建出来，再借助国内镜像源来pull容器。 -->

## 3. 下载必要的文件
下面命令在服务器执行，会在家目录建立一个子目录bot，相关文件均会放到该目录中。
```
cd
mkdir bot
cd bot

# 互联机器人源码
git clone https://github.com/Joch2520/LilyWhiteBot
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

根据示例配置文件中的注释修改配置文件。其中，config.yml的 QQ 部分有几处需要留意的地方：

1. `QQ.bot.passwordMd5` 需填寫機器人帳號密碼進行MD5加密後的結果。建議使用本地加密器以避免密碼流出。
2. 如需转发图片，建议使用图床（`transport.options.servemedia.type`不设置为`self`），因容器取文件比较麻烦。

### docker-compose.yaml
在bot目录创建docker-compose.yaml文件，可参照以下配置文件进行设置（注意修改下面的 VNC 密码与机器人 QQ 号）：

<i>待更新</i>
<!-- ```yaml
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
      # 如果使用酷Q Pro 则需要解除下面的注释
      # COOLQ_URL: http://dlsec.cqp.me/cqp-full

  lilywhitebot:
    image: node:12
    restart: always
    working_dir: /home/node/app
    volumes:
      - ./LilyWhiteBot:/home/node/app
    command: "npm run install-start"
``` -->

## 5. 启动
执行
```
docker-compose up -d
```

第一次启动时，需解除QQ設備鎖。解鎖成功后，在命令行中重启主程式。

配置完成后，检查机器人是否正常运行。互联机器人日志可通过`docker logs bot_lilywhitebot_1`命令查看。

## 其他说明
### 文件服务器
```yaml
version: "3"

services:
  # ...

  lilywhitebot:
    image: node:12
    restart: always
    working_dir: /home/node/app
    volumes:
      - ./LilyWhiteBot:/home/node/app
      # 在此处增加临时文件存放目录
      - ./cache:/home/ndoe/cache
    command: "npm run install-start"

  nginx:
    # ...
    ports:
      - "80:80"
      - "443:443"
    volumes:
      # 与上面保持一致
      - ./cache:/var/www/html
```

config.yml：
* `transport.options.servemedia.type`设置为`self`
* `transport.options.servemedia.cachePath`设置为`/home/node/cache`
* `transport.options.servemedia.serveUrl`设置为你的（上面示例为nginx）服务器网址
