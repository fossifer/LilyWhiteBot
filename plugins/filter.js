/*
 * filter.js 過濾符合特定規則的訊息
 *
 * "filter": {
 *     "filters": [
 *         {
 *             event: "send/receive",       // send：防止訊息發出，receive：防止訊息被接收
 *             from: "regex"
 *         },
 *         {
 *             event: "send/receive",       // 以下均为並列關係
 *             from: "regex",               // 需要小寫、完整名稱：irc\\/user、telegram\\/userid、qq\\/@qq號
 *             to: "regex",
 *             nick: "regex",
 *             text: "regex",
 *             filter_reply: true,          // 如果一條訊息回覆了其他訊息，且後者滿足以上條件，則也會被過濾，預設false
 *             extra_forward_nick: "regex", // 過濾 msg.extra.forward.nick，其他屬性亦類似
 *                                          // 注意即便 filter_reply 為 true 也不會過濾被回覆的訊息，所以不建議同時使用，以免產生未定義行為
 *         },
 *     ]
 * }
 */

'use strict';

const BridgeMsg = require('./transport/BridgeMsg.js');

let msgfilters = {
    send: [],
    receive: []
};

module.exports = (pluginManager, options) => {
    const bridge = pluginManager.plugins.transport;

    if (!bridge) {
        return;
    }

    let filters = options.filters || [];
    for (let f of filters) {
        let arr, opt = {};
        if (f.event === 'receive') {
            arr = msgfilters.receive;
        } else if (f.event === 'send' || !f.event) {
            arr = msgfilters.send;
        } else {
            continue;
        }

        if (f.from !== undefined) { opt.from_uid = f.from; }
        if (f.to   !== undefined) { opt.to_uid   = f.to; }
        if (f.nick !== undefined) { opt.nick     = f.nick; }
        if (f.text !== undefined) { opt.text     = f.text; }
        if (f.filter_reply !== undefined) { opt.filter_reply = f.filter_reply; }
        for (let prop in f) {
            if (prop.startsWith('extra_') && f[prop] !== undefined) {
                opt[prop] = f[prop];
            }
        }

        arr.push(opt);
    }

    const process = (event) => (msg) => {
        let filters = msgfilters[event];

        for (let f of filters) {
            let rejects = true;
            let rejects_reply = false;
            for (let prop in f) {
                if (prop === 'filter_reply') continue;
                if (prop.startsWith('extra_')) {
                    // Check msg.extra (a nested dictionary)
                    let props = prop.split('_');
                    let cur_obj = msg;
                    for (let cur_prop of props) {
                        if (!cur_obj[cur_prop]) {
                            rejects = false;
                            break;
                        }
                        cur_obj = cur_obj[cur_prop];
                    }
                    if (!(cur_obj && cur_obj.toString().match(f[prop]))) {
                        rejects = false;
                        break;
                    }
                } else {
                    // Check the direct property of msg object
                    if (!(msg[prop] && msg[prop].toString().match(f[prop]))) {
                        rejects = false;
                        break;
                    }
                }
                if (!rejects) break;
            }
            // Check the replied message if `filter_reply` flag of the filter is set
            if (f.filter_reply && msg.extra.reply) {
                rejects_reply = true;
                let reply = msg.extra.reply;
                reply.text = reply.message;
                reply.to_uid = msg.to_uid;
                reply.from_uid = msg.from_uid;
                for (let prop in f) {
                    // msg.reply does not have extra property
                    if (prop === 'filter_reply' || prop.startsWith('extra_')) continue;
                    if (!(reply[prop] && reply[prop].toString().match(f[prop]))) {
                        rejects_reply = false;
                        break;
                    }
                }
            }
            if (rejects || rejects_reply) {
                return Promise.reject();
            }
        }
    };

    bridge.addHook('bridge.send', process('send'));
    bridge.addHook('bridge.receive', process('receive'));
};

