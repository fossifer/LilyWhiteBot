
'use strict';

const htmlEscape = (str) => {
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
};

module.exports = (variables, config) => {
    const {bridge, Request, Broadcast, handler: tgHandler} = variables;
    const options = config.options.Telegram || {};
    const forwardBots = options.forwardBots || {};

    if (!options.notify) {
        options.notify = {};
    }

    // 我們自己也是傳話機器人
    forwardBots[tgHandler.username] = 'self';

    /*
     * 傳話
     */
    // 如果是互聯機器人，那麼提取真實的使用者名稱和訊息內容
    const parseForwardBot = (username, text) => {
        let realText, realNick;
        let symbol = forwardBots[username];
        if (symbol === 'self') {
            // TODO 更換匹配方式
            // [, , realNick, realText] = text.match(/^(|<.> )\[(.*?)\] ([^]*)$/m) || [];
            [, realNick, realText] = text.match(/^\[(.*?)\] ([^]*)$/m) || [];
        } else if (symbol === '[]') {
            [, realNick, realText] = text.match(/^\[(.*?)\]:? ([^]*)$/m) || [];
        } else if (symbol === '<>') {
            [, realNick, realText] = text.match(/^<(.*?)>:? ([^]*)$/m) || [];
        }

        return {realNick, realText};
    };

    // 將訊息加工好並發送給其他群組
    tgHandler.on('text', (context) => {
        let extra = context.extra;
        if (context.text.match(/^\/([A-Za-z0-9_@]+)(\s+(.*)|\s*)$/) && !options.forwardCommands) {
            return;
        }

        // 檢查是不是自己在回覆自己，然後檢查是不是其他互聯機器人在說話
        if (extra.reply && forwardBots[extra.reply.username]) {
            let {realNick, realText} = parseForwardBot(extra.reply.username, extra.reply.message);
            if (realNick) {
                [extra.reply.nick, extra.reply.message] = [realNick, realText];
            }
        } else if (extra.forward && forwardBots[extra.forward.username]) {
            let {realNick, realText} = parseForwardBot(extra.forward.username, context.text);
            if (realNick) {
                [extra.forward.nick, context.text] = [realNick, realText];
            }
        }

        bridge.send(context).catch(() => {});
    });

    tgHandler.on('richmessage', (context) => {
        let extra = context.extra;

        // 檢查是不是在回覆互聯機器人
        if (extra.reply && forwardBots[extra.reply.username]) {
            let {realNick, realText} = parseForwardBot(extra.reply.username, extra.reply.message);
            if (realNick) {
                [extra.reply.nick, extra.reply.message] = [realNick, realText];
            }
        }

        bridge.send(context).catch(() => {});
    });

    // 收到了來自其他群組的訊息
    tgHandler.on('exchange', (context) => {
        let to;
        if (context.extra.mapto) {
            to = context.extra.mapto[tgHandler.type];
        }

        switch (context.type) {
            case 'message':
                let output = '';

                // 多群組
                if (context.extra.isAction) {
                    output = `* <b>${htmlEscape(context.nick)}</b> ${htmlEscape(context.text)}`;
                } else {
                    if (context.extra.clients >= 3) {
                        output = `[<i>${htmlEscape(context.handler.id)}</i> - <b>${htmlEscape(context.nick)}</b>] ${htmlEscape(context.text)}`;
                    } else {
                        output = `[<b>${htmlEscape(context.nick)}</b>] ${htmlEscape(context.text)}`;
                    }
                }

                tgHandler.sayWithHTML(to, output);

                // 如果含有相片和音訊
                if (context.extra.uploads) {
                    let files = [];

                    for (let upload of context.extra.uploads) {
                        if (upload.type === 'audio') {
                            tgHandler.sendAudio(to, upload.url);
                        } else if (upload.type === 'photo') {
                            tgHandler.sendPhoto(to, upload.url);
                        } else {
                            files.push(upload.url);
                        }
                    }

                    if (files.length > 0) {
                        output += ` ${htmlEscape(files.join(' '))}`;
                    }
                }

                break;

            case 'request':
                tgHandler.emit('request', context);
                if (context.command) {
                    tgHandler.emit(`request#${context.command}`, context);
                }
                break;

            case 'broadcast':
                if (context.extra.clients >= 3) {
                    tgHandler.sayWithHTML(to, `<pre>&lt; ${context.handler.type}: ${htmlEscape(context.text)} &gt;</pre>`);
                } else {
                    tgHandler.sayWithHTML(to, `<pre>&lt; ${htmlEscape(context.text)} &gt;</pre>`);
                }
                break;
        }
    });

    // Pinned message
    tgHandler.on('pin', (info, ctx) => {
        if (options.notify.pin) {
            bridge.send(new Broadcast({
                from: info.from.id,
                to: info.to,
                nick: info.from.nick,
                text: `${info.from.nick} pinned: ${info.text}`,
                handler: tgHandler,
                _rawdata: ctx,
            })).catch(() => {});
        }
    });


    /*
     * 加入與離開
     */
    tgHandler.on('join', (group, from, target, ctx) => {
        let text;
        if (from.id === target.id) {
            text = `${target.nick} 加入群組`;
        } else {
            text = `${from.nick} 邀請 ${target.nick} 加入群組`;
        }

        if (options.notify.join) {
            bridge.send(new Broadcast({
                from: target.id,
                to: group,
                nick: target.nick,
                text: text,
                handler: tgHandler,
                _rawdata: ctx,
            })).catch(() => {});
        }
    });

    tgHandler.on('leave', (group, from, target, ctx) => {
        let text;
        if (from.id === target.id) {
            text = `${target.nick} 離開群組`;
        } else {
            text = `${target.nick} 被 ${from.nick} 移出群組`;
        }

        if (options.notify.leave) {
            bridge.send(new Broadcast({
                from: target.id,
                to: group,
                nick: target.nick,
                text: text,
                handler: tgHandler,
                _rawdata: ctx,
            })).catch(() => {});
        }
    });


    /*
     * 查詢IRC群組情況的命令
     */
    const sendRequest = (context) => {
        let ctx = new Request(context);
        ctx.targets = 'IRC';

        bridge.send(ctx).catch(() => {
            context.reply('請在與IRC頻道互聯的群組中使用本命令。');
        });
    };

    // 非主群不提供命令
    if (tgHandler.type === 'Telegram') {
        tgHandler.addCommand('ircnames', sendRequest);
        tgHandler.addCommand('ircwhois', sendRequest);
        tgHandler.addCommand('irctopic', sendRequest);
        tgHandler.addCommand('irccommand', sendRequest);
    }
};
