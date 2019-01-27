/*
 * 酷 Q 機器人介面
 *
 * 與 cqsocketapi（https://github.com/mrhso/cqsocketapi/tree/nodejs）配合使用
 */

/*
 * 普通紅包：[QQ红包]请使用新版手机QQ查收红包。
 * 口令紅包：沒有任何跡象
 */

'use strict';

const dgram = require('dgram');
const { TextEncoder, TextDecoder } = require('text-encoding');
const Buffer = require('buffer').Buffer;
const EventEmitter = require('events').EventEmitter;

const MAX_LEN = 0; // 發送時消息 Base64 的最大長度，0 為不限制

let gminfoCache = new Map();
let pminfoCache = new Map();

const g2u = new TextDecoder('gb18030');
const u2g = new TextEncoder('gb18030', { NONSTANDARD_allowLegacyEncoding: true });

const base642str = (str, unicode = false) => {
    let buf = Buffer.from(str, 'base64');
    if (unicode) {
        return buf.toString();
    } else {
        return g2u.decode(buf);
    }
};

const str2base64 = (str, unicode = false) => {
    if (unicode) {
        return Buffer.from(str).toString('base64');
    } else {
        let s = u2g.encode(str);
        return Buffer.from(s).toString('base64');
    }
};

const buf2str = (buffer, left, right, unicode = false) => {
    let temp = buffer.slice(left, right);
    if (unicode) {
        return temp.toString();
    } else {
        return g2u.decode(temp);
    }
};

const replaceEmoji = (str) => str.replace(/\[CQ:emoji,id=(\d*)\]/g, (_, id) => String.fromCodePoint(id));

/**
 * 將 Base64 格式的使用者資訊轉為 Object
 * @param  {string} str 從 Server 接收的 base64 碼
 * @return {object}     包含具體使用者資訊的 Object
 */
const parseStrangerInfo = (str) => {
    if (str === 'None' || !str) {
        return {};
    }

    if (pminfoCache.has(str)) {
        return pminfoCache.get(str);
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
        obj.name = replaceEmoji(buf2str(raw, offset, offset + strlen, this._unicode));
        offset += strlen;

        // 性別
        let gender = raw.readUInt32BE(offset);
        obj.gender = gender === 0 ? 'male' : (gender === 255 ? '' : 'female');
        offset += 4;

        // TODO: 性別後面有 4 個 00，不知道是什麼東西

        let r = Object.freeze(obj);
        pminfoCache.set(str, r);
    } finally {
        return r;
    }
};

/**
 * 將 Base64 格式的群成員資訊轉為 Object
 * @param  {string} str 從 Server 接收的 base64 碼
 * @return {object}     包含具體使用者資訊的 Object
 */
const parseGroupMemberInfo = (str) => {
    if (str === 'None' || !str) {
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
        obj.name = replaceEmoji(buf2str(raw, offset, offset + strlen, this._unicode));
        offset += strlen;

        // 群名片
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.groupCard = replaceEmoji(buf2str(raw, offset, offset + strlen, this._unicode));
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
        obj.hasBadRecord = raw.readUInt32BE(offset) && true;
        offset += 4;

        // 群專屬名片
        strlen = raw.readUInt16BE(offset);
        offset += 2;
        obj.honor = replaceEmoji(buf2str(raw, offset, offset + strlen, this._unicode));
        offset += strlen;

        // 專屬名片過期時間
        obj.honorExpirationTime = raw.readInt32BE(offset);
        offset += 4;

        // 能否修改群名片
        obj.isGroupCardEditable = raw.readUInt32BE(offset) && true;
        offset += 4;

        r = Object.freeze(obj);
        gminfoCache.set(str, r);
    } finally {
        return r;
    }
};

