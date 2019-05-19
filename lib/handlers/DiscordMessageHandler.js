/*
 * @name 使用通用介面處理 Discord 訊息
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');

const getFriendlySize = (size) => {
    if (size <= 1126) {
        return `${size.toLocaleString()} B`;
    } else if (size <= 1153433) {
        return `${(size / 1024).toLocaleString()} KiB`;
    } else if (size <= 1181116006) {
        return `${(size / 1048576).toLocaleString()} MiB`;
    } else {
        return `${(size / 1073741824).toLocaleString()} GiB`;
    }
};

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
        this._useProxyURL = options.useProxyURL;

        const processMessage = (rawdata) => {
            if (!this._enabled || rawdata.author.id === client.user.id) {
                return;
            }

            let text = rawdata.content;
            let extra = {};
            if (rawdata.attachments && rawdata.attachments.size) {
                for (let [, p] of rawdata.attachments) {
                    extra.files = [{
                        client: 'Discord',
                        type: 'photo',
                        id: p.id,
                        size: p.filesize,
                        url: this._useProxyURL ? p.proxyURL : p.url,
                    }];
                    text += ` <photo: ${p.width}x${p.height}, ${getFriendlySize(p.filesize)}>`;
                }
            }

            let context = new Context({
                from: rawdata.author.id,
                to: rawdata.channel.id,
                nick: this._nickStyle === 'username' ? rawdata.author.username || rawdata.author.id : rawdata.author.id,
                text: text,
                isPrivate: rawdata.channel.type === 'dm',
                extra: extra,
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
