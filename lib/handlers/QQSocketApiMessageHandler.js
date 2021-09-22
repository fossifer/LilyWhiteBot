/*
 * @name 使用通用介面處理 QQ 訊息
 *
 * 備註：不接收討論組訊息
 *
 * 口令紅包沒有任何跡象，所以只好認為：如果一分鐘之內一句話被重複了三次或以上，說明大家在搶紅包
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const LRU = require("lru-cache");
const QQSocketApiBot = require('../QQSocketApiBot.js');
const winston = require('winston');
const { loadConfig } = require('../util.js');

class QQSocketApiMessageHandler extends MessageHandler {
    constructor(config = {}) {
        super();

        let botConfig = config.bot || {};
        let qqOptions = config.options || {};

        // 配置文件兼容性
        for (let key of ['qq', 'apiRoot', 'accessToken', 'secret', 'listen', 'host', 'port']) {
            botConfig[key] = botConfig[key] || config[key];
        }

        let client = new QQSocketApiBot({
            CoolQPro: qqConfig.CoolQPro,
            host: config.host || '127.0.0.1',
            port: config.port || 11235,
            unicode: qqOptions.unicode,
            dir: qqOptions.dir,
            coolqCache: '',
            legacy: false,
        });

        client.on('Error', (err) => {
            winston.error(`QQBot (cqsocketapi) error: ${err.error.toString()} (${err.event})`);
        });

        // 載入敏感詞清單
        let badwords = [];
        if (qqOptions.selfCensorship) {
            try {
                badwords = loadConfig('badwords') || [];
            } catch (ex) {
                winston.error('<QQBot> Unable to load badwords list');
            }
        }

        this._type = 'QQ';
        this._id = 'Q';

        this._client = client;
        this._selfCensorship = qqOptions.selfCensorship || false;
        this._badwords = badwords;
        this._ignoreCash = qqOptions.ignoreCash || false;
        this._qq = parseInt(botConfig.qq) || 0;
        this._nickStyle = qqOptions.nickStyle || 'groupcard';
        this._keepSilence = qqOptions.keepSilence || [];
        this._CoolQPro = qqOptions.CoolQPro || false;

        this._stat = new LRU({
            max: 500,
            maxAge: 60000,
        });

        if (this._selfCensorship) {
            this._badwordsRegexp = [];
            for (let word of this._badwords) {
                this._badwordsRegexp.push(new RegExp(word, 'gmu'));
            }
        }

        const receiveMessage = async (rawdata, isPrivate) => {
            if (!this._enabled) {
                return;
            }

            let context = new Context({
                from: rawdata.from,
                nick: this.getNick(rawdata.user),
                text: rawdata.text,
                isPrivate: isPrivate,
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

            if (rawdata.from === 80000000) {
                context.nick = `<匿名消息> ${rawdata.user.groupCard}`;
            }

            // 記錄圖片和語音
            let files = [];
            for (let image of parsedMsg.extra.images) {
                let fileItem = {
                    client: 'QQ',
                    type: 'image',
                    id: image,
                };
                let path = await this.image(image);
                if (path.startsWith('http://') || path.startsWith('https://')) {
                    fileItem.url = path;
                } else {
                    fileItem.path = path;
                }
                files.push(fileItem);
            }
            for (let voice of parsedMsg.extra.records) {
                let fileItem = {
                    client: 'QQ',
                    type: 'audio',
                    id: voice,
                };
                let path = await this.voice(voice);
                if (path.startsWith('http://') || path.startsWith('https://')) {
                    fileItem.url = path;
                } else {
                    fileItem.path = path;
                }
                files.push(fileItem);
            }
            context.extra.files = files;

            if (files.length === 0 && this._ignoreCash && !isPrivate) {
                // 過濾紅包訊息（特別是口令紅包），並且防止誤傷（例如「[圖片]」）
                let msg = `${rawdata.group}: ${rawdata.text}`;

                let count = this._stat.get(msg) || 0;

                if (++count > 3) {
                    context.extra.isCash = true;
                }

                this._stat.set(msg, count);
            }

            // 記錄 at
            context.extra.ats = rawdata.extra.ats;

            if (isPrivate) {
                context.to = this._qq;
            } else {
                context.to = rawdata.group;
            }

            // 檢查是不是命令
            for (let [cmd, callback] of this._commands) {
                if (rawdata.text.startsWith(cmd)) {
                    let param = rawdata.text.trim().substring(cmd.length);
                    if (param === '' || param.startsWith(' ')) {
                        param = param.trim();

                        context.command = cmd;
                        context.param = param;

                        if (typeof callback === 'function') {
                            callback(context, cmd, param);
                        }

                        this.emit('command', context, cmd, param);
                        this.emit(`command#${cmd}`, context, param);
                    }
                }
            }

            this.emit('text', context);
        };

        client.on('GroupMessage', (rawdata) => {
            receiveMessage(rawdata, false);
        });

        client.on('PrivateMessage', (rawdata) => {
            receiveMessage(rawdata, true);
        });

        client.on('GroupMemberIncrease', (rawdata) => {
            this.emit('join', rawdata);
        });

        client.on('GroupMemberDecrease', (rawdata) => {
            this.emit('leave', rawdata);
        });

        client.on('GroupAdmin', (rawdata) => {
            this.emit('admin', rawdata);
        });
    }

    get qq() { return this._qq; }
    get selfCensorship() { return this._selfCensorship; }
    set selfCensorship(v) { this._selfCensorship = v && true; }
    get ignoreCash() { return this._ignoreCash; }
    set ignoreCash(v) { this._ignoreCash = v && true; }
    get nickStyle() { return this._nickStyle; }
    set nickStyle(v) { this._nickStyle = v; }
    get isCoolQPro() { return this._CoolQPro; }

    getNick(user) {
        if (user) {
            let { qq, name, groupCard } = user;
            qq = qq || '';

            if (this._nickStyle === 'groupcard') {
                return groupCard || name || qq.toString();
            } else if (this._nickStyle === 'nick') {
                return name || qq.toString();
            } else {
                return qq.toString();
            }
        } else {
            return '';
        }
    }

    escape(message) {
        return this._client.escape(message);
    }

    async say(target, message, options = {}) {
        if (!this._enabled) {
            throw new Error('Handler not enabled');
        } else if (this._keepSilence.indexOf(parseInt(target)) !== -1) {
            // 忽略
        } else {
            // 屏蔽敏感詞語
            if (this._selfCensorship) {
                for (let re of this._badwordsRegexp) {
                    message = message.replace(re, (m) => '*'.repeat(m.length));
                }
            }

            if (target.toString().startsWith('@')) {
                let realTarget = target.toString().substr(1);
                return await this._client.sendPrivateMessage(realTarget, message, options);
            } else {
                if (options.isPrivate) {
                    return await this._client.sendPrivateMessage(target, message, options);
                } else {
                    return await this._client.sendGroupMessage(target, message, options);
                }
            }
        }
    }

    async reply(context, message, options = {}) {
        if (context.isPrivate) {
            options.isPrivate = true;
            return await this.say(context.from, message, options);
        } else {
            if (options.noPrefix) {
                return await this.say(context.to, `${message}`, options);
            } else {
                return await this.say(context.to, `${context.nick}: ${message}`, options);
            }
        }
    }

    groupMemberInfo(group, qq) {
        return this._client.groupMemberInfo(group, qq);
    }

    parseMessage(message) {
        return this._client.parseMessage(message);
    }

    image(file) {
        return this._client.image(file);
    }

    voice(file) {
        return this._client.voice(file);
    }

    async start() {
        if (!this._started) {
            this._started = true;
            this._client.start();
        }
    }

    async stop() {
        if (this._started) {
            this._started = false;
            this._client.stop();
        }
    }
}

module.exports = QQSocketApiMessageHandler;
