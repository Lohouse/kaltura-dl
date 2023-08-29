var downloading = false;
var durationSecond = 0;
var finishList = [];
var tsUrlList = [];
var aesConf = {
    method: "",
    uri: "",
    iv: "",
    key: "",
    decryptor: null,
    stringToBuffer: function(e) {
        return new TextEncoder().encode(e)
    }
}
var beginTime = "";
var isPause = false;
var downloadIndex = 0;
var errorNum = 0;
var errorList = [];
var mediaFileList = [];
var finishNum = 0;
var isComplete = false;

function alertError(err) {
    resetVars();
    alert(err);
}

function applyURL(m3u8Url, tsUrl) {
    if (tsUrl = tsUrl || location.href, m3u8Url.indexOf("http") === 0)
        return m3u8Url;
    if (m3u8Url[0] === "/") {
        let s = tsUrl.split("/");
        return s[0] + "//" + s[2] + m3u8Url;
    } else {
        let s = tsUrl.split("/");
        return s.pop(), s.join("/") + "/" + m3u8Url;
    }
}

function ajax(callbacks) {
    callbacks = callbacks || {};
    let req = new XMLHttpRequest;
    if (callbacks.type === "file") {
        req.responseType = "arraybuffer";
    }
    req.onreadystatechange = function() {
        if (req.readyState === 4) {
            let s = req.status;
            if (s >= 200 && s < 300) {
                if (callbacks.success) {
                    callbacks.success(req.response);
                }
            } else if (callbacks.fail) {
                callbacks.fail(s);
            }
        }
    }
    
    req.open("GET", callbacks.url, true);
    req.send(null);
}

function getM3U8(m3u8Url, progressElement) {
    if (downloading) {
        alert("Alredy downloading, please wait...");
        return
    }

    downloading = true;
    //tips = "m3u8 downloading, please wait";
    beginTime = new Date;
    ajax({
        url: m3u8Url,
        success: resp => {
            tsUrlList = [],
            resp.split(`
`).forEach(tsUrl => {
                if (tsUrl.toUpperCase().indexOf("#EXTINF:") > -1) {
                    durationSecond += parseFloat(tsUrl.split("#EXTINF:")[1]);
                }
                if (tsUrl.toLowerCase().indexOf(".ts") > -1) {
                    tsUrlList.push(applyURL(tsUrl, m3u8Url));
                    finishList.push({
                        title: tsUrl,
                        status: ""
                    });
                }
            });

            if (resp.indexOf("#EXT-X-KEY") > -1) {
                aesConf.method = (resp.match(/(.*METHOD=([^,\s]+))/) || ["", "", ""])[2];
                aesConf.uri = (resp.match(/(.*URI="([^"]+))"/) || ["", "", ""])[2];
                aesConf.iv = (resp.match(/(.*IV=([^,\s]+))/) || ["", "", ""])[2];
                aesConf.iv = aesConf.iv ? aesConf.stringToBuffer(aesConf.iv) : "";
                aesConf.uri = applyURL(aesConf.uri, m3u8Url);
                getAES();
            } else if (tsUrlList.length > 0) {
                downloadTS(progressElement);
            } else {
                alertError("The resource is empty, please check whether the link is valid");
            }
        },
        fail: () => {
            alertError("The resource is empty, please check whether the link is valid")
        }
    });
}

function getAES() {
    ajax({
        type: "file",
        url: aesConf.uri,
        success: resp => {
            aesConf.key = resp,
            aesConf.decryptor = new window.AESDecryptor,
            aesConf.decryptor.constructor(),
            aesConf.decryptor.expandKey(aesConf.key),
            downloadTS()
        }
        ,
        fail: () => {
            alertError("AES error")
        }
    });
}

function downloadTS(progressElement) {
    //tips = "ts fragment downloading, please wait";

    let dlRetry = () => {
        let currentlyPaused = isPause;
        let currentDownloadIndex = downloadIndex;

        downloadIndex++;

        if (finishList[currentDownloadIndex] && finishList[currentDownloadIndex].status === "") {
            ajax({
                url: tsUrlList[currentDownloadIndex],
                type: "file",
                success: resp => {
                    dealTS(
                        resp, 
                        currentDownloadIndex,
                        progressElement, 
                        function () {
                            if (downloadIndex < tsUrlList.length && !currentlyPaused) {
                                dlRetry();
                            }
                        }
                    )
                }
                ,
                fail: () => {
                    errorNum++;
                    finishList[currentDownloadIndex].status = "error";
                    finishList[currentDownloadIndex].errorIndex = currentDownloadIndex;
                    errorList.push(finishList[currentDownloadIndex]);
                    if (downloadIndex < tsUrlList.length && !currentlyPaused) {
                        dlRetry();
                    }
                }
            });

        } else if (downloadIndex < tsUrlList.length && !currentlyPaused) {
            dlRetry();
        }
    };

    for (let t = 0; t < 10; t++) {
        dlRetry();
    }
}

function aesDecrypt(tsContent, dlContent) {
    let s = aesConf.iv || new Uint8Array([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, dlContent]);
    return aesConf.decryptor.decrypt(tsContent, 0, s.buffer || s, !0);
}

