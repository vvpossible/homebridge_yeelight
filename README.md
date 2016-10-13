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
