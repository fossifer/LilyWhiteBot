/*
 * Context 為統一格式的訊息上下文
 *
 * 訊息的完整格式設定：
 * {
 *     from: "",
 *     to: "",
 *     nick: "",
 *     text: "",
 *     isPrivate: false,
 *     command: "",
 *     param: "",
 *     extra: {         // 備註：本程式為淺層拷貝
 *         clients: 3,  // 本次傳送有幾個群互聯？（由 bridge 發送）
 *         clientName: {
 *             shortname: ''
 *             fullname: ''
 *         }
 *         mapto: [     // 對應到目標群組之後的 to（由 bridge 發送）
 *             "irc/#aaa",
 *             ...
 *         ],
 *         reply: {
 *             nick: "",
 *             username: "",
 *             message: "",
 *             isText: true,
 *         },
 *         forward: {
 *             nick: "",
 *             username: "",
 *         },
 *         files: [
 *             {
 *                 client: "Telegram",  // 用於區分
 *                 type: ...
 *                 ...
 *             }
 *         ]
 *         uploads: [        // Telegram：檔案上傳用，由 bridge 發送
 *             {
 *                 url: "",
 *                 type: "image"    // image/audio/file
 *             }
 *         ],
 *     },
 *     handler: 訊息來源的 handler,
 *     _rawdata: 處理訊息的機器人所用的內部資料，應避免使用,
 * }
 */
'use strict';

let msgId = 0;

const getMsgId = () => {
    msgId++;
    return msgId;
};

class Context {
    constructor(options = {}, overrides = {}) {
        this.from = null;
        this.to = null;
        this.nick = '';
        this.text = '';
        this.isPrivate = null;
        this.extra = {};
        this.handler = null;
        this._rawdata = null;
        this.command = '';
        this.param = '';
        this._msgId = getMsgId();

        // TODO 雖然這樣很醜陋，不過暫時先這樣了
        for (let k of ['from', 'to', 'nick', 'text', 'isPrivate', 'extra', 'handler', '_rawdata', 'command', 'param']) {
            if (overrides[k] !== undefined) {
                this[k] = overrides[k];
            } else if (options[k] !== undefined) {
                this[k] = options[k];
            }
        }

        if (overrides.text !== undefined) {
            this.command = overrides.command || '';
            this.param = overrides.param || '';
        }
    }

    say(target, message, options) {
        if (this.handler) {
            this.handler.say(target, message, options);
        }
    }

    reply(message, options) {
        if (this.handler) {
            this.handler.reply(this, message, options);
        }
    }

    get msgId() {
        return this._msgId;
    }
}

module.exports = Context;
