"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.winetHandler = void 0;
const sslConfig_1 = require("./sslConfig");
const ws_1 = __importDefault(require("ws"));
const slugify_1 = __importDefault(require("slugify"));
const Constants_1 = require("./types/Constants");
const modbusReader_1 = require("./modbusReader");
class winetHandler {
    winetUser;
    winetPass;
    token = '';
    currentDevice;
    inFlightDevice;
    currentStages = [];
    devices = [];
    deviceStatus = {};
    lastDeviceUpdate = {};
    watchdogCount = 0;
    watchdogLastData;
    winetVersion;
    scanInterval;
    watchdogInterval;
    logger;
    host;
    ssl = false;
    sslConfig;
    lang;
    frequency;
    analytics;
    properties;
    callbackUpdatedStatus;
    ws;
    modbusReader;
    modbusEnabled = false;
    constructor(logger, host, lang, frequency, winetUser, winetPass, analytics, modbusIp) {
        this.winetUser = winetUser || 'admin';
        this.winetPass = winetPass || 'pw8888';
        this.logger = logger;
        this.host = host;
        this.sslConfig = new sslConfig_1.SSLConfig(logger);
        this.lang = lang;
        this.frequency = frequency;
        this.analytics = analytics;
        // Initialize Modbus reader if IP is provided
        if (modbusIp && modbusIp.trim().length > 0) {
            this.logger.info(`🔌 Modbus enabled for ${modbusIp}`);
            this.modbusReader = new modbusReader_1.ModbusReader(modbusIp);
            this.modbusEnabled = true;
        }
    }
    setProperties(properties) {
        this.properties = properties;
    }
    setCallback(callback) {
        this.callbackUpdatedStatus = callback;
    }
    setWatchdog() {
        const watchdogTimeout = this.frequency * 6000;
        const checkInterval = this.frequency * 1000;
        this.watchdogInterval = setInterval(() => {
            if (this.watchdogLastData === undefined)
                return;
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
        const wsOptions = this.ssl ? this.sslConfig.getSSLOptions(this.host) : {};
        this.ws = new ws_1.default(this.ssl
            ? `wss://${this.host}:443/ws/home/overview`
            : `ws://${this.host}:8082/ws/home/overview`, wsOptions);
        this.ws.on('open', this.onOpen.bind(this));
        this.ws.on('message', this.onMessage.bind(this));
        this.ws.on('error', this.onError.bind(this));
    }
    reconnect() {
        this.ws?.close();
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
        const packet = Object.assign({ lang: this.lang, token: this.token }, data);
        if (this.ws && this.ws.readyState === ws_1.default.OPEN) {
            this.ws.send(JSON.stringify(packet));
        }
    }
    onOpen() {
        this.logger.info('Connected to WiNet device');
        this.sendPacket({
            service: 'connect',
            username: this.winetUser,
            passwd: this.winetPass,
        });
    }
    onError(error) {
        this.logger.error('WebSocket error:', error);
        this.analytics?.registerError('websocket', error.message);
    }
    onMessage(data) {
        this.watchdogLastData = Date.now();
        try {
            const message = JSON.parse(data.toString());
            const { result_code, result_data } = message;
            // Extract service from result_data, not from top level
            const service = result_data?.service;
            // Debug log the raw message to understand what's being received
            this.logger.debug('Received message:', {
                service,
                result_code,
                hasResultData: !!result_data,
                messageKeys: Object.keys(message),
            });
            // Handle case where service is undefined or null
            if (!service) {
                this.logger.warn('Received message without service field in result_data:', {
                    result_code,
                    result_data,
                    messageKeys: Object.keys(message),
                });
                return;
            }
            if (result_code !== 1) {
                this.logger.warn(`Received non-success result_code: ${result_code} for service: ${service}`);
            }
            switch (service) {
                case 'connect': {
                    const { ConnectSchema } = require('./types/MessageTypes');
                    const connectResult = ConnectSchema.safeParse(result_data);
                    if (!connectResult.success) {
                        this.analytics?.registerError('connectSchema', 'successFalse');
                        this.logger.error('Invalid connect message: schema validation failed');
                        return;
                    }
                    const connectData = connectResult.data;
                    if (connectData.token === undefined) {
                        this.analytics?.registerError('connectSchema', 'tokenMissing');
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
                    this.analytics?.registerVersion(this.winetVersion);
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
                    const { LoginSchema } = require('./types/MessageTypes');
                    const loginResult = LoginSchema.safeParse(result_data);
                    if (!loginResult.success) {
                        this.analytics?.registerError('loginSchema', 'successFalse');
                        this.logger.error('Invalid login message: schema validation failed');
                        return;
                    }
                    const loginData = loginResult.data;
                    if (loginData.token === undefined) {
                        this.analytics?.registerError('loginSchema', 'tokenMissing');
                        this.logger.error('Authenticated Token is missing');
                        return;
                    }
                    if (result_code === 1) {
                        this.logger.info('Authenticated successfully');
                    }
                    else {
                        this.analytics?.registerError('loginSchema', 'resultCodeFail');
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
                    const { DeviceListSchema } = require('./types/MessageTypes');
                    const deviceListResult = DeviceListSchema.safeParse(result_data);
                    if (!deviceListResult.success) {
                        this.analytics?.registerError('deviceListSchema', 'successFalse');
                        this.logger.error('Invalid devicelist message: schema validation failed');
                        return;
                    }
                    const deviceListData = deviceListResult.data;
                    const existingDeviceSerials = new Set(this.devices.map(d => d.dev_sn));
                    const alphanumericRegex = /[^a-zA-Z0-9]/g;
                    for (const device of deviceListData.list) {
                        const deviceStages = Constants_1.DeviceTypeStages.get(device.dev_type) || [];
                        if (deviceStages.length === 0) {
                            this.logger.info('Skipping device:', device.dev_name, device.dev_sn);
                            continue;
                        }
                        if (!existingDeviceSerials.has(device.dev_sn)) {
                            this.deviceStatus[device.dev_id] = {};
                            device.dev_model = device.dev_model.replace(alphanumericRegex, '');
                            device.dev_sn = device.dev_sn.replace(alphanumericRegex, '');
                            const stageNames = deviceStages
                                .map(s => Constants_1.QueryStages[s])
                                .join(', ');
                            this.logger.info(`Detected device: ${device.dev_model} (${device.dev_sn}) - Type: ${device.dev_type}, Stages: ${stageNames}`);
                            this.devices.push(device);
                            existingDeviceSerials.add(device.dev_sn);
                        }
                    }
                    this.analytics?.registerDevices(this.devices);
                    // Start continuous device scanning
                    this.scanDevices();
                    this.scanInterval = setInterval(() => {
                        this.scanDevices();
                    }, this.frequency * 1000);
                    this.logger.info(`Started continuous scanning with ${this.frequency}s interval`);
                    break;
                }
                case 'real':
                case 'real_battery': {
                    const receivedDevice = this.inFlightDevice;
                    this.inFlightDevice = undefined;
                    const { RealtimeSchema } = require('./types/MessageTypes');
                    const realtimeResult = RealtimeSchema.safeParse(result_data);
                    if (!realtimeResult.success) {
                        this.analytics?.registerError('realtimeSchema', 'successFalse');
                        this.logger.error('Invalid realtime message: schema validation failed');
                        this.reconnect();
                        return;
                    }
                    if (receivedDevice === undefined) {
                        this.logger.error('Received realtime data without a current device');
                        return;
                    }
                    const slugifyOptions = { lower: true, strict: true, replacement: '_' };
                    // Log all data names for meter-connected inverter (A22C1208343)
                    const device = this.devices.find(d => d.dev_id === receivedDevice);
                    if (device?.dev_sn === 'A22C1208343') {
                        this.logger.info(`[METER DEBUG] Received ${realtimeResult.data.list.length} datapoints for ${device.dev_sn}`);
                        const dataNames = realtimeResult.data.list.map((d) => `${this.properties?.[d.data_name] || d.data_name} (${d.data_unit})`);
                        this.logger.info(`[METER DEBUG] Data names: ${dataNames.join(', ')}`);
                    }
                    for (const data of realtimeResult.data.list) {
                        const name = this.properties?.[data.data_name] || data.data_name;
                        let value;
                        if (Constants_1.NumericUnits.has(data.data_unit)) {
                            value =
                                data.data_value === '--'
                                    ? undefined
                                    : parseFloat(data.data_value);
                        }
                        else {
                            value = data.data_value.startsWith('I18N_')
                                ? this.properties?.[data.data_value]
                                : data.data_value;
                        }
                        const dataPoint = {
                            name,
                            slug: (0, slugify_1.default)(name, slugifyOptions),
                            value,
                            unit: data.data_unit,
                            dirty: true,
                        };
                        // Log meter-related datapoints
                        if (device?.dev_sn === 'A22C1208343' && name.toLowerCase().includes('meter')) {
                            this.logger.info(`[METER DEBUG] ${name} = ${value} ${data.data_unit}`);
                        }
                        this.updateDeviceStatus(receivedDevice, dataPoint);
                    }
                    this.scanDevices();
                    break;
                }
                case 'direct': {
                    const receivedDevice = this.inFlightDevice;
                    this.inFlightDevice = undefined;
                    const { DirectSchema } = require('./types/MessageTypes');
                    const directResult = DirectSchema.safeParse(result_data);
                    if (!directResult.success) {
                        this.analytics?.registerError('directSchema', 'successFalse');
                        this.logger.error('Invalid direct message: schema validation failed');
                        return;
                    }
                    if (receivedDevice === undefined) {
                        this.logger.error('Received direct data without a current device');
                        return;
                    }
                    let mpptTotalW = 0;
                    const slugifyOptions = { lower: true, strict: true, replacement: '_' };
                    for (const data of directResult.data.list) {
                        const names = data.name.split('%');
                        const name = this.properties?.[names[0]] || data.name;
                        let nameV = name + ' Voltage';
                        let nameA = name + ' Current';
                        let nameW = name + ' Power';
                        if (names.length > 1) {
                            nameV = nameV.replace('{0}', names[1].replace('@', ''));
                            nameA = nameA.replace('{0}', names[1].replace('@', ''));
                            nameW = nameW.replace('{0}', names[1].replace('@', ''));
                        }
                        const dataPointV = {
                            name: nameV,
                            slug: (0, slugify_1.default)(nameV, slugifyOptions),
                            value: data.voltage === '--' ? undefined : parseFloat(data.voltage),
                            unit: data.voltage_unit,
                            dirty: true,
                        };
                        const dataPointA = {
                            name: nameA,
                            slug: (0, slugify_1.default)(nameA, slugifyOptions),
                            value: data.current === '--' ? undefined : parseFloat(data.current),
                            unit: data.current_unit,
                            dirty: true,
                        };
                        const dataPointW = {
                            name: nameW,
                            slug: (0, slugify_1.default)(nameW, slugifyOptions),
                            value: data.current === '--'
                                ? undefined
                                : Math.round(parseFloat(data.current) * parseFloat(data.voltage) * 100) / 100,
                            unit: 'W',
                            dirty: true,
                        };
                        if (dataPointW.value !== undefined &&
                            dataPointW.name.toLowerCase().startsWith('mppt')) {
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
                    this.analytics?.registerError('notice', result_code + '');
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
                    this.analytics?.registerError('unknownService', service || 'undefined');
                    this.logger.error('Received unknown message type:', {
                        service,
                        result_code,
                        hasResultData: !!result_data,
                        messageKeys: Object.keys(message),
                        fullMessage: message,
                    });
            }
        }
        catch (error) {
            this.logger.error('Failed to parse message:', error);
            this.analytics?.registerError('parseError', error.message);
        }
    }
    updateDeviceStatus(device, dataPoint) {
        const combinedName = `${device}_${dataPoint.slug}`;
        const deviceStats = this.deviceStatus[device];
        const oldDataPoint = deviceStats?.[dataPoint.slug];
        if (oldDataPoint === undefined ||
            oldDataPoint.value !== dataPoint.value ||
            this.lastDeviceUpdate[combinedName] === undefined ||
            Date.now() - this.lastDeviceUpdate[combinedName] > 300000) {
            deviceStats[dataPoint.slug] = dataPoint;
            this.lastDeviceUpdate[combinedName] = Date.now();
        }
    }
    /**
     * Augment device status with Modbus meter data
     * Adds meter_power, grid_import_energy, and grid_export_energy
     */
    async addModbusMeterData() {
        if (!this.modbusReader) {
            return;
        }
        try {
            this.logger.info('🔄 Reading Modbus meter data...');
            const meterData = await this.modbusReader.readMeterData();
            this.logger.info(`📊 Modbus meter data READ: ${meterData.power}W, ` +
                `Import: ${meterData.importEnergy.toFixed(1)}kWh, ` +
                `Export: ${meterData.exportEnergy.toFixed(1)}kWh`);
            // Find the first device (assuming meter is connected to first inverter)
            // In future, could make this configurable
            const firstDevice = this.devices[0];
            if (!firstDevice) {
                this.logger.warn('No devices found for Modbus meter data');
                return;
            }
            const deviceId = firstDevice.dev_id.toString();
            if (!this.deviceStatus[deviceId]) {
                this.deviceStatus[deviceId] = {};
            }
            const deviceStats = this.deviceStatus[deviceId];
            // Add meter power
            deviceStats['meter_power'] = {
                title: 'Meter Power',
                name: 'meter_power',
                value: meterData.power,
                unit: 'W',
                slug: 'meter_power',
                dirty: true,
            };
            // Add grid import energy
            deviceStats['grid_import_energy'] = {
                title: 'Grid Import Energy',
                name: 'grid_import_energy',
                value: meterData.importEnergy,
                unit: 'kWh',
                slug: 'grid_import_energy',
                dirty: true,
            };
            // Add grid export energy
            deviceStats['grid_export_energy'] = {
                title: 'Grid Export Energy',
                name: 'grid_export_energy',
                value: meterData.exportEnergy,
                unit: 'kWh',
                slug: 'grid_export_energy',
                dirty: true,
            };
            // Mark these sensors as recently updated to bypass cache
            const now = Date.now();
            this.lastDeviceUpdate[`${deviceId}_meter_power`] = now;
            this.lastDeviceUpdate[`${deviceId}_grid_import_energy`] = now;
            this.lastDeviceUpdate[`${deviceId}_grid_export_energy`] = now;
            this.logger.info(`✅ Added 3 Modbus sensors to device ${deviceId}`);
        }
        catch (error) {
            const errorMsg = error instanceof Error ? error.message : String(error);
            this.logger.error(`Failed to read Modbus meter data: ${errorMsg}`);
            // Don't throw - continue with other sensors
        }
    }
    async scanDevices() {
        if (this.inFlightDevice !== undefined) {
            this.analytics?.registerError('scanDevices', 'inFlightDevice');
            this.logger.info(`Skipping scanDevices, in flight device: ${this.inFlightDevice}`);
            this.watchdogCount++;
            if (this.watchdogCount > 5) {
                this.analytics?.registerError('scanDevices', 'watchdogTriggered');
                this.logger.error('Watchdog triggered, reconnecting');
                this.reconnect();
            }
            return;
        }
        if (this.currentDevice === undefined) {
            this.currentDevice = this.devices[0].dev_id;
            this.currentStages = [
                ...(Constants_1.DeviceTypeStages.get(this.devices[0].dev_type) || []),
            ];
        }
        else if (this.currentStages.length === 0) {
            const currentIndex = this.devices.findIndex(device => device.dev_id === this.currentDevice);
            const nextIndex = currentIndex + 1;
            if (nextIndex >= this.devices.length) {
                this.currentDevice = undefined;
                // Calculate total data points for logging
                const totalDataPoints = Object.values(this.deviceStatus).reduce((count, deviceData) => count + Object.keys(deviceData).length, 0);
                this.logger.debug(`Completed scan cycle - ${this.devices.length} devices, ${totalDataPoints} data points`);
                // Augment with Modbus meter data if enabled
                if (this.modbusEnabled) {
                    await this.addModbusMeterData();
                }
                this.callbackUpdatedStatus?.(this.devices, this.deviceStatus);
                return;
            }
            this.currentDevice = this.devices[nextIndex].dev_id;
            this.currentStages = [
                ...(Constants_1.DeviceTypeStages.get(this.devices[nextIndex].dev_type) || []),
            ];
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
        this.logger.debug(`Scanning device ${this.currentDevice} with service '${service}'`);
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