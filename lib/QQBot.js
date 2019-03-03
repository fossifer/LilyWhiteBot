/*
 * 酷 Q 機器人介面
 *
 * 與 cqsocketapi（https://github.com/mrhso/cqsocketapi）配合使用
 */

'use strict';

const dgram = require('dgram');
const { TextEncoder, TextDecoder, toLF, toCRLF } = require('ishisashiencoding');
const EventEmitter = require('events');
const path = require('path');
const fs = require('fs');

const MAX_LEN = 33025; // 發送時的最大長度

let gminfoCache = new Map();
let pinfoCache = new Map();
let finfoCache = new Map();
let ginfoCache = new Map();

const g2u = new TextDecoder('GB 18030-2000');
const u2g = new TextEncoder('GB 18030-2000');

const base642str = (str, unicode = false) => {
    let buf = Buffer.from(str, 'base64');
    if (unicode) {
        // 接收時轉為 LF
        return toLF(buf.toString());
    } else {
        return toLF(g2u.decode(buf));
    }
};

const str2base64 = (str, unicode = false) => {
    if (!str) {
        // 酷 Q 部分使用 sscanf_s 拆分各數據，若遇到空數據則會不正常，故使用 0x00 對應的 AA== 傳輸過去
        // 不過 JS 的 split 就沒有這種問題
        return 'AA==';
    } else if (unicode) {
        // 傳給酷 Q 時轉為 CR LF
        return Buffer.from(toCRLF(str)).toString('base64');
    } else {
        let s = u2g.encode(toCRLF(str));
        return Buffer.from(s).toString('base64');
    }
};

const buf2str = (buffer, left, right, unicode = false) => {
    let temp = buffer.slice(left, right);
    if (unicode) {
        return toLF(temp.toString());
    } else {
        return toLF(g2u.decode(temp));
    }
};

/**
 * 將 Base64 格式的使用者資訊轉為 Object
 * @param  {string} str 從 Server 接收的 Base64 碼
 * @return {object}     包含具體使用者資訊的 Object
 */
const parseStrangerInfo = (str) => {
    if (str === '(null)' || !str) {
        return {};
    }

    if (pinfoCache.has(str)) {
        return pinfoCache.get(str);
    }

    let obj = {};
    let r = obj;

    try {
        let hi, lo;
        let strlen;
        let offset;

        let raw = Buffer.from(str, 'base64');

        // QQ 號
        hi = raw.readUInt32BE(0);
        lo = raw.readUInt32BE(4);
        obj.qq = hi*4294967296 + lo;

        offset = 8;

        // 昵稱
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.name = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 性別
        let gender = raw.readUInt32BE(offset);
        obj.gender = gender === 0 ? 'male' : (gender === 255 ? '' : 'female');
        offset += 4;

        // 年齡
        obj.age = raw.readUInt32BE(offset);
        offset += 4;

        let r = Object.freeze(obj);
        pinfoCache.set(str, r);
    } finally {
        return r;
    }
};

/**
 * 將 Base64 格式的群成員資訊轉為 Object
 * @param  {string} str 從 Server 接收的 Base64 碼
 * @return {object}     包含具體使用者資訊的 Object
 */
const parseGroupMemberInfo = (str) => {
    if (str === '(null)' || !str) {
        return {};
    }

    if (gminfoCache.has(str)) {
        return gminfoCache.get(str);
    }

    let obj = {};
    let r = obj;

    try {
        let hi, lo;
        let strlen;
        let offset;

        let raw = Buffer.from(str, 'base64');

        // 群號
        hi = raw.readUInt32BE(0);
        lo = raw.readUInt32BE(4);
        obj.group = hi*4294967296 + lo;

        // QQ 號
        hi = raw.readUInt32BE(8);
        lo = raw.readUInt32BE(12);
        obj.qq = hi*4294967296 + lo;

        offset = 16;

        // 昵稱
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.name = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 群名片
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.rawGroupCard = buf2str(raw, offset, offset + strlen, this._unicode);
        obj.groupCard = obj.rawGroupCard.replace(/<.*?>/gu, '');
        offset += strlen;

        // 性別
        let gender = raw.readUInt32BE(offset);
        obj.gender = gender === 0 ? 'male' : (gender === 255 ? '' : 'female');
        offset += 4;

        // 年齡
        obj.age = raw.readUInt32BE(offset);
        offset += 4;

        // 區域
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.area = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 入群時間戳
        obj.joinTime = raw.readUInt32BE(offset);
        offset += 4;

        // 上次發言
        obj.lastSpeakTime = raw.readUInt32BE(offset);
        offset += 4;

        // 群等級
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.level = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 權限
        let right = raw.readUInt32BE(offset);
        obj.userright = right === 3 ? 'creator' : (right === 2 ? 'admin' : 'member');
        offset += 4;

        // 是否有不良記錄
        obj.hasBadRecord = Boolean(raw.readUInt32BE(offset));
        offset += 4;

        // 群專屬頭銜
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.honor = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 專屬頭銜過期時間
        obj.honorExpirationTime = raw.readInt32BE(offset);
        offset += 4;

        // 能否修改群名片
        obj.isGroupCardEditable = Boolean(raw.readUInt32BE(offset));
        offset += 4;

        r = Object.freeze(obj);
        gminfoCache.set(str, r);
    } finally {
        return r;
    }
};

