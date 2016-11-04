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
	var that = this;
	var uuid;
	var found = 0;
	var newAccessory = null;
	var lightbulbService = null;
        var name;
	
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
            name = dev.did.substring(dev.did.length-6);
            this.log("found dev: " + name); 
	    newAccessory = new Accessory(name, uuid);
	    newAccessory.context.did = dev.did;
	    newAccessory.context.model = dev.model;
	    lightbulbService = new Service.Lightbulb(name);	    
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
	    newAccessory.addService(lightbulbService, name);
	    this.yeeAccessories.push(newAccessory);
	    this.api.registerPlatformAccessories("homebridge-yeelight", "yeelight", [newAccessory]);
	}
    },

    onDevConnected: function(dev) {
	this.log("accesseory reachable");

	this.log("dev connected " + dev.did + " " + dev.connected);	
	var accessory = dev.ctx;
	accessory.updateReachability(true);	
    },

    onDevDisconnected: function(dev) {
	this.log("accesseory unreachable");

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

    onDevPropChange: function(dev, prop, val) {
        var accessory = dev.ctx;
        var character;
        var lightbulbService = accessory.getService(Service.Lightbulb);

        this.log("update accessory prop: " + prop + "value: " + val);

        if (prop == "power") {
            character = lightbulbService.getCharacteristic(Characteristic.On)
        } else if (prop == "bright") {
            character = lightbulbService.getCharacteristic(Characteristic.Brightness)
        } else if (prop == "sat") {
            character = lightbulbService.getCharacteristic(Characteristic.Saturation)
        } else if (prop == "hue") {
            character = lightbulbService.getCharacteristic(Characteristic.Hue)
        } else {
            return;
        }
        character.updateValue(val);
    },

    configureAccessory: function(accessory) {
	var platform = this;

	//accessory.updateReachability(false);
	accessory.reachable = true;

	accessory.on('identify', function(paired, callback) {
            platform.log("identify ....");
	});

	this.yeeAccessories.push(accessory);
	
	return;
    },

    exeCmd: function(did, characteristic, value, callback) {

        dev = this.yeeAgent.getDevice(did);

        if (dev == null) {
            this.log("no device found for did: " + did);
            return;
        }

	switch(characteristic.toLowerCase()) {
	    
	case 'identify':
            this.log("identfy....");
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


