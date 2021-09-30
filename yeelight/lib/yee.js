var net = require("net");
var dgram = require('dgram');
var noble = null;

var bleCmd = [];
bleCmd.length = 18;

try {
    var noble = require('noble');
} catch (ex) {
    console.log("failed to load BLE module!");
}

var PORT = 1982;
var MCAST_ADDR = '239.255.255.250';
var discMsg = new Buffer('M-SEARCH * HTTP/1.1\r\nMAN: \"ssdp:discover\"\r\nST: wifi_bulb\r\n');

YeeDevice = function (did, loc, model, power, bri, hue, sat, ct, name, color_mode, cb, ...rest) {
    var tmp              = loc.split(":");
    var host             = tmp[0];
    var port             = tmp[1];

    this.did             = did;
    this.host            = host;
    this.port            = parseInt(port, 10);
    this.model           = model;
    this.name            = name;

    this.power           = power == 'on' ? 1 : 0;
    this.bright          = parseInt(bri,10);
    this.hue             = parseInt(hue,10);
    this.sat             = parseInt(sat,10);
    this.connected       = false;
    this.sock            = null;
    this.ctx             = null;
    this.ct              = transform_ct(ct, this.model, 'dev_to_hk');
    this.color_mode      = parseInt(color_mode,10);
    this.retry_tmr       = null;
    this.hb_tmr          = null;
    this.hb_lost         = 0;
    this.retry_cnt       = 0;
    this.propChangeCb    = cb;

    this.bleDevRWHdl     = null
    this.bleDevNotifyHdl = null;
    this.discovering     = 0;


    this.update = function(loc, power, bri, hue, sat, ct, color_mode, name) {
        var tmp     = loc.split(":");
        var host    = tmp[0];
        var port    = tmp[1];
        this.host   = host;
        this.port   = parseInt(port, 10);
        this.power  = power == 'on' ? 1 : 0;
        this.bright = bri;
        this.hue    = parseInt(hue, 10);
        this.sat    = parseInt(sat, 10);
        this.color_mode = parseInt(color_mode, 10);
        this.ct     = transform_ct(ct, this.model, 'dev_to_hk');
        this.name   = name;
    }.bind(this);

    this.connect = function(callback) {
        var that = this;

        if (this.connected == true) {
            return;
        }

        this.connected    = true;
        this.connCallback = callback;

        this.sock = new net.Socket();
        this.sock.connect(this.port, this.host, function() {
            if (!that.sock)
                return;
            that.retry_cnt = 0;
            that.sock.setNoDelay(true);
            clearTimeout(that.retry_tmr);
            that.hb_tmr = setInterval(that.handleHb, 10000);
            that.hb_lost = 0;
            callback(0);
        });

        this.handleHb = function () {
            that.hb_lost ++;

            if (that.hb_lost > 2) {
                console.log("heartbeat lost, close socket and reconnect");
                that.handleSockError();
                return;
            }

            console.log("send hb to: " + that.did);

            that.sendCmd({
                id: 0,
                method: 'get_prop',
                params: ['power', 'bright', 'rgb']
            });
        };


        this.sock.on("data", function(data) {
            var msg = data.toString();
            var rsps = msg.split("\r\n");

            rsps.forEach(function (json, idex, array) {
                try {
                    JSON.parse(json, function(k,v) {
                       if (k == 'id') {
                           that.hb_lost = 0;
                       }

                       if (k == 'power') {
                           that.power = v == 'on' ? 1 : 0;
                           that.propChangeCb(that, 'power', that.power);
                       } else if (k == 'bright') {
                           that.bright = parseInt(v, 10);
                           that.propChangeCb(that, 'bright', that.bright);
                       } else if (k == 'hue') {
                           that.hue = parseInt(v, 10);
                           that.propChangeCb(that, 'hue', that.hue);
                       } else if (k == 'sat') {
                           that.sat = parseInt(v, 10);
                           that.propChangeCb(that, 'sat', that.sat);
                       } else if (k == 'rgb') {
                           var p = rgbToHsv(parseInt(v, 10));
                           that.hue = p[0];
                           that.sat = p[1];
                           that.propChangeCb(that, 'hue', that.hue);
                           that.propChangeCb(that, 'sat', that.sat);
                       } else if (k == 'ct') {
                           that.ct = transform_ct(v, that.model, 'dev_to_hk');
                           that.propChangeCb(that, 'ct', that.ct);
                       } else if (k == 'active_mode') {
                           that.color_mode = parseInt(v, 10);
                           that.propChangeCb(that, 'night_mode', that.color_mode);
                       }
                    });
                } catch(e) {
                    //console.log(e);
                }
           });
        });

        this.sock.on("end", that.handleSockError);
        this.sock.on("error", that.handleSockError);
    }.bind(this);

    this.handleSockError = function () {
        console.log("closed the socket and retry");
        this.connected = false;
        this.sock = null;
        this.connCallback(-1);
        this.retry_tmr = setTimeout(this.handleDiscon, 3000);
        clearTimeout(this.hb_tmr);
    }.bind(this);

    this.handleDiscon = function () {
        console.log("retry connect (" + this.retry_cnt + ") ...: " + this.did);
        this.retry_cnt = this.retry_cnt + 1;
        if (this.retry_cnt > 9)
            return;

        this.connect(this.connCallback);
    }.bind(this);

    this.sendBLECmd = function () {
        if (!this.bleDevRWHdl)
            return;

        this.bleDevRWHdl.write(new Buffer(bleCmd), false, function(error) {});
    }.bind(this);

    this.setPower = function(is_on) {
        this.power = is_on;

        if (this.model == "bedside") {
            bleCmd[0] = 0x43;
            bleCmd[1] = 0x40;
            bleCmd[2] = is_on ? 0x01 : 0x02;

            this.sendBLECmd();
            return;
        }

        var on_off = "on";

        if (!is_on)
            on_off = "off";

        this.sendCmd({
            id: 1,
            method: 'set_power',
            params: [on_off, "smooth", 500]
        });
    }.bind(this);

    this.setBright = function(val) {
        this.bright = val;

        if (this.model == "bedside") {
            bleCmd[0] = 0x43;
            bleCmd[1] = 0x42;
            bleCmd[2] = parseInt(val.toString(16), 16);

            this.sendBLECmd();
            return;
        }

        this.sendCmd({
            id: 1,
            method: 'set_bright',
            params: [val, 'smooth', 500]
        });
    }.bind(this);

    this.setNightMode = function(val) {
        var mode = 1
        if (val) {
            mode = 5
        }
        this.sendCmd({
            id: 1,
            method: 'set_power',
            params: ['on', "smooth", 500, mode]
        });
    }.bind(this);

    this.setColor = function (hue, sat) {
        this.hue = hue;
        this.sat = sat;

        if (this.model == "bedside") {
            rgb = hsv2rgb(parseFloat(hue/360), parseFloat(sat/100), 1);

            bleCmd[0] = 0x43;
            bleCmd[1] = 0x41;
            bleCmd[2] = parseInt(rgb.r.toString(16), 16);
            bleCmd[3] = parseInt(rgb.g.toString(16), 16);
            bleCmd[4] = parseInt(rgb.b.toString(16), 16);
            bleCmd[5] = 0xFF;
            bleCmd[6] = 0x65;

            this.sendBLECmd();
            return;
        }

        if (!this.power) {
            this.setPower(1);
        }

        if (this.model == "ceiling4") {
            this.sendCmd({
                id: 1,
                method: 'bg_set_hsv',
                params: [hue, sat, 'smooth', 500]
            });
            return
        }

        this.sendCmd({
            id: 1,
            method: 'set_hsv',
            params: [hue, sat, 'smooth', 500]
        });
    }.bind(this);

    this.setCT = function (ct) {
        this.ct = ct;

        if (!this.power) {
            this.setPower(1);
        }

        var trans_ct = transform_ct(ct, this.model, 'hk_to_dev');

        if (this.model == "bedside") {
            bleCmd[0] = 0x43;
            bleCmd[1] = 0x43;
            bleCmd[2] = trans_ct >> 8;
            bleCmd[3] = trans_ct & 255;
            bleCmd[4] = 0x00; // don't set a brightness
            this.sendBLECmd();
            return;
        }

        var req = {id:1, method:'set_ct_abx',
            params:[trans_ct, 'smooth', 500]};
        this.sendCmd(req);

    }.bind(this);

    this.setBlink = function () {
        this.sendCmd({
            id: 1,
            method: 'start_cf',
            params: [6,0,'500,2,4000,1,500,2,4000,50']
        });
    }.bind(this);

    this.setName = function (name) {
        this.name = name;
        this.sendCmd({
            id: 1,
            method: 'set_name',
            params:[new Buffer(name).toString('base64')]
       });
    }.bind(this);

    this.sendCmd = function(cmd) {
        if (this.sock == null || this.connected == false) {
            console.log("connection broken" + this.connected + "\n" + this.sock);
            return;
        }
        var msg = JSON.stringify(cmd);

        console.log(msg);

        this.sock.write(msg + "\r\n");
    }.bind(this);
};

