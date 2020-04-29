'use strict';

const BridgeMsg = require('../BridgeMsg.js');
const LRU = require('lru-cache');

const truncate = (str, maxLen = 10) => {
    str = str.replace(/\n/gu, '');
    if (str.length > maxLen) {
        str = str.substring(0, maxLen - 3) + '...';
    }
    return str;
};

let bannedMessage = new LRU({
    max: 500,
    maxAge: 300000,
});
let groupInfo = new LRU({
    max: 500,
    maxAge: 3600000,
});

let bridge = null;
let config = null;
let qqHandler = null;

let options = {};

const init = (b, h, c) => {
    bridge = b;
    config = c;
    qqHandler = h;

    const options = config.options.QQ || {};

    if (!options.notify) {
        options.notify = {};
    }

    /*
     * 傳話
     */
    // 將訊息加工好並發送給其他群組
    qqHandler.on('text', (context) => {
        const send = () => bridge.send(context).catch(() => {});

        // 「應用消息」
        if (context.from === 1000000 && options.notify.sysmessage) {
            bridge.send(new BridgeMsg(context, {
                isNotice: true,
            }));
            return;
        }

        // 過濾口令紅包
        if (context.extra.isCash) {
            let key = `${context.to}: ${context.text}`;
            if (!bannedMessage.has(key)) {
                bannedMessage.set(key, true);
                bridge.send(new BridgeMsg(context, {
                    text: `已暫時屏蔽「${context.text}」`,
                    isNotice: true,
                }));
            }
            return;
        }

        if (!context.isPrivate && context.extra.ats && context.extra.ats.length > 0) {
            // 查询 QQ 的 at
            let promises = [];

            for (let at of context.extra.ats) {
                if (groupInfo.has(`${at}@${context.to}`)) {
                    promises.push(Promise.resolve(groupInfo.get(`${at}@${context.to}`)));
                } else {
                    promises.push(qqHandler.groupMemberInfo(context.to, at).catch(_ => {}));
                }
            }

            Promise.all(promises).then((infos) => {
                for (let info of infos) {
                    if (info) {
                        groupInfo.set(`${info.qq}@${context.to}`, info);

                        const user = {
                            sender: {
                                user_id: info.qq,
                                nickname: info.name,
                                card: info.groupCard
                            }
                        };
                        const searchReg = new RegExp(`\\[CQ:at,qq=${info.qq}\\]`, 'gu');
                        const atText = `＠${qqHandler.escape(qqHandler.getNick(user))}`;
                        context.text = context.text.replace(searchReg, atText);
                    }
                }
            }).catch(_ => {}).then(() => send());
        } else {
            send();
        }
    });

    /*
     * 加入與離開
     */
    qqHandler.on('join', (data) => {
        if (options.notify.join) {
            bridge.send(new BridgeMsg({
                from: data.group,
                to: data.group,
                nick: data.user_target.name,
                text: `${data.user_target.name} (${data.target}) 加入QQ群`,
                isNotice: true,
                handler: qqHandler,
                _rawdata: data,
            })).catch(() => {});
        }
    });

    qqHandler.on('leave', (data) => {
        let text;
        if (data.type === 1) {
            text = `${data.user_target.name} (${data.target}) 退出QQ群`;
        } else {
            text = `${data.user_target.name} (${data.target}) 被管理員 ${data.user_admin.name} (${data.adminQQ}) 踢出QQ群`;
        }

        if (groupInfo.has(`${data.target}@${data.group}`)) {
            groupInfo.del(`${data.target}@${data.group}`);
        }

        if (options.notify.leave) {
            bridge.send(new BridgeMsg({
                from: data.group,
                to: data.group,
                nick: data.user_target.name,
                text: text,
                isNotice: true,
                handler: qqHandler,
                _rawdata: data,
            })).catch(() => {});
        }
    });

    /*
     * 管理員
     */
    qqHandler.on('admin', (data) => {
        let text;
        if (data.type === 1) {
            text = `${data.user.name} (${data.target}) 被取消管理員`;
        } else {
            text = `${data.user.name} (${data.target}) 成為管理員`;
        }

        if (options.notify.setadmin) {
            bridge.send(new BridgeMsg({
                from: data.group,
                to: data.group,
                nick: data.user.name,
                text: text,
                isNotice: true,
                handler: qqHandler,
                _rawdata: data,
            })).catch(() => {});
        }
    });
};

// 收到了來自其他群組的訊息
const receive = (msg) => new Promise((resolve, reject) => {
    if (msg.isNotice) {
        if (msg.extra.clients >= 3) {
            qqHandler.say(msg.to, `< ${msg.extra.clientName.fullname}: ${msg.text} >`).catch(e => reject(e));
        } else {
            qqHandler.say(msg.to, `< ${msg.text} >`).catch(e => reject(e));
        }
    } else {
        if (msg.extra.isAction) {
            // 一定是 IRC
            qqHandler.say(msg.to, `* ${msg.nick} ${msg.text}`).catch(e => reject(e));
            resolve();
        } else {
            let special = '';
            let prefix = '';
            if (!config.options.hidenick) {
                if (msg.extra.reply) {
                    const reply = msg.extra.reply;
                    special = `Re ${reply.nick} `;

                    if (reply.isText) {
                        special += `「${truncate(reply.message)}」`;
                    } else {
                        special += reply.message;
                    }

                    special += ': ';
                } else if (msg.extra.forward) {
                    special = `Fwd ${msg.extra.forward.nick}: `;
                }

                if (msg.extra.clients >= 3 && msg.extra.clientName.shortname) {
                    prefix = `[${msg.extra.clientName.shortname} - ${msg.nick}] ${special}`;
                } else {
                    prefix = `[${msg.nick}] ${special}`;
                }
            }

            // 处理图片附件
            let pendingText = qqHandler.escape(prefix + msg.text);
            if (qqHandler.isCoolQPro) {
                // HTTP API 插件 + CoolQ Pro 直接插图
                pendingText += (msg.extra.uploads || []).map(u => `[CQ:image,file=${u.url}]`).join('');
            } else {
                pendingText += qqHandler.escape((msg.extra.uploads || []).map(u => ` ${u.url}`).join(''));
            }

            qqHandler.say(msg.to, pendingText, { noEscape: true }).catch(e => reject(e));
        }
    }
    resolve();
});

module.exports = {
    init,
    receive,
};
