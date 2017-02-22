/*
 * 在Telegram群組中取得群組的ID，以便於配置互聯機器人
 */

'use strict';

module.exports = (pluginManager, options) => {
    let tg = pluginManager.handlers.get('Telegram');
    if (tg) {
        tg.addCommand('thisgroupid', (context) => {
            if (context.isPrivate) {
                context.reply(`BotUserId = ${context.to}`);
            } else {
                context.reply(`GroupId = ${context.to}`);
            }
        });
    }
};