const faces = {
    0:"惊讶",1:"撇嘴",2:"色",3:"发呆",4:"得意",5:"流泪",6:"害羞",7:"闭嘴",8:"睡",9:"大哭",
    10:"尴尬",11:"发怒",12:"调皮",13:"呲牙",14:"微笑",15:"难过",16:"酷",17:"非典",18:"抓狂",19:"吐",
    20:"偷笑",21:"可爱",22:"白眼",23:"傲慢",24:"饥饿",25:"困",26:"惊恐",27:"流汗",28:"憨笑",29:"悠闲",
    30:"奋斗",31:"咒骂",32:"疑问",33:"嘘……",34:"晕",35:"折磨",36:"衰",37:"骷髅",38:"敲打",39:"再见",
    40:"闪人",41:"发抖",42:"爱情",43:"跳跳",44:"找",45:"美眉",46:"猪头",47:"猫咪",48:"小狗",49:"拥抱",
    50:"钱",51:"灯泡",52:"酒杯",53:"蛋糕",54:"闪电",55:"炸弹",56:"刀",57:"足球",58:"音乐",59:"便便",
    60:"咖啡",61:"饭",62:"药丸",63:"玫瑰",64:"凋谢",65:"吻",66:"爱心",67:"心碎",68:"会议",69:"礼物",
    70:"电话",71:"时间",72:"邮件",73:"电视",74:"太阳",75:"月亮",76:"赞",77:"踩",78:"握手",79:"胜利",
    80:"多多",81:"美女",82:"汉良",83:"毛毛",84:"Q 仔",85:"飞吻",86:"怄火",87:"白酒",88:"汽水",89:"西瓜",
    90:"下雨",91:"多云",92:"雪人",93:"星星",94:"女",95:"男",96:"冷汗",97:"擦汗",98:"抠鼻",99:"鼓掌",
    100:"糗大了",101:"坏笑",102:"左哼哼",103:"右哼哼",104:"哈欠",105:"鄙视",106:"委屈",107:"快哭了",108:"阴险",109:"亲亲",
    110:"吓",111:"可怜",112:"菜刀",113:"啤酒",114:"篮球",115:"乒乓",116:"示爱",117:"瓢虫",118:"抱拳",119:"勾引",
    120:"拳头",121:"差劲",122:"爱你",123:"NO",124:"OK",125:"转圈",126:"磕头",127:"回头",128:"跳绳",129:"挥手",
    130:"激动",131:"街舞",132:"献吻",133:"左太极",134:"右太极",135:"招财进宝",136:"双喜",137:"鞭炮",138:"灯笼",139:"发财",
    140:"K 歌",141:"购物",142:"邮件",143:"帅",144:"喝彩",145:"祈祷",146:"爆筋",147:"棒棒糖",148:"喝奶",149:"下面",
    150:"香蕉",151:"飞机",152:"开车",153:"高铁左车头",154:"车厢",155:"高铁右车头",156:"多云",157:"下雨",158:"钞票",159:"熊猫",
    160:"灯泡",161:"风车",162:"闹钟",163:"打伞",164:"彩球",165:"钻戒",166:"沙发",167:"纸巾",168:"药",169:"手枪",170:"青蛙",
    171:"茶",172:"眨眼睛",173:"泪奔",174:"无奈",175:"卖萌",176:"小纠结",177:"喷血",178:"斜眼笑",179:"doge",180:"惊喜",
    181:"骚扰",182:"笑哭",183:"我最美",184:"河蟹",185:"羊驼",186:"栗子",187:"幽灵",188:"蛋",189:"马赛克",190:"菊花",
    191:"肥皂",192:"红包",193:"大笑",194:"不开心",195:"啊",196:"惶恐",197:"冷漠",198:"呃",199:"好棒",200:"拜托",
    201:"点赞",202:"无聊",203:"托脸",204:"吃",205:"送花",206:"害怕",207:"花痴",208:"小样儿",209:"脸红",210:"飙泪",
    211:"我不看",212:"托腮",213:"哇哦"
};

