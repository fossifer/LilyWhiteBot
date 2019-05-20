/*
 * @name 使用統一介面處理訊息
 *
 * MessageHandler 的目的是為不同種類的機器人提供統一的介面。在統一的 context 之下，它們也可以忽略訊息來源的軟件，以自己能夠
 * 接受的方式輸出其他群組的訊息
 *
 * 接受以下事件：
 *
 * text: context
 * command: context
 * command#命令: context
 *
 * context 須使用統一格式
 */

const EventEmitter = require('events');

class MessageHandler extends EventEmitter {
    constructor () {
        super();

        this._client = null;
        this._type = 'unknown';
        this._id = '?';
        this._enabled = true;
        this._commands = new Map();
    }

    get rawClient() { return this._client; }
    get type() { return this._type; }
    set type(value) { this._type = value; }
    get id() { return this._id; }
    set id(value) { this._id = value; }
    get enabled() { return this._enabled; }
    set enabled(value) { this._enabled = value && true; }

    say(target, message, options) {
        if (this._enabled) {
            return Promise.resolve();
        } else {
            return Promise.reject();
        }
    }
    reply(context, message, options) {
        return this.say(context.from, message, options);
    }

    addCommand(command, func) {
        if ((!command) || (command.trim() === '')) {
            return this;
        }

        if (typeof func === 'function') {
            this._commands.set(command, func);
        } else {
            this._commands.set(command, true);
        }
        return this;
    }

    deleteCommand(command) {
        this._commands.delete(command);
        return this;
    }
}

module.exports = MessageHandler;