exports.YeeAgent = function(ip, handler) {
    this.ip         = ip;
    this.log        = handler.log;
    this.discSock   = dgram.createSocket('udp4');
    this.scanSock   = dgram.createSocket('udp4');
    this.devices    = {};
    this.handler    = handler;
    this.bleScanTmr = null;
    this.bleStopTmr = null;

    this.getDevice = function(did) {
        if (did in this.devices)
            return this.devices[did];
        else
            return null;
    }.bind(this);

    this.delDevice = function(did) {
        delete this.devices[did];
    }.bind(this);

    this.discSock.bind(PORT, function() {
        this.log("add to multicast group");
        this.discSock.setBroadcast(true);
        this.discSock.setMulticastTTL(128);
        this.discSock.addMembership(MCAST_ADDR);
    }.bind(this));

    this.discSock.on('listening', function() {
        var address = this.discSock.address();
        this.log('listen on ' + address.address);
    }.bind(this));

    this.handleDiscoverMsg = function(message, from) {
        var that = this;
        did      = "";
        loc      = "";
        power    = "";
        bright   = "";
        model    = "";
        hue      = "";
        sat      = "";
        ct       = "";
        color_mode = "";
        name     = "";

        headers = message.toString().split("\r\n");

        for (i = 0; i < headers.length; i++) {
            if (headers[i].indexOf("id:") >= 0)
                did = headers[i].slice(4);
            if (headers[i].indexOf("Location:") >= 0)
                loc = headers[i].slice(10);
            if (headers[i].indexOf("power:") >= 0)
                power = headers[i].slice(7);
            if (headers[i].indexOf("bright:") >= 0)
                bright = headers[i].slice(8);
            if (headers[i].indexOf("model:") >= 0)
                model = headers[i].slice(7);
            if (headers[i].indexOf("hue:") >= 0)
                hue = headers[i].slice(5);
            if (headers[i].indexOf("sat:") >= 0)
                sat = headers[i].slice(5);
            if (headers[i].indexOf("ct:") >= 0)
                ct =  headers[i].slice(4);
            if (headers[i].indexOf("color_mode:") >= 0)
                color_mode = headers[i].slice(12);
            if (headers[i].indexOf("name:") >= 0)
                ame = new Buffer(headers[i].slice(6), 'base64').toString('utf8');
        }

        if (did == "" || loc == "" || model == "" || power == "" || bright == "") {
            this.log("no did or loc found!");
            return;
        }

        loc = loc.split("//")[1];
        if (loc == "") {
            this.log("location format error!");
            return;
        }

        if (did in this.devices) {
            this.log("already in device list!");
            this.devices[did].update(loc, power, bright, hue, sat, ct, name, color_mode);
        } else {
            this.devices[did] = new YeeDevice(did, loc, model, power, bright, hue, sat, ct, name, color_mode, this.devPropChange);
            this.handler.onDevFound(this.devices[did]);
        }

        if (this.devices[did].connected == false &&
            this.devices[did].sock == null) {

            var dev = this.devices[did];

            dev.connect(function(ret) {
                if (ret < 0) {
                    that.log("failed to connect!");
                    that.handler.onDevDisconnected(dev);
                } else {
                    that.log("connect ok!");
                    that.handler.onDevConnected(dev);
                }
            });
        }
    }.bind(this);

    this.devPropChange = function (dev, prop, val) {
        this.log(dev.did + " property change: " + prop + " value: " + val);
        this.handler.onDevPropChange(dev, prop, val);
    }.bind(this);

    this.scanSock.on('message', this.handleDiscoverMsg);
    this.discSock.on('message', this.handleDiscoverMsg);

    this.startDisc = function() {
        var that = this;

        this.scanSock.send(discMsg, 0, discMsg.length, PORT, MCAST_ADDR);

        if (!noble) {
            this.log("no ble cap, skip ble device discovery");
            return;
        }

        noble.on('stateChange', function(state) {
            if (state == 'poweredOn') {
                that.bleScanTmr = setTimeout(that.scanBLE, 16000);
                that.bleStopTmr = setTimeout(that.stopScanBLE, 8000);
                noble.startScanning();
            } else {
                noble.stopScanning();
            }
        });

        noble.on('discover', function(peripheral) {
            var localName = peripheral.advertisement.localName

            if (localName && localName.indexOf("XMCTD_") >= 0) {
                that.log("found Yeelight Bedside lamp: " + peripheral.address);
                that.handleBLEDevice(peripheral);
            }
        });
    }.bind(this);


    this.scanBLE = function() {
        noble.startScanning();
        this.bleScanTmr = setTimeout(this.scanBLE, 16000);
        this.bleStopTmr = setTimeout(this.stopScanBLE, 8000);
        this.log("start new round of scan");
    }.bind(this);

    this.stopScanBLE = function() {
        noble.stopScanning();
        this.log("stop this round of scan");
    }.bind(this);

    this.handleBLEDevice = function(pdev) {
        var did = pdev.address;
        var that = this;


        if (did in that.devices) {
            that.log("already in device list: " + did);
        } else {

            that.devices[did] = new YeeDevice(did,
                                              "0.0.0.0:0",
                                              "bedside",
                                              "on",
                                              "100",
                                              "360",
                                              "100",
                                              "0",
                                              "unknown",
                                              that.devPropChange
                                             );
          
            this.handler.onDevFound(that.devices[did]);
        }

        if (that.devices[did].connected == false) {
            if (that.devices[did].discovering) {
                that.log("still discovering");
                return;
            }

            pdev.disconnect();
            that.devices[did].discovering = 1;
            setTimeout(function() {
                that.log("stop discovering");
                that.devices[did].discovering = 0;
            }, 10000);

            pdev.connect(function(ret) {
                if (ret < 0) {
                    that.log("failed to connect!");
                    that.handler.onDevDisconnected(that.devices[did]);
                } else {
                    that.log("connect ok: " + did);

                    pdev.discoverServices(['8e2f0cbd1a664b53ace6b494e25f87bd'], function(error, services) {
                        that.log('discovered services');
                        that.devices[did].discovering = 0;
                        var deviceInformationService = services[0];

                        deviceInformationService.discoverCharacteristics(
                             ['aa7d3f342d4f41e0807f52fbf8cf7443', '8f65073d9f574aaaafea397d19d5bbeb'],
                             function(error, characteristics) {
                                 that.devices[did].bleDevRWHdl = characteristics[0];
                                 that.devices[did].bleDevNotifyHdl = characteristics[1];
                                 that.devices[did].bleDevNotifyHdl.on('data', function(data, isNotify) {
                                     that.handleBLENotify(did, data, isNotify);
                                 });

                                 that.devices[did].bleDevNotifyHdl.subscribe(function(error) {
                                     that.log('ble notification on');
                                     // 43 67 for auth
                                     bleCmd[0] = 0x43;
                                     bleCmd[1] = 0x67;
                                     // deadbeef as magic for our Pi
                                     bleCmd[2] = 0xde;
                                     bleCmd[3] = 0xad;
                                     bleCmd[4] = 0xbe;
                                     bleCmd[5] = 0xbf;

                                     that.devices[did].sendBLECmd();
                                     that.devices[did].connected = true;
                                     that.handler.onDevConnected(that.devices[did]);
                               });
                        });
                    });
                }
            });
        } else {
            that.log("lose connection with BLE: " + pdev.address);

            if (that.devices[did].bleDevNotifyHdl) {
                that.devices[did].bleDevNotifyHdl.unsubscribe(function(error) {
                    that.log('ble notification off');
                });
            }
            that.devices[did].bleDevRWHdl     = null;
            that.devices[did].bleDevNotifyHdl = null;
            that.devices[did].connected       = false;
            that.handler.onDevDisconnected(that.devices[did]);
        }
    }.bind(this);

    this.handleBLENotify = function(did, data, isNotify) {
        this.log("receive notify for did: " + did);

        dev = this.devices[did];

        if (data[0] == 0x43 && data[1] == 0x45) {
            if (data[2] == 1)
                dev.propChangeCb(dev, 'power', 1);
            else
                dev.propChangeCb(dev, 'power', 0);

            dev.propChangeCb(dev, 'bright', data[8]);

            switch (data[3]) {
                case 2: // "sunshine" aka white mode
                    var temp = (data[9] << 8) + (data[10] & 255);
                    dev.propChangeCb(dev, 'ct', transform_ct(temp, dev.model, "dev_to_hk"));
                    dev.propChangeCb(dev, 'sat', 0);
                    break;
                case 1: // "color" mode
                    var red = data[4];
                    var green = data[5];
                    var blue = data[6];
                    var p = rgbToHsv((red << 16) + (green << 8) + blue);
                    dev.propChangeCb(dev, 'hue', p[0]);
                    dev.propChangeCb(dev, 'sat', p[1]);
                    break;
                case 3:
                    console.log("lamp entered flow mode");
                    break;
            }

            console.log("power: " + data[2] + " bright: " + data[8]);
        }   
    }.bind(this);
};

