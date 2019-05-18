/*
 * @name 使用通用介面處理 Discord 訊息
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');

class DiscordMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client || !client.addListener) {
            throw ReferenceError('No Discord client object');
        }

        this._type = 'Discord';
        this._id = 'D';

        this._client = client;
        this._nickStyle = options.nickStyle || 'username';
        this._keepSilence = options.keepSilence || [];

        const processMessage = (rawdata) => {
            if (!this._enabled || rawdata.author.id === client.user.id) {
                return;
            }

            let context = new Context({
                from: rawdata.author.id,
                to: rawdata.channel.id,
                nick: this._nickStyle === 'username' ? rawdata.author.username || rawdata.author.id : rawdata.author.id,
                text: rawdata.content,
                isPrivate: rawdata.channel.type === 'dm',
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

            // 檢查是不是命令
            for (let [cmd, callback] of this._commands) {
                if (rawdata.content.startsWith(cmd)) {
                    let param = rawdata.content.trim().substring(cmd.length);
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

        client.on('ready', (message) => {
            this.emit('ready', message);
        });
    }

    say(target, message, options = {}) {
        if (!this._enabled) {
            return Promise.reject();
        } else if (this._keepSilence.indexOf(target) !== -1) {
            return Promise.resolve();
        } else {
            this._client.channels.get(target).send(message);
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

module.exports = DiscordMessageHandler;
