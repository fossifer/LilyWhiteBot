'use strict';

const Context = require('../../lib/handlers/Context.js');
const BridgeMsg = require('./BridgeMsg.js');

let processors = new Map();
let hooks = {};
let hooks2 = new WeakMap();
let map = {};
let aliases = {};

// TODO 独立的命令处理
// let commands = {};

const getBridgeMsg = (msg) => {
    if (msg instanceof BridgeMsg) {
        return msg;
    } else {
        return new BridgeMsg(msg);
    }
};

const prepareMsg = (msg) => {
    // 檢查是否有傳送目標
    let alltargets = map[msg.to_uid];
    let targets = [];
    for (let t in alltargets) {
        if (!alltargets[t].disabled) {
            targets.push(t);
        }
    }

    // 向 msg 中加入附加訊息
    msg.extra.clients = targets.length + 1;
    msg.extra.mapto = targets;
    if (aliases[msg.to_uid]) {
        msg.extra.clientName = aliases[msg.to_uid];
    } else {
        msg.extra.clientName = {
            shortname: msg.handler.id,
            fullname: msg.handler.type,
        };
    }

    return bridge.emitHook('bridge.send', msg);
};

const bridge = {
    get map() { return map; },
    set map(obj) { map = obj; },
    get aliases() { return aliases; },
    set aliases(obj) { aliases = obj; },
    get processors() { return processors; },
    addProcessor(type, processor) { processors.set(type, processor); },
    deleteProcessor(type) { processors.delete(type); },
    addHook(event, func, priority = 100) {
        // Event:
        // bridge.send：剛發出，尚未準備傳話
        // bridge.receive：已確認目標
        if (!hooks[event]) {
            hooks[event] = new Map();
        }
        let m = hooks[event];
        if (m && typeof func === 'function') {
            let p = priority;
            while (m.has(p)) {
                p++;
            }
            m.set(p, func);
            hooks2.set(func, { event: event, priority: p });
        }
    },
    deleteHook(func) {
        if (hooks2.has(func)) {
            let h = hooks2.get(func);
            hooks[h.event].delete(h.priority);
            hooks2.delete(func);
        }
    },
    emitHook(event, msg) {
        let r = Promise.resolve();
        if (hooks[event]) {
            for (let [priority, hook] of hooks[event]) {
                r = r.then(_ => hook(msg));
            }
        }
        return r;
    },

    send(m) {
        let msg = getBridgeMsg(m);
        return prepareMsg(msg).then(() => {
            // 全部訊息已傳送 resolve(true)，部分訊息已傳送 resolve(false)；
            // 所有訊息被拒絕傳送 reject()
            // Hook 需自行處理異常

            // 向對應目標的 handler 觸發 exchange
            let promises = [];
            let allresolved = true;

            for (let t of msg.extra.mapto) {
                let msg2 = new BridgeMsg(msg, {
                    to_uid: t
                });
                let client = BridgeMsg.parseUID(t).client;

                promises.push(bridge.emitHook('bridge.receive', msg2).then(_ => {
                    let processor = processors.get(client);
                    if (processor) {
                        return processor.receive(msg2);
                    }
                }));
            }

            return Promise.all(promises)
                .catch(() => { allresolved = false; })
                .then(() => {
                    bridge.emitHook('bridge.sent', msg);
                    return Promise.resolve(allresolved);
                });
        });
    }
};

module.exports = bridge;
