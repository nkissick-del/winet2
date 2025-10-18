import Winston from 'winston';
import { Properties } from './types/Properties';
type ReturnProperties = {
    properties: Properties;
    forceSsl: boolean;
};
export declare function getProperties(logger: Winston.Logger, host: string, lang: string, ssl: boolean): Promise<ReturnProperties>;
export {};
