/*
 * @name 使用通用接口处理 IRC 消息
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const color = require('irc-colors');

class IRCMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client || !client.addListener) {
            throw ReferenceError('No IRC client object');
        }

        this._type = 'IRC';
        this._id = 'I';

        this._client = client;
        this._maxLines = options.maxLines || 4;
        this._splitsep = {
            prefix: options.splitPrefix || '',
            postfix: options.splitPostfix || ''
        };
        this._keepSilence = options.keepSilence || [];

        const processMessage = (from, to, text, rawdata, isAction = false) => {
            if (!this._enabled || from === client.nick) {
                return;
            }

            // 去除訊息中的格式字元
            let plainText = color.stripColorsAndStyle(text);

            let context = new Context({
                from: from,
                to: to,
                nick: from,
                text: plainText,
                isPrivate: to === client.nick,
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

            if (to !== client.nick) {
                context.to = to.toLowerCase();
            }

            if (isAction) {
                context.extra.isAction = true;
            }

            // 檢查是不是命令
            for (let [cmd, callback] of this._commands) {
                if (plainText.startsWith(cmd)) {
                    let param = plainText.trim().substring(cmd.length);
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

        client.on('message', processMessage);
        client.on('action', (from, to, text, rawdata) => {
            processMessage(from, to, text, rawdata, true);
        });

        client.on('join', (channel, nick, message) => {
            this.emit('join', channel, nick, message);
        });

        client.on('nick', (oldnick, newnick, channels, message) => {
            this.emit('nick', oldnick, newnick, channels, message);
        });

        client.on('quit', (nick, reason, channels, message) => {
            this.emit('quit', nick, reason, channels, message);
        });

        client.on('part', (channel, nick, reason, message) => {
            this.emit('part', channel, nick, reason, message);
        });

        client.on('kick', (channel, nick, by, reason, message) => {
            this.emit('kick', channel, nick, by, reason, message);
        });

        client.on('kill', (nick, reason, channels, message) => {
            this.emit('kill', nick, reason, channels, message);
        });

        client.on('topic', (channel, topic, nick, message) => {
            this.emit('topic', channel, topic, nick, message);
        });

        client.on('registered', (message) => {
            this.emit('registered', message);
        });
    }

    get maxLines() { return this._maxLines; }
    set maxLines(value) { this._maxLines = value; }

    get splitPrefix() { return this._splitsep.prefix; }
    set splitPrefix(p) { this._splitsep.prefix = p; }
    get splitPostfix() { return this._splitsep.postfix; }
    set splitPostfix(p) { this._splitsep.postfix = p; }

    get nick() { return this._client.nick; }

    say(target, message, options = {}) {
        if (!this._enabled) {
            return Promise.reject();
        } else if (this._keepSilence.indexOf(target.toLowerCase()) !== -1) {
            return Promise.resolve();
        } else {
            let lines = this.splitText(message, 449, this._maxLines);
            if (options.isAction) {
                this._client.action(target, lines.join('\n'));
            } else {
                this._client.say(target, lines.join('\n'));
            }
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

    get chans() {
        return this._client.chans;
    }

    whois(nick, callback) {
        this._client.whois(nick, callback);
    }

    splitText(text, maxBytesPerLine = 449, maxLines = 0) {
        let text2 = text.replace(/\n+/g, '\n').replace(/\n*$/g, '');
        let lines = [];
        let line = [];
        let bytes = 0;
        let seplen = this._splitsep.prefix.length + this._splitsep.postfix.length;

        if (maxBytesPerLine < 10) {
            return [];
        }

        for (let ch of text2) {
            if (ch === '\n') {
                lines.push(line.join(''));
                line = [];
                bytes = 0;
                if (maxLines > 0 && lines.length === maxLines + 1) {
                    break;
                }
            } else {
                let code = ch.codePointAt(0);
                let b = (code <= 0x7F) ? 1 : (
                         (code <= 0x7FF) ? 2 : (
                          (code <= 0xFFFF) ? 3 : (
                           (code <= 0x10FFFF) ? 4 : 5
                          )
                         )
                        );

                if (bytes + b > maxBytesPerLine - seplen) {
                    line.push(this._splitsep.postfix);
                    lines.push(line.join(''));
                    line = [this._splitsep.prefix, ch];
                    bytes = b;
                    if (maxLines > 0 && lines.length === maxLines) {
                        lines.push(line.join(''));
                        break;
                    }
                } else {
                    line.push(ch);
                    bytes += b;
                }
            }
        }

        if (maxLines > 0 && lines.length > maxLines) {
            lines.pop();
            lines.push('...');
        } else if (line.length > 0) {
            if (maxLines > 0 && lines.length === maxLines) {
                lines.push('...');
            } else {
                lines.push(line.join(''));
            }
        }

        return lines;
    }

    join(channel, callback) {
        this._client.join(channel, callback);
    }

    part(channel, message, callback) {
        this._client.part(channel, message, callback);
    }
}

module.exports = IRCMessageHandler;
