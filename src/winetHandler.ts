import {z} from 'zod';
import {DeviceSchema} from './types/MessageTypes';
import {DeviceStatusMap} from './types/DeviceStatus';
import {Properties} from './types/Properties';
import * as winston from 'winston';
import {Analytics} from './analytics';
import {SSLConfig} from './sslConfig';
import WebSocket from 'ws';
import slugify from 'slugify';
import {QueryStages, DeviceTypeStages, NumericUnits} from './types/Constants';

export class winetHandler {
  private winetUser: string;
  private winetPass: string;
  private token = '';
  private currentDevice?: number;
  private inFlightDevice?: number;
  private currentStages: QueryStages[] = [];
  private devices: z.infer<typeof DeviceSchema>[] = [];
  private deviceStatus: DeviceStatusMap = {};
  private lastDeviceUpdate: {[key: string]: number} = {};
  private watchdogCount = 0;
  private watchdogLastData?: number;
  private winetVersion?: number;
  private scanInterval?: NodeJS.Timeout;
  private watchdogInterval?: NodeJS.Timeout;
  private logger: winston.Logger;
  private host: string;
  private ssl = false;
  private sslConfig: SSLConfig;
  private lang: string;
  private frequency: number;
  private analytics?: Analytics;
  private properties?: Properties;
  private callbackUpdatedStatus?: (
    devices: z.infer<typeof DeviceSchema>[],
    deviceStatus: DeviceStatusMap,
  ) => void;
  private ws?: WebSocket;

  constructor(
    logger: winston.Logger,
    host: string,
    lang: string,
    frequency: number,
    winetUser?: string,
    winetPass?: string,
    analytics?: Analytics,
  ) {
    this.winetUser = winetUser || 'admin';
    this.winetPass = winetPass || 'pw8888';
    this.logger = logger;
    this.host = host;
    this.sslConfig = new SSLConfig(logger);
    this.lang = lang;
    this.frequency = frequency;
    this.analytics = analytics;
  }

  setProperties(properties: Properties): void {
    this.properties = properties;
  }

  setCallback(
    callback: (
      devices: z.infer<typeof DeviceSchema>[],
      deviceStatus: DeviceStatusMap,
    ) => void,
  ): void {
    this.callbackUpdatedStatus = callback;
  }

  private setWatchdog(): void {
    const watchdogTimeout = this.frequency * 6000;
    const checkInterval = this.frequency * 1000;

    this.watchdogInterval = setInterval(() => {
      if (this.watchdogLastData === undefined) return;

      if (Date.now() - this.watchdogLastData > watchdogTimeout) {
        this.logger.error('Watchdog triggered, reconnecting');
        this.reconnect();
      }
    }, checkInterval);
  }

  private clearWatchdog(): void {
    if (this.watchdogInterval !== undefined) {
      clearInterval(this.watchdogInterval);
    }
  }

  connect(ssl?: boolean): void {
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

    this.ws = new WebSocket(
      this.ssl
        ? `wss://${this.host}:443/ws/home/overview`
        : `ws://${this.host}:8082/ws/home/overview`,
      wsOptions,
    );

    this.ws.on('open', this.onOpen.bind(this));
    this.ws.on('message', this.onMessage.bind(this));
    this.ws.on('error', this.onError.bind(this));
  }

  private reconnect(): void {
    this.ws?.close();
    this.logger.warn('Reconnecting to Winet');

    if (this.scanInterval !== undefined) {
      clearInterval(this.scanInterval);
    }

    this.clearWatchdog();

    setTimeout(
      () => {
        this.connect();
      },
      this.frequency * 1000 * 3,
    );
  }

