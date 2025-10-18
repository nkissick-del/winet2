"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.winetHandler = void 0;
const ws_1 = __importDefault(require("ws"));
const MessageTypes_1 = require("./types/MessageTypes");
const slugify_1 = __importDefault(require("slugify"));
const Constants_1 = require("./types/Constants");
const { SSLConfig } = require("./sslConfig");
class winetHandler {
    constructor(logger, host, lang, frequency, winetUser, winetPass, analytics) {
        // Optimized property initialization with default values
        this.winetUser = winetUser || 'admin';
        this.winetPass = winetPass || 'pw8888';
        this.token = '';
        this.currentDevice = undefined;
        this.inFlightDevice = undefined;
        this.currentStages = [];
        this.devices = [];
        this.deviceStatus = {};  // Use object instead of array for O(1) lookups
        this.lastDeviceUpdate = {};
        this.watchdogCount = 0;
        this.watchdogLastData = undefined;
        this.winetVersion = undefined;
        this.scanInterval = undefined;
        this.watchdogInterval = undefined;
        this.logger = logger;
        this.host = host;
        this.ssl = false;
        this.sslConfig = new SSLConfig(logger);
        this.lang = lang;
        this.frequency = frequency;
        this.analytics = analytics;
    }
    setProperties(properties) {
        this.properties = properties;
    }
    setCallback(callback) {
        this.callbackUpdatedStatus = callback;
    }
    setWatchdog() {
        // Pre-calculate timeout thresholds for better performance
        const watchdogTimeout = this.frequency * 6000; // 6 * frequency in milliseconds
        const checkInterval = this.frequency * 1000;
        
        this.watchdogInterval = setInterval(() => {
            if (this.watchdogLastData === undefined) return;
            
            if (Date.now() - this.watchdogLastData > watchdogTimeout) {
                this.logger.error('Watchdog triggered, reconnecting');
                this.reconnect();
            }
        }, checkInterval);
    }
    clearWatchdog() {
        if (this.watchdogInterval !== undefined) {
            clearInterval(this.watchdogInterval);
        }
    }
    connect(ssl) {
        if (ssl !== undefined) {
            this.ssl = ssl;
        }
        this.token = '';
        this.currentDevice = undefined;
        this.inFlightDevice = undefined;
        this.currentStages = [];
        this.watchdogCount = 0;
        this.winetVersion = undefined;
        if (this.scanInterval !== undefined) {
            clearInterval(this.scanInterval);
        }
        this.watchdogLastData = Date.now();
        this.setWatchdog();
        const wsOptions = this.ssl
            ? this.sslConfig.getSSLOptions(this.host)
            : {};
        this.ws = new ws_1.default(this.ssl
            ? `wss://${this.host}:443/ws/home/overview`
            : `ws://${this.host}:8082/ws/home/overview`, wsOptions);
        this.ws.on('open', this.onOpen.bind(this));
        this.ws.on('message', this.onMessage.bind(this));
        this.ws.on('error', this.onError.bind(this));
    }
    reconnect() {
        this.ws.close();
        this.logger.warn('Reconnecting to Winet');
        if (this.scanInterval !== undefined) {
            clearInterval(this.scanInterval);
        }
        this.clearWatchdog();
        setTimeout(() => {
            this.connect();
        }, this.frequency * 1000 * 3);
    }
    sendPacket(data) {
        // Optimized packet creation with pre-built base object
        const packet = Object.assign({ lang: this.lang, token: this.token }, data);
        this.ws.send(JSON.stringify(packet));
    }
    onOpen() {
        this.sendPacket({
            service: 'connect',
        });
        this.scanInterval = setInterval(() => {
            if (this.currentDevice === undefined) {
                this.scanDevices();
            }
        }, this.frequency * 1000);
    }
    onError(error) {
        this.logger.error('Websocket error:', error);
        this.analytics.registerError('websocket_onError', error.message);
        if (this.watchdogInterval === undefined) {
            this.reconnect();
        }
    }
    onMessage(data) {
        let message;
        try {
            message = JSON.parse(data.toString());
        } catch (e) {
            this.analytics.registerError('invalid_json', 'JSON_PARSE_ERROR');
            this.logger.error('Invalid JSON received from inverter:', e.message);
            return; // Skip this message, keep connection alive
        }
        
        const validationResult = MessageTypes_1.MessageSchema.safeParse(message);
        if (!validationResult.success) {
            this.analytics.registerError('invalid_message', 'MessageSchema');
            this.logger.error('Invalid message: schema validation failed');
            return;
        }
        const typedMessage = validationResult.data;
        if (typedMessage.result_msg === 'I18N_COMMON_INTER_ABNORMAL') {
            this.logger.error('Winet disconnect: Internal Error');
            this.analytics.registerError('winetError', 'INTER_ABNORMAL');
            this.reconnect();
            return;
        }
        this.watchdogLastData = Date.now();
        const result_code = typedMessage.result_code;
        const result_data = typedMessage.result_data;
        const service = result_data.service;
        switch (service) {
            case 'connect': {
                const connectResult = MessageTypes_1.ConnectSchema.safeParse(result_data);
                if (!connectResult.success) {
                    this.analytics.registerError('connectSchema', 'successFalse');
                    this.logger.error('Invalid connect message: schema validation failed');
                    return;
                }
                const connectData = connectResult.data;
                if (connectData.token === undefined) {
                    this.analytics.registerError('connectSchema', 'tokenMissing');
                    this.logger.error('Token is missing');
                    return;
                }
                if (connectData.ip === undefined) {
                    this.logger.info('Connected to a older Winet-S device');
                    this.winetVersion = 1;
                }
                else if (connectData.forceModifyPasswd !== undefined) {
                    this.logger.info('Connected to a Winet-S2 device with newer firmware');
                    this.winetVersion = 3;
                }
                else {
                    this.logger.info('Connected to a Winet-S2 device with older firmware');
                    this.winetVersion = 2;
                }
                this.analytics.registerVersion(this.winetVersion);
                this.token = connectData.token;
                this.logger.info('Connected to Winet, logging in');
                this.sendPacket({
                    service: 'login',
                    passwd: this.winetPass,
                    username: this.winetUser,
                });
                break;
            }
            case 'login': {
                const loginResult = MessageTypes_1.LoginSchema.safeParse(result_data);
                if (!loginResult.success) {
                    this.analytics.registerError('loginSchema', 'successFalse');
                    this.logger.error('Invalid login message: schema validation failed');
                    return;
                }
                const loginData = loginResult.data;
                if (loginData.token === undefined) {
                    this.analytics.registerError('loginSchema', 'tokenMissing');
                    this.logger.error('Authenticated Token is missing');
                    return;
                }
                if (result_code === 1) {
                    this.logger.info('Authenticated successfully');
                }
                else {
                    this.analytics.registerError('loginSchema', 'resultCodeFail');
                    throw new Error('Failed to authenticate');
                }
                this.token = loginData.token;
                this.sendPacket({
                    service: 'devicelist',
                    type: '0',
                    is_check_token: '0',
                });
                break;
            }
            case 'devicelist': {
                const deviceListResult = MessageTypes_1.DeviceListSchema.safeParse(result_data);
                if (!deviceListResult.success) {
                    this.analytics.registerError('deviceListSchema', 'successFalse');
                    this.logger.error('Invalid devicelist message: schema validation failed');
                    return;
                }
                const deviceListData = deviceListResult.data;
                // Optimized device processing with Set for O(1) lookups
                const existingDeviceSerials = new Set(this.devices.map(d => d.dev_sn));
                const alphanumericRegex = /[^a-zA-Z0-9]/g;
                
                for (const device of deviceListData.list) {
                    const deviceStages = Constants_1.DeviceTypeStages.get(device.dev_type) || [];
                    if (deviceStages.length === 0) {
                        this.logger.info('Skipping device:', device.dev_name, device.dev_sn);
                        continue;
                    }
                    
                    // Use Set for O(1) lookup instead of Array.findIndex O(n)
                    if (!existingDeviceSerials.has(device.dev_sn)) {
                        this.deviceStatus[device.dev_id] = {};
                        device.dev_model = device.dev_model.replace(alphanumericRegex, '');
                        device.dev_sn = device.dev_sn.replace(alphanumericRegex, '');
                        
                        const stageNames = deviceStages.map(s => Constants_1.QueryStages[s]).join(', ');
                        this.logger.info(`Detected device: ${device.dev_model} (${device.dev_sn}) - Type: ${device.dev_type}, Stages: ${stageNames}`);
                        
                        this.devices.push(device);
                        existingDeviceSerials.add(device.dev_sn);
                    }
                }
                this.analytics.registerDevices(this.devices);
                this.scanDevices();
                break;
            }
            case 'real':
            case 'real_battery': {
                const receivedDevice = this.inFlightDevice;
                this.inFlightDevice = undefined;
                const realtimeResult = MessageTypes_1.RealtimeSchema.safeParse(result_data);
                if (!realtimeResult.success) {
                    this.analytics.registerError('realtimeSchema', 'successFalse');
                    this.logger.error('Invalid realtime message: schema validation failed');
                    this.reconnect();
                    return;
                }
                if (receivedDevice === undefined) {
                    this.logger.error('Received realtime data without a current device');
                    return;
                }
                // Optimized realtime data processing with pre-optimized constants
                const slugifyOptions = { lower: true, strict: true, replacement: '_' };
                
                for (const data of realtimeResult.data.list) {
                    const name = this.properties[data.data_name] || data.data_name;
                    let value;
                    
                    if (Constants_1.NumericUnits.has(data.data_unit)) {
                        value = data.data_value === '--' ? undefined : parseFloat(data.data_value);
                    } else {
                        value = data.data_value.startsWith('I18N_') ? 
                            this.properties[data.data_value] : data.data_value;
                    }
                    
                    const dataPoint = {
                        name,
                        slug: (0, slugify_1.default)(name, slugifyOptions),
                        value,
                        unit: data.data_unit,
                        dirty: true,
                    };
                    this.updateDeviceStatus(receivedDevice, dataPoint);
                }
                this.scanDevices();
                break;
            }
            case 'direct': {
                const receivedDevice = this.inFlightDevice;
                this.inFlightDevice = undefined;
                const directResult = MessageTypes_1.DirectSchema.safeParse(result_data);
                if (!directResult.success) {
                    this.analytics.registerError('directSchema', 'successFalse');
                    this.logger.error('Invalid direct message: schema validation failed');
                    return;
                }
                if (receivedDevice === undefined) {
                    this.logger.error('Received direct data without a current device');
                    return;
                }
                let mpptTotalW = 0;
                for (const data of directResult.data.list) {
                    const names = data.name.split('%');
                    var name = this.properties[names[0]];
                    if (!name) {
                        name = data.name;
                    }
                    var nameV = name + ' Voltage';
                    var nameA = name + ' Current';
                    var nameW = name + ' Power';
                    if (names.length > 1) {
                        nameV = nameV.replace('{0}', names[1].replace('@', ''));
                        nameA = nameA.replace('{0}', names[1].replace('@', ''));
                        nameW = nameW.replace('{0}', names[1].replace('@', ''));
                    }
                    const dataPointV = {
                        name: nameV,
                        slug: (0, slugify_1.default)(nameV, { lower: true, strict: true, replacement: '_' }),
                        value: data.voltage === '--' ? undefined : parseFloat(data.voltage),
                        unit: data.voltage_unit,
                        dirty: true,
                    };
                    const dataPointA = {
                        name: nameA,
                        slug: (0, slugify_1.default)(nameA, { lower: true, strict: true, replacement: '_' }),
                        value: data.current === '--' ? undefined : parseFloat(data.current),
                        unit: data.current_unit,
                        dirty: true,
                    };
                    const dataPointW = {
                        name: nameW,
                        slug: (0, slugify_1.default)(nameW, { lower: true, strict: true, replacement: '_' }),
                        value: data.current === '--'
                            ? undefined
                            : Math.round(parseFloat(data.current) * parseFloat(data.voltage) * 100) / 100,
                        unit: 'W',
                        dirty: true,
                    };
                    if (dataPointW.value !== undefined && dataPointW.name.toLowerCase().startsWith('mppt')) {
                        mpptTotalW += dataPointW.value;
                    }
                    this.updateDeviceStatus(receivedDevice, dataPointV);
                    this.updateDeviceStatus(receivedDevice, dataPointA);
                    this.updateDeviceStatus(receivedDevice, dataPointW);
                }
                const dataPointTotalW = {
                    name: 'MPPT Total Power',
                    slug: 'mppt_total_power',
                    value: Math.round(mpptTotalW * 100) / 100,
                    unit: 'W',
                    dirty: true,
                };
                this.updateDeviceStatus(receivedDevice, dataPointTotalW);
                this.scanDevices();
                break;
            }
            case 'notice': {
                this.analytics.registerError('notice', result_code + '');
                if (result_code === 100) {
                    this.logger.info('Websocket got timed out');
                    this.reconnect();
                }
                else {
                    this.logger.error('Received notice from inverter');
                }
                break;
            }
            default:
                this.analytics.registerError('unknownService', service);
                this.logger.error('Received unknown message type:', service);
        }
    }
    updateDeviceStatus(device, dataPoint) {
        const combinedName = `${device}_${dataPoint.slug}`;
        const oldDataPoint = this.deviceStatus[device][dataPoint.slug];
        if (oldDataPoint === undefined ||
            oldDataPoint.value !== dataPoint.value ||
            this.lastDeviceUpdate[combinedName] === undefined ||
            new Date().getTime() - this.lastDeviceUpdate[combinedName].getTime() >
                300000) {
            this.deviceStatus[device][dataPoint.slug] = dataPoint;
            this.lastDeviceUpdate[combinedName] = new Date();
        }
    }
    scanDevices() {
        if (this.inFlightDevice !== undefined) {
            this.analytics.registerError('scanDevices', 'inFlightDevice');
            this.logger.info(`Skipping scanDevices, in flight device: ${this.inFlightDevice}`);
            this.watchdogCount++;
            if (this.watchdogCount > 5) {
                this.analytics.registerError('scanDevices', 'watchdogTriggered');
                this.logger.error('Watchdog triggered, reconnecting');
                this.reconnect();
            }
            return;
        }
        if (this.currentDevice === undefined) {
            this.currentDevice = this.devices[0].dev_id;
            this.currentStages = [...(Constants_1.DeviceTypeStages.get(this.devices[0].dev_type) || [])];
        }
        else if (this.currentStages.length === 0) {
            const currentIndex = this.devices.findIndex(device => device.dev_id === this.currentDevice);
            const nextIndex = currentIndex + 1;
            if (nextIndex >= this.devices.length) {
                this.currentDevice = undefined;
                this.callbackUpdatedStatus(this.devices, this.deviceStatus);
                return;
            }
            this.currentDevice = this.devices[nextIndex].dev_id;
            this.currentStages = [...(Constants_1.DeviceTypeStages.get(this.devices[nextIndex].dev_type) || [])];
        }
        const nextStage = this.currentStages.shift();
        let service = '';
        switch (nextStage) {
            case Constants_1.QueryStages.REAL:
                service = 'real';
                break;
            case Constants_1.QueryStages.DIRECT:
                service = 'direct';
                break;
            case Constants_1.QueryStages.REAL_BATTERY:
                service = 'real_battery';
                break;
            default:
                this.logger.error('Unknown query stage:', nextStage);
                return;
        }
        this.inFlightDevice = this.currentDevice;
        this.sendPacket({
            service: service,
            dev_id: this.currentDevice.toString(),
            time123456: Date.now(),
            level: 3,
            extended: 'true',
            grid: 'true',
        });
    }
}
exports.winetHandler = winetHandler;
//# sourceMappingURL=winetHandler.js.map