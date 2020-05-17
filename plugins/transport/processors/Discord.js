/*
 * @name Discord 訊息收發
 */

'use strict';

const LRU = require('lru-cache');
const format = require('string-format');

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

let options = {};

const init = (b, h, c) => {
    bridge = b;
    config = c;
    discordHandler = h;

    options = config.options.Discord || {};

    /*
     * 傳話
     */

    // 將訊息加工好並發送給其他群組
    discordHandler.on('text', (context) => {
        const send = () => bridge.send(context).catch(() => {});

        userInfo.set(context.from, context._rawdata.author);

        if (context.text.match(/<:\w+:\d*?>/u)) {
          // 處理自定義表情符號
          let emojis = [];

          context.text.replace(/<:(\w+):(\d*?)>/g, (_, name, id) => {
              if (id && !emojis.filter(v=>v.id===id).length) {emojis.push({name:name, id:id})};
          });
          if (!context.extra.files) { context.extra.files = [] }
          for (let emoji of emojis) {
              // TODO: 檢查是否動圖，使用.gif
              let url = `https://cdn.discordapp.com/emojis/${emoji.id}.png`
              let proxyURL = `https://media.discordapp.net/emojis/${emoji.id}.png`
              context.text = context.text.replace(new RegExp(`<:${emoji.name}:${emoji.id}>`, 'gu'), `<emoji: ${emoji.name}>`);
              context.extra.files.push({
                  client: 'Discord',
                  type: 'photo',
                  id: emoji.id,
                  size: 262144,
                  url: discordHandler._useProxyURL ? proxyURL : url,
              })
          }
          if (!context.extra.files.length) { delete context.extra.files }
        }

        if (context.text.match(/<@\d*?>/u)) {
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
                    promises.push(discordHandler.fetchUser(at).catch(_ => {}));
                }
            }

            Promise.all(promises).then((infos) => {
                for (let info of infos) {
                    if (info) {
                        userInfo.set(info.id, info);
                        context.text = context.text.replace(new RegExp(`<@${info.id}>`, 'gu'), `@${discordHandler.getNick(info)}`);
                    }
                }
            }).catch(_ => {}).then(() => send());
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
