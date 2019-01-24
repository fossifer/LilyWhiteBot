/*
 * @name 使用通用介面處理微信訊息
 *
 * 備註：不接收討論組訊息
 *
 * 口令紅包沒有任何跡象，所以只好認為：如果一分鐘之內一句話被重複了三次或以上，說明大家在搶紅包
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const LRU = require("lru-cache");

class WeChatMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client || !client.addListener) {
            throw ReferenceError('No Wechat client object');
        }

        this._type = 'WeChat';
        this._id = 'W';

        this._client = client;
        this._ungoodwords = options.ungoodwords || [];
        this._keepSilence = options.keepSilence || [];

        this._ungoodwordsRegexp = [];
        for (let word of this._ungoodwords) {
            this._ungoodwordsRegexp.push(new RegExp(word, 'gmu'));
        }

        client.on('Message', (rawdata) => {
            if (!this._enabled) {
                return;
            }

            let content = rawdata.content;
            let nick = '';

            // TODO 别那么 hack
            if (content.indexOf(':\n') !== -1) {
                nick = content.substr(0, content.indexOf(':\n'));
                content = content.substr(content.indexOf(':\n')+2);
            }

            let context = new Context({
                from: rawdata.from,     // 无法得知消息来源，from 是群组号
                to: rawdata.from,       // from 才是群组号
                nick: nick,
                text: content,
                isPrivate: false,
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

            // 檢查是不是命令
            // TODO 修正
            for (let [cmd, callback] of this._commands) {
                if (content.startsWith(cmd)) {
                    let param = content.trim().substring(cmd.length);
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
        });
    }

    getNick(user) {
        return '';
    }

    say(target, message, options = {}) {
        if (!this._enabled) {
            return Promise.reject();
        } else if (this._keepSilence.indexOf(parseInt(target)) !== -1) {
            return Promise.resolve();
        } else {
            // 屏蔽敏感詞語
            for (let re of this._ungoodwordsRegexp) {
                message = message.replace(re, (m) => '*'.repeat(m.length));
            }

            this._client.send(target, message);
            return Promise.resolve();
        }
    }

    reply(context, message, options = {}) {
        if (context.isPrivate) {
            return this.say(context.from, message, options);
        } else {
            if (options.noPrefix) {
                return this.say(context.to, `${message}`, options);
            } else {
                return this.say(context.to, `${context.nick}: ${message}`, options);
            }
        }
    }
}

module.exports = WeChatMessageHandler;
