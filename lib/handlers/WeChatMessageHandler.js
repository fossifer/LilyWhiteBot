/*
 * @name 使用通用介面處理微信訊息
 *
 * 警告：此为原型程序，仅用作测试，请勿用于生产环境
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const WeChatBot = require('../WeChatBotClient.js');
const winston = require('winston');
const { loadConfig } = require('../util.js');

class WeChatMessageHandler extends MessageHandler {
    constructor(config = {}) {
        super();

        let botConfig = config.bot || {};
        let wechatOptions = config.options || {};

        let client = new WeChatBot({
            host: botConfig.host || '127.0.0.1',
            port: botConfig.port || 11337,
        });

        client.on('Error', (err) => {
            winston.error(`WeChatBot Error: ${err.error.toString()} (${err.event})`);
        });

        // 載入敏感詞清單
        let badwords = [];
        if (options.selfCensorship) {
            try {
                badwords = loadConfig('../../badwords') || [];
            } catch (ex) {
                winston.error('<QQBot> Unable to load badwords list');
            }
        }

        this._type = 'WeChat';
        this._id = 'W';

        this._client = client;
        this._ungoodwords = badwords || [];
        this._keepSilence = wechatOptions.keepSilence || [];

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
            return Promise.reject(new Error('Handler not enabled'));
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

module.exports = WeChatMessageHandler;
