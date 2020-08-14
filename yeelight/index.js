"use strict";

const https = require('https');
const crypto = require('crypto');

const DysonLinkAccessoryModule = require("./DysonLinkAccessory");
const DysonLinkDevice = require("./DysonLinkDevice").DysonLinkDevice;
const DysonLinkAccessory = DysonLinkAccessoryModule.DysonLinkAccessory;

var Accessory, Service, Characteristic, UUIDGen;

module.exports = function(homebridge) {
    console.log("homebridge API version: " + homebridge.version);

    // Accessory must be created from PlatformAccessory Constructor
    Accessory = homebridge.platformAccessory;

    // Service and Characteristic are from hap-nodejs
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;

    DysonLinkAccessoryModule.setHomebridge(homebridge);

    // For platform plugin to be considered as dynamic platform plugin,
    // registerPlatform(pluginName, platformName, constructor, dynamic), dynamic must be true
    homebridge.registerPlatform("homebridge-dyson-link", "DysonPlatform", DysonPlatform, true);
}

class DysonPlatform {
    constructor(log, config, api) {
        this.log = log;
        this.config = config;
        this.accessories = [];

        if (api) {
            // Save the API object as plugin needs to register new accessory via this object.
            this.api = api;
            var platform = this;
            // Listen to event "didFinishLaunching", this means homebridge already finished loading cached accessories
            // Platform Plugin should only register new accessory that doesn't exist in homebridge after this event.
            // Or start discover new accessories
            this.api.on('didFinishLaunching', () => {
                platform.log("Finished launching. Start to create accessory from config");
                // Check if the accessories is null as this may be called from second instance of homebrdige too
                if (this.config && this.config.accessories) {
                    let accountPassword = this.config.password || process.env.DYSON_PASSWORD;
                    let accountEmail = this.config.email || process.env.DYSON_EMAIL;
                    this.getDevicesFromAccount(accountEmail, accountPassword, config.country, (accountDevices) => {
                        this.config.accessories.forEach((accessory) => {
                            let nightModeVisible = accessory.nightModeVisible;
                            if(nightModeVisible == null || nightModeVisible == undefined) {
                                platform.log.debug("no night mode visible value, default to true");
                                nightModeVisible = true;
                            }
                            let focusModeVisible = accessory.focusModeVisible;
                            if(focusModeVisible == null || focusModeVisible == undefined) {
                                platform.log.debug("no focus mode visible value, default to true");
                                focusModeVisible = true;
                            }
                            let autoModeVisible = accessory.autoModeVisible;
                            if(autoModeVisible == null || autoModeVisible == undefined) {
                                platform.log.debug("no auto mode visible value, default to true");
                                autoModeVisible = true;
                            }
                            let deviceInfo = accountDevices[accessory.serialNumber];
                            var password = ''
                            if (deviceInfo) {
                                platform.log("Use device password from account");
                                password = deviceInfo.password;
                                accessory.serialNumber = 'DYSON-'+accessory.serialNumber+'-'+deviceInfo.ProductType;
                            }
                            else if (accessory.password) {
                                platform.log("Use device password from config file");
                                password = crypto.createHash('sha512').update(accessory.password, "utf8").digest("base64");
                            }
                            else {
                                platform.log.error("Missing password for device with serial number " + accessory.serialNumber + ", devices found on your account: " + Object.keys(accountDevices).join(", "));
                                return;
                            }
                            platform.log(accessory.displayName + " IP:" + accessory.ip + " Serial Number:" + accessory.serialNumber);
                            let device = new DysonLinkDevice(accessory.displayName, accessory.ip, accessory.serialNumber, password, platform.log);
                            if (device.valid) {
                                platform.log("Device serial number format valids");
                                let uuid = UUIDGen.generate(accessory.serialNumber);
                                // Check if the accessory got cached
                                let cachedAccessory = platform.accessories.find((item) => item.UUID === uuid);
                                if (!cachedAccessory) {
                                    platform.log("Device not cached. Create a new one");
                                    let dysonAccessory = new Accessory(accessory.displayName, uuid);
                                    new DysonLinkAccessory(accessory.displayName, device, dysonAccessory, platform.log, nightModeVisible, focusModeVisible, autoModeVisible);
                                    platform.api.registerPlatformAccessories("homebridge-dyson-link", "DysonPlatform", [dysonAccessory]);
                                    platform.accessories.push(accessory);
                                } else {
                                    platform.log("Device cached. Try to update this");
                                    cachedAccessory.displayName = accessory.displayName;
                                    new DysonLinkAccessory(accessory.displayName, device, cachedAccessory, platform.log, nightModeVisible, focusModeVisible, autoModeVisible);
                                    platform.api.updatePlatformAccessories([cachedAccessory]);
                                }
                            }
                        });
                    });

                }
                else{
                    platform.log.error("Unable to find config or accessories");
                }
            });
        }

    }

