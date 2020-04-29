'use strict';

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
let wechatHandler = null;

let options = {};

const init = (b, h, c) => {
    bridge = b;
    config = c;
    wechatHandler = h;

    const options = config.options.QQ || {};

    if (!options.notify) {
        options.notify = {};
    }

    /*
     * 傳話
     */
    // 將訊息加工好並發送給其他群組
    wechatHandler.on('text', (context) => {
        bridge.send(context).catch(() => {});
    });
};

// 收到了來自其他群組的訊息
const receive = (msg) => new Promise((resolve, reject) => {
    if (msg.isNotice) {
        if (msg.extra.clients >= 3) {
            wechatHandler.say(msg.to, `< ${msg.extra.clientName.fullname}: ${msg.text} >`);
        } else {
            wechatHandler.say(msg.to, `< ${msg.text} >`);
        }
    } else {
        if (msg.extra.isAction) {
            // 一定是 IRC
            wechatHandler.say(msg.to, `* ${msg.nick} ${msg.text}`);
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

                if (msg.extra.clients >= 3 && msg.extra.clientName.shortname) {
                    prefix = `[${msg.extra.clientName.shortname} - ${msg.nick}] ${special}`;
                } else {
                    prefix = `[${msg.nick}] ${special}`;
                }
            }

            // 檔案
            wechatHandler.say(msg.to, prefix + msg.text);
        }
    }
    resolve();
});

module.exports = {
    init,
    receive,
};
