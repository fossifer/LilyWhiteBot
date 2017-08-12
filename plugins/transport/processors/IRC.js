/*
 * @name IRC訊息收發
 */

'use strict';

const color = require('irc-colors');
const BridgeMsg = require('../BridgeMsg.js');

const truncate = (str, maxLen = 10) => {
    str = str.replace(/\n/gu, '');
    if (str.length > maxLen) {
        str = str.substring(0, maxLen - 3) + '...';
    }
    return str;
};

let bridge = null;
let config = null;
let ircHandler = null;

let options = {};

const init = (b, h, c) => {
    bridge = b;
    config = c;
    ircHandler = h;

    // 自動加頻道
    ircHandler.once('registered', () => {
        for (let g in bridge.map) {
            let cl = BridgeMsg.parseUID(g);
            if (cl.client === 'IRC') {
                ircHandler.join(cl.id);
            }
        }
    });

    options = config.options.IRC || {};
    const colorize = options.colorize || {};

    if (!options.notify) {
        options.notify = {};
    }

    ircHandler.splitPrefix = '->';
    ircHandler.splitPostfix = '->';
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

            bridge.send(new BridgeMsg({
                from: channel.toLowerCase(),
                to: channel.toLowerCase(),
                nick: nick,
                text: text,
                isNotice: true,
                handler: ircHandler,
                _rawdata: message,
            })).catch(() => {});
        }
    });

    /*
     * 監視加入/離開頻道
     */
    let awaySpan = 1000 * (parseInt(options.notify.timeBeforeLeave) || 0);
    let userlist = {};

    ircHandler.on('join', (channel, nick, message) => {
        if (options.notify.join && nick !== ircHandler.nick) {
            bridge.send(new BridgeMsg({
                from: channel.toLowerCase(),
                to: channel.toLowerCase(),
                nick: nick,
                text: `${nick} 加入頻道`,
                isNotice: true,
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
                bridge.send(new BridgeMsg({
                    from: chan,
                    to: chan,
                    nick: newnick,
                    text: message,
                    isNotice: true,
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
            if ((options.notify.leave === 'all' && nick !== ircHandler.nick) ||
                (options.notify.leave === 'onlyactive' && isActive(nick, chan))
               ) {
                bridge.send(new BridgeMsg({
                    from: chan,
                    to: chan,
                    nick: nick,
                    text: message,
                    isNotice: true,
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

// 收到了來自其他群組的訊息
const receive = (msg) => new Promise((resolve, reject) => {
    let colorize = options.colorize || {};

    if (msg.isNotice) {
        let tmp2;
        if (msg.extra.clients >= 3) {
            tmp2 = `< ${msg.extra.clientName.fullname}: ${msg.text} >`;
        } else {
            tmp2 = `< ${msg.text} >`;
        }
        if (colorize.enabled && colorize.broadcast) {
            tmp2 = color[colorize.broadcast](tmp2);
        }
        ircHandler.say(msg.to, tmp2);
    } else {
        let output = [];
        let tmp;

        if (!config.options.hidenick) {
            output.push('[');
            if (msg.extra.clients >= 3) {
                tmp = `${msg.extra.clientName.shortname}`;
                if (colorize.enabled && colorize.client) {
                    tmp = color[colorize.client](tmp);
                }
                output.push(tmp);
                output.push(' - ');
            }

            tmp = msg.nick;
            if (colorize.enabled && colorize.nick && tmp.length > 0) {
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

            if (msg.extra.reply) {
                const reply = msg.extra.reply;
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
            } else if (msg.extra.forward) {
                tmp = `Fwd ${msg.extra.forward.nick}: `;
                if (colorize.enabled && colorize.fwdfrom) {
                    tmp = color[colorize.fwdfrom](tmp);
                }
                output.push(tmp);
            }
        }

        output.push(msg.text);

        // 檔案
        if (msg.extra.uploads) {
            output.push(...msg.extra.uploads.map(u => ` ${u.url}`));
        }

        ircHandler.say(msg.to, output.join(''));
    }
    resolve();
});

module.exports = {
    init,
    receive,
};