    configureAccessory(accessory) {
        this.log(accessory.displayName, "Configure Accessory");
        accessory.reachable = true;
        accessory.on('identify', (paired, callback) => {
            this.log(accessory.displayName, "Identify!!!");
            callback();
        });

        this.accessories.push(accessory);
    }

    getDevicesFromAccount(email, password, country, callback) {
        if (!email || !password) {
            this.log("Dyson email/pass not found, v2 devices may not work")
            callback({});
            return;
        }
        // Adapted from: https://github.com/CharlesBlonde/libpurecoollink/blob/master/libpurecoollink/utils.py
        const decryptPassword = (encryptedPassword) => {
            let key = Uint8Array.from(Array(32), (val, index) => index + 1);
            let init_vector = new Uint8Array(16);
            var decipher = crypto.createDecipheriv('aes-256-cbc', key, init_vector);
            var decryptedPassword = decipher.update(encryptedPassword, 'base64', 'utf8');
            decryptedPassword = decryptedPassword + decipher.final('utf8');
            return decryptedPassword
        };

        if (!country) {
            country = "US"
        }

        let DYSON_API_URL = "appapi.cp.dyson.com";
        if (country == "CN"){            
            DYSON_API_URL = "appapi.cp.dyson.cn"
            this.log.info("Country code is CN. Changed to use CN server -" + DYSON_API_URL);
        }

        let postData = {
            Email: email,
            Password: password
        };
        let postBody = JSON.stringify(postData);

        
        var options = {
            hostname: DYSON_API_URL,
            port: 443,
            path: '/v1/userregistration/authenticate?country=' + country,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': postBody.length
            },
            rejectUnauthorized: false
        };
        // Initial request with email/pass to get authorization tokens of Account and Password
        var req = https.request(options, (res) => {
            var data = "";
            res.setEncoding('utf-8');
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                if (!data) {
                    this.log.error("Could not login to Dyson")
                    callback({});
                    return;
                }

                let credentials = null;

                try{
                    credentials = JSON.parse(data);
                } catch (e) {
                    this.log.error("JSON parse error.could not login to Dyson")
                    this.log.error(e)
                    callback({});
                    return;
                }

                let account = credentials.Account;
                let password = credentials.Password;
                let auth = 'Basic ' + Buffer.from(account + ':' + password).toString('base64');

                var options = {
                    hostname: DYSON_API_URL,
                    port: 443,
                    path: '/v2/provisioningservice/manifest',
                    headers: {
                        "Authorization": auth
                    },
                    rejectUnauthorized: false
                };
                // Request devices in user's account to get local credentials
                var req = https.get(options, (res) => {
                    var data = "";
                    res.setEncoding('utf-8');
                    res.on('data', (chunk) => data += chunk);
                    res.on('end', () => {
                        if (!data || data.length == 0) {
                            this.log.error("Could not login to Dyson");
                            callback({});
                            return;
                        }
                        let devices = JSON.parse(data);
                        var devicesBySerial = {};
                        devices.forEach((device) => {
                            if (device.LocalCredentials) {
                                let decrypted = JSON.parse(decryptPassword(device.LocalCredentials));
                                device.password = decrypted.apPasswordHash;
                                devicesBySerial[device.Serial] = device
                            }
                        });
                        callback(devicesBySerial);
                    });
                });
                req.on('error', function(err) {
                    this.log.error("Error logging in, check Dyson email, password, and country - "+err);
                });
                req.end();
            });
        });
        req.on('error', function(err) {
            this.log.error("Error logging in, check Dyson email, password, and country - "+err);
        });
        req.write(postBody);
        req.end();
    }
}
