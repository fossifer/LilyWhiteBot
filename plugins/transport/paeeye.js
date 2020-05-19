'use strict';

const winston = require('winston');

module.exports = (bridge, options) => {
    bridge.addHook('bridge.send', (msg) => new Promise((resolve, reject) => {
        let paeeye = options.options.paeeye;

        if (paeeye) {
            if (typeof paeeye === 'string') {
                if (msg.text.startsWith(paeeye) ||
                    (msg.extra.reply && msg.extra.reply.message.startsWith(paeeye))) {
                    winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                    reject(false);
                    return;
                }
            } else {
                if (msg.text.startsWith(paeeye.prepend) ||
                    msg.text.includes(paeeye.inline)) {
                    winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                    reject(false);
                    return;
                } else if (msg.extra.reply && (msg.extra.reply.message.startsWith(paeeye.prepend) ||
                    msg.extra.reply.message.includes(paeeye.inline))) {
                    winston.debug(`[paeeye.js] #${msg.msgId}: Ignored.`);
                    reject(false);
                    return;
                }
            }
        }
        resolve();
    }));
};
