var yeeLight = require('./yee.js');


YeeHandler  = function(){

	this.onDevFound = function(dev) {
	    console.log("dev found: " + dev.did);
	    console.log("dev power: " + dev.power);
	};

	this.onDevConnected = function(dev) {
	    console.log("dev conn: " + dev.did + " " + dev.name);
	    dev.setPower(1);
	    //dev.setName("Light");
	};

	this.onDevDisconnected = function(dev) {
	    console.log("dev disconn: " + dev.did);
	};

	this.onDevPropChange = function(dev, prop, val) {
	    console.log("dev DevPropChange: " + dev.did + " prop: " + prop + " val: " + val);
	};
};

var api = new yeeLight.YeeAgent("192.168.1.16", new YeeHandler());


api.startDisc();


