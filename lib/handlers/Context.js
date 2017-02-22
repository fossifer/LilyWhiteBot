/*
 * Context為統一格式的訊息上下文
 *
 * Message：由當前用戶端接收的訊息（包括命令），期待由自己處理或被其他用戶端接收（但不期待反饋）
 *
 * 以下二者用於互聯，故不放此處
 * Request：由當前用戶端接收的訊息，期待由其他用戶端處理，需要的話再將結果反饋回本用戶端
 * Broadcast：當前用戶端發送給其他用戶端的訊息，不期待任何反饋
 *
 * 訊息的完整格式設定：
 * {
 *     type: "message/request/broadcast",
 *     from: "",
 *     to: "",
 *     nick: "",
 *     text: "",
 *     command: "",     // 僅限message/request
 *     param: "",       // 僅限message/request
 *     targets: [""],   // 僅限request
 *     isPrivate: false,
 *     extra: {         // 備註：本程式為淺層拷貝
 *         clients: 3,  // 是兩個群互聯還是三個群互聯？（由bridge發送）
 *         mapto: {     // 對應到目標群組之後的to（由bridge發送）
 *             IRC: "",
 *             QQ: "",
 *         },
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
 *         uploads: [        // Telegram：檔案上傳用，由bridge發送
 *             {
 *                 url: "",
 *                 type: "photo"    // photo/audio/file
 *             }
 *         ]
 *     },
 *     handler: 訊息來源的handler,
 *     _rawdata: 處理訊息的機器人所用的內部資料，應避免使用,
 * }
 */
'use strict';

class Context {
    constructor(options = {}) {
        for (let k of ['type', 'from', 'to', 'nick', 'text', 'isPrivate', 'extra', 'handler', '_rawdata']) {
            this[k] = options[k];
        }

        if (!this.extra) {
            this.extra = {};
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
}

class Message extends Context {
    constructor(options = {}, overrides = {}) {
        super(options);

        this.command = options.command;
        this.param = options.param;

        for (let k of ['from', 'to', 'nick', 'text', 'isPrivate', 'extra', 'handler', '_rawdata', 'command', 'param']) {
            this[k] = overrides[k] || this[k];
        }

        this.type = 'message';
    }
}

module.exports = {
    Context,
    Message,
};