/**
 * 將 Base64 格式的檔案資訊轉為 Object
 * @param  {string} str 從 Server 接收的 Base64 碼
 * @return {object}     包含具體檔案資訊的 Object
 */
const parseFileInfo = (str) => {
    if (str === '(null)' || !str) {
        return {};
    }

    if (finfoCache.has(str)) {
        return finfoCache.get(str);
    }

    let obj = {};
    let r = obj;

    try {
        let hi, lo;
        let strlen;
        let offset;

        let raw = Buffer.from(str, 'base64');

        // ID
        strlen = raw.readUInt16BE(0);
        offset = 2;
        obj.id = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 檔案名
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.name = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        // 大小
        hi = raw.readUInt32BE(offset);
        lo = raw.readUInt32BE(offset + 4);
        obj.size = hi*4294967296 + lo;
        offset += 8;

        // BusID
        hi = raw.readUInt32BE(offset);
        lo = raw.readUInt32BE(offset + 4);
        obj.busid = hi*4294967296 + lo;
        offset += 8;

        r = Object.freeze(obj);
        finfoCache.set(str, r);
    } finally {
        return r;
    }
};

/**
 * 將 Base64 格式的 QQ 群資訊轉為 Object
 * @param  {string} str 從 Server 接收的 Base64 碼
 * @return {object}     包含具體 QQ 群資訊的 Object
 */
const parseGroupInfo = (str) => {
    if (str === '(null)' || !str) {
        return {};
    }

    if (ginfoCache.has(str)) {
        return ginfoCache.get(str);
    }

    let obj = {};
    let r = obj;

    try {
        let hi, lo;
        let strlen;
        let offset;

        let raw = Buffer.from(str, 'base64');

        // 群號
        hi = raw.readUInt32BE(0);
        lo = raw.readUInt32BE(4);
        obj.group = hi*4294967296 + lo;
        offset = 8;

        // 群名
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.name = buf2str(raw, offset, offset + strlen, this._unicode);
        offset += strlen;

        r = Object.freeze(obj);
        ginfoCache.set(str, r);
    } finally {
        return r;
    }
};

