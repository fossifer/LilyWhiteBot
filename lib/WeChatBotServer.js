/*
 * 微信机器人（单独运行部分）
 *
 * 警告：原型程序，请勿用于生产环境！
 */

'use strict';

const udp = require('dgram');
const Buffer = require('buffer').Buffer;
const LRU = require("lru-cache");
const Wechat = require('wechat4u');

const server = udp.createSocket('udp4');
const bot = new Wechat();

const PORT = 11337;
let now = new Date().getTime()/1000;

const clients = LRU({
    max: 500,
    maxAge: 300000,
});

const base642str = str => Buffer.from(str, 'base64').toString();
const str2base64 = str => Buffer.from(str).toString('base64');

const log = (message, isError = false) => {
    let date = new Date().toISOString();
    let output = `[${date.substring(0,10)} ${date.substring(11,19)}] ${message}`;

    if (isError) {
        console.error(output);
    } else {
        console.log(output);
    }
};

const parseAddress = str => {
    let arr = str.split(':') || [];
    let port = arr.pop() || 0;
    return {
        ip: arr.join(':'),
        port: parseInt(port)
    };
};

/*
 * SocketServer 部分
 */
server.on('error', error => {
    log('Socket错误：' + error, true);
    server.close();
});

server.on('message', (msg, info) => {
    let strmsg = msg.toString();
    let arr = strmsg.split(' ') || [];
    let cmd = arr[0] || '';
    switch (cmd.toLowerCase()) {
        case 'clienthello':
            clients.set(`${info.address}:${parseInt(arr[1])}`, true);
            break;

        case 'message':
            let target = arr[1];
            let content = arr[2];
            bot.sendText(base642str(content), target);
            break;

        default:
            log('Unknown message: ' + strmsg);
    }
});

server.on('listening', () => {
    let address = server.address();
    log(`监听IP: ${address.address}，端口: ${address.port}`);
});

server.bind(PORT);

const broadcast = (msg) => {
    clients.forEach((_, address) => {
        let {ip, port} = parseAddress(address);
        server.send(msg, 0, msg.length, port, ip);
    });
};

setInterval(() => {
    broadcast('ServerHello');
}, 150000);

/*
 * 微信部分
 */
bot.on('uuid', uuid => {
    log('请点击链接并扫描二维码登录：' + 'https://login.weixin.qq.com/qrcode/' + uuid);
});

bot.on('login', () => {
    log('登录成功');
});

bot.on('message', msg => {
    if (msg.isSendBySelf) { return; }
    if (msg.CreateTime < now) { return; }

    if (msg.Content && msg.Content.toLowerCase().indexOf('!thisgroupid') !== -1) {
        log('THISGROUPID: ' + msg.FromUserName);
    }

    // console.log(msg);
    let strmsg = `Message ${msg.MsgType} ${msg.CreateTime} ${msg.FromUserName} ${msg.ToUserName} ${str2base64(msg.Content)}`;
    broadcast(strmsg);
});

bot.start();


