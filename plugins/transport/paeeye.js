'use strict';

const winston = require('winston');

module.exports = (bridge, options) => {
    bridge.addHook('bridge.send', (msg) => new Promise((resolve, reject) => {
        if (options.options.paeeye) {
            if (msg.text.startsWith(options.options.paeeye)) {
                winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                reject(false);
                return;
            } else if (msg.extra.reply && msg.extra.reply.message.startsWith(options.options.paeeye)) {
                winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                reject(false);
                return;
            }
        }
        resolve();
    }));
};
