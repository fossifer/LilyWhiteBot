/*
 * @name IRC訊息收發
 */

'use strict';

const color = require('irc-colors');

const truncate = (str, maxLen = 10) => {
    str = str.replace(/\n/gu, '');
    if (str.length > maxLen) {
        str = str.substring(0, maxLen - 3) + '...';
    }
    return str;
};

module.exports = (variables, config) => {
    const {bridge, Broadcast, handler: ircHandler} = variables;
    const options = config.options.IRC || {};
    const colorize = options.colorize || {};

    if (!options.notify) {
        options.notify = {};
    }

    ircHandler.splitPrefix = '-> ';
    ircHandler.splitPostfix = ' ->';
    if (colorize.enabled && colorize.linesplit) {
        ircHandler.splitPrefix = color[colorize.linesplit](ircHandler.splitPrefix);
        ircHandler.splitPostfix = color[colorize.linesplit](ircHandler.splitPostfix);
    }

    /*
     * 傳話
     */

    // 將訊息加工好並發送給其他群組
    ircHandler.on('text', (context) => {
        bridge.send(context).catch(() => {});
    });

    // 收到了來自其他群組的訊息
    ircHandler.on('exchange', (context, resolve, reject) => {
        let to;
        if (context.extra.mapto) {
            to = context.extra.mapto[ircHandler.type].toLowerCase();
        }

        switch (context.type) {
            case 'message':
                let output = [];
                let tmp;

                if (!config.options.hidenick) {
                    output.push('[');
                    if (context.extra.clients >= 3) {
                        tmp = `${context.handler.id}`;
                        if (colorize.enabled && colorize.client) {
                            tmp = color[colorize.client](tmp);
                        }
                        output.push(tmp);
                        output.push(' - ');
                    }

                    tmp = context.nick;
                    if (colorize.enabled && colorize.nick) {
                        if (colorize.nick === 'colorful') {
                            // hash
                            let m = tmp.split('').map(x=>x.codePointAt(0)).reduce((x,y)=>x+y);
                            let n = colorize.nickcolors.length;
                            tmp = color[colorize.nickcolors[m % n]](tmp);
                        } else {
                            tmp = color[colorize.nick](tmp);
                        }
                    }
                    output.push(tmp, '] ');

                    if (context.extra.reply) {
                        const reply = context.extra.reply;
                        tmp = `Re ${reply.nick} `;
                        if (colorize.enabled && colorize.replyto) {
                            tmp = color[colorize.replyto](tmp);
                        }
                        output.push(tmp);

                        if (reply.isText) {
                            tmp = `「${truncate(reply.message)}」`;
                        } else {
                            tmp = reply.message;
                        }
                        if (colorize.enabled && colorize.repliedmessage) {
                            tmp = color[colorize.repliedmessage](tmp);
                        }
                        output.push(tmp, ': ');
                    } else if (context.extra.forward) {
                        tmp = `Fwd ${context.extra.forward.nick}: `;
                        if (colorize.enabled && colorize.fwdfrom) {
                            tmp = color[colorize.fwdfrom](tmp);
                        }
                        output.push(tmp);
                    }
                }

                output.push(context.text);

                // 檔案
                if (context.extra.uploads) {
                    output.push(...context.extra.uploads.map(u => ` ${u.url}`));
                }

                ircHandler.say(to, output.join(''));
                resolve();
                break;

            case 'request':
                ircHandler.emit('request', context);
                if (context.command) {
                    ircHandler.emit(`request#${context.command}`, context);
                }
                resolve();
                break;

            case 'broadcast':
                let tmp2;
                if (context.extra.clients >= 3) {
                    tmp2 = `< ${context.handler.type}: ${context.text} >`;
                } else {
                    tmp2 = `< ${context.text} >`;
                }
                if (colorize.enabled && colorize.broadcast) {
                    tmp2 = color[colorize.broadcast](tmp2);
                }
                ircHandler.say(to, tmp2);
                resolve();
                break;

            default:
                reject();
        }
    });


    /*
     * 頻道Topic變更
     */
    ircHandler.on('topic', (channel, topic, nick, message) => {
        if (message.command === 'TOPIC' && options.notify.topic) {
            let text;
            if (topic) {
                text = `${nick} 將頻道Topic設定為 ${topic}`;
            } else {
                text = `${nick} 取消了頻道的Topic`;
            }

            bridge.send(new Broadcast({
                from: channel.toLowerCase(),
                to: channel.toLowerCase(),
                nick: nick,
                text: text,
                handler: ircHandler,
                _rawdata: message,
            })).catch(() => {});
        }
    });


    /*
     * 處理由IRC接收並反饋給其他群組的命令
     */
    const processWhois = (context) => {
        if (!options.allowQuery) {
            context.reply('該命令已被禁用');
            return;
        }

        if (context.param) {
            ircHandler.whois(context.param, (info) => {
                let output = [`${info.nick}: Unknown nick`];

                if (info.user) {
                    output = [
                        `${info.nick} (${info.user}@${info.host})`,
                        `Server: ${info.server} (${info.serverinfo})`
                    ];

                    if (info.realname) {
                        output.push(`Realname: ${info.realname}`);
                    }

                    if (info.account) {
                        output.push(`${info.nick} ${info.accountinfo} ${info.account}`);
                    }
                }

                context.reply(output.join('\n'));
            });
        } else {
            context.reply('用法：/ircwhois IRC暱称');
        }
    };

    const processNames = (context) => {
        if (!options.allowQuery) {
            context.reply('該命令已被禁用');
            return;
        }

        let chan = context.extra.mapto[ircHandler.type].toLowerCase();
        let users = ircHandler.chans[chan].users;
        let userlist = [];

        for (let user in users) {
            if (users[user] !== '') {
                userlist.push(`(${users[user]})${user}`);
            } else if (users[user] !== undefined) {
                userlist.push(user);
            }
        }
        userlist.sort((a, b) => {
            if (a.startsWith('(@)') && !b.startsWith('(@)')) {
                return -1;
            } else if (b.startsWith('(@)') && !a.startsWith('(@)')) {
                return 1;
            } else if (a.startsWith('(+)') && !b.startsWith('(+)')) {
                return -1;
            } else if (b.startsWith('(+)') && !a.startsWith('(+)')) {
                return 1;
            } else {
                return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
            }
        });

        context.reply(`Users on ${chan}: ${userlist.join(', ')}`);
    };

    const processTopic = (context) => {
        if (!options.allowQuery) {
            context.reply('該命令已被禁用');
            return;
        }

        let chan = context.extra.mapto[ircHandler.type].toLowerCase();
        let topic = ircHandler.chans[chan].topic;

        if (topic) {
            context.reply(`Topic for channel ${chan}: ${topic}`);
        } else {
            context.reply(`No topic for ${chan}`);
        }
    };

    const processCommand = (context) => {
        if (!options.receiveCommands) {
            context.reply('該命令已被禁用');
            return;
        }

        if (context.param) {
            // 防止換行
            let lines = context.param.split('\n');
            if (lines[0]) {
                context.reply(lines[0], {
                    noPrefix: true,
                });
                ircHandler.say(context.extra.mapto[ircHandler.type].toLowerCase(), lines[0]);
            }
        } else {
            context.reply('用法：/irccommand 命令');
        }
    };

    ircHandler.on('request#ircwhois', processWhois);
    ircHandler.on('request#/ircwhois', processWhois);

    ircHandler.on('request#ircnames', processNames);
    ircHandler.on('request#/ircnames', processNames);

    ircHandler.on('request#irctopic', processTopic);
    ircHandler.on('request#/irctopic', processTopic);

    ircHandler.on('request#irccommand', processCommand);
    ircHandler.on('request#/irccommand', processCommand);


    /*
     * 監視加入/離開頻道
     */
    let awaySpan = 1000 * (parseInt(options.notify.timeBeforeLeave) || 0);
    let userlist = {};

    ircHandler.on('join', (channel, nick, message) => {
        if (options.notify.join) {
            bridge.send(new Broadcast({
                from: channel.toLowerCase(),
                to: channel.toLowerCase(),
                nick: nick,
                text: `${nick} 加入頻道`,
                handler: ircHandler,
                _rawdata: message,
            })).catch(() => {});
        }
    });

    ircHandler.on('text', (context) => {
        if (context.isPrivate) {
            return;
        }

        if (config.options.paeeye && context.text.startsWith(config.options.paeeye)) {
            return;
        }

        // 記錄使用者發言的時間與頻道
        if (!userlist[context.from]) {
            userlist[context.from] = {};
        }

        userlist[context.from][context.to.toLowerCase()] = new Date().getTime();
    });

    const isActive = (nick, channel) => {
        let now = new Date().getTime();
        return userlist[nick] && userlist[nick][channel] &&
                awaySpan > 0 && (now - userlist[nick][channel] <= awaySpan);
    };

    ircHandler.on('nick', (oldnick, newnick, channels, rawdata) => {
        // 記錄使用者更名情況
        if (userlist[oldnick]) {
            userlist[newnick] = userlist[oldnick];
            delete userlist[oldnick];
        }

        let message = `${oldnick} 更名為 ${newnick}`;

        for (let ch in ircHandler.chans) {
            let chan = ch.toLowerCase();

            if ((options.notify.rename === 'all') ||
                (options.notify.rename === 'onlyactive' && userlist[newnick] && userlist[newnick][chan])
               ) {
                bridge.send(new Broadcast({
                    from: chan,
                    to: chan,
                    nick: newnick,
                    text: message,
                    handler: ircHandler,
                    _rawdata: rawdata,
                })).catch(() => {});
            }
        }
    });

    const leaveHandler = (nick, chans, action, reason, rawdata) => {
        let now = new Date().getTime();
        let message;
        if (reason) {
            message = `${nick} 已${action} (${reason})`;
        } else {
            message = `${nick} 已${action}`;
        }

        for (let ch in chans) {
            let chan = ch.toLowerCase();
            if ((options.notify.leave === 'all') ||
                (options.notify.leave === 'onlyactive' && isActive(nick, chan))
               ) {
                bridge.send(new Broadcast({
                    from: chan,
                    to: chan,
                    nick: nick,
                    text: message,
                    handler: ircHandler,
                    _rawdata: rawdata,
                })).catch(() => {});
            }

            if (userlist[nick]) {
                delete userlist[nick][chan];
            }
        }
    };

    ircHandler.on('quit', (nick, reason, channels, message) => {
        leaveHandler(nick, ircHandler.chans, '離開IRC', reason, message);
    });

    ircHandler.on('part', (channel, nick, reason, message) => {
        leaveHandler(nick, { [channel]: {} }, '離開頻道', reason, message);
    });

    ircHandler.on('kick', (channel, nick, by, reason, message) => {
        leaveHandler(nick, { [channel]: {} }, `被 ${by} 踢出頻道`, reason, message);
    });

    ircHandler.on('kill', (nick, reason, channels, message) => {
        leaveHandler(nick, ircHandler.chans, '被kill', reason, message);
    });
};
