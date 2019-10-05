/*
 * 離開群組
 *
 * 請設置 Bot Owner，否則無法使用
 *
 * 設置：
 * "leave-tg": {
 *     "owner": 你的 userid，可通過 groupid-tg 並與 bot 私聊取得
 * }
 */

'use strict';

const winston = require('winston');

module.exports = (pluginManager, options) => {
    let tg = pluginManager.handlers.get('Telegram');
    if (tg) {
        tg.addCommand('leave', (context) => {
            if (context.isPrivate) {
                context.reply("Can't leave.");
                winston.debug(`[leave-tg.js] Msg #${context.msgId}: Bot can't leave from private chats.`);
            } else if (options.owner && context.from === options.owner) {
                tg.leaveChat(context.to);
                winston.debug(`[leave-tg.js] Msg #${context.msgId}: Bot has left from ${context.to}.`);
            } else {
                winston.debug(`[leave-tg.js] Msg #${context.msgId}: Bot won't leave due to lack of permissions.`);
            }
        });
    }
};
