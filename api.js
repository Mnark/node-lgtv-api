const request = require('request');
const xml2js = require('xml2js');
const async = require('async');
const http = require('http');
const client = require('node-ssdp').Client
const xmlBuilder = new xml2js.Builder();
const xmlParser = new xml2js.Parser();

module.exports = LgTvApi;

function LgTvApi(_host, _port, _pairingKey) {
    this.host = _host;
    this.port = _port;
    this.pairingKey = _pairingKey;
    this.session = null;
    this.debugMode = false;
    this.tvType = 0;

}

LgTvApi.prototype.setTvType = function (_tvType) {
    this.tvType = _tvType;
};

LgTvApi.prototype.setDebugMode = function (_debugMode) {
    this.debugMode = _debugMode;
};

LgTvApi.prototype.discover = function (callback) {
    if (!this.client) {
        this.client = new client();
        this.client.on('response', function (headers, statusCode, rinfo) {
            //console.log('Looking up service description @ ' + headers);
            //console.log('Looking up service description @ ' + headers.LOCATION);
            //if (headers.LOCATION.startsWith('http://192.168.0.11:')) {
                //console.log('Headers: ' + JSON.stringify(headers));
                http.get(headers.LOCATION, (res) => {
                    //console.log('Response from service description');
                    res.on('data', (chunk) => {
                        xmlParser.parseString(chunk, (err, data) => {
                            if (err) {
                                callback(err)
                                return
                            }
                           // console.log("data: " + JSON.stringify(data))
                            if (data.envelope && data.envelope.device) {
                                console.log("DEVICE FOUND: " + JSON.stringify(data.envelope.device))
                                callback(null, data.envelope.device);
                                return
                            }

                            if (data.root && data.root.device) {
                                console.log("DEVICE FOUND: " + JSON.stringify(data.root.device))
                                callback(null, data.root.device);
                                return
                            }
                            
                            callback(new Error('No data found in response'))
                        })
                    })
                })
            //}    
            //console.log('Got a response to an m-search.');
            console.log('Location: ' + JSON.stringify(headers.LOCATION));
            //console.log('');
            //console.log('statusCode:' + JSON.stringify(statusCode));
            //console.log('');
            console.log('rinfo: ' + JSON.stringify(rinfo));
            console.log('');

        });
    }
    // search for a service type 
    //client.search('urn:schemas-upnp-org:service:ContentDirectory:1');
    //this.client.search('urn:schemas-udap:service:netrcu:1');
    //this.client.search('udap:rootservice');
    //this.client.search('udap:all');
    this.client.search('ssdp:all');
    //this.client.search('roap:rootservice');
    //this.client.search('roap:rootservice');  
    //'udap:rootservice'
};

LgTvApi.prototype.displayPairingKey = function (functionCallback) {
    if (this.debugMode) console.log("displayPairingKey called.");
    switch (this.tvType) {
        case 1: // Netcast 
            let payload = { envelope: { api: { $: { type: 'pairing' }, name: 'showkey' } } };
            this.sendXMLRequest('/udap/api/pairing', payload, function (err, response, data) {
                if (this.debugMode) console.info('XML Response recieved Error:' + err);
                if (err || response.statusCode != 200) {
                    if (this.debugMode) console.log("sendXMLRequest error." + err);
                    functionCallback(err != null ? err : new Error('Response code:' + response.statusCode));
                    return;
                }
                functionCallback(null);
            });
            break;
        default: // Original
            this.sendXMLRequest('/roap/api/auth', { auth: { type: 'AuthKeyReq' } }, (function (err, response, data) {
                if (err || response.statusCode != 200) {
                    functionCallback(err != null ? err : new Error('Response code:' + response.statusCode));
                } else {
                    functionCallback(null);
                }
            }).bind(this));
    }

};

