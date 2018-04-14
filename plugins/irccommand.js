/*
 * 在其他群組向 IRC 發命令
 */

'use strict';

const BridgeMsg = require('./transport/BridgeMsg.js');

module.exports = (pluginManager, options) => {
    const bridge = pluginManager.plugins.transport;

    if (!bridge || !pluginManager.handlers.has('IRC')) {
        return;
    }

    if (!options.disallowedClients) {
        options.disallowedClients = ['IRC'];
    } else {
        options.disallowedClients.push('IRC');
    }

    let prefix = options.prefix || '';
    let echo = options.echo || true;
    let ircHandler = pluginManager.handlers.get('IRC');

    bridge.addCommand(`/${prefix}command`, (context) => {
        if (!context.isPrivate) {
            if (context.param) {
                if (echo) {
                    context.reply(context.param);
                }

                for (let c of context.extra.mapto) {
                    let client = BridgeMsg.parseUID(c);
                    if (client.client === 'IRC') {
                        ircHandler.say(client.id, context.param);
                    }
                }
            } else {
                context.reply(`用法: /${prefix}command <命令>`);
            }
        }
        return Promise.resolve();
    }, options);
};
