/*
 * 互聯機器人
 */

'use strict';

module.exports = (pluginManager, options) => {
    /*
     * 準備「郵遞員」bridge
     */
    const {Context, Message} = pluginManager.global;

    /*
     * Request是一種發給其他指定群組，而且期待對方能給予回覆的訊息
     */
    class Request extends Context {
        constructor(options = {}, overrides = {}) {
            super(options);

            this.command = options.command;
            this.param = options.param;
            this.targets = options.targets || [];

            for (let k of ['from', 'to', 'nick', 'text', 'isPrivate', 'extra', 'handler', '_rawdata', 'command', 'param', 'targets']) {
                this[k] = overrides[k] || this[k];
            }

            this.type = 'request';
        }
    }

    /*
     * Broadcast是一種發給其他所有群組，而且不期待任何回應的訊息
     */
    class Broadcast extends Context {
        constructor(options = {}, overrides = {}) {
            super(options);

            for (let k of ['from', 'to', 'nick', 'text', 'extra', 'handler', '_rawdata']) {
                this[k] = overrides[k] || this[k];
            }

            this.isPrivate = false;
            this.type = 'broadcast';
        }

        // 不做任何動作
        say() {}
        reply() {}
    }

    // 便於其他套件使用
    pluginManager.global.Request = Request;
    pluginManager.global.Broadcast = Broadcast;

    let bridge = require('./transport/bridge.js')(options, {
        Context,
        Message,
        Request,
        Broadcast,
        pluginManager,
    });

    /*
      確定已經支援哪些用戶端
     */
    let availableClients = [];
    let coreClients = [];
    for (let [type, handler] of pluginManager.handlers) {
        availableClients.push(type);
        coreClients.push(type);
    }

    /*
      處理用戶端別名
     */
    let extraClients = [];
    let aliases = options.aliases || {};
    for (let original in aliases) {
        for (let newclient in aliases[original]) {
            extraClients.push({
                type: newclient,
                id: aliases[original][newclient],
                originalType: original,
            });
            availableClients.push(newclient);
        }
    }

    /*
      理清各群之間的關係：根據已知資料，建立一對一的關係（然後將disable的關係去除），便於查詢。例如：

        map: {
            IRC: {
                "#channel1": {
                    QQ: {
                        target: 123123123,
                        disabled: false,
                    },
                    Telegram: {
                        target: -123123123,
                        disabled: true,
                    },
                },
                ...
            },
            QQ: {
                "123123123": {
                    IRC: "#channel1",
                    ...
                },
                ...
            },
            ...
        }
     */
    let map = {};
    for (let client of availableClients) {
        map[client] = {};
    }

    let groups = options.groups || [];
    for (let group of groups) {
        // 建立聯繫
        for (let client1 of availableClients) {
            let g1 = group[client1];
            let m1 = map[client1];
            if (g1) {
                m1[g1] = {};
                for (let client2 of availableClients) {
                    if (client1 === client2) {
                        continue;
                    }

                    let g2 = group[client2];
                    if (g2) {
                        m1[g1][client2] = {
                            target: g2,
                            disabled: false,
                        };
                    }
                }
            }
        }

        // 移除被禁止的聯繫
        let disable = group.disable || {};
        for (let client1 in disable) {
            if (map[client1]) {
                let g1 = group[client1];
                if (typeof disable[client1] === 'string') {
                    let client2 = disable[client1];
                    if (map[client1][g1][client2]) {
                        map[client1][g1][client2].disabled = true;
                    }
                } else {
                    for (let client2 of disable[client1]) {
                        if (map[client1][g1][client2]) {
                            map[client1][g1][client2].disabled = true;
                        }
                    }
                }
            }
        }
    }

    bridge.map = map;

    // 載入各用戶端的處理程式，並連接到bridge中
    for (let type of coreClients) {
        let handler = pluginManager.handlers.get(type);
        if (handler) {
            require(`./transport/handlers/${type}.js`)({
                bridge,
                handler,
                Context,
                Message,
                Request,
                Broadcast,
            }, options);

            bridge.add(type, handler);
        }
    }

    // 為副群組（別名）單獨建立 MessageHandler
    for (let client of extraClients) {
        let originalType = client.originalType;
        let { object: Handler, options: handlerOptions } = pluginManager.handlerClasses.get(originalType);
        let originalHandler = pluginManager.handlers.get(originalType);
        if (Handler) {
            pluginManager.log(`Added a new client: ${originalType} -> ${client.type} <${client.id}>`);

            let handler = new Handler(originalHandler.rawClient, handlerOptions);
            handler.type = client.type;
            handler.id = client.id;
            require(`./transport/handlers/${originalType}.js`)({
                bridge,
                handler,
                Context,
                Message,
                Request,
                Broadcast,
            }, options);

            bridge.add(client.type, handler);
        }
    }

    return bridge;
};