const PCFaces = { /*PC 版定義*/
    0:"惊讶",1:"撇嘴",2:"色",3:"发呆",4:"得意",5:"流泪",6:"害羞",7:"闭嘴",8:"睡",9:"大哭",
    10:"尴尬",11:"发怒",12:"调皮",13:"呲牙",14:"微笑",15:"难过",16:"酷",17:"表情"/*未定義*/,18:"抓狂",19:"吐",
    20:"偷笑",21:"可爱",22:"白眼",23:"傲慢",24:"饥饿",25:"困",26:"惊恐",27:"流汗",28:"憨笑",29:"大兵",
    30:"奋斗",31:"咒骂",32:"疑问",33:"嘘...",34:"晕",35:"折磨",36:"衰",37:"骷髅",38:"敲打",39:"再见",
    40:"表情"/*未定義*/,41:"发抖",42:"爱情",43:"跳跳",44:"表情"/*未定義*/,45:"表情"/*未定義*/,46:"猪头",47:"表情"/*未定義*/,48:"表情"/*未定義*/,49:"拥抱",
    50:"表情"/*未定義*/,51:"表情"/*未定義*/,52:"表情"/*未定義*/,53:"蛋糕",54:"闪电",55:"炸弹",56:"刀",57:"足球",58:"表情"/*未定義*/,59:"便便",
    60:"咖啡",61:"饭",62:"表情"/*未定義*/,63:"玫瑰",64:"凋谢",65:"表情"/*未定義*/,66:"爱心",67:"心碎",68:"表情"/*未定義*/,69:"礼物",
    70:"表情"/*未定義*/,71:"表情"/*未定義*/,72:"表情"/*未定義*/,73:"表情"/*未定義*/,74:"太阳",75:"月亮",76:"强",77:"弱",78:"握手",79:"胜利",
    80:"表情"/*未定義*/,81:"表情"/*未定義*/,82:"表情"/*未定義*/,83:"表情"/*未定義*/,84:"表情"/*未定義*/,85:"飞吻",86:"怄火",87:"表情"/*未定義*/,88:"表情"/*未定義*/,89:"西瓜",
    90:"表情"/*未定義*/,91:"表情"/*未定義*/,92:"表情"/*未定義*/,93:"表情"/*未定義*/,94:"表情"/*未定義*/,95:"表情"/*未定義*/,96:"冷汗",97:"擦汗",98:"抠鼻",99:"鼓掌",
    100:"糗大了",101:"坏笑",102:"左哼哼",103:"右哼哼",104:"哈欠",105:"鄙视",106:"委屈",107:"快哭了",108:"阴险",109:"亲亲",
    110:"吓",111:"可怜",112:"菜刀",113:"啤酒",114:"篮球",115:"乒乓",116:"示爱",117:"瓢虫",118:"抱拳",119:"勾引",
    120:"拳头",121:"差劲",122:"爱你",123:"NO",124:"OK",125:"转圈",126:"磕头",127:"回头",128:"跳绳",129:"挥手",
    130:"激动",131:"街舞",132:"献吻",133:"左太极",134:"右太极",135:"表情"/*未定義*/,136:"双喜",137:"鞭炮",138:"灯笼",139:"发财",
    140:"K歌",141:"购物",142:"邮件",143:"帅",144:"喝彩",145:"祈祷",146:"爆筋",147:"棒棒糖",148:"喝奶",149:"下面",
    150:"香蕉",151:"飞机",152:"开车",153:"高铁左车头",154:"车厢",155:"高铁右车头",156:"多云",157:"下雨",158:"钞票",159:"熊猫",
    160:"灯泡",161:"风车",162:"闹钟",163:"打伞",164:"彩球",165:"钻戒",166:"沙发",167:"纸巾",168:"药",169:"手枪",170:"青蛙",
    171:"茶",172:"眨眼睛",173:"泪奔",174:"无奈",175:"卖萌",176:"小纠结",177:"喷血",178:"斜眼笑",179:"doge",180:"惊喜",
    181:"骚扰",182:"笑哭",183:"我最美",184:"河蟹",185:"羊驼",186:"表情"/*未定義*/,187:"幽灵",188:"蛋",189:"表情"/*未定義*/,190:"菊花",
    191:"表情"/*未定義*/,192:"红包",193:"大笑",194:"不开心",195:"表情"/*未定義*/,196:"表情"/*未定義*/,197:"冷漠",198:"呃",199:"好棒",200:"拜托",
    201:"点赞",202:"无聊",203:"托脸",204:"吃",205:"送花",206:"害怕",207:"花痴",208:"小样儿",209:"表情"/*未定義*/,210:"飙泪",
    211:"我不看",212:"托腮",213:"表情"/*未定義*/
};

