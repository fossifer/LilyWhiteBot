/*
 * @name 使用通用介面處理 Discord 訊息
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const discord = require('discord.js');
const winston = require('winston');
const { getFriendlySize } = require('../util.js');

class DiscordMessageHandler extends MessageHandler {
    constructor (config = {}) {
        super();

        let botConfig = config.bot || {};
        let discordOptions = config.options || {};

        const client = new discord.Client();

        client.on('ready', (message) => {
            winston.info('DiscordBot is ready.');
        });

        client.on('error', (message) => {
            winston.error(`DiscordBot Error: ${message.message}`);
        });

        this._type = 'Discord';
        this._id = 'D';

        this._token = botConfig.token;
        this._client = client;
        this._nickStyle = discordOptions.nickStyle || 'username';
        this._keepSilence = discordOptions.keepSilence || [];
        this._useProxyURL = discordOptions.useProxyURL;
        this._relayEmoji = discordOptions.relayEmoji;

        const processMessage = async (rawdata) => {
            if (!this._enabled || rawdata.author.id === client.user.id) {
                return;
            }

            let text = rawdata.content;
            let extra = {};
            if (rawdata.attachments && rawdata.attachments.size) {
                extra.files = []
                for (let [, p] of rawdata.attachments) {
                    extra.files.push({
                        client: 'Discord',
                        type: 'photo',
                        id: p.id,
                        size: p.size,
                        url: this._useProxyURL ? p.proxyURL : p.url,
                    });
                    text += ` <photo: ${p.width}x${p.height}, ${getFriendlySize(p.size)}>`;
                }
            }

            if (rawdata.reference && rawdata.reference.messageID) {
                if (rawdata.channel.id==rawdata.reference.channelID) {
                  let msg = await rawdata.channel.messages.fetch(rawdata.reference.messageID);
                  let reply = {
                    nick: this.getNick(msg.member||msg.author),
                    username: msg.author.username,
                    message: this._convertToText(msg),
                    isText: msg.content && true,
                  };

                  extra.reply = reply;
                }
            }

            let context = new Context({
                from: rawdata.author.id,
                to: rawdata.channel.id,
                nick: this.getNick(rawdata.member||rawdata.author),
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

    async say(target, message, options = {}) {
        if (!this._enabled) {
            throw new Error('Handler not enabled');
        } else if (this._keepSilence.indexOf(target) !== -1) {
            return;
        } else {
            let channel = await this._client.channels.fetch(target)
            return await channel.send(message);
        }
    }

    async reply(context, message, options = {}) {
        if (context.isPrivate) {
            return await this.say(context.from, message, options);
        } else {
            if (options.noPrefix) {
                return await this.say(context.to, `${message}`, options);
            } else {
                return await this.say(context.to, `${context.nick}: ${message}`, options);
            }
        }
    }

    getNick(userobj) {
        if (userobj) {
            if (userobj instanceof discord.GuildMember) {
              var { nickname, id, user } = userobj;
              var { username } = user;
            } else {
              var { username, id } = userobj;
              var nickname = null;
            }

            if (this._nickStyle === 'nickname') {
                return nickname || username || id;
            } else if (this._nickStyle === 'username') {
                return username || id;
            } else {
                return id;
            }
        } else {
            return '';
        }
    }

    async fetchUser(user) {
        return await this._client.users.fetch(user);
    }

    fetchEmoji(emoji) {
        return this._client.emojis.resolve(emoji);
    }

    _convertToText(message) {
        if (message.content) {
            return message.content;
        } else if (message.attachments) {
            return '<Photo>';
        // } else if (message.pinned_message) {
        //     return '<Pinned Message>';
        // } else if (message.new_chat_member) {
        //     return '<New member>';
        // } else if (message.left_chat_member) {
        //     return '<Removed member>';
        } else {
            return '<Message>';
        }
    }

    async start() {
        if (!this._started) {
            this._started = true;
            this._client.login(this._token);
        }
    }

    async stop() {
        if (this._started) {
            this._started = false;
            this._client.destroy();
        }
    }
}

module.exports = DiscordMessageHandler;
