/*
 * @name Discord 訊息收發
 */

'use strict';

const BridgeMsg = require('../BridgeMsg.js');
const LRU = require('lru-cache');

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

let emojiInfo = new LRU({
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

        if (context.text.match(/<:.+:\d*?>/u)) {
          // 處理自定義表情符號
          let emojis = [];
          let promises = [];

          context.text.replace(/<:.+:(\d*?)>/gu, (_, id) => {
              if (id) {emojis.push(id)};
          });
          emojis = [...new Set(emojis)];
          for (let emoji of emojis) {
            if (emojiInfo.has(emoji)) {
                promises.push(Promise.resolve(emojiInfo.get(emoji)));
            } else {
                promises.push(discordHandler.fetchEmoji(emoji).catch(_ => {}))
            }
          }

          Promise.all(promises).then((infos) => {
              for (let info of infos) {
                  if (info) {
                      let proxyURL = info.url.replace("cdn.discordapp.com", "media.discordapp.net")
                      emojiInfo.set(info.id, info);
                      context.text = context.text.replace(new RegExp(`<:.+:${info.id}>`, 'gu'), `<emoji: ${info.name}>`);
                      context.extra.files.push({
                          client: 'Discord',
                          type: 'photo',
                          id: info.id,
                          size: 262144,
                          url: discordHandler._useProxyURL ? proxyURL : info.url,
                      })
                  }
              }
          }).catch(_ => {})
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
const receive = (msg) => new Promise((resolve, reject) => {
    if (msg.isNotice) {
        if (msg.extra.clients >= 3) {
            discordHandler.say(msg.to, `< ${msg.extra.clientName.fullname}: ${msg.text} >`);
        } else {
            discordHandler.say(msg.to, `< ${msg.text} >`);
        }
    } else {
        if (msg.extra.isAction) {
            // 一定是 IRC
            discordHandler.say(msg.to, `* ${msg.nick} ${msg.text}`);
            resolve();
        } else {
            let special = '';
            let prefix = '';
            if (!config.options.hidenick) {
                if (msg.extra.reply) {
                    const reply = msg.extra.reply;
                    special = `Re ${reply.nick} `;

                    if (reply.isText) {
                        special += `「${truncate(reply.message)}」`;
                    } else {
                        special += reply.message;
                    }

                    special += ': ';
                } else if (msg.extra.forward) {
                    special = `Fwd ${msg.extra.forward.nick}: `;
                }

                if (msg.extra.clients >= 3) {
                    prefix = `[${msg.extra.clientName.shortname} - ${msg.nick}] ${special}`;
                } else {
                    prefix = `[${msg.nick}] ${special}`;
                }
            }

            // 檔案
            const attachFileUrls = () => (msg.extra.uploads || []).map(u => ` ${u.url}`).join('');
            discordHandler.say(msg.to, prefix + msg.text + attachFileUrls());
        }
    }
    resolve();
});

module.exports = {
    init,
    receive,
};
