/*
 * 在 Telegram 群組中取得群組的 ID，以便於配置互聯機器人
 */

'use strict';

const winston = require('winston');

module.exports = (pluginManager, options) => {
    let tg = pluginManager.handlers.get('Telegram');
    if (tg) {
        tg.addCommand('thisgroupid', (context) => {
            if (context.isPrivate) {
                context.reply(`YourId = ${context.from}`);
                winston.debug(`[groupid-tg.js] Msg #${context.msgId}: YourId = ${context.from}`);
            } else {
                context.reply(`GroupId = ${context.to}`);
                winston.debug(`[groupid-tg.js] Msg #${context.msgId}: GroupId = ${context.to}`);
            }
        });
    }
};
