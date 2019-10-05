/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中
 *
 * 已知的問題：
 * Telegram 音訊使用 ogg 格式，QQ 則使用 amr 和 silk，這個可以考慮互相轉換一下
 *
 * TODO
 * 將下面幾個 uploadToXXX 合併
 */
'use strict';

const fs = require('fs');
const url = require('url');
const path = require('path');
const request = require('request');
const DWebp = require('cwebp').DWebp;
const tmp = require('tmp');
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
    if (path.extname(name) === '.webp' && servemedia.webp2png) {
        return name + '.png';
    } else {
        return name;
    }
};

const preprocessFile = (url, file) => {
    if (path.extname(url) === '.webp' && servemedia.webp2png) {
        return new DWebp(file, servemedia.webpPath).stream();
    } else {
        return file;
    }
};

// 不能直接轉檔因此以本機為快取
const preprocessFile2 = (url, file) => new Promise((resolve, reject) => {
    if (path.extname(url) === '.webp' && servemedia.webp2png) {
        let fname = tmp.tmpNameSync();
        new DWebp(file, servemedia.webpPath).write(fname, (err) => {
            if (err) {
                reject(err);
            } else {
                resolve(fs.createReadStream(fname), fname);
            }
        });
    } else {
        resolve(file);
    }
});

/*
 * 儲存至本機快取
 */
const saveToCache = (file, fileid) => new Promise((resolve, reject) => {
    try {
        let t;
        let targetDir = servemedia.cachePath;
        let targetName = fileid;

        if (file.url && !path.extname(targetName)) {
            targetName += path.extname(file.url);
        }
        targetName = preprocessFileName(targetName);

        let targetPath = path.join(targetDir, targetName);
        let w = fs.createWriteStream(targetPath).on('error', (e) => {
            reject(e);
        });

        if (file.url) {
            // 下載
            preprocessFile(file.url, request.get(file.url)).on('end', () => {
                resolve(servemedia.serveUrl + targetName);
            }).pipe(w);
        } else if (file.path) {
            // 複製到 cachePath
            fs.createReadStream(file.path).on('end', () => {
                resolve(servemedia.serveUrl + targetName);
            }).pipe(w);
        } else {
            reject('Invalid file');
        }
    } catch (e) {
        reject(e);
    }
});

/*
 * 上传到各种图床
 */
const uploadToHost = (host, file) => new Promise((resolve, reject) => {
    const post = (pendingfile, callback) => {
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

        return request.post(requestOptions, (error, response, body) => {
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
                            reject(new Error(body.msg));
                        } else {
                            resolve(body.data.url);
                        }
                        break;
                    case 'imgur':
                        if (body && !body.success) {
                            reject(body.data.error);
                        } else {
                            resolve(body.data.link);
                        }
                        break;

                }
            } else {
                reject(new Error(error));
            }
        });
    };

    if (file.url) {
        preprocessFile2(file.url, request.get(file.url)).then((f, filename) => {
            post(f, () => {
                if (filename) {
                    fs.unlink(filename, (err) => {
                        if (err) {
                            winston.error(`Unable to unlink ${filename} `, err);
                        }
                    });
                }
            });
        });
    } else if (file.path) {
        post(fs.createReadStream(file.path));
    } else {
        reject(new Error('Invalid file'));
        return;
    }
});

/*
 * 上傳到自行架設的 linx 圖床上面
 */
const uploadToLinx = (file) => new Promise((resolve, reject) => {
    let name;

    const response = (error, response, body) => {
        if (!error && response.statusCode === 200) {
            resolve(body.trim());
        } else {
            reject(new Error(error));
        }
    };

    if (file.url) {
        name = preprocessFileName(path.basename(file.url));

        preprocessFile(file.url, request.get(file.url))
            .on('error', (e) => { reject(e); })
            .pipe(request.put({
                url: servemedia.linxApiUrl + name,
                headers: {
                    'User-Agent': servemedia.userAgent || USERAGENT,
                    'Linx-Randomize': 'yes'
                }
            }, response));
    } else if (file.path) {
        name = path.basename(file.path);
        fs.createReadStream(file.path)
            .on('error', (e) => { reject(new Error(e)); })
            .pipe(request.put({
                url: servemedia.linxApiUrl + name,
                headers: {
                    'User-Agent': servemedia.userAgent || USERAGENT,
                    'Linx-Randomize': 'yes'
                }
            }, response));
    } else {
        reject('Invalid file');
    }
});

/*
 * 決定檔案去向
 */
