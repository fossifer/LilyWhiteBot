'use strict';

const fileUploader = require('./file.js');

module.exports = (options, objects) => {
    let handlers = new Map();
    let map = {};

    fileUploader.init(options);
    fileUploader.handlers = handlers;

    let bridge = {
        get map() {
            return map;
        },
        set map(obj) {
            map = obj;
        },
        get handlers() {
            return handlers;
        },
        add: (type, handler) => {
            handlers.set(type, handler);
        },
        remove: (type) => {
            handlers.delete(type);
        },
        send: (context) => {
            return new Promise((resolve, reject) => {
                // 如果符合paeeye，不傳送
                if (options.options.paeeye) {
                    if (context.text.startsWith(options.options.paeeye)) {
                        resolve();
                        return;
                    } else if (context.extra.reply && context.extra.reply.message.startsWith(options.options.paeeye)) {
                        resolve();
                        return;
                    }
                }

                // 檢查是否有傳送目標，如果沒有，reject
                let [fromType, fromGroup] = [context.handler.type, context.to];
                let alltargets = map[fromType][fromGroup];
                let targets = {}, targets2 = [], targetCount = 0;

                if (context.type === 'request') {
                    // Request有自己期待的目標
                    let ts = context.targets;
                    if (ts) {
                        if (typeof context.targets === 'string') {
                            ts = [context.targets];
                        }

                        for (let t of ts) {
                            if (alltargets[t] && !alltargets[t].disabled) {
                                targets[t] = alltargets[t].target;
                                targets2.push(t);
                                targetCount++;
                            }
                        }
                    }
                } else {
                    for (let t in alltargets) {
                        if (t !== fromType && alltargets[t] && !alltargets[t].disabled) {
                            targets[t] = alltargets[t].target;
                            targets2.push(t);
                            targetCount++;
                        }
                    }
                }

                // 向context中加入附加訊息
                context.extra.clients = targetCount + 1;
                context.extra.mapto = targets;

                if (targetCount) {
                    // 檢查是否有檔案，如果有，交給file處理，並等處理結束後將檔案位址附加到訊息中
                    fileUploader.process(context).then((uploads) => {
                        context.extra.uploads = uploads;
                    }).catch((e) => {
                        objects.pluginManager.log(`Error on processing files: ${e}`, true);
                        bridge.send(new objects.Broadcast(context, {
                            text: 'File upload error',
                            extra: {},
                        }));
                    }).then(() => {
                        // 向對應目標的handler觸發exchange
                        for (let t of targets2) {
                            handlers.get(t).emit('exchange', context);
                        }
                        resolve();
                    });
                } else {
                    reject();
                }
            });
        },
    };

    return bridge;
};
