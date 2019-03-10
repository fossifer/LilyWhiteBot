/*
* BabyQ
*
* command: '!bbq'
* types: [
*     'qq/123456'
* ]
*/

'use strict';

const BridgeMsg = require('./transport/BridgeMsg.js');

module.exports = (pluginManager, options) => {
    const bridge = pluginManager.plugins.transport;

    if (!bridge || !pluginManager.handlers.has('QQ')) {
        return;
    }

    let qqHandler = pluginManager.handlers.get('QQ');
    let command = options.command || '!bbq';
    let types = [];

    for (let t of (options.types || [])) {
        let client = BridgeMsg.parseUID(t);
        if (client.uid) {
            types.push(client.uid);
        }
    }

    bridge.addCommand(command, (context) => {
        if (!context.isPrivate) {
            for (let c of context.extra.mapto) {
                let client = BridgeMsg.parseUID(c);
                if (client.client === 'QQ') {
                    if (types.indexOf(client.uid) > -1) {
                        qqHandler.say(client.id, `[CQ:at,qq=2854196300] ${qqHandler.escape(context.param)}`, {
                            noEscape: true,
                        });
                    }
                }
            }
        }
    }, options);
};
