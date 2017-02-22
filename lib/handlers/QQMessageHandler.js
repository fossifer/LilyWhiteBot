/*
 * @name 使用通用介面處理QQ訊息
 *
 * 備註：不接收討論組訊息
 *
 * 口令紅包沒有任何跡象，所以只好認為：如果一分鐘之內一句話被重複了三次或以上，說明大家在搶紅包
 */

const MessageHandler = require('./MessageHandler.js');
const Message = require('./Context.js').Message;

class QQMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client || !client.addListener) {
            throw ReferenceError('No QQ client object');
        }

        this._type = 'QQ';

        this._client = client;
        this._selfCensorship = options.selfCensorship || false;
        this._badwords = options.badwords || [];
        this._ignoreCash = options.ignoreCash || false;
        this._qq = parseInt(options.qq) || 0;
        this._nickStyle = options.nickStyle || 'groupcard';

        this._pendingQueries = new Map();       // 用於查詢使用者資料
        this._stat = {                          // 用於統計發言，以便屏蔽口令紅包
            last: new Map(),
            count: new Map(),
        };

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

            let context = new Message({
                from: rawdata.from,
                nick: this.getNick(rawdata.user),
                text: rawdata.text,
                isPrivate: isPrivate,
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

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
                // 過濾紅包訊息（特別是口令紅包），並且防止誤傷（例如[圖片]）
                let msg = `${rawdata.group}: ${rawdata.text}`;

                let count = this._stat.count.get(msg) || 0;

                if (++count > 3) {
                    context.extra.isCash = true;
                }

                this._stat.count.set(msg, count);
                this._stat.last.set(msg, new Date().getTime());
            }

            // 記錄 @
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

        // 定期清理發言統計
        setInterval(() => {
            let now = new Date().getTime();
            for (let [chat, last] of this._stat.last) {
                if (now - last > 60000) {
                    this._stat.last.delete(chat);
                    this._stat.count.delete(chat);
                }
            }
        }, 60000);

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

        client.on('GroupMemberInfo', (info) => {
            let key = `${info.group}_${info.qq}`;
            let callback = this._pendingQueries.get(key);
            this._pendingQueries.delete(key);
            callback(info);
        });
    }

    get qq() { return this._qq; }
    get selfCensorship() { return this._selfCensorship; }
    set selfCensorship(v) { this._selfCensorship = v && true; }
    get ignoreCash() { return this._ignoreCash; }
    set ignoreCash(v) { this._ignoreCash = v && true; }
    get nickStyle() { return this._nickStyle; }
    set nickStyle(v) { this.nickStyle = v; }

    getNick(user) {
        if (user) {
            let {qq, name, groupCard} = user;

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

    say(target, message, options = {}) {
        // 屏蔽敏感詞語
        if (this._selfCensorship) {
            for (let re of this._badwordsRegexp) {
                message = message.replace(re, (m) => '*'.repeat(m.length));
            }
        }

        if (options.isPrivate) {
            this._client.sendPrivateMessage(target, message);
        } else {
            this._client.sendGroupMessage(target, message);
        }
        return this;
    }

    reply(context, message, options = {}) {
        if (context.isPrivate) {
            options.isPrivate = true;
            this.say(context.from, message, options);
        } else {
            if (options.noPrefix) {
                this.say(context.to, `${message}`, options);
            } else {
                this.say(context.to, `${context.nick}: ${message}`, options);
            }
        }
        return this;
    }

    groupMemberInfo(group, qq) {
        return new Promise((resolve, reject) => {
            let stop = false;
            let timeOut = setTimeout(() => {
                stop = true;
                reject();
            }, 250);
            const done = (info) => {
                if (!stop) {
                    clearTimeout(timeOut);
                    resolve(info);
                }
            }

            this._pendingQueries.set(`${group}_${qq}`, done);
            this._client.groupMemberInfo(group, qq);
        });
    }
}

module.exports = QQMessageHandler;