const faces = {
    0: '惊讶', 1: '撇嘴', 2: '色', 3: '发呆', 4: '得意', 5: '流泪', 6: '害羞', 7: '闭嘴', 8: '睡', 9: '大哭',
    10: '尴尬', 11: '发怒', 12: '调皮', 13: '呲牙', 14: '微笑', 15: '难过', 16: '酷', 17: '非典', 18: '抓狂', 19: '吐',
    20: '偷笑', 21: '可爱', 22: '白眼', 23: '傲慢', 24: '饥饿', 25: '困', 26: '惊恐', 27: '流汗', 28: '憨笑', 29: '悠闲',
    30: '奋斗', 31: '咒骂', 32: '疑问', 33: '嘘……', 34: '晕', 35: '折磨', 36: '衰', 37: '骷髅', 38: '敲打', 39: '再见',
    40: '闪人', 41: '发抖', 42: '爱情', 43: '跳跳', 44: '找', 45: '美眉', 46: '猪头', 47: '猫咪', 48: '小狗', 49: '拥抱',
    50: '钱', 51: '灯泡', 52: '酒杯', 53: '蛋糕', 54: '闪电', 55: '炸弹', 56: '刀', 57: '足球', 58: '音乐', 59: '便便',
    60: '咖啡', 61: '饭', 62: '药丸', 63: '玫瑰', 64: '凋谢', 65: '吻', 66: '爱心', 67: '心碎', 68: '会议', 69: '礼物',
    70: '电话', 71: '时间', 72: '邮件', 73: '电视', 74: '太阳', 75: '月亮', 76: '赞', 77: '踩', 78: '握手', 79: '胜利',
    80: '多多', 81: '美女', 82: '汉良', 83: '毛毛', 84: 'Q 仔', 85: '飞吻', 86: '怄火', 87: '白酒', 88: '汽水', 89: '西瓜',
    90: '下雨', 91: '多云', 92: '雪人', 93: '星星', 94: '女', 95: '男', 96: '冷汗', 97: '擦汗', 98: '抠鼻', 99: '鼓掌',
    100: '糗大了', 101: '坏笑', 102: '左哼哼', 103: '右哼哼', 104: '哈欠', 105: '鄙视', 106: '委屈', 107: '快哭了', 108: '阴险', 109: '亲亲',
    110: '吓', 111: '可怜', 112: '菜刀', 113: '啤酒', 114: '篮球', 115: '乒乓', 116: '示爱', 117: '瓢虫', 118: '抱拳', 119: '勾引',
    120: '拳头', 121: '差劲', 122: '爱你', 123: 'NO', 124: 'OK', 125: '转圈', 126: '磕头', 127: '回头', 128: '跳绳', 129: '挥手',
    130: '激动', 131: '街舞', 132: '献吻', 133: '左太极', 134: '右太极', 135: '招财进宝', 136: '双喜', 137: '鞭炮', 138: '灯笼', 139: '发财',
    140: 'K 歌', 141: '购物', 142: '邮件', 143: '帅', 144: '喝彩', 145: '祈祷', 146: '爆筋', 147: '棒棒糖', 148: '喝奶', 149: '下面',
    150: '香蕉', 151: '飞机', 152: '开车', 153: '高铁左车头', 154: '车厢', 155: '高铁右车头', 156: '多云', 157: '下雨', 158: '钞票', 159: '熊猫',
    160: '灯泡', 161: '风车', 162: '闹钟', 163: '打伞', 164: '彩球', 165: '钻戒', 166: '沙发', 167: '纸巾', 168: '药', 169: '手枪',
    170: '青蛙', 171: '茶', 172: '眨眼睛', 173: '泪奔', 174: '无奈', 175: '卖萌', 176: '小纠结', 177: '喷血', 178: '斜眼笑', 179: 'Doge',
    180: '惊喜', 181: '骚扰', 182: '笑哭', 183: '我最美', 184: '河蟹', 185: '羊驼', 186: '栗子', 187: '幽灵', 188: '蛋', 189: '马赛克',
    190: '菊花', 191: '肥皂', 192: '红包', 193: '大笑', 194: '不开心', 195: '啊', 196: '惶恐', 197: '冷漠', 198: '呃', 199: '好棒',
    200: '拜托', 201: '点赞', 202: '无聊', 203: '托脸', 204: '吃', 205: '送花', 206: '害怕', 207: '花痴', 208: '小样儿', 209: '脸红',
    210: '飙泪', 211: '我不看', 212: '托腮', 213: '哇哦', 214: '啵啵', 215: '糊脸', 216: '拍头', 217: '扯一扯', 218: '舔一舔', 219: '蹭一蹭',
    220: '拽炸天', 221: '顶呱呱', 222: '抱抱', 223: '暴击', 224: '开枪', 225: '撩一撩', 226: '拍桌', 227: '拍手', 228: '恭喜', 229: '干杯',
    230: '嘲讽', 231: '哼', 232: '佛系', 233: '掐一掐',
};

/**
 * 去除接收訊息中的 CQ 碼（酷 Q 專用碼，包括表情、繪文字、相片等資料），將其換為「[表情名稱]」、「[图片]」等文字。
 * @param  {string} Message 已解碼並轉為 UTF-8 之後的訊息
 * @return {string} 去除 CQ 碼之後的文字
 */
