'use strict';

const Context = require('../../lib/handlers/Context.js');

let clientFullNames = {};

const genUID = (context, id) => {
    if (!context.handler) {
        return null;
    }

    // QQ要特殊處理
    if (context.handler.type === 'QQ' && context.isPrivate) {
        return `qq/@${id}`;
    } else {
        return `${context.handler.type.toLowerCase()}/${id}`;
    }
};

class BridgeMsg extends Context {
    constructor(context, overrides = {}) {
        super(context, overrides);

        this.isNotice = false;

        for (let k of ['isNotice', 'from_uid', 'to_uid']) {
            if (overrides[k] !== undefined) {
                this[k] = overrides[k];
            } else if (context[k] !== undefined) {
                this[k] = context[k];
            }
        }
    }

    get from_uid() {
        return this.from ? genUID(this, this.from) : this._from_uid;
    }

    set from_uid(u) {
        let { client, id, uid } = BridgeMsg.parseUID(u);
        this.from = id;
        this._from_uid = u;
    }

    get to_uid() {
        return this.to ? genUID(this, this.to) : this._to_uid;
    }

    set to_uid(u) {
        let { client, id, uid } = BridgeMsg.parseUID(u);
        this.to = id;
        this._to_uid = u;
    }
}

BridgeMsg.setHandlers = (handlers) => {
    // 取得用戶端簡稱所對應的全稱
    clientFullNames = {};
    for (let [type, handler] of handlers) {
        clientFullNames[handler.id.toLowerCase()] = type;
        clientFullNames[type.toLowerCase()] = type;
    }
};

BridgeMsg.parseUID = (s) => {
    let client = null, id = null, uid = null;
    if (s) {
        let i = s.indexOf('/');

        if (i !== -1) {
            client = s.substr(0, i).toLowerCase();
            if (clientFullNames[client]) {
                client = clientFullNames[client];
            }

            id = s.substr(i+1);
            uid = `${client.toLowerCase()}/${id}`;
        }
    }
    return { client, id, uid };
};

BridgeMsg.getUIDFromContext = genUID;

module.exports = BridgeMsg;
