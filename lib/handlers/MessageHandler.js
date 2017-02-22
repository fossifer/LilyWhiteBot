/*
 * @name 使用統一介面處理訊息
 *
 * MessageHandler的目的是為不同種類的機器人提供統一的介面。在統一的context之下，它們也可以忽略訊息來源的軟件，以自己能夠
 * 接受的方式輸出其他群組的訊息。
 *
 * 接受以下事件：
 *
 * text: context
 * command: context
 * command#命令: context
 *
 * context須使用統一格式
 */

const EventEmitter = require('events').EventEmitter;

class MessageHandler extends EventEmitter {
    constructor () {
        super();

        this._type = 'unknown';
        this._enabled = true;
        this._commands = new Map();
    }

    get type() {
        return this._type;
    }

    get enabled() {
        return this._enabled;
    }

    set enabled(value) {
        this._enabled = value && true;
    }

    say(target, message, options) { return this; }
    reply(context, message, options) { return this; }

    addCommand(command, func) {
        if (typeof func === 'function') {
            this._commands.set(command, func);
        } else {
            this._commands.set(command, true);
        }
        return this;
    }

    removeCommand(command) {
        this._commands.delete(command);
        return this;
    }
}

module.exports = MessageHandler;
