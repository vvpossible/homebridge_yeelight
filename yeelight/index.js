var yeeLight = require('./lib/yee.js');
var Service, Characteristic, Accessory, UUIDGen;

module.exports = function(homebridge) {
    Accessory = homebridge.platformAccessory;
    
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    
    homebridge.registerPlatform("homebridge-yeelight", "yeelight", YeePlatform, true);    
}

function YeePlatform(log, config, api) {
    log("YeePlatform Init");
    
    this.log = log;
    this.config = config;
    this.yeeAccessories = [];
    
    var platform = this;
    
    if (api) {
	this.api = api;

	this.api.on('didFinishLaunching', function() {
	    platform.log("DidFinishLaunching");
	    
            platform.yeeAgent = new yeeLight.YeeAgent("0.0.0.0", platform);
            platform.yeeAgent.startDisc();
	    
	}.bind(this));
    }
}

YeePlatform.prototype = {

    onDevFound: function(dev) {

	this.log("found " + dev.did + " " + dev.connected);
	
	var that = this;
	var uuid;
	var found = 0;
	var newAccessory = null;
	var lightbulbService = null;
	
	for (var index in this.yeeAccessories) {
	    var accessory = this.yeeAccessories[index];
	    if (accessory.context.did == dev.did) {
		newAccessory = accessory;
		found = 1;
		break;
	    }
	}

	if (found) {
	    this.log("cached accessory: " + newAccessory.context.did);
	    lightbulbService = newAccessory.getService(Service.Lightbulb);
	} else {
	    uuid = UUIDGen.generate(dev.did);
	    newAccessory = new Accessory("yeelight", uuid);
	    newAccessory.context.did = dev.did;
	    newAccessory.context.model = dev.model;
	    lightbulbService = new Service.Lightbulb("yeelight");	    
	}
	
	dev.ctx = newAccessory;
	
	lightbulbService
	    .getCharacteristic(Characteristic.On)
	    .on('set', function(value, callback) { that.exeCmd(dev.did, "power", value, callback);})
	    .value = dev.power;

	if (!found) {
	    lightbulbService
		.addCharacteristic(Characteristic.Brightness)
		.on('set', function(value, callback) { that.exeCmd(dev.did, "brightness", value, callback);})
		.value = dev.bright;

	    if (dev.model == "color" || dev.model == "stripe") {
		lightbulbService
		    .addCharacteristic(Characteristic.Hue)
		    .on('set', function(value, callback) { that.exeCmd(dev.did, "hue", value, callback);})
	            .value = dev.hue;

		lightbulbService
		    .addCharacteristic(Characteristic.Saturation)
		    .on('set', function(value, callback) { that.exeCmd(dev.did, "saturation", value, callback);})
	            .value = dev.sat;
	    }
	} else {
	    lightbulbService
		.getCharacteristic(Characteristic.Brightness)
		.on('set', function(value, callback) { that.exeCmd(dev.did, "brightness", value, callback);})
		.value = dev.bright;

	    if (dev.model == "color" || dev.model == "stripe") {
		lightbulbService
		    .getCharacteristic(Characteristic.Hue)
		    .on('set', function(value, callback) { that.exeCmd(dev.did, "hue", value, callback);})
	            .value = dev.hue;
		

		lightbulbService
		    .getCharacteristic(Characteristic.Saturation)
		    .on('set', function(value, callback) { that.exeCmd(dev.did, "saturation", value, callback);})
	            .value = dev.sat;
	    }	    
	}

	newAccessory.reachable = true;

	if (!found) {
	    newAccessory.addService(lightbulbService);
	    this.yeeAccessories.push(newAccessory);
	    this.api.registerPlatformAccessories("homebridge-yeelight", "yeelight", [newAccessory]);
	}
    },

    onDevConnected: function(dev) {
	this.log("accesseory become reachable");

	this.log("dev connected " + dev.did + " " + dev.connected);	
	var accessory = dev.ctx;
	accessory.updateReachability(true);	
    },

    onDevDisconnected: function(dev) {
	this.log("accesseory become unreachable");

	this.log("dev disconnected " + dev.did + " " + dev.connected);	
	var accessory = dev.ctx;

	// updateReachability seems have bug, but remove the accessory will cause
	// the name of the light gone, leave the user to decide...
	if (1) {
	    accessory.updateReachability(false);	    
	} else {
	    this.api.unregisterPlatformAccessories("homebridge-yeelight", "yeelight", [accessory]);

	    var idx = this.yeeAccessories.indexOf(accessory);
	    if (idx > -1) {
		this.yeeAccessories.splice(idx, 1);
	    }

	    this.yeeAgent.delDevice(dev.did);
	}
    },

    configureAccessory: function(accessory) {
	this.log(accessory.displayName, "Configure Accessory");
	
	var platform = this;

	//accessory.updateReachability(false);
	accessory.reachable = true;

	accessory.on('identify', function(paired, callback) {
	    platform.log(accessory.displayName, "Identify!!!");
	    callback();
	});

	this.yeeAccessories.push(accessory);
	
	return;
    },

    exeCmd: function(did, characteristic, value, callback) {

        dev = this.yeeAgent.getDevice(did);

        if (dev == null) {
self.log("no device found for did: " + did);
            return;
        }

	switch(characteristic.toLowerCase()) {
	    
	case 'identify':
	    dev.setBlink();
	    break;
	case 'power':
	    dev.setPower(value);
	    break;
	case 'hue':
	    dev.setColor(value, dev.sat);
	    break;
	case 'brightness':
	    dev.setBright(value);
	    break;
	case 'saturation':
	    dev.setColor(dev.hue, value);
	    break;
	default:
	    break;
	}

	if (callback)
	    callback();
    },
    
    /*
    configurationRequestHandler : function(context, request, callback) {
	this.log("Context: ", JSON.stringify(context));
	this.log("Request: ", JSON.stringify(request));

	// Check the request response
	if (request && request.response && request.response.inputs && request.response.inputs.name) {
	    this.addAccessory(request.response.inputs.name);
	    return;
	}


	var respDict = {
	    "type": "Interface",
	    "interface": "input",
	    "title": "Add Accessory",
	    "items": [
		{
		    "id": "name",
		    "title": "Name",
		    "placeholder": "Fancy Light"
		},
	    ]
	}

	context.ts = "Hello";
	//invoke callback to update setup UI
	callback(respDict);
    }
    */
};