const parseMessage = (message) => {
    let images = [];
    let records = [];
    let at = {};

    let text = message.replace(/\[CQ:(.*?),(.*?)\]/gu, (_, type, param) => {
        let tmp;
        let tmp1;
        let tmp2;
        switch (type) {
            case 'face':
                // [CQ:face,id=13]
                tmp = param.match(/(?:^|,)id=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    return `[${faces[parseInt(tmp[1])]}]`;
                } else {
                    return '[表情]';
                }

            case 'emoji':
                // [CQ:emoji,id=128052]
                tmp = param.match(/(?:^|,)id=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    return String.fromCodePoint(tmp[1]);
                } else {
                    return '';
                }

            case 'bface':
                // [CQ:bface,p=10278,id=42452682486D91909B7A513B8BFBC3C6]
                // TODO 取得表情內容
                return '[原创表情]';

            case 'sface':
                // [CQ:sface,id=851970]
                // TODO 取得表情內容
                return '[小表情]';

            case 'image':
                // [CQ:image,file=0792531B8B74FE6F86B87ED6A3958779.png]
                tmp = param.match(/(?:^|,)file=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    images.push(tmp[1]);
                    return '[图片]';
                } else {
                    return '';
                }

            case 'rich':
                // 分享音樂 [CQ:rich,url=http://music.163.com/song/504733843/?userid=263400453,text= 新宝島 BENI ]
                // 協議不支援 [CQ:rich,text=QQ天气提示 升级QQ查看天气]
                tmp1 = param.match(/(?:^|,)url=(.*?)(?:,|$)/u);
                tmp2 = param.match(/(?:^|,)text=(.*?)(?:,|$)/u);
                if (tmp1 && tmp1[1]) {
                    return `[分享链接：${tmp1[1]}]`;
                } else if (tmp2 && tmp2[1]) {
                    return `[${tmp2[1]}]`;
                } else {
                    return '';
                }

            case 'record':
                // 一般語音為 [CQ:record,file=C091016F9A0CCFF1741AF0B442BD4F70.silk]
                // 領語音紅包為 [CQ:record,file=C091016F9A0CCFF1741AF0B442BD4F70.silk,hb=true]
                // 依據客户端之不同，可能是 silk，也可能是 amr
                tmp = param.match(/(?:^|,)file=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    records.push(tmp[1]);
                    return '[语音]';
                } else {
                    return '';
                }

            case 'at':
                // [CQ:at,qq=1145759243]
                tmp = param.match(/(?:^|,)qq=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    if (tmp[1] === 'all') {
                        return '@全体成员';
                    } else {
                        at[tmp[1]] = true;
                        return `@${tmp[1]}`;                // 只給出 QQ 號，至於應該 @ 什麼內容，讓使用者處理吧
                    }
                } else {
                    return '';
                }

            case 'share':
                // [CQ:share,url=http://www.bilibili.com/video/av42585280?share_medium=android&amp;share_source=qq&amp;bbid=XZ97F38904CBFC1747BFE02321AFCB3A3D933&amp;ts=1549692084426,title=三天之内,content=给生活找点乐子~,image=http://url.cn/5AEq2ju]
                tmp = param.match(/(?:^|,)url=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    return `[分享链接：${tmp[1]}]`;
                } else {
                    return '';
                }

            case 'hb':
                // [CQ:hb,title=恭喜发财]
                tmp = param.match(/(?:^|,)title=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    return `[红包：${tmp[1]}]`;
                } else {
                    return '';
                }

            case 'sign':
                // [CQ:sign,title=我过来签个到啦,image=https://p.qpic.cn/qunsign/0/sign_30cc0f793397325b74be99fabd5f9cfcjs0qje77/750]
                tmp = param.match(/(?:^|,)title=(.*?)(?:,|$)/u);
                if (tmp && tmp[1]) {
                    return `[签到：${tmp[1]}]`;
                } else {
                    return '';
                }

            case 'location':
                // [CQ:location,lat=23.081961,lon=113.453941,title=大吉沙,content=广东省广州市黄埔区,style=1]
                tmp = [];
                tmp1 = param.match(/(?:^|,)title=(.*?)(?:,|$)/u);
                tmp2 = param.match(/(?:^|,)content=(.*?)(?:,|$)/u);
                if (tmp1 && tmp1[1]) {
                    tmp.push(tmp1[1]);
                }
                if (tmp2 && tmp2[1]) {
                    tmp.push(tmp2[1]);
                }
                if (tmp.length > 0) {
                    return `[位置：${tmp.join(' ')}]`;
                } else {
                    return '';
                }

            case 'contact':
                // 群邀請 [CQ:contact,id=609486016,type=group]
                // 好友邀請 [CQ:contact,id=1145759243,type=qq]
                tmp1 = param.match(/(?:^|,)id=(.*?)(?:,|$)/u);
                tmp2 = param.match(/(?:^|,)type=(.*?)(?:,|$)/u);
                if (tmp1 && tmp1[1] && tmp2 && tmp2[1] === 'group') {
                    return `[群邀请：${tmp1[1]}]`;
                } else if (tmp1 && tmp1[1] && tmp2 && tmp2[1] === 'qq') {
                    return `[好友邀请：${tmp1[1]}]`;
                } else {
                    return '';
                }

            default:
                return '';
        }
    });

    // at 去重
    let ats = [];
    for (let k in at) {
        ats.push(parseInt(k));
    }

    text = text.replace(/&#91;/gu, '[').replace(/&#93;/gu, ']').replace(/&amp;/gu, '&');

    return {
        text: text,
        extra: {
            images: images,
            records: records,
            ats: ats,
        },
        raw: message,
    };
};

class QQBot extends EventEmitter {
    constructor (options = {}) {
        super();
        this._started = false;
        this._debug = options.debug;
        this._serverHost = options.host || '127.0.0.1';
        this._serverPort = options.port || 11235;
        this._nick = undefined;
        this._timeoutCounter = 0;
        this._timeoutTimer = null;
        this._isPro = options.CoolQPro;
        this._unicode = options.unicode;
        this._qq = undefined;
        // 表示酷 Q 所在環境中的 CoolQ Socket API 插件目錄
        this._cqAppDir = undefined;
        this._setAppDir = options.appDir;
        // 表示實際環境的 CoolQ Socket API 插件目錄，需要自己設定
        // Windows 用家沒填也無事，但酷 Q on Docker 用家務必準確設定！
        this._appDir = this._setAppDir;
    }

    _log(message, isError) {
        if (this._debug) {
            let date = new Date();
            let zone = - date.getTimezoneOffset();
            let dateStr = new Date(date.getTime() + 60000 * zone).toISOString();
            let zoneStr;
            if (zone > 0) {
                zoneStr = `UTC+${zone / 60}`;
            } else if (zone === 0) {
                zoneStr = `UTC`;
            } else {
                zoneStr = `UTC${zone / 60}`;
            }
            let output = `[${dateStr.substring(0, 10)} ${dateStr.substring(11, 19)} (${zoneStr})] ${message}`;

            if (isError) {
                console.error(output);
            } else {
                console.log(output);
            }
        }
    }

    start() {
        if (this._started) {
            return;
        }

        this._socket = dgram.createSocket('udp4');

        this._timeoutCounter = 0;
        this._timeoutTimer = setInterval(() => {
            if (this._started) {
                this._timeoutCounter++;
                if (this._timeoutCounter >= 300) {
                    this._timeoutCounter = 0;
                    this.emit('Timeout');
                }
            }
        }, 1000);

        this._socket.on('message', (msg, rinfo) => {
            this._log(`recv: ${msg}`);

            try {

                let frames = msg.toString().split(' ');

                let command = frames[0];

                // 除錯用
                // this.emit('Raw', msg.toString());

                let msgdata;
                let file;
                let raw;
                let offset;
                let strlen;
                let number;
                let info;

                switch (command) {
                    case 'ServerHello':
                        this._timeoutCounter = 0;
                        this.emit('ServerHello', {
                            timeout: parseInt(frames[1]),
                            prefix:  parseInt(frames[2]),
                            payload: parseInt(frames[3]),
                            frame:   parseInt(frames[4]),
                        });
                        break;

                    case 'LoginNick':
                        this._nick = base642str(frames[1], this._unicode);
                        this.emit('LoginNick', this._nick);
                        break;

                    case 'GroupMessage':
                        msgdata = parseMessage(base642str(frames[3], this._unicode));
                        let userinfo = parseGroupMemberInfo(frames[6]);

                        // 匿名消息
                        if (parseInt(frames[2]) === 80000000) {
                            let info = base642str(frames[7], this._unicode);
                            let nick = info.substring(10).split('\0')[0];

                            userinfo = {
                                qq: 80000000,
                                name: '匿名消息',
                                groupCard: nick,
                                anonymous: frames[7],
                            };
                            // Pro 得到的消息內容不含 Nick，但 Air 中含，要去掉
                            if (!this._isPro) {
                                msgdata = parseMessage(msgdata.raw.substring(`&#91;${userinfo.groupCard}&#93;:`.length));
                            }
                        }

                        this.emit('GroupMessage', {
                            group: parseInt(frames[1]),
                            from:  parseInt(frames[2]),
                            text:  msgdata.text,
                            extra: msgdata.extra,
                            type:  parseInt(frames[4]),
                            id:    parseInt(frames[5]),
                            user:  userinfo,
                            raw:   msgdata.raw,
                        });
                        break;

                    case 'PrivateMessage':
                        msgdata = parseMessage(base642str(frames[2], this._unicode));

                        this.emit('PrivateMessage', {
                            from:  parseInt(frames[1]),
                            text:  msgdata.text,
                            extra: msgdata.extra,
                            type:  parseInt(frames[3]),
                            id:    parseInt(frames[4]),
                            user:  parseStrangerInfo(frames[5]),
                            raw:   msgdata.raw,
                        });
                        break;

                    case 'DiscussMessage':
                        msgdata = parseMessage(base642str(frames[3], this._unicode));

                        this.emit('DiscussMessage', {
                            group: parseInt(frames[1]),
                            from:  parseInt(frames[2]),
                            text:  msgdata.text,
                            extra: msgdata.extra,
                            type:  parseInt(frames[4]),
                            id:    parseInt(frames[5]),
                            user:  parseStrangerInfo(frames[6]),
                            raw:   msgdata.raw,
                        });
                        break;

                    case 'GroupAdmin':
                        this.emit('GroupAdmin', {
                            group:  parseInt(frames[1]),
                            type:   parseInt(frames[2]),      // 1: 取消管理員，2: 設置管理員
                            target: parseInt(frames[3]),
                            time:   parseInt(frames[4]),
                            user:   parseGroupMemberInfo(frames[5]),
                        });
                        break;

                    case 'GroupMemberDecrease':
                        this.emit('GroupMemberDecrease', {
                            group:       parseInt(frames[1]),
                            adminQQ:     parseInt(frames[2]),      // 管理員 QQ，自行離開時為 0
                            target:      parseInt(frames[3]),
                            type:        parseInt(frames[4]),      // 1: 自行離開，2: 他人被踢，3: 自己被踢
                            time:        parseInt(frames[5]),
                            user_admin:  parseGroupMemberInfo(frames[6]),
                            user_target: parseStrangerInfo(frames[7]),
                        });
                        break;

                    case 'GroupMemberIncrease':
                        this.emit('GroupMemberIncrease', {
                            group:       parseInt(frames[1]),
                            admin:       parseInt(frames[2]),      // 管理員 QQ
                            target:      parseInt(frames[3]),
                            type:        parseInt(frames[4]),      // 1: 管理員同意，2: 管理員邀請
                            time:        parseInt(frames[5]),
                            user_target: parseGroupMemberInfo(frames[6]),
                        });
                        break;

                    case 'GroupMemberInfo':
                        this.emit('GroupMemberInfo', parseGroupMemberInfo(frames[1]));
                        break;

                    case 'StrangerInfo':
                        this.emit('StrangerInfo', parseStrangerInfo(frames[1]));
                        break;

                    case 'FriendAdded':
                        this.emit('FriendAdded', {
                            from: parseInt(frames[1]),
                            type: parseInt(frames[2]),
                            time: parseInt(frames[3]),
                            user: parseStrangerInfo(frames[4]),
                        });
                        break;

                    case 'RequestAddFriend':
                        this.emit('RequestAddFriend', {
                            from: parseInt(frames[1]),
                            text: parseMessage(base642str(frames[2], this._unicode)),
                            flag: base642str(frames[3], this._unicode),
                            type: parseInt(frames[4]),
                            time: parseInt(frames[5]),
                            user: parseStrangerInfo(frames[6]),
                        });
                        break;

                    case 'RequestAddGroup':
                        this.emit('RequestAddGroup', {
                            group: parseInt(frames[1]),
                            from:  parseInt(frames[2]),
                            text:  parseMessage(base642str(frames[3], this._unicode)),
                            flag:  base642str(frames[4], this._unicode),
                            type:  parseInt(frames[5]),
                            time:  parseInt(frames[6]),
                            user:  parseStrangerInfo(frames[7]),
                        });
                        break;

                    case 'GroupUpload':
                        this.emit('GroupUpload', {
                            group: parseInt(frames[1]),
                            from:  parseInt(frames[2]),
                            file:  parseFileInfo(frames[3]),
                            type:  parseInt(frames[4]),
                            time:  parseInt(frames[5]),
                            user:  parseGroupMemberInfo(frames[6]),
                        });
                        break;

                    case 'GroupMemberList':
                        file = path.join(this._appDir, base642str(frames[1], this._unicode).substring(this._cqAppDir.length).replace(/\\/gu, '/'));
                        raw = Buffer.from(fs.readFileSync(file).toString(), 'base64');
                        number = raw.readUInt32BE(0);
                        offset = 4;
                        info = [];
                        while (offset < raw.length) {
                            strlen = raw.readUInt16BE(offset);
                            offset += 2;
                            info.push(parseGroupMemberInfo(raw.slice(offset, offset + strlen).toString('base64')));
                            offset += strlen;
                        }

                        this.emit('GroupMemberList', {
                            group : parseInt(path.basename(file).split('.')[0]),
                            number: number,
                            info  : info,
                        });
                        break;

                    case 'Cookies':
                        // 沒見過把 Cookie 單獨抽一部分使用的，所以整個輸出
                        this.emit('Cookies', base642str(frames[1], this._unicode));
                        break;

                    case 'CsrfToken':
                        this.emit('CsrfToken', frames[1]);
                        break;

                    case 'LoginQQ':
                        this._qq = parseInt(frames[1]);
                        this.emit('LoginQQ', this._qq);
                        break;

                    case 'AppDirectory':
                        this._cqAppDir = base642str(frames[1], this._unicode);
                        if (!this._setAppDir) {
                            this._appDir = this._cqAppDir;
                        };
                        this.emit('AppDirectory', this._cqAppDir);
                        break;

                    case 'PrivateMessageID':
                        this.emit('PrivateMessageID', {
                            id:      parseInt(frames[1]),
                            number:  parseInt(frames[2]),
                        });
                        break;

                    case 'GroupMessageID':
                        this.emit('GroupMessageID', {
                            id:      parseInt(frames[1]),
                            number:  parseInt(frames[2]),
                        });
                        break;

                    case 'DiscussMessageID':
                        this.emit('DiscussMessageID', {
                            id:      parseInt(frames[1]),
                            number:  parseInt(frames[2]),
                        });
                        break;

                    case 'GroupList':
                        file = path.join(this._appDir, base642str(frames[1], this._unicode).substring(this._cqAppDir.length).replace(/\\/gu, '/'));
                        raw = Buffer.from(fs.readFileSync(file).toString(), 'base64');
                        number = raw.readUInt32BE(0);
                        offset = 4;
                        info = [];
                        while (offset < raw.length) {
                            strlen = raw.readUInt16BE(offset);
                            offset += 2;
                            info.push(parseGroupInfo(raw.slice(offset, offset + strlen).toString('base64')));
                            offset += strlen;
                        }

                        this.emit('GroupList', {
                            number: number,
                            info  : info,
                        });
                        break;

                    case 'Record':
                        this.emit('Record', {
                            file:   base642str(frames[1], this._unicode),
                            source: base642str(frames[2], this._unicode),
                            format: base642str(frames[3], this._unicode),
                        });
                        break;

                    default:
                        // 其他訊息
                        this._log(`Unknown message: ${msg.toString()}`);
                        break;
                }
            } catch (ex) {
                this.emit('Error', {
                    event: 'receive',
                    context: msg.toString(),
                    error: ex,
                });
            }
        });

        this._socket.on('listening', () => {
            var address = this._socket.address();
            this._log(`Server listening at ${address.address}:${address.port}`);
            this._clientPort = address.port;

            const sayHello = () => {
                if (this._started) {
                    let hello = `ClientHello ${this._clientPort}`;
                    this._socket.send(hello, 0, hello.length, this._serverPort, this._serverHost);

                    // 原本此處是單獨放在啟動後一秒執行（無週期），但如此先啟動 Bot 再啟動酷 Q 就得不到這些信息
                    // 所以便與發送 ClientHello 一起執行，這樣只要和酷 Q 開始通信就一定能正常獲取
                    let get_nick = `LoginNick`;
                    let get_qq = `LoginQQ`;
                    let get_dir = `AppDirectory`;
                    try {
                        this._socket.send(get_nick, 0, get_nick.length, this._serverPort, this._serverHost);
                    } catch (ex) {
                        this.emit('Error', {
                            event: 'connect',
                            context: 'LoginNick',
                            error: ex,
                        });
                    }
                    try {
                        this._socket.send(get_qq, 0, get_qq.length, this._serverPort, this._serverHost);
                    } catch (ex) {
                        this.emit('Error', {
                            event: 'connect',
                            context: 'LoginQQ',
                            error: ex,
                        });
                    }
                    try {
                        this._socket.send(get_dir, 0, get_dir.length, this._serverPort, this._serverHost);
                    } catch (ex) {
                        this.emit('Error', {
                            event: 'connect',
                            context: 'AppDirectory',
                            error: ex,
                        });
                    }

                    setTimeout(sayHello, 120000);
                }
            };
            sayHello();

        });

        this._started = true;
        this._socket.bind();
    }

    stop() {
        if (!this._started) {
            return;
        }

        this._socket.close();
        this._started = false;

        if (this._timeoutTimer) {
            clearInterval(this._timeoutTimer);
            this._timeoutTimer = null;
        }

        this._nick = undefined;
        this._qq = undefined;
        this._cqAppDir = undefined;
        this._appDir = this._setAppDir;
    }

    _rawSend(msg) {
        try {
            this._socket.send(msg, 0, msg.length < MAX_LEN ? msg.length : MAX_LEN, this._serverPort, this._serverHost);
        } catch (ex) {
            this.emit('Error', {
                event: 'send',
                context: msg,
                error: ex,
            });
        }
    }

    escape(text) {
        return text.replace(/&/gu, '&amp;').replace(/\[/gu, '&#91;').replace(/\]/gu, '&#93;');
    }

    send(type, target, message, options, number = Date.now()) {
        if (type === 'PrivateMessage' || type === 'GroupMessage' || type === 'DiscussMessage') {
            let message2 = message;
            if (!(options && options.noEscape)) {
                message2 = this.escape(message);
            }

            let answer = `${type} ${target} ${str2base64(message2, this._unicode)} ${number}`;
            this._rawSend(answer);
        }
    }

    // 關於 number 之用法，詳見附錄
    sendPrivateMessage(qq, message, options, number = Date.now()) {
        this.send('PrivateMessage', qq, message, options, number);
    }

    sendGroupMessage(group, message, options, number = Date.now()) {
        this.send('GroupMessage', group, message, options, number);
    }

    sendDiscussMessage(discuss, message, options, number = Date.now()) {
        this.send('DiscussMessage', discuss, message, options, number);
    }

    get nick() {
        return this._nick;
    }

    get isCoolQPro() {
        return this._isPro;
    }

    groupMemberInfo(group, qq, noCache = true) {
        let cmd = `GroupMemberInfo ${group} ${qq} ${noCache ? 1 : 0}`;
        this._rawSend(cmd);
    }

    strangerInfo(qq, noCache = true) {
        let cmd = `StrangerInfo ${qq} ${noCache ? 1 : 0}`;
        this._rawSend(cmd);
    }

    groupBan(group, qq, duration = 1800) {
        let cmd = `GroupBan ${group} ${qq} ${duration}`;
        this._rawSend(cmd);
    }

    // ClientHello 會定時發送，一般不需要手動發送
    // 因此該函數僅適用於 Debug，正常情況沒必要使用
    sayHello() {
        let cmd = `ClientHello ${this._clientPort}`;
        this._rawSend(cmd);
    }

    // LoginNick 會隨發送 ClientHello 自動獲取
    // 當然此函數可以確保獲得最新的 Nick
    loginNick() {
        let cmd = `LoginNick`;
        this._rawSend(cmd);
    }

    sendLike(qq, times = 1) {
        let cmd = `Like ${qq} ${times}`;
        this._rawSend(cmd);
    }

    // rejectAddRequest 為 true 則不再接收此人加群申請，慎用
    groupKick(group, qq, rejectAddRequest = false) {
        let cmd = `GroupKick ${group} ${qq} ${rejectAddRequest ? 1 : 0}`;
        this._rawSend(cmd);
    }

    groupAdmin(group, qq, setAdmin = true) {
        let cmd = `GroupAdmin ${group} ${qq} ${setAdmin ? 1 : 0}`;
        this._rawSend(cmd);
    }

    groupWholeBan(group, enableBan = true) {
        let cmd = `GroupWholeBan ${group} ${enableBan ? 1 : 0}`;
        this._rawSend(cmd);
    }

    // anonymous 為 GroupMessage 收到的一串記錄匿名信息之 Base64
    // 可在收到 GroupMessage 時的 user.anonymous 取得
    groupAnonymousBan(group, anonymous, duration = 1800) {
        let cmd = `GroupAnonymousBan ${group} ${anonymous} ${duration}`;
        this._rawSend(cmd);
    }

    groupAnonymous(group, enableAnonymous = true) {
        let cmd = `GroupAnonymous ${group} ${enableAnonymous ? 1 : 0}`;
        this._rawSend(cmd);
    }

    groupCard(group, qq, newCard) {
        let cmd = `GroupCard ${group} ${qq} ${str2base64(newCard, this._unicode)}`;
        this._rawSend(cmd);
    }

    // isDismiss 為 true 則解散本群，否則退出
    groupLeave(group, isDismiss = false) {
        let cmd = `GroupLeave ${group} ${isDismiss ? 1 : 0}`;
        this._rawSend(cmd);
    }

    // duration 為 -1 則頭銜永久有效
    groupSpecialTitle(group, qq, newSpecialTitle, duration = -1) {
        let cmd = `GroupSpecialTitle ${group} ${qq} ${str2base64(newSpecialTitle, this._unicode)} ${duration}`;
        this._rawSend(cmd);
    }

    discussLeave(discuss) {
        let cmd = `DiscussLeave ${discuss}`;
        this._rawSend(cmd);
    }

    // responseOperation 為 1 則通過，為 2 則拒絕
    friendAddRequest(responseFlag, responseOperation = 1, remark = '') {
        let cmd = `FriendAddRequest ${str2base64(responseFlag, this._unicode)} ${responseOperation} ${str2base64(remark, this._unicode)}`;
        this._rawSend(cmd);
    }

    // requestType 為 1 則加群，為 2 則邀請
    // responseOperation 為 1 則通過，為 2 則拒絕
    groupAddRequest(responseFlag, requestType = 1, responseOperation = 1, reason = '') {
        let cmd = `GroupAddRequest ${str2base64(responseFlag, this._unicode)} ${requestType} ${responseOperation} ${str2base64(reason, this._unicode)}`;
        this._rawSend(cmd);
    }

    groupMemberList(group) {
        let cmd = `GroupMemberList ${group}`;
        this._rawSend(cmd);
    }

    cookies() {
        let cmd = `Cookies`;
        this._rawSend(cmd);
    }

    csrfToken() {
        let cmd = `CsrfToken`;
        this._rawSend(cmd);
    }

    // LoginQQ 會隨發送 ClientHello 自動獲取
    // 當然此函數可以確保獲得最新的 QQ 號
    loginQQ() {
        let cmd = `LoginQQ`;
        this._rawSend(cmd);
    }

    appDirectory() {
        let cmd = `AppDirectory`;
        this._rawSend(cmd);
    }

    get qq() {
        return this._qq;
    }

    get appDir() {
        return this._appDir;
    }

    deleteMessage(id) {
        let cmd = `DeleteMessage ${id}`;
        this._rawSend(cmd);
    }

    parseMessage(message) {
        return parseMessage(message);
    }

    groupList() {
        let cmd = `GroupList`;
        this._rawSend(cmd);
    }

    record(file, format) {
        let cmd = `Record ${str2base64(file, this._unicode)} ${str2base64(format, this._unicode)}`;
        this._rawSend(cmd);
    }
}

module.exports = QQBot;