LgTvApi.prototype.authenticate = function (functionCallback) {
    if (this.debugMode) console.log("Authenticate called. Pairing key = " + this.pairingKey);
    if (this.pairingKey === null) {
        this.displayPairingKey(functionCallback);
    } else {
        switch (this.tvType) {
            case 1: // Netcast 
                let payload = { envelope: { api: { $: { type: 'pairing' }, name: 'hello', value: this.pairingKey, port: this.port } } };
                this.sendXMLRequest('/udap/api/pairing', payload, (err, resp) => {
                    var data = "";
                    if (err || resp.statusCode != 200) {
                        console.log("sendXMLRequest Error:" + err)
                        functionCallback(err ? err : new Error('Response code:' + resp.statusCode))
                        return;
                    }

                    functionCallback(null, this.pairingKey);
                })
                break;
            default: // Original
                async.waterfall([
                    (function (callback) {
                        this.sendXMLRequest('/roap/api/auth', { auth: { type: 'AuthReq', value: this.pairingKey } }, callback)
                    }).bind(this),
                    (function (err, response, data, callback) {
                        if (err || response.statusCode != 200) {
                            callback(err ? err : new Error('Response code:' + response.statusCode), data);
                        } else {
                            xmlParser.parseString(data, callback);
                        }
                    }).bind(this)
                ], (function (err, data) {
                    if (err) {
                        functionCallback(err, null)
                    } else {
                        this.session = data.envelope.session[0];
                        functionCallback(err, this.session);
                    }
                }).bind(this));
        }
    }
};

LgTvApi.prototype.processCommand = function (commandName, parameters, functionCallback) {
    if (this.session === null) {
        functionCallback(new Error("No session id"));
    }
    var payload;
    if (tvType == 0) {
        if (!isNaN(parseInt(commandName)) && parameters.length == 0) {
            parameters.value = commandName;
            commandName = 'HandleKeyInput';
        } else if (isNaN(parseInt(parameters)) && !(((typeof parameters === "object") && (parameters !== null)))) {
            parameters.value = parameters;
        } else {
            console.log('yes');
        }

        parameters.name = commandName;
        payload = { command: parameters };
    } else {

    }

    async.waterfall([
        (function (callback) {
            this.sendXMLRequest('/roap/api/command', payload, callback);
        }).bind(this),
        (function (err, response, data, callback) {
            if (err || response.statusCode != 200) {
                callback(err ? err : new Error('Response code:' + response.statusCode), data);
            } else {
                xmlParser.parseString(data, callback);
            }
        }).bind(this)

    ], (function (err, data) {
        if (err) {
            functionCallback(err, null)
        } else {
            functionCallback(err, data);
        }
    }).bind(this));

};

LgTvApi.prototype.queryData = function (targetId, functionCallback) {
    if (this.session === null) {
        functionCallback(new Error("No session id"));
    }
    switch (this.tvType) {
        case 1: // Netcast 
            this.sendRequest('/udap/api/data?target=' + targetId, (err, response) => {
                console.log("Got a response... now what 1? Error" + err)
                console.log("Got a response... now what 2? statusCode" + response.statusCode)
                if (err || response.statusCode != 200) {
                    functionCallback(err != null ? err : new Error('Response code:' + response.statusCode));
                    return
                }
                response.on('data', (chunk) => {
                    xmlParser.parseString(chunk, (err, data) => {
                        if (err) {
                            functionCallback(err)
                            return
                        }
                        if (data.envelope.data) {
                            functionCallback(null, data.envelope.data);
                            return
                        }
                        functionCallback(new Error('No data found in response'))
                    })
                })
                //console.log("Headers = " + JSON.stringify(response.headers));
            });
            break;
        default: // Original
            async.waterfall([
                (function (callback) {
                    this.sendRequest('/roap/api/data?target=' + targetId, callback);
                }).bind(this),
                (function (err, response, data, callback) {
                    if (err || response.statusCode != 200) {
                        callback(err != null ? err : new Error('Response code:' + response.statusCode));
                    } else {
                        xmlParser.parseString(data, callback);
                    }
                }).bind(this)
            ], function (err, data) {
                if (err) {
                    functionCallback(err, null)
                } else {
                    functionCallback(err, data.envelope.data);
                }
            });
    }

};

LgTvApi.prototype.takeScreenShot = function (functionCallback) {
    let path = '/roap/api/data?target=' + this.TV_INFO_SCREEN;
    if (this.debugMode) {
        console.info('REQ path:' + path);
    }
    let uri = 'http://' + this.host + ':' + this.port + path;
    let options = {
        headers: {
            'Content-Type': 'application/atom+xml',
            'Connection': 'Keep-Alive'
        }
    };
    functionCallback(null, request.get(uri, options));
};

