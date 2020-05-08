const MessageHandler = require('./MessageHandler.js');
const QQSocketApiMessageHandler = require('./QQSocketApiMessageHandler');
const QQHttpApiMessageHandler = require('./QQHttpApiMessageHandler');

class QQMessageHandler extends MessageHandler {
    constructor (config = {}) {
        super();

        if (config.apiRoot || (config.bot || {}).apiRoot) {
            this._handler = new QQHttpApiMessageHandler(config);
        } else {
            this._handler = new QQSocketApiMessageHandler(config);
        }

        this._client = this._handler.rawClient;
        this._type = 'QQ';
        this._id = 'Q';
    }

    get qq() { return this._handler.qq; }
    get selfCensorship() { return this._handler.selfCensorship; }
    set selfCensorship(v) { this._handler.selfCensorship = v; }
    get ignoreCash() { return this._handler.ignoreCash; }
    set ignoreCash(v) { this._handler.ignoreCash = v; }
    get nickStyle() { return this._handler.nickStyle; }
    set nickStyle(v) { this._handler.nickStyle = v; }
    get isCoolQPro() { return this._handler.isCoolQPro; }
    get enabled() { return this._handler.enabled; }
    set enabled(value) { this._handler.enabled = value; }
    get started() { return this._handler.started(); }

    getNick(user) { return this._handler.getNick(user); }
    escape(message) { return this._handler.escape(message); }
    say(target, message, options) { return this._handler.say(target, message, options); }
    reply(context, message, options) { return this._handler.reply(context, message, options); }
    groupMemberInfo(group, qq) { return this._handler.groupMemberInfo(group, qq); }
    strangerInfo(qq) { return this._handler.strangerInfo(qq); }
    parseMessage(message) { return this._handler.parseMessage(message); }
    image(file) { return this._handler.image(file); }
    voice(file) { return this._handler.voice(file); }
    addCommand(command, func) { return this._handler.addCommand(command, func); }
    deleteCommand(command) { return this._handler.deleteCommand(command); }

    start() { return this._handler.start(); }
    stop() { return this._handler.stop(); }
}

module.exports = QQMessageHandler;
