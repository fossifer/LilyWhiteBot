/*
 * unfilter.js 過濾不符合特定規則的訊息
 *
 * 使用方法同 filter.js，不建議建立衝突的規則
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

        for (let f of filters) {
            let rejects = false;
            let rejects_reply = false;
            for (let prop in f) {
                if (!(msg[prop] && msg[prop].toString().match(f[prop]))) {
                    rejects = true;
                    break;
                }
            }
            // check the replied message if `filter_reply` flag of the filter is set
            if (f.filter_reply && msg.extra.reply) {
                rejects_reply = false;
                let reply = msg.extra.reply;
                reply.text = reply.message;
                reply.to_uid = msg.to_uid;
                reply.from_uid = msg.from_uid;
                for (let prop in f) {
                    if (!(reply[prop] && reply[prop].toString().match(f[prop]))) {
                        rejects_reply = true;
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

