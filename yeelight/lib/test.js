var yeeLight = require('./yee.js');

var api = new yeeLight.YeeAgent("192.168.1.16", onDevFound, onDevConn, onDevDiscon);

function onDevFound(dev) {
    console.log("dev found: " + dev.did);
    console.log("dev power: " + dev.power);
};

function onDevConn(dev) {
    console.log("dev conn: " + dev.did + " " + dev.name);
    dev.setPower(1);
    dev.setName("Light");
};

function onDevDiscon(dev) {
    console.log("dev disconn: " + dev.did);
};

api.startDisc();


