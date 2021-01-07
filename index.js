const zlib = require('zlib');
const WebSocket = require('ws');

const textEncoder = new TextEncoder('utf-8');
const textDecoder = new TextDecoder('utf-8');

const ROOM_ID = 23058;

const readInt = (buffer, start, len) => {
    let result = 0;
    for (let i = len - 1; i >= 0; i--) {
        result += Math.pow(256, len - i - 1) * buffer[start + i];
    }
    return result;
}

const writeInt = (buffer, start, len, value) => {
    let i = 0;
    while (i < len) {
        buffer[start + i] = value / Math.pow(256, len - i - 1);
        i++;
    }
}

const encode = (str, op) => {
    let data = textEncoder.encode(str);
    let packetLen = 16 + data.byteLength;
    let header = [0, 0, 0, 0, 0, 16, 0, 1, 0, 0, 0, op, 0, 0, 0, 1];
    writeInt(header, 0, 4, packetLen);
    return (new Uint8Array(header.concat(...data))).buffer;
}

const decoder = (blob) => {
    let buffer = new Uint8Array(blob);
    let result = {};
    result.packetLen = readInt(buffer, 0, 4);
    result.headerLen = readInt(buffer, 4, 2);
    result.ver = readInt(buffer, 6, 2);
    result.op = readInt(buffer, 8, 4);
    result.seq = readInt(buffer, 12, 4);
    if (result.op === 5) {
        result.body = [];
        let offset = 0;
        while (offset < buffer.length) {
            let packetLen = readInt(buffer, offset + 0, 4);
            let headerLen = 16;
            let data;
            if (result.ver == 2) {
                data = buffer.slice(offset + headerLen, offset + packetLen);
                let newBuffer = zlib.inflateSync(new Uint8Array(data));
                const obj = decoder(newBuffer);
                const body = obj.body;
                result.body = result.body.concat(body);
            } else {
                data = buffer.slice(offset + headerLen, offset + packetLen);
                let body = textDecoder.decode(data);
                if (body) {
                    result.body.push(JSON.parse(body));
                }
            }
            offset += packetLen;
        }
    } else if (result.op === 3) {
        result.body = {
            count: readInt(buffer, 16, 4)
        };
    }
    return result;
}

const decode = (blob) => {
    return new Promise((resolve) => {
        const result = decoder(blob);
        resolve(result)
    });
}

const ws = new WebSocket('wss://broadcastlv.chat.bilibili.com:2245/sub');
ws.onopen = () => {
    ws.send(encode(JSON.stringify({
        roomid: ROOM_ID
    }), 7));
};

// 心跳
setInterval(() => {
    ws.send(encode('', 2));
}, 30000);

ws.onmessage = async (msgEvent) => {
    const packet = await decode(msgEvent.data);
    // console.log('packet:', packet);
    switch (packet.op) {
        case 8:
            console.log('加入房间');
            break;
        case 3:
            const count = packet.body.count
            console.log(`人气：${count}`);
            break;
        case 5:
            packet.body.forEach((body) => {
                switch (body.cmd) {
                    case 'DANMU_MSG':
                        console.log('barrage:', body.info);
                        console.log(`${body.info[2][1]}: ${body.info[1]}`);
                        break;
                    case 'SEND_GIFT':
                        console.log(`${body.data.uname} ${body.data.action} ${body.data.num} 个 ${body.data.giftName}`);
                        break;
                    case 'WELCOME':
                        console.log(`欢迎 ${body.data.uname}`);
                        break;
                        // 此处省略很多其他通知类型
                    default:
                        console.log(body);
                }
            })
            break;
        default:
            console.log(packet);
    }
};