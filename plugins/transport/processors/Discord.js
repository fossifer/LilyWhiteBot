/*
 * @name Discord 訊息收發
 */

'use strict';

const LRU = require('lru-cache');
const format = require('string-format');
const winston = require('winston');

const truncate = (str, maxLen = 10) => {
    str = str.replace(/\n/gu, '');
    if (str.length > maxLen) {
        str = str.substring(0, maxLen - 3) + '...';
    }
    return str;
};

let userInfo = new LRU({
    max: 500,
    maxAge: 3600000,
});

let bridge = null;
let config = null;
let discordHandler = null;
let forwardBots = {};

let options = {};


const parseForwardBot = (text, options) => {
    let tester = {};
    for (let style in options) {
      tester[style] = {};
      for (let template in options[style]) {
          tester[style][template] = new RegExp("^" + options[style][template].replace(/\[/g, "\\[").replace(/\]/g, "\\]").replace(/\*/g, "\\*")
            .replace("{text}", "(?<text>[^]*)").replace("{nick}", "(?<nick>.*?)").replace(/\{[^\{\}]+\}/g, "(.*?)") + "$", "mu");
      };
    };

    let realText, realNick;
    let groups;
    if (tester.complex.reply.test(text)) {
        groups = text.match(tester.complex.reply).groups || {};
    } else if (tester.complex.forward.test(text)) {
        groups = text.match(tester.complex.forward).groups || {};
    } else if (tester.complex.action.test(text)) {
        groups = text.match(tester.complex.action).groups || {};
    } else if (tester.complex.message.test(text)) {
        groups = text.match(tester.complex.message).groups || {};
    } else if (tester.complex.notice.test(text)) {
        groups = text.match(tester.complex.notice).groups || {};
        groups.nick = "";
    } else if (tester.simple.reply.test(text)) {
        groups = text.match(tester.simple.reply).groups || {};
    } else if (tester.simple.forward.test(text)) {
        groups = text.match(tester.simple.forward).groups || {};
    } else if (tester.simple.action.test(text)) {
        groups = text.match(tester.simple.action).groups || {};
    } else if (tester.simple.message.test(text)) {
        groups = text.match(tester.simple.message).groups || {};
    } else if (tester.simple.notice.test(text)) {
        groups = text.match(tester.simple.notice).groups || {};
        groups.nick = "";
    }
    [realNick, realText] = [groups.nick, groups.text];

    return { realNick, realText };
};

const init = (b, h, c) => {
    bridge = b;
    config = c;
    discordHandler = h;

    options = config.options.Discord || {};
    forwardBots = options.forwardBots || {};

    // 消息样式
    let messageStyle = config.options.messageStyle;

    /*
     * 傳話
     */

    // 將訊息加工好並發送給其他群組
    discordHandler.on('text', (context) => {
        const send = () => bridge.send(context).catch(e => winston.error(e.trace));

        userInfo.set(context.from, context._rawdata.author);

        let extra = context.extra;

        // 檢查是不是在回覆自己
        if (extra.reply && forwardBots[extra.reply.username]==extra.reply.discriminator) {
            let { realNick, realText } = parseForwardBot(extra.reply.message, messageStyle);
            if (realText) {

                [extra.reply.nick, extra.reply.message] = [realNick, realText];
            }
        }

        if (/<a?:\w+:\d*?>/g.test(context.text)) {
          // 處理自定義表情符號
          let emojis = [];
          let animated = [];

          context.text = context.text.replace(/<:(\w+):(\d*?)>/g, (_, name, id) => {
              if (id && !emojis.filter(v=>v.id===id).length) {emojis.push({name:name, id:id})};
              return `<emoji: ${name}>`;
          });
          context.text = context.text.replace(/<a:(\w+):(\d*?)>/g, (_, name, id) => {
              if (id && !animated.filter(v=>v.id===id).length) {animated.push({name:name, id:id})};
              return `<emoji: ${name}>`;
          });

          if (!context.extra.files) { context.extra.files = [] }
          if (discordHandler._relayEmoji) {
            for (let emoji of emojis) {
              let url = `https://cdn.discordapp.com/emojis/${emoji.id}.png`
              let proxyURL = `https://media.discordapp.net/emojis/${emoji.id}.png`
              context.extra.files.push({
                    client: 'Discord',
                    type: 'image',
                    id: emoji.id,
                    size: 262144,
                    url: discordHandler._useProxyURL ? proxyURL : url,
                })
            }
            for (let emoji of animated) {
              let url = `https://cdn.discordapp.com/emojis/${emoji.id}.gif`
              let proxyURL = `https://media.discordapp.net/emojis/${emoji.id}.gif`
              context.extra.files.push({
                    client: 'Discord',
                    type: 'image',
                    id: emoji.id,
                    size: 262144,
                    url: discordHandler._useProxyURL ? proxyURL : url,
                })
            }
          }
          if (!context.extra.files.length) { delete context.extra.files }
        }

        if (/<@\d*?>/u.test(context.text)) {
            // 處理 at
            let ats = [];
            let promises = [];

            context.text.replace(/<@(\d*?)>/gu, (_, id) => {
                ats.push(id);
            });
            ats = [...new Set(ats)];

            for (let at of ats) {
                if (userInfo.has(at)) {
                    promises.push(Promise.resolve(userInfo.get(at)));
                } else {
                    promises.push(discordHandler.fetchUser(at).catch(e => winston.error(e.stack)));
                }
            }

            Promise.all(promises).then((infos) => {
                for (let info of infos) {
                    if (info) {
                        userInfo.set(info.id, info);
                        context.text = context.text.replace(new RegExp(`<@${info.id}>`, 'gu'), `@${discordHandler.getNick(info)}`);
                    }
                }
            }).catch(e => winston.error(e.trace)).then(() => send());
        } else {
            send();
        }
    });

};

// 收到了來自其他群組的訊息
const receive = async (msg) => {
    // 元信息，用于自定义样式
    let meta = {
        nick: msg.nick,
        from: msg.from,
        to: msg.to,
        text: msg.text,
        client_short: msg.extra.clientName.shortname,
        client_full: msg.extra.clientName.fullname,
        command: msg.command,
        param: msg.param
    };
    if (msg.extra.reply) {
        let reply = msg.extra.reply;
        meta.reply_nick = reply.nick;
        meta.reply_user = reply.username;
        if (reply.isText) {
            meta.reply_text = truncate(reply.message);
        } else {
            meta.reply_text = reply.message;
        }
    }
    if (msg.extra.forward) {
        meta.forward_nick = msg.extra.forward.nick;
        meta.forward_user = msg.extra.forward.username;
    }

    // 自定义消息样式
    let messageStyle = config.options.messageStyle;
    let styleMode = 'simple';
    if (msg.extra.clients >= 3 && (msg.extra.clientName.shortname || msg.isNotice)) {
        styleMode = 'complex';
    }

    let template;
    if (msg.isNotice) {
        template = messageStyle[styleMode].notice;
    } else if (msg.extra.isAction) {
        template = messageStyle[styleMode].action;
    } else if (msg.extra.reply) {
        template = messageStyle[styleMode].reply;
    } else if (msg.extra.forward) {
        template = messageStyle[styleMode].forward;
    } else {
        template = messageStyle[styleMode].message;
    }

    let output = format(template, meta);
    let attachFileUrls = (msg.extra.uploads || []).map(u => ` ${u.url}`).join('');
    discordHandler.say(msg.to, `${output}${attachFileUrls}`);
};

module.exports = {
    init,
    receive,
};
