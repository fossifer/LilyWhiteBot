/*
 * @name 使用通用接口处理IRC消息
 */

const MessageHandler = require('./MessageHandler.js');
const Message = require('./Context.js').Message;
const color = require('irc-colors');

class IRCMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client || !client.addListener) {
            throw ReferenceError('No IRC client object');
        }

        this._type = 'IRC';

        this._client = client;
        this._maxLines = options.maxLines || 4;

        const processMessage = (from, to, text, rawdata, isAction = false) => {
            if (!this._enabled || from === client.nick) {
                return;
            }

            // 去除訊息中的格式字元
            let plainText = color.stripColorsAndStyle(text);

            let context = new Message({
                from: from,
                to: to,
                nick: from,
                text: plainText,
                isPrivate: to === client.nick,
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

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
            this.emit('quit', nick, reason, channels, message);
        });

        client.on('topic', (channel, topic, nick, message) => {
            this.emit('topic', channel, topic, nick, message);
        });
    }

    get maxLines() { return this._maxLines; }
    set maxLines(value) { this._maxLines = value; }

    say(target, message, options = {}) {
        let lines = this.splitText(message, 450, this._maxLines);
        this._client.say(target, lines.join('\n'));
        return this;
    }

    reply(context, message, options = {}) {
        if (context.isPrivate) {
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

    get chans() {
        return this._client.chans;
    }

    whois(nick, callback) {
        this._client.whois(nick, callback);
    }

    splitText(text, maxBytesPerLine = 450, maxLines = 0) {
        let lines = [];
        let line = [];
        let bytes = 0;
        let lastIsCR = false;

        if (maxBytesPerLine < 5) {
            return [];
        }

        for (let ch of text) {
            if (ch === '\n') {
                if (!lastIsCR) {
                    lines.push(line.join(''));
                    line = [];
                    bytes = 0;
                    lastIsCR = true;
                    if (maxLines > 0 && lines.length === maxLines + 1) {
                        break;
                    }
                }
            } else {
                lastIsCR = false;

                let code = ch.codePointAt(0);
                let b = (code <= 0x7F) ? 1 : (
                         (code <= 0x7FF) ? 2 : (
                          (code <= 0xFFFF) ? 3 : (
                           (code <= 0x10FFFF) ? 4 : 5
                          )
                         )
                        );

                if (bytes + b > maxBytesPerLine) {
                    lines.push(line.join(''));
                    line = [ch];
                    bytes = b;
                    if (maxLines > 0 && lines.length === maxLines) {
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
}

module.exports = IRCMessageHandler;
