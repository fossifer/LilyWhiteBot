/*
 * linky - 自動將聊天中的[[]]與{{}}換成 Wiki 系統的連結
 *
 * 配置方法：在 config.js 中

    plugins 中加入一個「wikilinky」，然後在末尾補一個：

    "wikilinky": {
        "groups": {
            "qq/123123123": "https://zh.wikipedia.org/wiki/$1"
        },
        "ignore": {
            "IRC": "wm-bot",
            "Telegram": "^12345678$"
            "QQ": "^123456789$"
            "Discord": "^123456789987654321$"
        }
    }
 */
'use strict';

const BridgeMsg = require('./transport/BridgeMsg.js');

const compare = (x, y) => {
    return x.pos - y.pos;
};

let map = {};
let ignore = {};

const pad = (str) => {
    return `00${str}`.substr(-2);
};

const genlink = (v) => {
    // 處理「#」
    let str = v.replace(/ /gu, '_');
    let p = str.indexOf('#');

    if (p === -1) {
        return encodeURI(str);
    } else {
        /*
          對於「#」後面的內容：

          不轉成 ASCII 的：字母、數字、「-」、「.」、「:」、「_」
          空白轉成「_」
         */
        let s1 = encodeURI(str.substring(0, p));
        let s2 = str.substring(p+1);

        let plain = Buffer.from(s2, 'utf-8').toString('binary');

        s2 = plain.replace(/[^A-Za-z0-9\-\.:_]/gu, (ch) => {
            return `.${pad(ch.charCodeAt(0).toString(16).toUpperCase())}`;
        });

        return `${s1}#${s2}`;
    }
};

const linky = (string, prefix) => {
    let text = {};      // 去重複
    let links = [];

    string.replace(/\[\[\s*([^\[\|]+?)\s*(|\|.+?)\]\]/gu, (s, l, _, offset) => {
        if (!text[l]) {
            links.push({ pos: offset, link: prefix.replace('$1', genlink(l)) });
            text[l] = true;
        }
        return s;
    });

    string.replace(/([^\{]|^)\{\{\s*([^\{#\[\]\|]+?)\s*(|\|.+?)\}\}/gu, (s, _, l, __, offset) => {
        let t = l;
        if (!t.startsWith(':') && !t.toLowerCase().startsWith('template:')) {
            t = 'Template:' + t;
        }
        if (!text[t]) {
            links.push({ pos: offset, link: prefix.replace('$1', `${genlink(t)}`) });
            text[t] = true;
        }
        return s;
    });

    links.sort(compare);
    return links;
};

const checkignore = (context) => {
    for (let [client, from] of Object.entries(ignore)) {
        if (context.handler.type === client && context.from.toString().match(from)) {
            return true;
        }
    }
    return false;
};

const processlinky = (context, bridge) => {
    try {
        let rule = map[BridgeMsg.getUIDFromContext(context, context.to)];
        if (rule) {
            let links = linky(context.text, rule);

            if (links.length > 0 && !checkignore(context)) {
                context.reply(links.map(l => l.link).join('  '));
                // 若互聯且在公開群組調用，則讓其他群也看到連結
                if (bridge && !context.isPrivate) {
                    bridge.send(new BridgeMsg(context, {
                        text: links.map(l => l.link).join('  '),
                        isNotice: true,
                    }));
                }
            }
        }
    } catch (ex) {

    }
};

module.exports = (pluginManager, options) => {
    const bridge = pluginManager.plugins.transport;
    if (!options) {
        return;
    }

    let types = {};

    BridgeMsg.setHandlers(pluginManager.handlers);

    for (let [type, handler] of pluginManager.handlers) {
        map[type] = {};
    }

    ignore = options.ignore || {};
    let groups = options.groups || {};
    for (let group in groups) {
        let client = BridgeMsg.parseUID(group);
        if (client.uid) {
            map[client.uid] = groups[group];
            types[client.client] = true;
        }
    }

    for (let type in types) {
        pluginManager.handlers.get(type).on('text', (context) => processlinky(context, bridge));
    }
};