function dealTS(tsContent, dlIndex, progressElement, dlRetry) {
    const decryptedContent = aesConf.uri ? aesDecrypt(tsContent, dlIndex) : tsContent;

    conversionMp4(decryptedContent, dlIndex, i => {
        mediaFileList[dlIndex] = i;
        finishList[dlIndex].status = "finish";
        finishNum++;

        if (finishNum === tsUrlList.length) {
            downloadFile(mediaFileList, formatTime(beginTime, "YYYY_MM_DD hh_mm_ss"));

            let prevContent = progressElement.innerHTML;
            progressElement.innerHTML = "Done!";
            setTimeout(() => {
                progressElement.innerHTML = prevContent;
                progressElement.style.background = "transparent";
            }, 3000);
        } else {
            let progress = Math.ceil(finishNum / tsUrlList.length * 100);
            progressElement.style.background = "linear-gradient(to right, #00bf00 " + progress + "%, transparent 0%)";
        }
        if (dlRetry) {
            dlRetry();
        }
    });
}

function formatTime(beginTime, format) {
    const s = {
        Y: beginTime.getFullYear(),
        M: beginTime.getMonth() + 1,
        D: beginTime.getDate(),
        h: beginTime.getHours(),
        m: beginTime.getMinutes(),
        s: beginTime.getSeconds()
    };
    return format.replace(/Y+|M+|D+|h+|m+|s+/g, n=>(new Array(n.length).join("0") + s[n[0]]).substr(-n.length));
}

function conversionMp4(content, dlIndex, callback) {
    let n = new window.muxjs.Transmuxer({
        keepOriginalTimestamps: true,
        duration: parseInt(durationSecond)
    });

    n.on("data", i => {
        if (dlIndex === 0) {
            let r = new Uint8Array(i.initSegment.byteLength + i.data.byteLength);
            r.set(i.initSegment, 0);
            r.set(i.data, i.initSegment.byteLength);
            callback(r.buffer);
        } else {
            callback(i.data);
        }
    });

    n.push(new Uint8Array(content));
    n.flush();
}

function downloadFile(mediaFiles, startTimeStr) {
    //tips = "ts fragment integration, please pay attention to the browser download";
    let s = null;
    let n = document.createElement("a");

    s = new Blob(mediaFiles,{
        type: "video/mp4"
    });

    n.download = startTimeStr + ".mp4";
    n.href = URL.createObjectURL(s);
    n.style.display = "none";
    document.body.appendChild(n);
    n.click();
    n.remove();
    
    resetVars();
}

function resetVars() {
    downloading = false;
    durationSecond = 0;
    finishList = [];
    tsUrlList = [];
    aesConf = {
        method: "",
        uri: "",
        iv: "",
        key: "",
        decryptor: null,
        stringToBuffer: function(e) {
            return new TextEncoder().encode(e)
        }
    }
    beginTime = "";
    isPause = false;
    downloadIndex = 0;
    errorNum = 0;
    errorList = [];
    mediaFileList = [];
    finishNum = 0;
    isComplete = false;
}

function transformUrl(inputString) {
    const indexOfThumbnail = inputString.indexOf('&thumbnail=');
    if (indexOfThumbnail === -1) {
        return null;
    }

    const frontCut = inputString.substring(indexOfThumbnail + '&thumbnail='.length);

    const indexOfVersion = frontCut.indexOf('/version/');
    if (indexOfVersion === -1) {
        return null;
    }

    const cutBack = frontCut.substring(0, indexOfVersion + 1);
    const resultString = cutBack.replace("http", "https")
        .replace("cfvod", "cdnapisec")
        .replace("thumbnail", "playManifest")
        .replace("entry_id", "entryId")
        + "format/applehttp/protocol/https/a.m3u8?responseFormat=jsonp&callback=";

    return resultString;
}

async function fetchM3u8Urls(url) {
    try {
        const response = await fetch(url);
  
        if (!response.ok) {
            console.log("Could not fetch video URL:", url);
            return null;
        }
  
        const m3u8Content = await response.text();
        const data = JSON.parse(m3u8Content.substring(1, m3u8Content.length - 2));
    
        return data;
    } catch (error) {
        console.log("Error while fetching URL:", url);
        return null;;
    }
}

function createDownloadButtons(videoWrapper, flavors) {
    const wrapperDiv = document.createElement('div');
    videoWrapper.appendChild(wrapperDiv);
    wrapperDiv.setAttribute('style', 'display: flex; flex-wrap: wrap;');

    flavors.forEach((flavor, strIndex) => {
        const childDiv = document.createElement('div');
        wrapperDiv.appendChild(childDiv);
        const divContent = flavor.width + "x" + flavor.height;
        childDiv.innerHTML = divContent;
        childDiv.setAttribute('style', 'border: 1px solid #ccc; padding: 10px; margin: 5px; cursor: pointer;');

        childDiv.addEventListener('click', () => {
            if (!downloading) {
                getM3U8(flavor.url, childDiv);
            }
        });
    });
}  

function main() {
    scriptUrls = [
        "https://m3u8.dev/js/aes-decryptor.js",
        "https://m3u8.dev/js/mux-mp4.js"
    ];
    for (var i = 0; i < scriptUrls.length; i++) {
        var script = document.createElement('script');
        script.src = scriptUrls[i];
        document.head.appendChild(script);
    }

    const iframes = document.querySelectorAll("iframe");
    iframes.forEach((iframe) => {
        const src = iframe.getAttribute("src");
        const transformedUrl = transformUrl(src);
        if (transformedUrl) {
            fetchM3u8Urls(transformedUrl).then((data) => {
                if (data) {
                    createDownloadButtons(iframe.parentNode.parentNode, data.flavors);
                }
            });
        }
    });
}

main();