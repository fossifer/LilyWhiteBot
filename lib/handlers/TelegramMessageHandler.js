/*
 * @name 使用通用介面處理 Telegram 訊息
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const https = require('https');
const proxy = require('../proxy.js');
const Telegraf = require('telegraf');
const winston = require('winston');
const { getFriendlySize, getFriendlyLocation, copyObject } = require('../util.js');

class TelegramMessageHandler extends MessageHandler {
    constructor (config = {}) {
        super();
    
        let botConfig = config.bot || {};
        let tgOptions = config.options || {};

        // 配置文件兼容性处理
        for (let key of ['proxy', 'webhook', 'apiRoot']) {
            botConfig[key] = botConfig[key] || tgOptions[key];
        }

        // 代理
        let myAgent = https.globalAgent;
        if (botConfig.proxy && botConfig.proxy.host) {
            myAgent = new proxy.HttpsProxyAgent({
                proxyHost: botConfig.proxy.host,
                proxyPort: botConfig.proxy.port,
            });
        }

        const client = new Telegraf(botConfig.token, {
            telegram: {
                agent: myAgent,
                apiRoot: botConfig.apiRoot || 'https://api.telegram.org',
            },
            username: botConfig.name,
        });

        client.catch((err) => {
            winston.error(`TelegramBot error: ${err.message}`, err);
        });

        if (botConfig.webhook && botConfig.webhook.port > 0) {
            let webhookConfig = botConfig.webhook;
            // 自动设置Webhook网址
            if (webhookConfig.url) {
                if (webhookConfig.ssl.certPath) {
                    client.telegram.setWebhook(webhookConfig.url, {
                        source: webhookConfig.ssl.certPath
                    });
                } else {
                    client.telegram.setWebhook(webhookConfig.url);
                }
            }
            
            // 启动Webhook服务器
            let tlsOptions = null;
            if (webhookConfig.ssl && webhookConfig.ssl.certPath) {
                tlsOptions = {
                    key: fs.readFileSync(webhookConfig.ssl.keyPath),
                    cert: fs.readFileSync(webhookConfig.ssl.certPath),
                };
                if (webhookConfig.ssl.caPath) {
                    tlsOptions.ca = [
                        fs.readFileSync(webhookConfig.ssl.caPath)
                    ];
                }
            }

            this._start = {
                mode: 'webhook',
                params: {
                    path: webhookConfig.path,
                    tlsOptions: tlsOptions,
                    port: webhookConfig.port
                }
            };
        } else {
            // 使用轮询机制
            this._start = {
                mode: 'poll',
                params: {
                    timeout: botConfig.timeout || 30,
                    limit: botConfig.limit || 100
                }
            };
        }

        this._type = 'Telegram';
        this._id = 'T';

        this._client = client;
        this._username = botConfig.name || '';
        this._nickStyle = tgOptions.nickStyle || 'username';
        this._startTime = new Date().getTime()/1000;
        this._keepSilence = tgOptions.keepSilence || [];

        client.on('message', async (ctx, next) => {
            if (this._enabled && ctx.message && ctx.chat) {
                if (ctx.message.date < this._startTime) {
                    return;
                }

                const context = new Context({
                    from: ctx.message.from.id,
                    to: ctx.chat.id,
                    nick: this._getNick(ctx.message.from),
                    text: '',
                    isPrivate: (ctx.chat.id > 0),
                    extra: {
                        username: ctx.message.from.username,
                    },
                    handler: this,
                    _rawdata: ctx,
                });

                if (ctx.message.reply_to_message) {
                    let reply = ctx.message.reply_to_message;
                    let replyTo = this._getNick(reply.from);
                    let replyMessage = this._convertToText(reply);

                    context.extra.reply = {
                        nick: replyTo,
                        username: reply.from.username,
                        message: replyMessage,
                        isText: reply.text && true,
                    };
                } else if (ctx.message.forward_from || ctx.message.forward_from_chat) {
                    let fwd = ctx.message.forward_from || ctx.message.forward_from_chat;
                    let fwdFrom = this._getNick(fwd);
                    // 用户昵称或频道名称
                    let fullname = `${fwd.first_name || ''} ${fwd.last_name || ''}`.trim() || fwd.title;

                    context.extra.forward = {
                        nick: fwdFrom,
                        username: fwd.username,
                        fullname: fullname,
                    };
                } else if (ctx.message.forward_sender_name) {
                    // 被转发者设置了隐藏用户链接，将 nick 和 username 都设置为 sender_name
                    context.extra.forward = {
                        nick: ctx.message.forward_sender_name,
                        username: ctx.message.forward_sender_name,
                    };
                }

                if (ctx.message.text) {
                    if (!context.text) {
                        context.text = ctx.message.text;
                    }

                    // 解析命令
                    let [, cmd, , param] = ctx.message.text.match(/^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u) || [];
                    if (cmd) {
                        // 如果包含 Bot 名，判断是否为自己
                        let [, c, , n] = cmd.match(/^([A-Za-z0-9_]+)(|@([A-Za-z0-9_]+))$/u) || [];
                        if ((n && (n.toLowerCase() === this._username.toLowerCase())) || !n) {
                            param = param || '';

                            context.command = c;
                            context.param = param;

                            if (typeof this._commands.get(c) === 'function') {
                                this._commands.get(c)(context, c, param || '');
                            }

                            this.emit('command', context, c, param || '');
                            this.emit(`command#${c}`, context, param || '');
                        }
                    }

                    this.emit('text', context);
                } else {
                    let message = ctx.message;
                    const setFile = async (msg, type) => {
                        context.extra.files = [{
                            client: 'Telegram',
                            url: await this.getFileLink(msg.file_id),
                            type: type,
                            id: msg.file_id,
                            size: msg.file_size,
                            mime_type: msg.mime_type,
                        }];
                    };

                    if (message.photo) {
                        let sz = 0;
                        for (let p of message.photo) {
                            if (p.file_size > sz) {
                                await setFile(p, 'image');
                                context.text = `<Image: ${p.width}x${p.height}, ${getFriendlySize(p.file_size)}>`;
                                sz = p.file_size;
                            }
                        }

                        if (message.caption) {
                            context.text += ' ' + message.caption;
                        }
                        context.extra.isImage = true;
                        context.extra.imageCaption = message.caption;
                    } else if (message.sticker) {
                        context.text = `${message.sticker.emoji}<Sticker>`;
                        await setFile(message.sticker, 'sticker');
                        context.extra.isImage = true;
                    } else if (message.audio) {
                        context.text = `<Audio: ${message.audio.duration}", ${getFriendlySize(message.audio.file_size)}>`;
                        await setFile(message.audio, 'audio');
                    } else if (message.voice) {
                        context.text = `<Voice: ${message.voice.duration}", ${getFriendlySize(message.voice.file_size)}>`;
                        await setFile(message.voice, 'voice');
                    } else if (message.video) {
                        context.text = `<Video: ${message.video.width}x${message.video.height}, ${message.video.duration}", ${getFriendlySize(message.video.file_size)}>`;
                        await setFile(message.video, 'video');
                    } else if (message.document) {
                        context.text = `<File: ${message.document.file_name}, ${getFriendlySize(message.document.file_size)}>`;
                        await setFile(message.document, 'document');
                    } else if (message.contact) {
                        context.text = `<Contact: ${message.contact.first_name}, ${message.contact.phone_number}>`;
                    } else if (message.location) {
                        context.text = `<Location: ${getFriendlyLocation(message.location.latitude, message.location.longitude)}>`;
                    } else if (message.venue) {
                        context.text = `<Venue: ${message.venue.title}, ${message.venue.address}, ${getFriendlyLocation(
                            message.venue.location.latitude, message.venue.location.longitude)}>`;
                    } else if (message.pinned_message) {
                        if (message.from.id === message.pinned_message.from.id) {
                            this.emit('pin', {
                                from: {
                                    id: message.from.id,
                                    nick: this._getNick(message.from),
                                    username: message.from.username,
                                },
                                to: ctx.chat.id,
                                text: this._convertToText(message.pinned_message),
                            }, ctx);
                        } else {
                            context.text = `<Pinned Message: ${this._convertToText(message.pinned_message)}>`;
                        }
                    } else if (message.left_chat_member) {
                        this.emit('leave', ctx.chat.id, {
                                id: message.from.id,
                                nick: this._getNick(message.from),
                                username: message.from.username,
                            }, {
                                id: message.left_chat_member.id,
                                nick: this._getNick(message.left_chat_member),
                                username: message.left_chat_member.username,
                            }, ctx);
                    } else if (message.new_chat_member) {
                        this.emit('join', ctx.chat.id, {
                                id: message.from.id,
                                nick: this._getNick(message.from),
                                username: message.from.username,
                            }, {
                                id: message.new_chat_member.id,
                                nick: this._getNick(message.new_chat_member),
                                username: message.new_chat_member.username,
                            }, ctx);
                    }

                    if (context.text) {
                        this.emit('richmessage', context);
                    }
                }
            }
            return next();
        });
    }

    _getNick(user) {
        if (user) {
            let username = (user.username || '').trim();
            let firstname = (user.first_name || '').trim() || (user.last_name || '').trim();
            let fullname = `${user.first_name || ''} ${user.last_name || ''}`.trim();

            if (this._nickStyle === 'fullname') {
                return fullname || username;
            } else if (this._nickStyle === 'firstname') {
                return firstname || username;
            } else {
                return username || fullname;
            }
        } else {
            return '';
        }
    }

    _convertToText(message) {
        if (message.audio) {
            return '<Audio>';
        } else if (message.photo) {
            return '<Image>';
        } else if (message.document) {
            return '<Document>';
        } else if (message.game) {
            return '<Game>';
        } else if (message.sticker) {
            return `${message.sticker.emoji}<Sticker>`;
        } else if (message.video) {
            return '<Video>';
        } else if (message.voice) {
            return '<Voice>';
        } else if (message.contact) {
            return '<Contact>';
        } else if (message.location) {
            return '<Location>';
        } else if (message.venue) {
            return '<Venue>';
        } else if (message.pinned_message) {
            return '<Pinned Message>';
        } else if (message.new_chat_member) {
            return '<New member>';
        } else if (message.left_chat_member) {
            return '<Removed member>';
        } else if (message.text) {
            return message.text;
        } else {
            return '<Message>';
        }
    }

    get username() { return this._username; }
    set username(v) { this._username = v; }
    get nickStyle() { return this._nickStyle; }
    set nickStyle(v) { this.nickStyle = v; }

    addCommand(command, func) {
        // 自動過濾掉 command 中的非法字元
        let cmd = command.replace(/[^A-Za-z0-9_]/gu, '');
        return super.addCommand(cmd, func);
    }

    deleteCommand(command) {
        let cmd = command.replace(/[^A-Za-z0-9_]/gu, '');
        return super.deleteCommand(cmd);
    }

    async _say(method, target, message, options = {}) {
        if (!this._enabled) {
            throw new Error('Handler not enabled');
        } else if (this._keepSilence.indexOf(parseInt(target)) !== -1) {
            // 忽略
        } else {
            return await this._client.telegram[method](target, message, options);
        }
    }

    say(target, message, options = {}) {
        return this._say('sendMessage', target, message, options);
    }

    sayWithHTML(target, message, options = {}) {
        let options2 = copyObject(options);
        options2.parse_mode = 'html';
        return this.say(target, message, options2);
    }

    sendPhoto(target, photo, options = {}) {
        return this._say('sendPhoto', target, photo, options);
    }

    sendAudio(target, audio, options = {}) {
        return this._say('sendAudio', target, audio, options);
    }

    sendVideo(target, video, options = {}) {
        return this._say('sendVideo', target, video, options);
    }

    sendAnimation(target, animation, options = {}) {
        return this._say('sendAnimation', target, animation, options);
    }

    sendDocument(target, doc, options = {}) {
        return this._say('sendDocument', target, doc, options);
    }

    async _reply(method, context, message, options = {}) {
        if ((context._rawdata && context._rawdata.message)) {
            if (context.isPrivate) {
                return await this._say(method, context.to, message, options);
            } else {
                let options2 = copyObject(options);
                options2.reply_to_message_id = context._rawdata.message.message_id;
                return await this._say(method, context.to, message, options2);
            }
        } else {
            throw new Error('No messages to reply');
        }
    }

    reply(context, message, options = {}) {
        return this._reply('sendMessage', context, message, options);
    }

    replyWithPhoto(context, photo, options = {}) {
        return this._reply('sendPhoto', context, photo, options);
    }

    getChatAdministrators(group) { return this._client.telegram.getChatAdministrators(group); }
    getFile(fileid) { return this._client.telegram.getFile(fileid); }
    getFileLink(fileid) { return this._client.telegram.getFileLink(fileid); }
    leaveChat(chatid) { return this._client.telegram.leaveChat(chatid); }

    async start() {
        if (!this._started) {
            this._started = true;

            if (this._start.mode === 'webhook') {
                this._client.startWebhook(this._start.params.path, this._start.params.tlsOptions, this._start.params.port);
            } else {
                this._client.startPolling(this._start.params.timeout, this._start.params.limit);
            }
        }
    }

    async stop() {
        if (this._started) {
            this._started = false;
            await this._client.stop();
        }
    }
}

module.exports = TelegramMessageHandler;
