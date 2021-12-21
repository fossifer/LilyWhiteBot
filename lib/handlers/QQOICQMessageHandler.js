/*
 * @name 使用通用介面處理 QQ 訊息
 *
 * 備註：不接收討論組訊息
 *
 * 口令紅包沒有任何跡象，所以只好認為：如果一分鐘之內一句話被重複了三次或以上，說明大家在搶紅包
 */

const MessageHandler = require('./MessageHandler.js');
const Context = require('./Context.js');
const oicq = require('oicq');
const LRU = require("lru-cache");
const { parseMessage: parseCoolQMessage, escape: escapeCoolQStr } = require('../coolq.js');
const { loadConfig } = require('../util.js');
const fs = require('fs');
const winston = require('winston');
const asciify = require('asciify-image');
const readline = require('readline');


class QQOICQMessageHandler extends MessageHandler {
    constructor(config = {}) {
        super();

        let botConfig = config.bot || {};
        let qqOptions = config.options || {};

        // 配置文件兼容性
        for (let key of ['qq', 'passwordMd5', 'platform', 'logLevel', 'kickoff', 'ignoreSelf', 'devicePath', 'reconnInterval']) {
            botConfig[key] = botConfig[key]===undefined ? config[key] : botConfig[key];
        }

        let client = oicq.createClient(botConfig.qq, {
            platform: botConfig.platform || 2,
            log_level: botConfig.logLevel || 'off',
            kickoff: botConfig.kickoff || false,
            ignore_self: botConfig.ignoreSelf===undefined ? true : botConfig.ignoreSelf,
            device_path: botConfig.devicePath || './data/',
            reconn_interval: botConfig.reconnInterval===undefined ? 5 : botConfig.reconnInterval,
            auto_server: botConfig.autoServer===undefined ? true : botConfig.autoServer,
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
        this._passwordMd5 = botConfig.passwordMd5;
        this._platform = botConfig.platform || 2;
        this._logLevel = botConfig.logLevel || 'off';
        this._kickoff = botConfig.kickoff || false;
        this._ignoreSelf = botConfig.ignoreSelf===undefined ? true : botConfig.ignoreSelf;
        this._devicePath = botConfig.devicePath || './data/'
        this._selfCensorship = qqOptions.selfCensorship || false;
        this._badwords = badwords;
        this._ignoreCash = qqOptions.ignoreCash || false;
        this._qq = parseInt(botConfig.qq) || 0;
        this._nickStyle = qqOptions.nickStyle || 'groupcard';
        this._showTitle = qqOptions.showTitle || false;
        this._multiMsgId = qqOptions.multiMsgId || false;
        this._keepSilence = qqOptions.keepSilence || [];

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
            
            if (this._multiMsgId && parsedMsg.extra.multimsg) {
              context.text+=`\n[私聊机器人使用 !qmulti ${parsedMsg.extra.multimsg[0]} 以${parsedMsg.extra.multimsg[1]}]`;
            }

            if (rawdata.anonymous) {
                context.nick = `<匿名消息> ${rawdata.anonymous.name}`;
            }

            if (this._showTitle&&this.getTitle(rawdata)) {
                context.nick = `<${this.getTitle(rawdata)}> ${context.nick}`;
            }

            // 記錄圖片、語音和影片
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
            for (let video of parsedMsg.extra.videos) {
                let fileItem = {
                    client: 'QQ',
                    type: 'video',
                    id: video,
                };
                // onebot在消息上報使用array格式時會有url值，不用去下載語音文件
                if (video.startsWith('http:') || video.startsWith('https:')) {
                    fileItem.url = video;
                } else {
                    // TODO 實現無url影片的獲取（若遇見的話）
                    continue;
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

            // 記錄 reply
            if (parsedMsg.extra.reply) {
              let id = parsedMsg.extra.reply;
              let {retcode, status, error, data} = await this._client.getMsg(id);
              if (status==="ok" && data) {
                let msg = this.parseMessage(data.message);
                let reply = {
                    nick: this.getNick(data),
                    qq: data.user_id,
                    message: this._convertToText(msg),
                    isText: msg.text && true,
                };

                context.extra.reply = reply;
              } else {
                winston.error(`Retcode ${retcode}: ${JSON.stringify(error, null, 2)}`);
              };
            }

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

        client.on('notice.group', async (context) => {
            switch (context.sub_type) {
                case 'admin':
                    // 设置/取消群管理员
                    this.emit('admin', {
                        group: context.group_id,
                        type: !context.set ? 1 : 2, // 1: 取消管理員，2: 設置管理員
                        target: context.user_id,
                        time: context.time,
                        user: await this.groupMemberInfo(context.group_id, context.user_id),
                    });
                    break;

                case 'increase':
                    // 进群
                    this.emit('join', {
                        group: context.group_id,
                        admin: context.operator_id,
                        target: context.user_id,
                        type: context.sub_type === 'approve' ? 1 : 2, // 1: 管理員同意，2: 管理員邀請
                        time: context.time,
                        user_target: await this.groupMemberInfo(context.group_id, context.user_id),
                    });
                    break;

                case 'decrease':
                    if (!context.dismiss) {
                      // 退群或被踢
                      this.emit('leave', {
                          group: context.group_id,
                          admin: context.operator_id, // 管理員 QQ，自行離開時為 0
                          target: context.user_id,
                          type: context.sub_type === 'leave' ? 1 : 2, // 1: 自行離開，2: 他人被踢，3: 自己被踢
                          time: context.time,
                          user_admin: await this.groupMemberInfo(context.group_id, context.operator_id),
                          user_target: await this.strangerInfo(context.user_id),
                      });
                    }
                    break;

                case 'ban':
                    // 禁言或解禁
                    let duration = '';
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
                        group: context.group_id,
                        type: context.sub_type === 'ban' ? 1 : 2, // 1: 禁言，2: 解除禁言
                        admin: context.operator_id, // 管理員 QQ
                        target: context.user_id,
                        time: context.time,
                        duration: context.duration, // 禁言时长，单位秒
                        durstr: duration, // 正常格式禁言时长
                        user_admin: await this.groupMemberInfo(context.group_id, context.operator_id),
                        user_target: await this.groupMemberInfo(context.group_id, context.user_id),
                    });
                    break;
            }
        });



        client.on('system.login', (info)=>{
            switch (info.sub_type) {
                case 'captcha':
                    winston.info('QQBot CAPTCHA required.');
                    //fs.writeFileSync('./data/captcha.jpg', info.image)
                    asciify(info.image, { fit: 'box', width: '100%', }, function (err, asciified) {
                        if (err) throw err;
                        let cstdin = readline.createInterface({ input: process.stdin });
                        console.log(asciified);
                        winston.info('Please enter CAPTCHA code: ')
                        cstdin.on('line', (input)=>{
                            client.captchaLogin(input.trim());
                            cstdin.close();
                        })
                    });
                    break;
                case 'slider':
                    winston.info(`QQBot slider required: ${info.url}`);
                    let sstdin = readline.createInterface({ input: process.stdin });
                    winston.info('Please enter slider ticket: ');
                    sstdin.on('line', (input)=>{
                        client.sliderLogin(input.trim());
                        sstdin.close();
                    })
                    break;
                case 'device':
                    winston.info(`QQBot device lock unlocking required: ${info.url}`);
                    break;
                case 'error':
                    winston.error(`QQBot Error ${info.code}: ${info.message}`);
                    break;
            }
        });

        client.on('system.online', ()=>{
            winston.info('QQBot is ready.');
        });

        client.on('system.offline', (info)=>{
            switch (info.sub_type) {
                case 'network':
                    winston.info('QQBot offline as network has disconnected.');
                    break;
                case 'frozen':
                    winston.error('QQBot offline as account was frozen.');
                    return;
                case 'kickoff':
                    winston.info('QQBot offline as account was logged in elsewhere.');
                    if (this._kickoff) { break; }
                    else return;
                case 'device':
                    winston.error('QQBot offline as device lock needs authentication.');
                    break;
                case 'unknown':
                    winston.error('QQBot offline due to unknown error.');
                    break;
            }
            this._started = false;
            this.start();
        });

        client.on('system.reconn', ()=>{
            winston.info('QQBot attempting to reconnect.');
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

    _convertToText(message) {
        if (message.text) {
          return message.text;
        } else if (message.extra.images.length) {
          return '<Image>';
        } else if (message.extra.records.length) {
          return '<Record>'
        } else {
          return '<Message>';
        }
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
                return await this._client.sendPrivateMsg(realTarget, message, !options.noEscape);
            } else {
                if (options.isPrivate) {
                    return await this._client.sendPrivateMsg(target, message, !options.noEscape);
                } else {
                    return await this._client.sendGroupMsg(target, message, !options.noEscape);
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
        const {retcode, status, error, data:info} = await this._client.getGroupMemberInfo(group, qq, true);
        if (status!=="ok") {
          winston.error(`Retcode ${retcode}: ${JSON.stringify(error, null, 2)}`);
          // 未知情況下曾出現 Retcode 102: code -1 幽灵群员
          return {
            group: group,
            qq: qq,
            name: '',
            groupCard: '',
            rawGroupCard: '',
            gender: '',
            age: '',
            area: '',
            joinTime: '',
            lastSpeakTime: '',
            level: '',
            userright: '',
            hasBadRecord: '',
            honor: '',
            honorExpirationTime: '',
            isGroupCardEditable: false,
          };
        }
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
        const {retcode, status, error, data:info} = await this._client.getStrangerInfo(qq);
        if (status!=="ok") {
          winston.error(`Retcode ${retcode}: ${JSON.stringify(error, null, 2)}`);
          return {
            qq: '',
            name: '',
            gender: '',
            age: '',
          }
        };
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

    async image(file) {
        // 获取cqimg文件内容
        let devicePath = this._devicePath;
        if (!devicePath.endsWith('/')) {
            devicePath += '/';
        };
        const buf = await fs.readFileSync(`${devicePath}image/${file}.cqimg`);
        const text = buf.toString();

        // 获取cqimg文件内容中的实际url
        const info = text.toString('ascii');
        const [, url] = info.match(/url=(.*?)[\r\n]/u) || [];
        return url;
    }

    async voice(file) {
        let devicePath = this._devicePath;
        if (!devicePath.endsWith('/')) {
            devicePath += '/';
        }
        return `${devicePath}data/record/${file}`
    }

    async start() {
        if (!this._started) {
            this._started = true;
            this._client.login(this._passwordMd5);
        }
    }

    async stop() {
        if (this._started) {
            this._started = false;
            this._client.logout();
        }
    }
}

module.exports = QQOICQMessageHandler;
