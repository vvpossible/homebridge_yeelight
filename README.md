# homebridge-yeelight
[![npm version](https://badge.fury.io/js/homebridge-yeelight.svg)](https://badge.fury.io/js/homebridge-yeelight)

Yeelight plugin for [HomeBridge](https://github.com/nfarina/homebridge)

This repository contains the Yeelight plugin for homebridge.

[Yeelight](https://www.yeelight.com) is a smart lighting company that makes WiFi and BLE bulbs and lamps.


### Installation
1. Install HomeBridge, please follow it's [README](https://github.com/nfarina/homebridge/blob/master/README.md). If you are using Raspberry Pi, please read [Running-HomeBridge-on-a-Raspberry-Pi](https://github.com/nfarina/homebridge/wiki/Running-HomeBridge-on-a-Raspberry-Pi).
2. Make sure you can see HomeBridge in your iOS devices, if not, please go back to step 1.
3. Download homebridge-yeelight to your local folder.

### Configuration
1. Enable developer mode of your Yeelight bulb, Yeelight Strip or Yeelight Ceiling lamp.

### Run it
1. From source code


        $ cd /path/to/homebridge-yeelight
        $ DEBUG=* homebridge -D -P .

2. As homebridge plugin


        $ npm install -g homebridge-yeelight
        $ homebridge


### About Yeelight bedside lamp (BLE device) 
BLE device can only be supported by Raspberry Pi 3. If you want to make Yeelight bedside lamp work with other hardware running homebridge, please try to install a bluetooth dongle and make sure it's working properly. Following is the procedure for Pi 3 users:

1. sudo apt-get install libbluetooth-dev

2. sudo npm install -g noble

3. sudo apt-get install libcap2-bin

4. sudo setcap cap_net_raw+eip $(eval readlink -f `which node`) 

5. update homebridge-yeelight to latest version and restart homebridge service.

6. When you connect your bedside lamp for 1st time, remember to press the Mode button after your see the breathing effect. This is to authorize your Pi to access bedside lamp's services.  
 
