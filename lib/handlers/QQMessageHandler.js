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

class QQMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client || !client.addListener) {
            throw ReferenceError('No QQ client object');
        }

        this._type = 'QQ';
        this._id = 'Q';

        this._client = client;
        this._selfCensorship = options.selfCensorship || false;
        this._badwords = options.badwords || [];
        this._ignoreCash = options.ignoreCash || false;
        this._qq = parseInt(options.qq) || 0;
        this._nickStyle = options.nickStyle || 'groupcard';
        this._isPro = options.CoolQPro && true;
        this._keepSilence = options.keepSilence || [];

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

        const receiveMessage = (rawdata, isPrivate) => {
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

            if (rawdata.from === 1000000) {
                context.nick = '应用消息';
            } else if (rawdata.from === 80000000) {
                context.nick = '匿名消息';
                context.text = `[${rawdata.user.groupCard}] ${context.text}`;
            }

            // 記錄圖片和語音
            let files = [];
            for (let image of rawdata.extra.images) {
                files.push({
                    client: 'QQ',
                    type: 'photo',
                    id: image,
                });
            }
            for (let voice of rawdata.extra.records) {
                files.push({
                    client: 'QQ',
                    type: 'audio',
                    id: voice,
                });
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

            // 記錄「@」
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
    set nickStyle(v) { this.nickStyle = v; }
    get isCoolQPro() { return this._isPro; }

    getNick(user) {
        if (user) {
            let {qq, name, groupCard} = user;
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

    say(target, message, options = {}) {
        if (!this._enabled) {
            return Promise.reject();
        } else if (this._keepSilence.indexOf(parseInt(target)) !== -1) {
            return Promise.resolve();
        } else {
            // 屏蔽敏感詞語
            if (this._selfCensorship) {
                for (let re of this._badwordsRegexp) {
                    message = message.replace(re, (m) => '*'.repeat(m.length));
                }
            }

            if (target.toString().startsWith('@')) {
                let realTarget = target.toString().substr(1);
                this._client.sendPrivateMessage(realTarget, message, options);
            } else {
                if (options.isPrivate) {
                    this._client.sendPrivateMessage(target, message, options);
                } else {
                    this._client.sendGroupMessage(target, message, options);
                }
            }

            return Promise.resolve();
        }
    }

    reply(context, message, options = {}) {
        if (context.isPrivate) {
            options.isPrivate = true;
            return this.say(context.from, message, options);
        } else {
            if (options.noPrefix) {
                return this.say(context.to, `${message}`, options);
            } else {
                return this.say(context.to, `${context.nick}: ${message}`, options);
            }
        }
    }

    groupMemberInfo(group, qq) {
        return this._client.groupMemberInfo(group, qq);
    }

    parseMessage(message) {
        return this._client.parseMessage(message);
    }
}

module.exports = QQMessageHandler;
