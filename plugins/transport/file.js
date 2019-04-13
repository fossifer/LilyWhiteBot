/*
 * 集中處理檔案：將檔案上傳到圖床，取得 URL 並儲存至 context 中。
 *
 * 已知的問題：
 * Telegram 音訊使用 ogg 格式，QQ 則使用 amr 和 silk，這個可以考慮互相轉換一下。
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

let options = {};
let servemedia;
let handlers;

const log = (message, isError = false) => {
    let date = new Date().toISOString();
    let output = `[${date.substring(0,10)} ${date.substring(11,19)}] ${message}`;

    if (isError) {
        console.error(output);
    } else {
        console.log(output);
    }
};

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
 * 上傳到 https://img.vim-cn.com
 */
const uploadToVimCN = (file) => new Promise((resolve, reject) => {
    const post = (pendingfile, callback) => request.post({
        url: 'https://img.vim-cn.com/',
        headers: {
            'User-Agent': 'LilyWhiteBot/1.3 (https://github.com/mrhso/LilyWhiteBot)'
        },
        formData: {
            name: pendingfile,
        },
    }, (error, response, body) => {
        if (typeof callback === 'function') {
            callback();
        }
        if (!error && response.statusCode === 200) {
            resolve(body.trim());
        } else {
            reject(error);
        }
    });

    if (file.url) {
        preprocessFile2(file.url, request.get(file.url)).then((f, filename) => {
            post(f, () => {
                if (filename) {
                    fs.unlink(filename, (err) => {
                        if (err) {
                            console.log(`Unable to unlink ${filename}`);
                        }
                    });
                }
            });
        });
    } else if (file.path) {
        post(fs.createReadStream(file.path));
    } else {
        reject('Invalid file');
        return;
    }
});

/*
 * 上傳到 https://sm.ms
 */
const uploadToSmms = (file) => new Promise((resolve, reject) => {
    const post = (pendingfile, callback) => request.post({
        url: 'https://sm.ms/api/upload',
        headers: {
            'User-Agent': 'LilyWhiteBot/1.3 (https://github.com/mrhso/LilyWhiteBot)'
        },
        json: true,
        formData: {
            smfile: pendingfile,
        },
    }, (error, response, body) => {
        if (typeof callback === 'function') {
            callback();
        }
        if (error) {
            reject(error);
        } else if (body && body.code !== 'success') {
            reject(body.msg);
        } else {
            resolve(body.data.url);
        }
    });

    if (file.url) {
        preprocessFile2(file.url, request.get(file.url)).then((f, filename) => {
            post(f, () => {
                if (filename) {
                    fs.unlink(filename, (err) => {
                        if (err) {
                            console.log(`Unable to unlink ${filename}`);
                        }
                    });
                }
            });
        });
    } else if (file.path) {
        post(fs.createReadStream(file.path));
    } else {
        reject('Invalid file');
        return;
    }
});

/*
 * 上傳到 https://imgur.com
 */
const uploadToImgur = (file, config) => new Promise((resolve, reject) => {
    const post = (pendingfile, callback) => request.post({
        url: config.apiUrl + 'upload',
        headers: {
            'Authorization': `Client-ID ${config.clientId}`,
        },
        json: true,
        formData: {
            type: 'file',
            image: pendingfile,
        },
    }, (error, response, body) => {
        if (typeof callback === 'function') {
            callback();
        }
        if (error) {
            reject(error);
        } else if (body && !body.success) {
            reject(body.data.error);
        } else {
            resolve(body.data.link);
        }
    });

    if (file.url) {
        preprocessFile2(file.url, request.get(file.url)).then((f, filename) => {
            post(f, () => {
                if (filename) {
                    fs.unlink(filename, (err) => {
                        if (err) {
                            console.log(`Unable to unlink ${filename}`);
                        }
                    });
                }
            });
        });
    } else if (file.path) {
        post(fs.createReadStream(file.path));
    } else {
        reject('Invalid file');
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
            reject(error);
        }
    };

    if (file.url) {
        name = preprocessFileName(path.basename(file.url));

        preprocessFile(file.url, request.get(file.url))
            .on('error', (e) => { reject(e); })
            .pipe(request.put({
                url: servemedia.linxApiUrl + name,
                headers: {
                    'Linx-Randomize': 'yes'
                }
            }, response));
    } else if (file.path) {
        name = path.basename(file.path);
        fs.createReadStream(file.path)
            .on('error', (e) => { reject(e); })
            .pipe(request.put({
                url: servemedia.linxApiUrl + name,
                headers: {
                    'Linx-Randomize': 'yes'
                }
            }, response));
    } else {
        reject('Invalid file');
    }
});

/*
 * 上傳到自行架設的 Uguu 圖床上面
 */
const uploadToUguu = (file) => new Promise((resolve, reject) => {
    const post = (pendingfile, name, callback) => request.post({
        url: servemedia.UguuApiUrl,
        formData: {
            "file": {
                value: pendingfile,
                options: {
                    filename: name
                }
            },
            randomname: "true"
        },
    }, (error, response, body) => {
        if (typeof callback === 'function') {
            callback();
        }
        if (!error && response.statusCode === 200) {
            resolve(body.trim());
        } else {
            reject(error);
        }
    });

    if (file.url) {
        let name = preprocessFileName(path.basename(file.url));
        preprocessFile2(file.url, request.get(file.url)).then((f, filename) => {
            post(f, name, () => {
                if (filename) {
                    fs.unlink(filename, (err) => {
                        if (err) {
                            console.log(`Unable to unlink ${filename}`);
                        }
                    });
                }
            });
        });
    } else if (file.path) {
        let name = path.basename(file.path);
        post(fs.createReadStream(file.path), name);
    } else {
        reject('Invalid file');
        return;
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
                uploadToVimCN(file).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'sm.ms':
                uploadToSmms(file).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'imgur':
                uploadToImgur(file, servemedia.imgur || {}).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'self':
                saveToCache(file, fileid).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'linx':
                uploadToLinx(file).then((url) => resolve(url), (e) => reject(e));
                break;

            case 'uguu':
            case 'Uguu':
                uploadToUguu(file).then((url) => resolve(url), (e) => reject(e));
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

const processQQFile = file => new Promise((resolve, reject) => {
    if (file.type === 'photo') {
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
            for (let file of context.extra.files) {
                if (servemedia.sizeLimit && servemedia.sizeLimit > 0 && file.size && file.size > servemedia.sizeLimit*1024) {
                    continue;
                }

                if (file.client === 'Telegram') {
                    promises.push(processTelegramFile(file));
                } else if (file.client === 'QQ') {
                    promises.push(processQQFile(file));
                }
            }
        }

        Promise.all(promises).then((uploads) => {
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
        log(`Error on processing files: ${e}`, true);
        msg.callbacks.push(new bridge.BridgeMsg(msg, {
            text: 'File upload error',
            isNotice: true,
            extra: {},
        }));
    }));
};
