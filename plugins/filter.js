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
 *             event: "send/receive",
 *             from: "regex",               // 需要小寫、完整名稱：irc\\/user、telegram\\/userid、qq\\/@qq號
 *             to: "regex",
 *             nick: "regex",
 *             text: "regex"                // 以上均为並列關係
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

        arr.push(opt);
    }

    const process = (event) => (msg) => {
        let filters = msgfilters[event];

        console.log('msg', msg.from, msg.to, msg.from_uid, msg.to_uid, msg.nick, msg.text);

        for (let f of filters) {
            let rejects = true;
            for (let prop in f) {
                if (!(msg[prop] && msg[prop].toString().match(f[prop]))) {
                    rejects = false;
                    break;
                }
            }
            if (rejects) {
                return Promise.reject();
            }
        }
    };

    bridge.addHook('bridge.send', process('send'));
    bridge.addHook('bridge.receive', process('receive'));
};

