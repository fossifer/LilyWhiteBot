/*
 * @name 使用通用介面處理 QQ 訊息
 *
 * 備註：不接收討論組訊息
 *
 * 口令紅包沒有任何跡象，所以只好認為：如果一分鐘之內一句話被重複了三次或以上，說明大家在搶紅包
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const CQHttp = require('cqhttp');
const LRU = require("lru-cache");
const { parseMessage: parseCoolQMessage, escape: escapeCoolQStr } = require('../coolq.js');
const { loadConfig } = require('../util.js');
const request = require('request');
const winston = require('winston');

class QQHttpApiMessageHandler extends MessageHandler {
    constructor(config = {}) {
        super();

        let botConfig = config.bot || {};
        let qqOptions = config.options || {};

        // 配置文件兼容性
        for (let key of ['qq', 'apiRoot', 'accessToken', 'secret', 'listen']) {
            botConfig[key] = botConfig[key] || config[key];
        }

        let apiRoot = botConfig.apiRoot || 'http://127.0.0.1:5700/';

        let client = new CQHttp({
            apiRoot: apiRoot,
            accessToken: botConfig.accessToken || '',
            secret: botConfig.secret || '',
        });

        let port = 11234;
        let host = '127.0.0.1';

        if (botConfig.listen) {
            port = botConfig.listen.port || port;
            host = botConfig.listen.host || host;
        }

        client('get_version_info').then((json) => {
            winston.info(`QQBot (HTTP API) Get CoolQ Information: CoolQ ${json.coolq_edition}, HTTP Plugin ${json.plugin_version}`);
        }).catch(e => {
            winston.error(`QQBot (HTTP API) Get CoolQ Information Failed: `, e);
        });

        // 載入敏感詞清單
        let badwords = [];
        if (qqOptions.selfCensorship) {
            try {
                badwords = loadConfig('badwords') || [];
            } catch (ex) {
                winston.error('<QQBot> Unable to load badwords list');
            }
        }

        this._type = 'QQ';
        this._id = 'Q';

        this._client = client;
        this._apiRoot = apiRoot;
        this._accessToken = botConfig.accessToken || '';
        this._host = host;
        this._port = port;
        this._selfCensorship = qqOptions.selfCensorship || false;
        this._badwords = badwords;
        this._ignoreCash = qqOptions.ignoreCash || false;
        this._qq = parseInt(botConfig.qq) || 0;
        this._nickStyle = qqOptions.nickStyle || 'groupcard';
        this._showTitle = qqOptions.showTitle || false;
        this._keepSilence = qqOptions.keepSilence || [];
        this._CoolQPro = qqOptions.CoolQPro || false;

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

        client.on('message', async (rawdata) => {
            if (!this._enabled) {
                return;
            }

            let isPrivate = rawdata.message_type === 'private';
            let isGpNotice = rawdata.message_type === 'group' && rawdata.sub_type === 'notice'
            const parsedMsg = parseCoolQMessage(rawdata.message);

            let context = new Context({
                from: rawdata.user_id,
                nick: this.getNick(rawdata),
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

            if (this._showTitle&&this.getTitle(rawdata)) {
                context.nick = `<${this.getTitle(rawdata)}> ${context.nick}`;
            }

            // 記錄圖片和語音
            let files = [];
            for (let image of parsedMsg.extra.images) {
                let fileItem = {
                    client: 'QQ',
                    type: 'image',
                    id: image,
                };
                // onebot在消息上報使用array格式時會有url值，不用去cqimg文件獲取
                if (image.startsWith('http:') || image.startsWith('https:')) {
                    fileItem.url = image;
                } else {
                    fileItem.path = await this.image(image);
                }
                files.push(fileItem);
            }
            for (let voice of parsedMsg.extra.records) {
                let fileItem = {
                    client: 'QQ',
                    type: 'audio',
                    id: voice,
                };
                // onebot在消息上報使用array格式時會有url值，不用去下載語音文件
                if (voice.startsWith('http:') || voice.startsWith('https:')) {
                    fileItem.url = voice;
                } else {
                    fileItem.path = await this.voice(voice);
                }
                files.push(fileItem);
            }
            context.extra.files = files;

            if (files.length === 0 && this._ignoreCash && !isPrivate) {
                // 過濾紅包訊息（特別是口令紅包），並且防止誤傷（例如「[圖片]」）
                // 若cqhttpapi消息上報使用array格式，則rawdata.message會變成[object Object]，會誤傷
                let msg = `${rawdata.group_id}: ${parsedMsg.text}`;

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
                        user_admin: await this.groupMemberInfo(context.group_id, context.operator_id),
                        user_target: await this.strangerInfo(context.user_id),
                    });
                    break;

                case 'group_ban':
                    // 禁言或解禁
                    let duration = ''
                    if (context.duration) {
                      let tmp = parseInt(context.duration);
                      let s = tmp%60; tmp-=s; tmp/=60;
                      if (s) { duration = ` ${s}秒`; }
                      let m = tmp%60; tmp-=m; tmp/=60;
                      if (m) { duration = ` ${m}分` + duration; }
                      let h = tmp%24; tmp-=h; tmp/=24;
                      if (h) { duration = ` ${h}时` + duration; }
                      if (tmp) { duration = ` ${tmp}天` + duration; }
                    }
                    this.emit('ban', {
                        group: parseInt(context.group_id),
                        type: context.sub_type === 'ban' ? 1 : 2, // 1: 禁言，2: 解除禁言
                        admin: parseInt(context.operator_id), // 管理員 QQ
                        target: parseInt(context.user_id),
                        time: parseInt(context.time),
                        duration: parseInt(context.duration), // 禁言时长，单位秒
                        durstr: duration, // 正常格式禁言时长
                        user_admin: await this.groupMemberInfo(context.group_id, context.operator_id),
                        user_target: await this.groupMemberInfo(context.group_id, context.user_id),
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
    set nickStyle(v) { this._nickStyle = v; }
    get isCoolQPro() { return this._CoolQPro; }

    getNick(user) {
        if (user) {
            let { user_id, nickname, card,    qq, name, groupCard, } = user.sender;
            user_id = user_id || qq || '';

            if (this._nickStyle === 'groupcard') {
                return card || groupCard || nickname || name || user_id.toString();
            } else if (this._nickStyle === 'nick') {
                return nickname || name || user_id.toString();
            } else {
                return user_id.toString();
            }
        } else {
            return '';
        }
    }

    getTitle(user) {
        if (user) {
            let { title,  honor } = user.sender;
            return !title && !honor ? '' : (title||honor);
        } else return '';
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

    async groupMemberInfo(group, qq) {
        const info = await this._client('get_group_member_info', {
            group_id: group,
            user_id: qq,
            no_cache: true,
        });
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

    _fetchFile(path, type) {
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
                url: `${apiRoot}get_${type}?file=${path}`,
				full_path: true,
                encoding: null,
                headers: headers,
            }, (err, httpResponse, body) => {
                if (err) {
                    reject(err);
                } else if (httpResponse >= 400) {
                    reject(new Error(`HTTP Error ${httpResponse} while fetching files`));
                } else {
					const info = JSON.parse(body);
                    resolve(info.data.file);
                }
            });
        });
    }

    async image(file) {
        // 获取cqimg文件内容中的实际url
        const url = await this._fetchFile(`${file}`, 'image');
		// test
		await new Promise(r => setTimeout(r, 1000));
        return url;
    }

    async voice(file) {
        const url = await this._fetchFile(`${file}`, 'record');
		// test
		await new Promise(r => setTimeout(r, 1000));
		return url;
    }

    async start() {
        if (!this._started) {
            this._started = true;
            this._client.listen(this._port, this._host);
            winston.info(`QQBot (HTTP API) is listening at ${this._host}:${this._port}...`);
        }
    }

    async stop() {
        if (this._started) {
            this._started = false;
            this._client.stop();
        }
    }
}

module.exports = QQHttpApiMessageHandler;