const AndroidFaces = { /*Android 版定義*/
    0:"惊讶",1:"撇嘴",2:"色",3:"发呆",4:"得意",5:"流泪",6:"害羞",7:"闭嘴",8:"睡",9:"大哭",
    10:"尴尬",11:"发怒",12:"调皮",13:"呲牙",14:"微笑",15:"难过",16:"酷",17:""/*未定義*/,18:"抓狂",19:"吐",
    20:"偷笑",21:"可爱",22:"白眼",23:"傲慢",24:"饥饿",25:"困",26:"惊恐",27:"流汗",28:"憨笑",29:"悠闲",
    30:"奋斗",31:"咒骂",32:"疑问",33:"嘘...",34:"晕",35:"折磨",36:"衰",37:"骷髅",38:"敲打",39:"再见",
    40:""/*未定義*/,41:"发抖",42:"爱情",43:"跳跳",44:""/*未定義*/,45:""/*未定義*/,46:"猪头",47:""/*未定義*/,48:""/*未定義*/,49:"拥抱",
    50:"钱",51:""/*未定義*/,52:""/*未定義*/,53:"蛋糕",54:"闪电",55:"炸弹",56:"刀",57:"足球",58:""/*未定義*/,59:"便便",
    60:"咖啡",61:"饭",62:""/*未定義*/,63:"玫瑰",64:"凋谢",65:""/*未定義*/,66:"爱心",67:"心碎",68:""/*未定義*/,69:"礼物",
    70:""/*未定義*/,71:""/*未定義*/,72:""/*未定義*/,73:""/*未定義*/,74:"太阳",75:"月亮",76:"赞",77:"踩",78:"握手",79:"胜利",
    80:""/*未定義*/,81:"美女",82:""/*未定義*/,83:""/*未定義*/,84:""/*未定義*/,85:"飞吻",86:"怄火",87:""/*未定義*/,88:""/*未定義*/,89:"西瓜",
    90:""/*未定義*/,91:""/*未定義*/,92:""/*未定義*/,93:""/*未定義*/,94:""/*未定義*/,95:""/*未定義*/,96:"冷汗",97:"擦汗",98:"抠鼻",99:"鼓掌",
    100:"糗大了",101:"坏笑",102:"左哼哼",103:"右哼哼",104:"哈欠",105:"鄙视",106:"委屈",107:"快哭了",108:"阴险",109:"亲亲",
    110:"吓",111:"可怜",112:"菜刀",113:"啤酒",114:"篮球",115:"乒乓",116:"示爱",117:"瓢虫",118:"抱拳",119:"勾引",
    120:"拳头",121:"差劲",122:"爱你",123:"NO",124:"OK",125:"转圈",126:"磕头",127:"回头",128:"跳绳",129:"挥手",
    130:"激动",131:"街舞",132:"献吻",133:"左太极",134:"右太极",135:"招财进宝",136:"双喜",137:"鞭炮",138:"灯笼",139:"发财",
    140:"K歌",141:"购物",142:"邮件",143:"帅",144:"喝彩",145:"祈祷",146:"爆筋",147:"棒棒糖",148:"喝奶",149:"下面",
    150:"香蕉",151:"飞机",152:"开车",153:"高铁左车头",154:"车厢",155:"高铁右车头",156:"多云",157:"下雨",158:"钞票",159:"熊猫",
    160:"灯泡",161:"风车",162:"闹钟",163:"打伞",164:"彩球",165:"钻戒",166:"沙发",167:"纸巾",168:"药",169:"手枪",170:"青蛙",
    171:"茶",172:"眨眼睛",173:"泪奔",174:"无奈",175:"卖萌",176:"小纠结",177:"喷血",178:"斜眼笑",179:"doge",180:"惊喜",
    181:"骚扰",182:"笑哭",183:"我最美",184:"河蟹",185:"羊驼",186:"栗子",187:"幽灵",188:"蛋",189:"马赛克",190:"菊花",
    191:"肥皂",192:"红包",193:"大笑",194:"不开心",195:"啊",196:"惶恐",197:"冷漠",198:"呃",199:"好棒",200:"拜托",
    201:"点赞",202:"无聊",203:"托脸",204:"吃",205:"送花",206:"害怕",207:"花痴",208:"小样儿",209:"脸红",210:"飙泪",
    211:"我不看",212:"托腮",213:"哇哦"
};