/* accepts parameters
 * h  Object = {h:x, s:y, v:z}
 * OR
 * h, s, v
*/
function hsv2rgb(h, s, v) {
    var r, g, b, i, f, p, q, t;
    if (arguments.length === 1) {
        s = h.s, v = h.v, h = h.h;
    }

    i = Math.floor(h * 6);
    f = h * 6 - i;
    p = v * (1 - s);
    q = v * (1 - f * s);
    t = v * (1 - (1 - f) * s);
    switch (i % 6) {
        case 0: r = v, g = t, b = p; break;
        case 1: r = q, g = v, b = p; break;
        case 2: r = p, g = v, b = t; break;
        case 3: r = p, g = q, b = v; break;
        case 4: r = t, g = p, b = v; break;
        case 5: r = v, g = p, b = q; break;
    }
    return {
        r: Math.round(r * 255),
        g: Math.round(g * 255),
        b: Math.round(b * 255)
    };
}


function rgbToHsv(rgb) {

    var r = ((rgb & 0xFF0000) >> 16) / 255.0;
    var g = ((rgb & 0xFF00) >> 8) / 255.0;
    var b = ((rgb & 0xFF)) / 255.0;

    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var h, s, v = max;

    var d = max - min;
    s = max == 0 ? 0 : d / max;

    if (max == min) {
        h = 0; // achromatic
    } else {
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return [ Math.round(h * 360), Math.round(s * 100)];
}

function line_map(x1, y1, x2, y2, x) {
    var k = (y2 - y1) / (x2 -x1);
    var b = y1 - k * x1;

    return parseInt(k * x + b);
}

function transform_ct(ct, model, type) {

    var min_ct = (model == "bedside") ? 1700 : 2700;
    var max_ct = 6500;
    var min_hk_ct = 500;
    var max_hk_ct = 140;

    if (type == 'hk_to_dev') {
        //from [140, 500]
        var trans_ct = line_map(min_hk_ct, min_ct, max_hk_ct, max_ct, parseInt(ct, 10));
        return trans_ct;
    } else if (type == 'dev_to_hk') {
        var trans_ct = line_map(min_ct, min_hk_ct, max_ct, max_hk_ct, parseInt(ct, 10));
        return trans_ct;
    } else {
        console.log("ct transform error" + type);
    }
}
