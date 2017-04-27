/*
 * 互聯機器人
 */

'use strict';

const BridgeMsg = require('./transport/BridgeMsg.js');

module.exports = (pluginManager, options) => {
    /*
     * 準備「郵遞員」bridge
     */
    let bridge = require('./transport/bridge.js');
    BridgeMsg.setHandlers(pluginManager.handlers);
    bridge.BridgeMsg = BridgeMsg;
    bridge.handlers = pluginManager.handlers;
    pluginManager.global.BridgeMsg = BridgeMsg;

    /*
      理清各群之間的關係：根據已知資料，建立一對一的關係（然後將disable的關係去除），便於查詢。例如：

        map: {
            'irc/#channel1': {
                'qq/123123123': {
                    disabled: false,
                },
                'telegram/-123123123': {
                    disabled: false,
                }
            },
            'irc/#channel2': {
                ...
            },
            'qq/123123123': {
                'irc/#channel1': {
                    disabled: false,
                },
                ...
            },
            ...
        }
     */
    let map = {};

    let groups = options.groups || [];
    if (groups[0] && !(groups[0] instanceof Array)) {
        groups = [groups];
    }

    for (let group of groups) {
        // 建立聯繫
        for (let c1 of group) {
            let client1 = BridgeMsg.parseUID(c1).uid;

            if (client1) {
                for (let c2 of group) {
                    let client2 = BridgeMsg.parseUID(c2).uid;
                    if (client1 === client2) { continue; }
                    if (!map[client1]) { map[client1] = {}; }

                    map[client1][client2] = {
                        disabled: false,
                    };
                }
            }
        }
    }

    // 移除被禁止的聯繫
    let disables = options.disables || {};
    for (let c1 in disables) {
        let client1 = BridgeMsg.parseUID(c1).uid;

        if (client1) {
            let list = disables[c1];
            if (typeof list === 'string') {
                list = [list];
            }

            for (let c2 of list) {
                let client2 = BridgeMsg.parseUID(c2).uid;
                if (map[client1][client2]) {
                    map[client1][client2].disabled = true;
                }
            }
        }
    }

    bridge.map = map;

    // 處理用戶端別名
    let aliases = options.aliases || {};
    let aliases2 = {};
    for (let a in aliases) {
        let cl = BridgeMsg.parseUID(a).uid;
        if (cl) {
            let names = aliases[a];
            let shortname;
            let fullname;

            if (typeof names === 'string') {
                shortname = fullname = names;
            } else {
                shortname = names[0];
                fullname = names[1] || shortname;
            }

            aliases2[cl] = {
                shortname,
                fullname
            };
        }
    }
    bridge.aliases = aliases2;

    // 載入各用戶端的處理程式，並連接到bridge中
    for (let [type, handler] of pluginManager.handlers) {
        let processor = require(`./transport/processors/${type}.js`);
        processor.init(bridge, handler, options);
        bridge.addProcessor(type, processor);
    }

    // command：允許向互聯群中加跨群操作的命令
    // paeeye：不轉發特定開頭的訊息
    // file：處理檔案上傳
    for (let p of ['command', 'paeeye', 'file']) {
        require(`./transport/${p}.js`)(bridge, options);
    }

    return bridge;
};