LgTvApi.prototype.sendXMLRequest = function (path, params, callback) {
    let reqBody = xmlBuilder.buildObject(params);
    if (this.debugMode) {
        console.info('REQ to ' + 'http://' + this.host + ':' + this.port + path);
        console.info(reqBody);
    }
    let options;
    switch (this.tvType) {
        case 1: // Netcast 
            options = {
                'host': this.host,
                'port': this.port,
                'path': path,
                'method': 'POST',
                'headers': {
                    'Host': this.host + ':' + this.port,
                    'Cache-Control': 'no-cache',
                    'Content-Type': 'text/xml; charset=utf-8',
                    'User-Agent': "'Apple iOS UDAP/2.0 Connect SDK'",
                    'Content-Length': reqBody.length,
                    'Connection': 'Close'
                }
            };
            var req = http.request(options, (res) => {
                if (this.debugMode) console.info('RES:' + res.statusCode);
                callback(null, res)
            });
            req.on('error', (err) => {
                if (this.debugMode) console.info('req error:' + err);
                callback(err)
            });
            //req.write(reqBody);
            req.end(reqBody);
            break;
        default: // Original
            let uri = 'http://' + this.host + ':' + this.port + path;
            options = {
                headers: {
                    'Content-Type': 'application/atom+xml',
                    'Connection': 'Keep-Alive'
                },
                body: reqBody
            };
            console.log(reqBody);
            request.post(uri, options, (function (err, response, data) {
                if (this.debugMode) {
                    console.info('RESP:' + data);
                }
                callback(null, err, response, data);
            }).bind(this))
    }
};

LgTvApi.prototype.sendRequest = function (path, callback) {
    if (this.debugMode) {
        console.info('REQ path:' + path);
    }
    let uri = 'http://' + this.host + ':' + this.port + path;
    switch (this.tvType) {
        case 1: // Netcast 
            http.get(uri, function (res) {
                callback(null, res)
            }).on('error', (err) => {
                callback(err)
            });
            break;
        default: // Original
            let options = {
                headers: {
                    'Content-Type': 'application/atom+xml',
                    'Connection': 'Keep-Alive'
                }
            };
            request.get(uri, options, (function (err, response, data) {
                if (this.debugMode) {
                    console.info('RESP:' + data);
                }
                callback(null, err, response, data);
            }).bind(this));
    }
};