const cacheFile = (getfile, fileid) => new Promise((resolve, reject) => {
    getfile.then((file) => {
        switch (servemedia.type) {
            case 'vimcn':
            case 'vim-cn':
            case 'sm.ms':
            case 'imgur':
            case 'uguu':
            case 'Uguu':
                uploadToHost(servemedia.type, file).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'self':
                saveToCache(file, fileid).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'linx':
                uploadToLinx(file).then((url) => resolve(url), (e) => reject(e));
                break;

            default:

        }
    }).catch((e) => reject(e));
});


/*
 * 處理來自 Telegram 的多媒體訊息
 */
const getTelegramFileUrl = fileid => new Promise((resolve, reject) => {
    handlers.get('Telegram').getFileLink(fileid).then((url) => {
        resolve({ url: url });
    }).catch((e) => {
        reject(e);
    });
});
const processTelegramFile = file => new Promise((resolve, reject) => {
    let type;
    switch (file.type) {
        case 'photo':
        case 'sticker':
            type = 'photo';
            break;
        case 'audio':
        case 'voice':
            type = 'audio';
            break;
        default:
            type = 'file';
    }

    cacheFile(getTelegramFileUrl(file.id), file.id).then((url) => {
        resolve({
            url: url,
            type: type,
        });
    }).catch((e) => reject(e));
});


/*
 * 處理來自 QQ 的多媒體訊息
 */
const getQQPhotoPath = (name) => handlers.get('QQ').image(name).then((path) => Promise.resolve({ path: path }));
const getQQVoicePath = (name) => Promise.resolve({ path: path.join(servemedia.coolqCache, 'record', name) });
const getQQPhotoUrl = name => new Promise((resolve, reject) => {
    let p = path.join(servemedia.coolqCache, 'image', name) + '.cqimg';
    fs.readFile(p, (err, data) => {
        if (err) {
            reject(err);
        } else {
            try {
                let info = data.toString('ascii');
                let [, url] = info.match(/url=(.*?)[\r\n]/u) || [];

                resolve({ url: url });
            } catch (ex) {
                reject(ex);
            }
        }
    });
});

const processQQFile = file => new Promise((resolve, reject) => {
    if (file.type === 'photo' && servemedia.legacy) {
        cacheFile(getQQPhotoUrl(file.id), file.id).then((url) => {
            resolve({
                url: url,
                type: 'photo',
            });
        }).catch((e) => reject(e));
    } else if (file.type === 'photo') {
        cacheFile(getQQPhotoPath(file.id), file.id).then((url) => {
            resolve({
                url: url,
                type: 'photo',
            });
        }).catch((e) => reject(e));
    } else {
        cacheFile(getQQVoicePath(file.id), file.id).then((url) => {
            resolve({
                url: url,
                type: 'file',
            });
        }).catch((e) => reject(e));
    }
});


/*
 * 處理來自 Discord 的多媒體訊息
 */
const processDiscordFile = file => new Promise((resolve, reject) => {
    cacheFile(Promise.resolve({ url: file.url }), file.id).then((url) => {
        resolve({
            url: url,
            type: 'photo',
        });
    }).catch((e) => reject(e));
});


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
    process: context => new Promise((resolve, reject) => {
        let promises = [];

        if (context.extra.files && servemedia.type && servemedia.type !== 'none') {
            let fileCount = context.extra.files.length;
            for (let [index, file] of context.extra.files.entries()) {
                if (servemedia.sizeLimit && servemedia.sizeLimit > 0 && file.size && file.size > servemedia.sizeLimit*1024) {
                    winston.debug(`[file.js] <FileUploader> #${context.msgId} File ${index+1}/${fileCount}: Size limit exceeded. Ignore.`);
                    continue;
                }

                if (file.client === 'Telegram') {
                    promises.push(processTelegramFile(file));
                } else if (file.client === 'QQ') {
                    promises.push(processQQFile(file));
                } else if (file.client === 'Discord') {
                    promises.push(processDiscordFile(file));
                }
            }
        }

        Promise.all(promises).then((uploads) => {
            let fileCount = uploads.length;
            for (let [index, upload] of uploads.entries()) {
                winston.debug(`[file.js] <FileUploader> #${context.msgId} File ${index+1}/${fileCount} (${upload.type}): ${upload.url}`);
            }
            resolve(uploads);
        }).catch((e) => {
            reject(e);
        });
    }),
};

module.exports = (bridge, options) => {
    fileUploader.init(options);
    fileUploader.handlers = bridge.handlers;

    bridge.addHook('bridge.send', (msg) => fileUploader.process(msg).then((uploads) => {
        msg.extra.uploads = uploads;
    }).catch((e) => {
        winston.error(`Error on processing files: `, e);
        msg.callbacks.push(new bridge.BridgeMsg(msg, {
            text: 'File upload error',
            isNotice: true,
            extra: {},
        }));
    }));
};
