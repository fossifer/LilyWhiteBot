/*
 * 離開群組
 *
 * 請設置 Bot Owner，否則無法使用。
 *
 * 設置：
 * "leave-tg": {
 *     "owner": 你的 userid，可通過 groupid-tg 並與 bot 私聊取得
 * }
 */

'use strict';

module.exports = (pluginManager, options) => {
    let tg = pluginManager.handlers.get('Telegram');
    if (tg) {
        tg.addCommand('leave', (context) => {
            if (context.isPrivate) {
                context.reply("Can't leave.");
            } else if (options.owner && context.from === options.owner) {
                tg.leaveChat(context.to);
            }
        });
    }
};
