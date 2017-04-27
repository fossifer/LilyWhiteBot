'use strict';

module.exports = (bridge, options) => {
    bridge.addHook('bridge.prepare', (msg) => new Promise((resolve, reject) => {
        if (options.options.paeeye) {
            if (msg.text.startsWith(options.options.paeeye)) {
                reject();
                return;
            } else if (msg.extra.reply && msg.extra.reply.message.startsWith(options.options.paeeye)) {
                reject();
                return;
            }
        }
        resolve();
    }));
};