  private sendPacket(data: any): void {
    const packet = Object.assign({lang: this.lang, token: this.token}, data);

    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(packet));
    }
  }

  private onOpen(): void {
    this.logger.info('Connected to WiNet device');

    this.sendPacket({
      service: 'connect',
      username: this.winetUser,
      passwd: this.winetPass,
    });
  }

  private onError(error: Error): void {
    this.logger.error('WebSocket error:', error);
    this.analytics?.registerError('websocket', error.message);
  }

  private onMessage(data: WebSocket.RawData): void {
    this.watchdogLastData = Date.now();

    try {
      const message = JSON.parse(data.toString());
      const {result_code, result_data} = message;

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
        this.logger.warn(
          'Received message without service field in result_data:',
          {
            result_code,
            result_data,
            messageKeys: Object.keys(message),
          },
        );
        return;
      }

      if (result_code !== 1) {
        this.logger.warn(
          `Received non-success result_code: ${result_code} for service: ${service}`,
        );
      }

      switch (service) {
        case 'connect': {
          const {ConnectSchema} = require('./types/MessageTypes');
          const connectResult = ConnectSchema.safeParse(result_data);

          if (!connectResult.success) {
            this.analytics?.registerError('connectSchema', 'successFalse');
            this.logger.error(
              'Invalid connect message: schema validation failed',
            );
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
          } else if (connectData.forceModifyPasswd !== undefined) {
            this.logger.info(
              'Connected to a Winet-S2 device with newer firmware',
            );
            this.winetVersion = 3;
          } else {
            this.logger.info(
              'Connected to a Winet-S2 device with older firmware',
            );
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
          const {LoginSchema} = require('./types/MessageTypes');
          const loginResult = LoginSchema.safeParse(result_data);

          if (!loginResult.success) {
            this.analytics?.registerError('loginSchema', 'successFalse');
            this.logger.error(
              'Invalid login message: schema validation failed',
            );
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
          } else {
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
          const {DeviceListSchema} = require('./types/MessageTypes');
          const deviceListResult = DeviceListSchema.safeParse(result_data);

          if (!deviceListResult.success) {
            this.analytics?.registerError('deviceListSchema', 'successFalse');
            this.logger.error(
              'Invalid devicelist message: schema validation failed',
            );
            return;
          }

          const deviceListData = deviceListResult.data;
          const existingDeviceSerials = new Set(
            this.devices.map(d => d.dev_sn),
          );
          const alphanumericRegex = /[^a-zA-Z0-9]/g;

          for (const device of deviceListData.list) {
            const deviceStages = DeviceTypeStages.get(device.dev_type) || [];
            if (deviceStages.length === 0) {
              this.logger.info(
                'Skipping device:',
                device.dev_name,
                device.dev_sn,
              );
              continue;
            }

            if (!existingDeviceSerials.has(device.dev_sn)) {
              this.deviceStatus[device.dev_id] = {} as any;
              device.dev_model = device.dev_model.replace(
                alphanumericRegex,
                '',
              );
              device.dev_sn = device.dev_sn.replace(alphanumericRegex, '');

              const stageNames = deviceStages
                .map(s => QueryStages[s])
                .join(', ');
              this.logger.info(
                `Detected device: ${device.dev_model} (${device.dev_sn}) - Type: ${device.dev_type}, Stages: ${stageNames}`,
              );

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

          this.logger.info(
            `Started continuous scanning with ${this.frequency}s interval`,
          );
          break;
        }

        case 'real':
        case 'real_battery': {
          const receivedDevice = this.inFlightDevice;
          this.inFlightDevice = undefined;

          const {RealtimeSchema} = require('./types/MessageTypes');
          const realtimeResult = RealtimeSchema.safeParse(result_data);

          if (!realtimeResult.success) {
            this.analytics?.registerError('realtimeSchema', 'successFalse');
            this.logger.error(
              'Invalid realtime message: schema validation failed',
            );
            this.reconnect();
            return;
          }

          if (receivedDevice === undefined) {
            this.logger.error(
              'Received realtime data without a current device',
            );
            return;
          }

          const slugifyOptions = {lower: true, strict: true, replacement: '_'};

          for (const data of realtimeResult.data.list) {
            const name = this.properties?.[data.data_name] || data.data_name;
            let value;

            if (NumericUnits.has(data.data_unit)) {
              value =
                data.data_value === '--'
                  ? undefined
                  : parseFloat(data.data_value);
            } else {
              value = data.data_value.startsWith('I18N_')
                ? this.properties?.[data.data_value]
                : data.data_value;
            }

            const dataPoint = {
              name,
              slug: slugify(name, slugifyOptions),
              value,
              unit: data.data_unit,
              dirty: true,
            };

            this.updateDeviceStatus(receivedDevice!, dataPoint);
          }

          this.scanDevices();
          break;
        }

        case 'direct': {
          const receivedDevice = this.inFlightDevice;
          this.inFlightDevice = undefined;

          const {DirectSchema} = require('./types/MessageTypes');
          const directResult = DirectSchema.safeParse(result_data);

          if (!directResult.success) {
            this.analytics?.registerError('directSchema', 'successFalse');
            this.logger.error(
              'Invalid direct message: schema validation failed',
            );
            return;
          }

          if (receivedDevice === undefined) {
            this.logger.error('Received direct data without a current device');
            return;
          }

          let mpptTotalW = 0;
          const slugifyOptions = {lower: true, strict: true, replacement: '_'};

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
              slug: slugify(nameV, slugifyOptions),
              value:
                data.voltage === '--' ? undefined : parseFloat(data.voltage),
              unit: data.voltage_unit,
              dirty: true,
            };

            const dataPointA = {
              name: nameA,
              slug: slugify(nameA, slugifyOptions),
              value:
                data.current === '--' ? undefined : parseFloat(data.current),
              unit: data.current_unit,
              dirty: true,
            };

            const dataPointW = {
              name: nameW,
              slug: slugify(nameW, slugifyOptions),
              value:
                data.current === '--'
                  ? undefined
                  : Math.round(
                      parseFloat(data.current) * parseFloat(data.voltage) * 100,
                    ) / 100,
              unit: 'W',
              dirty: true,
            };

            if (
              dataPointW.value !== undefined &&
              dataPointW.name.toLowerCase().startsWith('mppt')
            ) {
              mpptTotalW += dataPointW.value;
            }

            this.updateDeviceStatus(receivedDevice!, dataPointV);
            this.updateDeviceStatus(receivedDevice!, dataPointA);
            this.updateDeviceStatus(receivedDevice!, dataPointW);
          }

          const dataPointTotalW = {
            name: 'MPPT Total Power',
            slug: 'mppt_total_power',
            value: Math.round(mpptTotalW * 100) / 100,
            unit: 'W',
            dirty: true,
          };

          this.updateDeviceStatus(receivedDevice!, dataPointTotalW);
          this.scanDevices();
          break;
        }

        case 'notice': {
          this.analytics?.registerError('notice', result_code + '');
          if (result_code === 100) {
            this.logger.info('Websocket got timed out');
            this.reconnect();
          } else {
            this.logger.error('Received notice from inverter');
          }
          break;
        }

        default:
          this.analytics?.registerError(
            'unknownService',
            service || 'undefined',
          );
          this.logger.error('Received unknown message type:', {
            service,
            result_code,
            hasResultData: !!result_data,
            messageKeys: Object.keys(message),
            fullMessage: message,
          });
      }
    } catch (error) {
      this.logger.error('Failed to parse message:', error);
      this.analytics?.registerError('parseError', (error as Error).message);
    }
  }

  private updateDeviceStatus(device: number, dataPoint: any): void {
    const combinedName = `${device}_${dataPoint.slug}`;
    const deviceStats = this.deviceStatus[device] as any;
    const oldDataPoint = deviceStats?.[dataPoint.slug];

    if (
      oldDataPoint === undefined ||
      oldDataPoint.value !== dataPoint.value ||
      this.lastDeviceUpdate[combinedName] === undefined ||
      Date.now() - this.lastDeviceUpdate[combinedName] > 300000
    ) {
      deviceStats[dataPoint.slug] = dataPoint;
      this.lastDeviceUpdate[combinedName] = Date.now();
    }
  }

  private scanDevices(): void {
    if (this.inFlightDevice !== undefined) {
      this.analytics?.registerError('scanDevices', 'inFlightDevice');
      this.logger.info(
        `Skipping scanDevices, in flight device: ${this.inFlightDevice}`,
      );
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
        ...(DeviceTypeStages.get(this.devices[0].dev_type) || []),
      ];
    } else if (this.currentStages.length === 0) {
      const currentIndex = this.devices.findIndex(
        device => device.dev_id === this.currentDevice,
      );
      const nextIndex = currentIndex + 1;

      if (nextIndex >= this.devices.length) {
        this.currentDevice = undefined;

        // Calculate total data points for logging
        const totalDataPoints = Object.values(this.deviceStatus).reduce(
          (count, deviceData) => count + Object.keys(deviceData as any).length,
          0,
        );

        this.logger.debug(
          `Completed scan cycle - ${this.devices.length} devices, ${totalDataPoints} data points`,
        );
        this.callbackUpdatedStatus?.(this.devices, this.deviceStatus);
        return;
      }

      this.currentDevice = this.devices[nextIndex].dev_id;
      this.currentStages = [
        ...(DeviceTypeStages.get(this.devices[nextIndex].dev_type) || []),
      ];
    }

    const nextStage = this.currentStages.shift();
    let service = '';

    switch (nextStage) {
      case QueryStages.REAL:
        service = 'real';
        break;
      case QueryStages.DIRECT:
        service = 'direct';
        break;
      case QueryStages.REAL_BATTERY:
        service = 'real_battery';
        break;
      default:
        this.logger.error('Unknown query stage:', nextStage);
        return;
    }

    this.inFlightDevice = this.currentDevice;

    this.logger.debug(
      `Scanning device ${this.currentDevice} with service '${service}'`,
    );

    this.sendPacket({
      service: service,
      dev_id: this.currentDevice!.toString(),
      time123456: Date.now(),
      level: 3,
      extended: 'true',
      grid: 'true',
    });
  }
}
