'use strict';

const Context = require('../../lib/handlers/Context.js');

let clientFullNames = {};

const genUID = (context, id) => {
    if (!context.handler) {
        return null;
    }

    // QQ 要特殊處理
    if (context.handler.type === 'QQ' && context.isPrivate) {
        return `qq/@${id}`;
    } else {
        return `${context.handler.type.toLowerCase()}/${id}`;
    }
};

class BridgeMsg extends Context {
    constructor(context, overrides = {}) {
        // TODO 雖然這樣很醜陋，不過暫時先這樣了
        super(context, overrides);

        this.isNotice = false;

        if (this.handler) {
            this._from_client = this.handler.type;
            this._to_client = this.handler.type;

            this.from = this.from;
            this.to = this.to;
        }

        for (let k of ['isNotice', 'from_uid', 'to_uid']) {
            if (overrides[k] !== undefined) {
                this[k] = overrides[k];
            } else if (context[k] !== undefined) {
                this[k] = context[k];
            }
        }
    }

    get from() { return this._from; }
    get to() { return this._to; }
    get from_uid() { return this._from_uid; }
    get to_uid() { return this._to_uid; }

    set from(f) {
        this._from = f;
        this._from_uid = `${(this._from_client || '').toLowerCase()}/${f}`;
    }

    set to(t) {
        this._to = t;
        this._to_uid = `${(this._to_client || '').toLowerCase()}/${t}`;
    }

    set from_uid(u) {
        let { client, id, uid } = BridgeMsg.parseUID(u);
        this._from = id;
        this._from_uid = u;
        this._from_client = client;
    }

    set to_uid(u) {
        let { client, id, uid } = BridgeMsg.parseUID(u);
        this._to = id;
        this._to_uid = u;
        this._to_client = client;
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

BridgeMsg.parseUID = (u) => {
    let client = null, id = null, uid = null;
    if (u) {
        let s = u.toString();
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
