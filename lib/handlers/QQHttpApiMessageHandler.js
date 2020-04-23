/*
 * @name 使用通用介面處理 QQ 訊息
 *
 * 備註：不接收討論組訊息
 *
 * 口令紅包沒有任何跡象，所以只好認為：如果一分鐘之內一句話被重複了三次或以上，說明大家在搶紅包
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const LRU = require("lru-cache");
const request = require('request');
const { parseMessage: parseCoolQMessage, escape: escapeCoolQStr } = require('../coolq.js');

class QQHttpApiMessageHandler extends MessageHandler {
    constructor (client, options = {}) {
        super();

        if (!client) {
            throw ReferenceError('No QQ client object');
        }

        this._type = 'QQ';
        this._id = 'Q';

        this._client = client;
        this._selfCensorship = options.selfCensorship || false;
        this._badwords = options.badwords || [];
        this._ignoreCash = options.ignoreCash || false;
        this._qq = parseInt(options.qq) || 0;
        this._nickStyle = options.nickStyle || 'groupcard';
        this._showTitle = options.showTitle || false;
        this._keepSilence = options.keepSilence || [];
        this._apiRoot = options.apiRoot || '';
        this._accessToken = options.accessToken || '';
        this._CoolQPro = options.CoolQPro || false;

        this._stat = new LRU({
            max: 500,
            maxAge: 60000,
        });

        if (this._selfCensorship) {
            this._badwordsRegexp = [];
            for (let word of this._badwords) {
                this._badwordsRegexp.push(new RegExp(word, 'gmu'));
            }
        }

        client.on('message', (rawdata) => {
            if (!this._enabled) {
                return;
            }

            let isPrivate = rawdata.message_type === 'private';
            let isGpNotice = rawdata.message_type === 'group' && rawdata.sub_type === 'notice'
            const parsedMsg = parseCoolQMessage(rawdata.message);

            let context = new Context({
                from: rawdata.user_id,
                nick: this.getNick(rawdata, true),
                text: parsedMsg.text,
                isPrivate: isPrivate,
                isGpNotice: isGpNotice,
                extra: {},
                handler: this,
                _rawdata: rawdata,
            });

            if (rawdata.anonymous) {
                context.nick = `<匿名消息> ${rawdata.anonymous.name}`;
            }

            // 記錄圖片和語音
            let files = [];
            for (let image of parsedMsg.extra.images) {
                files.push({
                    client: 'QQ',
                    type: 'photo',
                    id: image,
                });
            }
            for (let voice of parsedMsg.extra.records) {
                files.push({
                    client: 'QQ',
                    type: 'audio',
                    id: voice,
                });
            }
            context.extra.files = files;

            if (files.length === 0 && this._ignoreCash && !isPrivate) {
                // 過濾紅包訊息（特別是口令紅包），並且防止誤傷（例如「[圖片]」）
                let msg = `${rawdata.group_id}: ${rawdata.message}`;

                let count = this._stat.get(msg) || 0;

                if (++count > 3) {
                    context.extra.isCash = true;
                }

                this._stat.set(msg, count);
            }

            // 記錄 at
            context.extra.ats = parsedMsg.extra.ats;

            if (isPrivate) {
                context.to = this._qq;
            } else {
                context.to = rawdata.group_id;
            }

            // 檢查是不是命令
            for (let [cmd, callback] of this._commands) {
                if (parsedMsg.text.startsWith(cmd)) {
                    let param = parsedMsg.text.trim().substring(cmd.length);
                    if (param === '' || param.startsWith(' ')) {
                        param = param.trim();

                        context.command = cmd;
                        context.param = param;

                        if (typeof callback === 'function') {
                            callback(context, cmd, param);
                        }

                        this.emit('command', context, cmd, param);
                        this.emit(`command#${cmd}`, context, param);
                    }
                }
            }

            this.emit('text', context);
        });

        client.on('notice', async (context) => {
            switch (context.notice_type) {
                case 'group_admin':
                    // 设置/取消群管理员
                    this.emit('admin', {
                        group: parseInt(context.group_id),
                        type: context.sub_type === 'unset' ? 1 : 2, // 1: 取消管理員，2: 設置管理員
                        target: parseInt(context.user_id),
                        time: parseInt(context.time),
                        user: await this.groupMemberInfo(context.group_id, context.user_id),
                    });
                    break;

                case 'group_increase':
                    // 进群
                    this.emit('join', {
                        group: parseInt(context.group_id),
                        admin: parseInt(context.operator_id),
                        target: parseInt(context.user_id),
                        type: context.sub_type === 'approve' ? 1 : 2, // 1: 管理員同意，2: 管理員邀請
                        time: parseInt(context.time),
                        user_target: await this.groupMemberInfo(context.group_id, context.user_id),
                    });
                    break;

                case 'group_decrease':
                    // 退群或被踢
                    this.emit('leave', {
                        group: parseInt(context.group_id),
                        admin: parseInt(context.operator_id), // 管理員 QQ，自行離開時為 0
                        target: parseInt(context.user_id),
                        type: context.sub_type === 'leave' ? 1 : 2, // 1: 自行離開，2: 他人被踢，3: 自己被踢
                        time: parseInt(context.time),
                        user_admin: await this.groupMemberInfo(context.operator_id),
                        user_target: await this.strangerInfo(context.user_id),
                    });
                    break;

                case 'group_ban':
                    // 禁言或解禁
                    this.emit('ban', {
                        group: parseInt(context.group_id),
                        type: context.sub_type === 'ban' ? 1 : 2, // 1: 禁言，2: 解除禁言
                        admin: parseInt(context.operator_id), // 管理員 QQ
                        target: parseInt(context.user_id),
                        time: parseInt(context.time),
                        duration: parseInt(context.duration), // 禁言时长，单位秒
                        user_admin: await this.groupMemberInfo(context.operator_id),
                        user_target: await this.groupMemberInfo(context.user_id),
                    });
                    break;
            }
        });
    }

    get qq() { return this._qq; }
    get selfCensorship() { return this._selfCensorship; }
    set selfCensorship(v) { this._selfCensorship = v && true; }
    get ignoreCash() { return this._ignoreCash; }
    set ignoreCash(v) { this._ignoreCash = v && true; }
    get nickStyle() { return this._nickStyle; }
    set nickStyle(v) { this.nickStyle = v; }
    get showTitle() { return this._showTitle; }
    set showTitle(v) { this.showTitle = v; }
    get isCoolQPro() { return this._CoolQPro; }

    getNick(user, withTitle) {
        if (user) {
            // 處理直接從緩存提取的內容 或 調用groupMemberInfo的返回值
            let { user_id, nickname, card, title,    qq, name, groupCard, honor } = user.sender;
            user_id = user_id || qq || '';
            if (!withTitle || !this._showTitle || !title || !honor) { title = '' }
            else { title = `<${title}> ` }

            if (this._nickStyle === 'groupcard') {
                return title + (card || groupCard || nickname || name || user_id.toString());
            } else if (this._nickStyle === 'nick') {
                return title + (nickname || name || user_id.toString());
            } else {
                return title + user_id.toString();
            }
        } else {
            return '';
        }
    }

    escape(message) {
        return escapeCoolQStr(message);
    }

    async say(target, message, options = {}) {
        if (!this._enabled) {
            throw new Error('Handler not enabled');
        } else if (this._keepSilence.indexOf(parseInt(target)) !== -1) {
            // 忽略
        } else {
            // 屏蔽敏感詞語
            if (this._selfCensorship) {
                for (let re of this._badwordsRegexp) {
                    message = message.replace(re, (m) => '*'.repeat(m.length));
                }
            }

            if (target.toString().startsWith('@')) {
                // auto_esacpe 为 true 时，插件会自动转义
                // 如果不想自动转义（noEscape = true），那么 auto_escape 需要为 false。
                let realTarget = target.toString().substr(1);
                return await this._client('send_private_msg', {
                    user_id: realTarget,
                    message: message,
                    auto_escape: !options.noEscape,
                });
            } else {
                if (options.isPrivate) {
                    return await this._client('send_private_msg', {
                        user_id: target,
                        message: message,
                        auto_escape: !options.noEscape,
                    });
                } else {
                    return await this._client('send_group_msg', {
                        group_id: target,
                        message: message,
                        auto_escape: !options.noEscape,
                    });
                }
            }
        }
    }

    async reply(context, message, options = {}) {
        if (context.isPrivate) {
            options.isPrivate = true;
            return await this.say(context.from, message, options);
        } else {
            if (options.noPrefix) {
                return await this.say(context.to, `${message}`, options);
            } else {
                return await this.say(context.to, `${context.nick}: ${message}`, options);
            }
        }
    }

    async groupMemberInfoRaw(group, qq) {
        const info = await this._client('get_group_member_info', {
            group_id: group,
            user_id: qq,
            no_cache: true,
        });
        return info
    }

    async groupMemberInfo(group, qq) {
        const info = groupMemberInfoRaw(group, qq);
        return {
            group: info.group_id,
            qq: info.user_id,
            name: info.nickname,
            groupCard: info.card,
            rawGroupCard: info.card,
            gender: info.sex === 'unknown' ? '' : info.sex,     // HTTP API 为 male、female 和 unknown，而 cqsocketapi 的未知性别为空串
            age: info.age,
            area: info.area,
            joinTime: info.join_time,
            lastSpeakTime: info.last_sent_time,
            level: info.level,
            userright: info.role === 'owner' ? 'creator' : info.role,   // cqsocketapi 为 creator/admin/member，而 http api 为 owner/admin/member
            hasBadRecord: info.unfriendly,
            honor: info.title,
            honorExpirationTime: info.title_expire_time,
            isGroupCardEditable: info.card_changeable,
        };
    }

    async strangerInfo(qq) {
        const info = await this._client('get_stranger_info', {
            user_id: qq,
            no_cache: true,
        });
        return {
            qq: info.user_id,
            name: info.nickname,
            gender: info.sex === 'unknown' ? '' : info.sex,
            age: info.age,
        };
    }

    parseMessage(message) {
        return parseCoolQMessage(message);
    }

    _fetchFile(path) {
        return new Promise((resolve, reject) => {
            let apiRoot = this._apiRoot;
            if (!apiRoot.endsWith('/')) {
                apiRoot += '/';
            }

            let headers = {};
            if (this._accessToken) {
                headers = {
                    'Authorization': `Bearer ${this._accessToken}`,
                };
            }

            request({
                url: `${apiRoot}data/${path}`,
                encoding: null,
                headers: headers,
            }, (err, httpResponse, body) => {
                if (err) {
                    reject(err);
                } else if (httpResponse >= 400) {
                    reject(new Error(`HTTP Error ${httpResponse} while fetching files`));
                } else {
                    resolve(body);
                }
            });
        });
    }

    async image(file) {
        // cqhttpapi在消息上報使用array格式時會有url值，不用去cqimg文件獲取
        if (file.startsWith('http://') || file.startsWith('https://')) { return file }
        // 获取cqimg文件内容
        const buf = await this._fetchFile(`image/${file}.cqimg`);
        const text = buf.toString();

        // 获取cqimg文件内容中的实际url
        const info = text.toString('ascii');
        const [, url] = info.match(/url=(.*?)[\r\n]/u) || [];
        return url;
    }

    async voice(file) {
        let apiRoot = this._apiRoot;
        if (!apiRoot.endsWith('/')) {
            apiRoot += '/';
        }
        return `${apiRoot}data/record/${file}`
    }
}

module.exports = QQHttpApiMessageHandler;
