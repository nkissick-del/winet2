import { Properties } from './types/Properties';
import * as winston from 'winston';
export interface PropertiesResult {
    properties: Properties;
    forceSsl: boolean;
}
export declare function getProperties(logger: winston.Logger, host: string, lang: string, ssl: boolean): Promise<PropertiesResult>;