const iOSFaces = { /*iOS（含 HD）版定義*/
    0:"惊讶",1:"撇嘴",2:"色",3:"发呆",4:"得意",5:"流泪",6:"害羞",7:"闭嘴",8:"睡",9:"大哭",
    10:"尴尬",11:"发怒",12:"调皮",13:"呲牙",14:"微笑",15:"难过",16:"酷",17:""/*未定義*/,18:"抓狂",19:"吐",
    20:"偷笑",21:"可爱",22:"白眼",23:"傲慢",24:"饥饿",25:"困",26:"惊恐",27:"流汗",28:"憨笑",29:"悠闲",
    30:"奋斗",31:"咒骂",32:"疑问",33:"嘘",34:"晕",35:"折磨",36:"衰",37:"骷髅",38:"敲打",39:"再见",
    40:""/*未定義*/,41:"发抖",42:"爱情",43:"跳跳",44:""/*未定義*/,45:""/*未定義*/,46:"猪头",47:""/*未定義*/,48:""/*未定義*/,49:"拥抱",
    50:""/*未定義*/,51:""/*未定義*/,52:""/*未定義*/,53:"蛋糕",54:"闪电",55:"炸弹",56:"刀",57:"足球",58:""/*未定義*/,59:"便便",
    60:"咖啡",61:"饭",62:""/*未定義*/,63:"玫瑰",64:"凋谢",65:""/*未定義*/,66:"爱心",67:"心碎",68:""/*未定義*/,69:"礼物",
    70:""/*未定義*/,71:""/*未定義*/,72:""/*未定義*/,73:""/*未定義*/,74:"太阳",75:"月亮",76:"强",77:"弱",78:"握手",79:"胜利",
    80:""/*未定義*/,81:""/*未定義*/,82:""/*未定義*/,83:""/*未定義*/,84:""/*未定義*/,85:"飞吻",86:"怄火",87:""/*未定義*/,88:""/*未定義*/,89:"西瓜",
    90:""/*未定義*/,91:""/*未定義*/,92:""/*未定義*/,93:""/*未定義*/,94:""/*未定義*/,95:""/*未定義*/,96:"冷汗",97:"擦汗",98:"抠鼻",99:"鼓掌",
    100:"糗大了",101:"坏笑",102:"左哼哼",103:"右哼哼",104:"哈欠",105:"鄙视",106:"委屈",107:"快哭了",108:"阴险",109:"亲亲",
    110:"吓",111:"可怜",112:"菜刀",113:"啤酒",114:"篮球",115:"乒乓",116:"示爱",117:"瓢虫",118:"抱拳",119:"勾引",
    120:"拳头",121:"差劲",122:"爱你",123:"NO",124:"OK",125:"转圈",126:"磕头",127:"回头",128:"跳绳",129:"挥手",
    130:"激动",131:"街舞",132:"献吻",133:"左太极",134:"右太极",135:""/*未定義*/,136:"双喜",137:"鞭炮",138:"灯笼",139:"发财",
    140:"K歌",141:"购物",142:"邮件",143:"帅",144:"喝彩",145:"祈祷",146:"爆筋",147:"棒棒糖",148:"喝奶",149:"下面",
    150:"香蕉",151:"飞机",152:"开车",153:"高铁左车头",154:"车厢",155:"高铁右车头",156:"多云",157:"下雨",158:"钞票",159:"熊猫",
    160:"灯泡",161:"风车",162:"闹钟",163:"打伞",164:"彩球",165:"钻戒",166:"沙发",167:"纸巾",168:"药",169:"手枪",170:"青蛙",
    171:"茶",172:"舔",173:"泪奔",174:"无奈",175:"卖萌",176:"小纠结",177:"喷血",178:"斜眼笑",179:"doge",180:"惊喜",
    181:"骚扰",182:"笑哭",183:"我最美",184:"河蟹",185:"羊驼",186:"栗子",187:"幽灵",188:"蛋",189:""/*未定義*/,190:"菊花",
    191:""/*未定義*/,192:"红包",193:"大笑",194:"不开心",195:""/*未定義*/,196:""/*未定義*/,197:"冷漠",198:"呃",199:"好棒",200:"拜托",
    201:"点赞",202:"无聊",203:"托脸",204:"吃",205:"送花",206:"害怕",207:"花痴",208:"小样儿",209:""/*未定義*/,210:"飙泪",
    211:"我不看",212:"托腮",213:"哇哦"
};

