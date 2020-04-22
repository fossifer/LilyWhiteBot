'use strict';

const winston = require('winston');

module.exports = (bridge, options) => {
    bridge.addHook('bridge.send', (msg) => new Promise((resolve, reject) => {
        if (options.options.paeeye && (options.options.paeeye.prepend || options.options.paeeye.prepend)) {
            if (msg.text.startsWith(options.options.paeeye.prepend) ||
                msg.text.includes(options.options.paeeye.inline)) {
                winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                reject(false);
                return;
            } else if (msg.extra.reply && (msg.extra.reply.message.startsWith(options.options.paeeye.prepend) ||
                msg.extra.reply.message.includes(options.options.paeeye.inline))) {
                winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                reject(false);
                return;
            }
        }
        resolve();
    }));
};
