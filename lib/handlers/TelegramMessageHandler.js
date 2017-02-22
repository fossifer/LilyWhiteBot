/*
 * @name 使用通用介面處理Telegram訊息
 */

const MessageHandler = require('./MessageHandler.js');
const Message = require('./Context.js').Message;

const getFriendlySize = (size) => {
    if (size <= 1126) {
        return `${size.toLocaleString()} bytes`;
    } else if (size <= 1153433) {
        return `${(size / 1024).toLocaleString()} KB`;
    } else if (size <= 1181116006) {
        return `${(size / 1048576).toLocaleString()} MB`;
    } else {
        return `${(size / 1099511627776).toLocaleString()} GB`;
    }
};

const getFriendlyLocation = (latitude, longitude) => {
    let y = latitude;
    let x = longitude;

    y = y<0 ? `${-y}°S` : `${y}°N`;
    x = x<0 ? `${-x}°W` : `${x}°E`;

    return `${y}, ${x}`;
};

class TelegramMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client && !client.addListener) {
            throw ReferenceError('No Telegram client object');
        }

        this._type = 'Telegram';

        this._client = client;
        this._username = options.botName || '';
        this._nickStyle = options.nickStyle || 'username';
        this._startTime = new Date().getTime()/1000;

        client.on('message', (ctx, next) => {
            if (this._enabled && ctx.message && ctx.chat) {
                if (ctx.message.date < this._startTime) {
                    return;
                }

                const context = new Message({
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
                } else if (ctx.message.forward_from) {
                    let fwd = ctx.message.forward_from;
                    let fwdFrom = this._getNick(fwd);

                    context.extra.forward = {
                        nick: fwdFrom,
                        username: fwd.username,
                    };
                }

                if (ctx.message.text) {
                    if (!context.text) {
                        context.text = ctx.message.text;
                    }

                    // 解析命令
                    let [, cmd, , param] = ctx.message.text.match(/^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/u) || [];
                    if (cmd) {
                        // 如果包含Bot名，判断是否为自己
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
                    const setFile = (msg, type) => {
                        context.extra.files = [{
                            client: 'Telegram',
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
                                setFile(p, 'photo');
                                context.text = `<photo: ${p.width}x${p.height}, ${getFriendlySize(p.file_size)}>`;
                                sz = p.file_size;
                            }
                        }
                    } else if (message.sticker) {
                        context.text = `${message.sticker.emoji}<Sticker>`;
                        setFile(message.sticker, 'sticker');
                    } else if (message.audio) {
                        context.text = `<Audio: ${message.audio.duration}", ${getFriendlySize(message.audio.file_size)}>`;
                        setFile(message.audio, 'audio');
                    } else if (message.voice) {
                        context.text = `<Voice: ${message.voice.duration}", ${getFriendlySize(message.voice.file_size)}>`;
                        setFile(message.voice, 'voice');
                    } else if (message.video) {
                        context.text = `<Video: ${message.video.width}x${message.video.height}, ${message.video.duration}", ${getFriendlySize(message.video.file_size)}>`;
                        setFile(message.video, 'video');
                    } else if (message.document) {
                        context.text = `<File: ${message.document.file_name}, ${getFriendlySize(message.document.file_size)}>`;
                        setFile(message.document, 'document');
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
                                text: message.pinned_message.text,
                            }, ctx);
                        } else {
                            context.text = `<Pinned Message: ${message.pinned_message.text}>`;
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
            return '<Photo>';
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
        // 自動過濾掉command中的非法字元
        let cmd = command.replace(/[^A-Za-z0-9_]/g, '');
        return super.addCommand(cmd, func);
    }

    removeCommand(command) {
        let cmd = command.replace(/[^A-Za-z0-9_]/g, '');
        return super.removeCommand(cmd);
    }

    _say(method, target, message, options = {}) {
        this._client.telegram[method](target, message, options);
    }

    say(target, message, options = {}) {
        this._client.telegram.sendMessage(target, message, options);
        return this;
    }

    sayWithHTML(target, message, options = {}) {
        options.parse_mode = 'html';
        return this.say(target, message, options);
    }

    sendPhoto(target, photo, options = {}) {
        this._client.telegram.sendPhoto(target, photo, options);
        return this;
    }

    sendAudio(target, audio, options = {}) {
        this._client.telegram.sendAudio(target, audio, options);
        return this;
    }

    _reply(method, context, message, options = {}) {
        if ((context._rawdata && context._rawdata.message)) {
            if (context.isPrivate) {
                this._say(method, context.to, message, options);
            } else {
                options.reply_to_message_id = context._rawdata.message.message_id;
                this._say(method, context.to, message, options);
            }
        }
        return this;
    }

    reply(context, message, options = {}) {
        this._reply('sendMessage', context, message, options);
        return this;
    }

    replyWithPhoto(context, photo, options = {}) {
        this._reply('sendPhoto', context, photo, options);
        return this;
    }

    getChatAdministrators(group) { return this._client.telegram.getChatAdministrators(group); }
    getFile(fileid) { return this._client.telegram.getFile(fileid); }
    getFileLink(fileid) { return this._client.telegram.getFileLink(fileid); }
    leaveChat(chatid) { return this._client.telegram.leaveChat(chatid); }
}

module.exports = TelegramMessageHandler;
