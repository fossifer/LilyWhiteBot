/*
 * 在其他群組查 IRC 的情況
 */

'use strict';

const BridgeMsg = require('./transport/BridgeMsg.js');

let ircHandler = null;

const getChans = (context) => {
    let r = [];
    for (let c of context.extra.mapto) {
        let client = BridgeMsg.parseUID(c);
        if (client.client === 'IRC') {
            r.push(client.id);
        }
    }
    return r;
};

const processWhois = (context) => {
    if (context.param) {
        ircHandler.whois(context.param, (info) => {
            let output = [`${info.nick}: Unknown nick`];

            if (info.user) {
                output = [
                    `${info.nick} (${info.user}@${info.host})`,
                    `Server: ${info.server} (${info.serverinfo})`
                ];

                if (info.realname) {
                    output.push(`Realname: ${info.realname}`);
                }

                if (info.account) {
                    output.push(`${info.nick} ${info.accountinfo} ${info.account}`);
                }
            }

            context.reply(output.join('\n'));
        });
    } else {
        context.reply('用法：/ircwhois IRC暱称');
    }
};

const processNames = (context) => {
    let chans = getChans(context);

    for (let chan of chans) {
        let users = ircHandler.chans[chan].users;
        let userlist = [];

        for (let user in users) {
            if (users[user] !== '') {
                userlist.push(`(${users[user]})${user}`);
            } else if (users[user] !== undefined) {
                userlist.push(user);
            }
        }
        userlist.sort((a, b) => {
            if (a.startsWith('(@)') && !b.startsWith('(@)')) {
                return -1;
            } else if (b.startsWith('(@)') && !a.startsWith('(@)')) {
                return 1;
            } else if (a.startsWith('(+)') && !b.startsWith('(+)')) {
                return -1;
            } else if (b.startsWith('(+)') && !a.startsWith('(+)')) {
                return 1;
            } else {
                return a.toLowerCase() < b.toLowerCase() ? -1 : 1;
            }
        });

        context.reply(`Users on ${chan}: ${userlist.join(', ')}`);
    }
};

const processTopic = (context) => {
    let chans = getChans(context);
    for (let chan of chans) {
        let topic = ircHandler.chans[chan].topic;

        if (topic) {
            context.reply(`Topic for channel ${chan}: ${topic}`);
        } else {
            context.reply(`No topic for ${chan}`);
        }
    }
};

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
    ircHandler = pluginManager.handlers.get('IRC');

    bridge.addCommand(`/${prefix}topic`, processTopic, options);
    bridge.addCommand(`/${prefix}names`, processNames, options);
    bridge.addCommand(`/${prefix}whois`, processWhois, options);
};
