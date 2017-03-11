/*
 * 掀桌子
 *
 * 在群組中使用 !pia、!mua 和 !hug （在Telegram群組中使用 /pia、/mua 和 /hug）
 */
'use strict';

module.exports = (pluginManager, options) => {
    const bridge = pluginManager.plugins.transport;
    const Broadcast = pluginManager.global.Broadcast;

    const pia = (action, context) => {
        context.reply(`${action} ${context.param}`);

        // 如果開啟了互聯，而且是在公開群組中使用本命令，那麼讓其他群也看見掀桌
        if (bridge && !context.isPrivate) {
            bridge.sendAfter(context, new Broadcast(context, {
                text: `${action} ${context.param}`,
            }));
        }
    };

    const p = context => pia(' (╯°Д°)╯︵ ~~~~~┻━┻', context);
    const m = context => pia('o(*￣3￣)o', context);
    const h = context => pia('(つ°ω°)つ', context);

    for (let [type, handler] of pluginManager.handlers) {
        handler.addCommand('!pia', p);
        handler.addCommand('!mua', m);
        handler.addCommand('!hug', h);
    }
};