/*
{ MsgId: '7914869631410386493',
  FromUserName: '@0ce0eee51174c24cf42fcb8062980f5e68c3196144c10f8ef923ffb519255dd5',
  ToUserName: '@0bb68385b6f8d32e3a09586fa4807f2d6cd6e588ca9ecd8f68220ebb0b226cd4',
  MsgType: 1,
  Content: '普通私聊消息[得意]',
  Status: 3,
  ImgStatus: 1,
  CreateTime: 1496851250,
  VoiceLength: 0,
  PlayLength: 0,
  FileName: '',
  FileSize: '',
  MediaId: '',
  Url: '',
  AppMsgType: 0,
  StatusNotifyCode: 0,
  StatusNotifyUserName: '',
  RecommendInfo:
   { UserName: '',
     NickName: '',
     QQNum: 0,
     Province: '',
     City: '',
     Content: '',
     Signature: '',
     Alias: '',
     Scene: 0,
     VerifyFlag: 0,
     AttrStatus: 0,
     Sex: 0,
     Ticket: '',
     OpCode: 0 },
  ForwardFlag: 0,
  AppInfo: { AppID: '', Type: 0 },
  HasProductId: 0,
  Ticket: '',
  ImgHeight: 0,
  ImgWidth: 0,
  SubMsgType: 0,
  NewMsgId: 7914869631410387000,
  OriContent: '',
  isSendBySelf: false,
  OriginalContent: '普通私聊消息[得意]' }



  { MsgId: '1021095003393356546',
    FromUserName: '@@bb427b9e776ec35d4e8118b2fc8c243f24fc144ee050107504dda28386b57568',
    ToUserName: '@0bb68385b6f8d32e3a09586fa4807f2d6cd6e588ca9ecd8f68220ebb0b226cd4',
    MsgType: 1,
    Content: '·:\n普通群聊消息😂',
    Status: 3,
    ImgStatus: 1,
    CreateTime: 1496851321,
    VoiceLength: 0,
    PlayLength: 0,
    FileName: '',
    FileSize: '',
    MediaId: '',
    Url: '',
    AppMsgType: 0,
    StatusNotifyCode: 0,
    StatusNotifyUserName: '',
    RecommendInfo:
     { UserName: '',
       NickName: '',
       QQNum: 0,
       Province: '',
       City: '',
       Content: '',
       Signature: '',
       Alias: '',
       Scene: 0,
       VerifyFlag: 0,
       AttrStatus: 0,
       Sex: 0,
       Ticket: '',
       OpCode: 0 },
    ForwardFlag: 0,
    AppInfo: { AppID: '', Type: 0 },
    HasProductId: 0,
    Ticket: '',
    ImgHeight: 0,
    ImgWidth: 0,
    SubMsgType: 0,
    NewMsgId: 1021095003393356500,
    OriContent: '',
    isSendBySelf: false,
    OriginalContent: '@0ce0eee51174c24cf42fcb8062980f5e68c3196144c10f8ef923ffb519255dd5:<br/>普通群聊消息<span class="emoji emoji1f639"></span>' }


图片
{ MsgId: '9003625357819194020',
  FromUserName: '@0ce0eee51174c24cf42fcb8062980f5e68c3196144c10f8ef923ffb519255dd5',
  ToUserName: '@0bb68385b6f8d32e3a09586fa4807f2d6cd6e588ca9ecd8f68220ebb0b226cd4',
  MsgType: 3,
  Content: '<?xml version="1.0"?>\n<msg>\n\t<img aeskey="78ef580a231149469b5f058c3f9e4404" encryver="0" cdnthumbaeskey="78ef580a231149469b5f058c3f9e4404" cdnthumburl="304b0201000444304202010002049516a90702030f52be020444ce69b80204593823c80420777869645f647962696772747077736735313231385f313439363835313339390201000201000400" cdnthumblength="6660" cdnthumbheight="120" cdnthumbwidth="103" cdnmidheight="0" cdnmidwidth="0" cdnhdheight="0" cdnhdwidth="0" cdnmidimgurl="304b0201000444304202010002049516a90702030f52be020444ce69b80204593823c80420777869645f647962696772747077736735313231385f313439363835313339390201000201000400" length="45956" md5="405eb70eed3635e4ae896838ec77979d" />\n</msg>\n',
  Status: 3,
  ImgStatus: 2,
  CreateTime: 1496851401,
  VoiceLength: 0,
  PlayLength: 0,
  FileName: '',
  FileSize: '',
  MediaId: '',
  Url: '',
  AppMsgType: 0,
  StatusNotifyCode: 0,
  StatusNotifyUserName: '',
  RecommendInfo:
   { UserName: '',
     NickName: '',
     QQNum: 0,
     Province: '',
     City: '',
     Content: '',
     Signature: '',
     Alias: '',
     Scene: 0,
     VerifyFlag: 0,
     AttrStatus: 0,
     Sex: 0,
     Ticket: '',
     OpCode: 0 },
  ForwardFlag: 0,
  AppInfo: { AppID: '', Type: 0 },
  HasProductId: 0,
  Ticket: '',
  ImgHeight: 120,
  ImgWidth: 103,
  SubMsgType: 0,
  NewMsgId: 9003625357819194000,
  OriContent: '',
  isSendBySelf: false,
  OriginalContent: '&lt;?xml version="1.0"?&gt;<br/>&lt;msg&gt;<br/>\t&lt;img aeskey="78ef580a231149469b5f058c3f9e4404" encryver="0" cdnthumbaeskey="78ef580a231149469b5f058c3f9e4404" cdnthumburl="304b0201000444304202010002049516a90702030f52be020444ce69b80204593823c80420777869645f647962696772747077736735313231385f313439363835313339390201000201000400" cdnthumblength="6660" cdnthumbheight="120" cdnthumbwidth="103" cdnmidheight="0" cdnmidwidth="0" cdnhdheight="0" cdnhdwidth="0" cdnmidimgurl="304b0201000444304202010002049516a90702030f52be020444ce69b80204593823c80420777869645f647962696772747077736735313231385f313439363835313339390201000201000400" length="45956" md5="405eb70eed3635e4ae896838ec77979d" /&gt;<br/>&lt;/msg&gt;<br/>' }


自己消息
{ MsgId: '3734784299703662400',
  FromUserName: '@0bb68385b6f8d32e3a09586fa4807f2d6cd6e588ca9ecd8f68220ebb0b226cd4',
  ToUserName: '@0ce0eee51174c24cf42fcb8062980f5e68c3196144c10f8ef923ffb519255dd5',
  MsgType: 1,
  Content: '回复',
  Status: 3,
  ImgStatus: 1,
  CreateTime: 1496851445,
  VoiceLength: 0,
  PlayLength: 0,
  FileName: '',
  FileSize: '',
  MediaId: '',
  Url: '',
  AppMsgType: 0,
  StatusNotifyCode: 0,
  StatusNotifyUserName: '',
  RecommendInfo:
   { UserName: '',
     NickName: '',
     QQNum: 0,
     Province: '',
     City: '',
     Content: '',
     Signature: '',
     Alias: '',
     Scene: 0,
     VerifyFlag: 0,
     AttrStatus: 0,
     Sex: 0,
     Ticket: '',
     OpCode: 0 },
  ForwardFlag: 0,
  AppInfo: { AppID: '', Type: 0 },
  HasProductId: 0,
  Ticket: '',
  ImgHeight: 0,
  ImgWidth: 0,
  SubMsgType: 0,
  NewMsgId: 3734784299703662600,
  OriContent: '',
  isSendBySelf: true,
  OriginalContent: '回复' }


*/
