/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中
 *
 * 已知的問題：
 * Telegram 音訊使用 ogg 格式，QQ 則使用 amr 和 silk，這個可以考慮互相轉換一下
 *
 */
'use strict';

const fs = require('fs');
const path = require('path');
const request = require('request');
const sharp = require('sharp');
const winston = require('winston');

let options = {};
let servemedia;
let handlers;

const pkg = require('../../package.json');
const USERAGENT = `LilyWhiteBot/${pkg.version} (${pkg.repository})`;

/*
 * 轉檔
 */
const preprocessFileName = (name) => {
    if (path.extname(name) === '.webp') {
        return name + '.png';
    } else {
        return name;
    }
};

const pipeFile = (file, pipe) => new Promise((resolve, reject) => {
    let filePath = file.url || file.path;
    let fileStream;

    if (file.url) {
        fileStream = request.get(file.url);
    } else if (file.path) {
        fileStream = fs.createReadStream(file.path);
    } else {
        throw new TypeError('unknown file type');
    }

    let stream = fileStream;
    if (path.extname(filePath) === '.webp') {
        if (file.type === 'sticker') {
            // 缩小表情包尺寸，否则在QQ等屏幕上会刷屏
            stream = sharp(fileStream).resize(256).png();
        } else {
            stream = sharp(fileStream).png();
        }
    }

    stream.on('error', err => reject(err))
        .on('end', () => resolve())
        .pipe(pipe);
});


/*
 * 儲存至本機快取
 */
const uploadToCache = async (file, fileid) => {
    let targetName = fileid;
    if (file.url && !path.extname(targetName)) {
        targetName += path.extname(file.url);
    }
    targetName = preprocessFileName(targetName);

    let targetPath = path.join(servemedia.cachePath, targetName);
    let writeStream = fs.createWriteStream(targetPath).on('error', (e) => { throw e; });
    await pipeFile(file, writeStream);

    return servemedia.serveUrl + targetName;
};

/*
 * 上传到各种图床
 */
const uploadToHost = (host, file) => new Promise((resolve, reject) => {
    const requestOptions = {
        timeout: servemedia.timeout,
        headers: {
            'User-Agent': servemedia.userAgent || USERAGENT,
        },
    };

    switch (host) {
        case 'vim-cn':
        case 'vimcn':
            requestOptions.url = 'https://img.vim-cn.com/';
            requestOptions.formData = {
                name: pendingfile,
            };
            break;

        case 'sm.ms':
            requestOptions.url = 'https://sm.ms/api/upload';
            requestOptions.json = true;
            requestOptions.formData = {
                smfile: pendingfile,
            };
            break;

        case 'imgur':
            if (servemedia.imgur.apiUrl.endsWith('/')) {
                requestOptions.url = servemedia.imgur.apiUrl + 'upload';
            } else {
                requestOptions.url = servemedia.imgur.apiUrl + '/upload';
            }
            requestOptions.headers.Authorization = `Client-ID ${config.clientId}`;
            requestOptions.json = true;
            requestOptions.formData = {
                type: 'file',
                image: pendingfile,
            };
            break;

        case 'uguu':
        case 'Uguu':
            requestOptions.url = servemedia.uguuApiUrl || servemedia.UguuApiUrl; // 原配置文件以大写字母开头
            requestOptions.formData = {
                "file": {
                    value: pendingfile,
                    options: {
                        filename: name
                    }
                },
                randomname: "true"
            };
            break;

        default:
            reject(new Error('Unknown host type'));
    }

    pipeFile(file, request.post(requestOptions, (error, response, body) => {
        if (typeof callback === 'function') {
            callback();
        }
        if (!error && response.statusCode === 200) {
            switch (host) {
                case 'vim-cn':
                case 'vimcn':
                    resolve(body.trim().replace('http://', 'https://'));
                    break;
                case 'uguu':
                case 'Uguu':
                    resolve(body.trim());
                    break;
                case 'sm.ms':
                    if (body && body.code !== 'success') {
                        reject(new Error(`sm.ms return: ${body.msg}`));
                    } else {
                        resolve(body.data.url);
                    }
                    break;
                case 'imgur':
                    if (body && !body.success) {
                        reject(new Error(`Imgur return: ${body.data.error}`));
                    } else {
                        resolve(body.data.link);
                    }
                    break;

            }
        } else {
            reject(new Error(error));
        }
    }));
});

/*
 * 上傳到自行架設的 linx 圖床上面
 */
const uploadToLinx = (file) => new Promise((resolve, reject) => {
    let name;
    if (file.url) {
        name = preprocessFileName(path.basename(file.url));
    } else if (file.path) {
        name = preprocessFileName(path.basename(file.path));
    }

    pipeFile(file, request.put({
        url: servemedia.linxApiUrl + name,
        headers: {
            'User-Agent': servemedia.userAgent || USERAGENT,
            'Linx-Randomize': 'yes'
        }
    }, (error, response, body) => {
        if (!error && response.statusCode === 200) {
            resolve(body.trim());
        } else {
            reject(new Error(error));
        }
    })).catch(err => reject(err));
});

/*
 * 決定檔案去向
 */
const uploadFile = async (file) => {
    switch (servemedia.type) {
        case 'vimcn':
        case 'vim-cn':
        case 'sm.ms':
        case 'imgur':
        case 'uguu':
        case 'Uguu':
            return await uploadToHost(servemedia.type, file);

        case 'self':
            return await uploadToCache(file, file.id);

        case 'linx':
            return await uploadToLinx(file);

        default:

    }
};


/*
 * 處理來自 QQ 的多媒體訊息
 */
const processQQFile = async (file) => {
    const url = await cacheFile(Promise.resolve(getitem), file.id);
    return {
        url: url,
        type: type,
    };
};


/*
 * 判斷訊息來源，將訊息中的每個檔案交給對應函式處理
 */
const fileUploader = {
    init: (opt) => {
        options = opt;
        servemedia = options.options.servemedia || {};
    },
    get handlers() { return handlers; },
    set handlers(h) { handlers = h; },
    process: async (context) => {
        if (context.extra.files && servemedia.type && servemedia.type !== 'none') {
            let promises = [];
            let fileCount = context.extra.files.length;

            for (let [index, file] of context.extra.files.entries()) {
                if (servemedia.sizeLimit && servemedia.sizeLimit > 0 && file.size && file.size > servemedia.sizeLimit*1024) {
                    winston.debug(`[file.js] <FileUploader> #${context.msgId} File ${index+1}/${fileCount}: Size limit exceeded. Ignore.`);
                } else {
                    promises.push(uploadFile(file));
                }
            }

            let uploads = await Promise.all(promises);
            for (let [index, upload] of uploads.entries()) {
                winston.debug(`[file.js] <FileUploader> #${context.msgId} File ${index+1}/${uploads.length} (${upload.type}): ${upload.url}`);
            }

            return uploads;
        } else {
            return [];
        }
    },
};

module.exports = (bridge, options) => {
    fileUploader.init(options);
    fileUploader.handlers = bridge.handlers;

    bridge.addHook('bridge.send', async (msg) => {
        try {
            msg.extra.uploads = await fileUploader.process(msg);
        } catch (e) {
            winston.error(`Error on processing files: `, e);
            msg.callbacks.push(new bridge.BridgeMsg(msg, {
                text: 'File upload error',
                isNotice: true,
                extra: {},
            }));
        }
    }
};