LgTvApi.prototype.TV_CMD_POWER = 1;
LgTvApi.prototype.TV_CMD_NUMBER_0 = 2;
LgTvApi.prototype.TV_CMD_NUMBER_1 = 3;
LgTvApi.prototype.TV_CMD_NUMBER_2 = 4;
LgTvApi.prototype.TV_CMD_NUMBER_3 = 5;
LgTvApi.prototype.TV_CMD_NUMBER_4 = 6;
LgTvApi.prototype.TV_CMD_NUMBER_5 = 7;
LgTvApi.prototype.TV_CMD_NUMBER_6 = 8;
LgTvApi.prototype.TV_CMD_NUMBER_7 = 9;
LgTvApi.prototype.TV_CMD_NUMBER_8 = 10;
LgTvApi.prototype.TV_CMD_NUMBER_9 = 11;
LgTvApi.prototype.TV_CMD_UP = 12;
LgTvApi.prototype.TV_CMD_DOWN = 13;
LgTvApi.prototype.TV_CMD_LEFT = 14;
LgTvApi.prototype.TV_CMD_RIGHT = 15;
LgTvApi.prototype.TV_CMD_OK = 20;
LgTvApi.prototype.TV_CMD_HOME_MENU = 21;
LgTvApi.prototype.TV_CMD_BACK = 23;
LgTvApi.prototype.TV_CMD_VOLUME_UP = 24;
LgTvApi.prototype.TV_CMD_VOLUME_DOWN = 25;
LgTvApi.prototype.TV_CMD_MUTE_TOGGLE = 26;
LgTvApi.prototype.TV_CMD_CHANNEL_UP = 27;
LgTvApi.prototype.TV_CMD_CHANNEL_DOWN = 28;
LgTvApi.prototype.TV_CMD_BLUE = 29;
LgTvApi.prototype.TV_CMD_GREEN = 30;
LgTvApi.prototype.TV_CMD_RED = 31;
LgTvApi.prototype.TV_CMD_YELLOW = 32;
LgTvApi.prototype.TV_CMD_PLAY = 33;
LgTvApi.prototype.TV_CMD_PAUSE = 34;
LgTvApi.prototype.TV_CMD_STOP = 35;
LgTvApi.prototype.TV_CMD_FAST_FORWARD = 36;
LgTvApi.prototype.TV_CMD_REWIND = 37;
LgTvApi.prototype.TV_CMD_SKIP_FORWARD = 38;
LgTvApi.prototype.TV_CMD_SKIP_BACKWARD = 39;
LgTvApi.prototype.TV_CMD_RECORD = 40;
LgTvApi.prototype.TV_CMD_RECORDING_LIST = 41;
LgTvApi.prototype.TV_CMD_REPEAT = 42;
LgTvApi.prototype.TV_CMD_LIVE_TV = 43;
LgTvApi.prototype.TV_CMD_EPG = 44;
LgTvApi.prototype.TV_CMD_PROGRAM_INFORMATION = 45;
LgTvApi.prototype.TV_CMD_ASPECT_RATIO = 46;
LgTvApi.prototype.TV_CMD_EXTERNAL_INPUT = 47;
LgTvApi.prototype.TV_CMD_PIP_SECONDARY_VIDEO = 48;
LgTvApi.prototype.TV_CMD_SHOW_SUBTITLE = 49;
LgTvApi.prototype.TV_CMD_PROGRAM_LIST = 50;
LgTvApi.prototype.TV_CMD_TELE_TEXT = 51;
LgTvApi.prototype.TV_CMD_MARK = 52;
LgTvApi.prototype.TV_CMD_3D_VIDEO = 400;
LgTvApi.prototype.TV_CMD_3D_LR = 401;
LgTvApi.prototype.TV_CMD_DASH = 402;
LgTvApi.prototype.TV_CMD_PREVIOUS_CHANNEL = 403;
LgTvApi.prototype.TV_CMD_FAVORITE_CHANNEL = 404;
LgTvApi.prototype.TV_CMD_QUICK_MENU = 405;
LgTvApi.prototype.TV_CMD_TEXT_OPTION = 406;
LgTvApi.prototype.TV_CMD_AUDIO_DESCRIPTION = 407;
LgTvApi.prototype.TV_CMD_ENERGY_SAVING = 409;
LgTvApi.prototype.TV_CMD_AV_MODE = 410;
LgTvApi.prototype.TV_CMD_SIMPLINK = 411;
LgTvApi.prototype.TV_CMD_EXIT = 412;
LgTvApi.prototype.TV_CMD_RESERVATION_PROGRAM_LIST = 413;
LgTvApi.prototype.TV_CMD_PIP_CHANNEL_UP = 414;
LgTvApi.prototype.TV_CMD_PIP_CHANNEL_DOWN = 415;
LgTvApi.prototype.TV_CMD_SWITCH_VIDEO = 416;
LgTvApi.prototype.TV_CMD_APPS = 417;
LgTvApi.prototype.TV_CMD_MOUSE_MOVE = 'HandleTouchMove';
LgTvApi.prototype.TV_CMD_MOUSE_CLICK = 'HandleTouchClick';
LgTvApi.prototype.TV_CMD_TOUCH_WHEEL = 'HandleTouchWheel';
LgTvApi.prototype.TV_CMD_CHANGE_CHANNEL = 'HandleChannelChange';
LgTvApi.prototype.TV_CMD_SCROLL_UP = 'up';
LgTvApi.prototype.TV_CMD_SCROLL_DOWN = 'down';
LgTvApi.prototype.TV_INFO_CURRENT_CHANNEL = 'cur_channel';
LgTvApi.prototype.TV_INFO_CHANNEL_LIST = 'channel_list';
LgTvApi.prototype.TV_INFO_CONTEXT_UI = 'context_ui';
LgTvApi.prototype.TV_INFO_VOLUME = 'volume_info';
LgTvApi.prototype.TV_INFO_SCREEN = 'screen_image';
LgTvApi.prototype.TV_INFO_3D = 'is_3d';
LgTvApi.prototype.TV_LAUNCH_APP = 'AppExecute';