/**
 * 去除接收訊息中的 CQ 碼（酷 Q 專用碼，包括表情、繪文字、相片等資料），將其換為「[表情名稱]」、「[图片]」等文字。
 * @param  {string} message 已解碼並轉為 UTF-8 之後的訊息
 * @return {string} 去除 CQ 碼之後的文字
 */
const parseMessage = (message, isPro) => {
    let images = [];
    let records = [];
    let at = {};

    let text = message.replace(/\[CQ:(.*?),(.*?)\]/g, (_, type, param) => {
        let tmp;
        switch (type) {
            case 'face':
                tmp = param.match(/id=(\d*)/);
                if (tmp && tmp[1]) {
                    return `[${faces[parseInt(tmp[1])]}]`;
                } else {
                    return '[表情]';
                }
                break;

            case 'emoji':
                tmp = param.match(/id=(\d*)/);
                if (tmp && tmp[1]) {
                    return String.fromCodePoint(tmp[1]);
                } else {
                    return '';
                }
                break;

            case 'bface':
                // CoolQ Air: [CQ:bface][中箭]
                // CoolQ Pro: [CQ:bface,p=10278,id=42452682486D91909B7A513B8BFBC3C6]
                if (isPro) {
                    // TODO 取得表情內容
                    return '[原创表情]';
                } else {
                    return '';
                }
                break;

            case 'sface':
                return '[小表情]';

            case 'image':
                // [CQ:image,file=XXX.jpg]
                tmp = param.match(/file=(.*)/);
                if (tmp && tmp[1]) {
                    images.push(tmp[1]);
                    return '[图片]';
                } else {
                    return '';
                }
                break;

            case 'rich':
                // [CQ:rich,url=XXX.jpg,text=...]
                tmp = param.match(/url=(.*?)(,|$)/);
                if (tmp && tmp[1]) {
                    return `[分享链接：${tmp[1]}]`;
                } else {
                    return '';
                }
                break;

            case 'record':
                // [CQ:record,file=XXX.amr] 或 XXX.silk（對講或變音）
                tmp = param.match(/file=(.*?)(,|$)/);
                if (tmp && tmp[1]) {
                    records.push(tmp[1]);
                    return '[语音]';
                } else {
                    return '';
                }
                break;

            case 'at':
                tmp = param.match(/qq=(.*)/);
                if (tmp && tmp[1]) {
                    if (tmp[1] === 'all') {
                        return '@全体成员';
                    } else {
                        at[parseInt(tmp[1])] = true;
                        return `@${tmp[1]}`;                // 只給出 QQ 號，至於應該 @ 什麼內容，讓使用者處理吧
                    }
                } else {
                    return '';
                }
                break;

            case 'share':
                tmp = param.match(/url=(.*?),/);
                if (tmp && tmp[1]) {
                    return `[分享链接：${tmp[1]}]`;
                } else {
                    return '';
                }
                break;

            default:
                return '';
        }
    });

    // at 去重
    let ats = [];
    for (let k in at) {
        ats.push(k);
    }

    text = text.replace(/\[CQ:bface\]/g, '')
                .replace(/&#91;/gu, '[')
                .replace(/&#93;/gu, ']')
                .replace(/&amp;/gu, '&');

    return {
        text: text,
        extra: {
            images: images,
            records: records,
            ats: ats,
        },
    };
};

class QQBot extends EventEmitter {
    constructor (options = {}) {
        super();
        this._started = false;
        this._debug = options.debug || false;
        this._serverHost = options.host || '127.0.0.1';
        this._serverPort = options.port || 11235;
        this._nick = '';
        this._timeoutCounter = 0;
        this._timeoutTimer = null;
        this._isPro = options.CoolQPro && true;
        this._unicode = options.unicode && true;
    }

    _log(message, isError) {
        if (this._debug) {
            let dateStr = new Date().toISOString();
            let output = `[${dateStr.substring(0,10)} ${dateStr.substring(11,19)}] ${message}`;

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

                switch (command) {
                    case 'ServerHello':
                        this._timeoutCounter = 0;
                        break;

                    case 'LoginNick':
                        this._nick = base642str(frames[1], this._unicode);
                        break;

                    case 'GroupMessage':
                        msgdata = parseMessage(base642str(frames[3], this._unicode), this._isPro);
                        let userinfo = parseGroupMemberInfo(frames[6]);

                        if (this._isPro && parseInt(frames[2]) === 80000000) {
                            // 匿名消息

                            let info = base642str(frames[7], this._unicode);
                            let nick = info.substring(10).split('\0')[0];

                            userinfo = {
                                qq: 80000000,
                                name: '匿名消息',
                                groupCard: nick,
                            };
                        }

                        this.emit('GroupMessage', {
                            group: parseInt(frames[1]),
                            from:  parseInt(frames[2]),
                            text:  msgdata.text,
                            extra: msgdata.extra,
                            type:  parseInt(frames[4]),
                            time:  parseInt(frames[5]),
                            user:  userinfo,
                        });
                        break;

                    case 'PrivateMessage':
                        msgdata = parseMessage(base642str(frames[2], this._unicode), this._isPro);

                        this.emit('PrivateMessage', {
                            from: parseInt(frames[1]),
                            text:  msgdata.text,
                            extra: msgdata.extra,
                            type: parseInt(frames[3]),
                            time: parseInt(frames[4]),
                            user: parseStrangerInfo(frames[5]),
                        });
                        break;

                    case 'DiscussMessage':
                        msgdata = parseMessage(base642str(frames[3], this._unicode), this._isPro);

                        this.emit('DiscussMessage', {
                            group: parseInt(frames[1]),
                            from:  parseInt(frames[2]),
                            text:  msgdata.text,
                            extra: msgdata.extra,
                            type:  parseInt(frames[4]),
                            time:  parseInt(frames[5]),
                            user:  parseStrangerInfo(frames[6]),
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
                            admin:       parseInt(frames[2]),      // 管理員QQ
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

                    setTimeout(sayHello, 120000);
                }
            };
            sayHello();

            setTimeout(() => {
                let hello = `LoginNick`;
                try {
                    this._socket.send(hello, 0, hello.length, this._serverPort, this._serverHost);
                } catch (ex) {
                    this.emit('Error', {
                        event: 'connect',
                        context: 'LoginNick',
                        error: ex,
                    });
                }
            }, 1000);

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

        this._nick = '';
    }

    _rawSend(msg) {
        try {
            this._socket.send(msg, 0, msg.length < MAX_LEN || MAX_LEN == 0 ? msg.length : MAX_LEN, this._serverPort, this._serverHost);
        } catch (ex) {
            this.emit('Error', {
                event: 'send',
                context: msg,
                error: ex,
            });
        }
    }

    escape(text) {
        return text.replace(/&/gu, '&amp;')
                .replace(/\[/gu, '&#91;')
                .replace(/\]/gu, '&#93;');
    }

    send(type, target, message, options) {
        if (type === 'PrivateMessage' || type === 'GroupMessage' || type === 'DiscussMessage') {
            let message2 = message;
            if (!(options && options.noEscape)) {
                message2 = this.escape(message);
            }

            let answer = `${type} ${target} ${str2base64(message2, this._unicode)}`;
            this._rawSend(answer);
        }
    }

    sendPrivateMessage(qq, message, options) {
        this.send('PrivateMessage', qq, message, options);
    }

    sendGroupMessage(group, message, options) {
        this.send('GroupMessage', group, message, options);
    }

    sendDiscussMessage(discussid, message, options) {
        this.send('DiscussMessage', discussid, message, options);
    }

    get nick() {
        return this._nick;
    }

    get isCoolQPro() {
        return this._isPro;
    }

    groupMemberInfo(group, qq, nocache = true) {
        let cmd = `GroupMemberInfo ${group} ${qq} ${nocache ? 1 : 0}`;
        this._rawSend(cmd);
    }

    strangerInfo(qq, nocache = true) {
        let cmd = `StrangerInfo ${qq} ${nocache ? 1 : 0}`;
        this._rawSend(cmd);
    }

    groupBan(group, qq, duration = 1800) {
        let cmd = `GroupBan ${group} ${qq} ${duration}`;
        this._rawSend(cmd);
    }
}

module.exports = QQBot;
