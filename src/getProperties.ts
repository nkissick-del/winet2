import {Properties} from './types/Properties';
import * as winston from 'winston';
import * as http from 'http';
import * as https from 'https';

import {SSLConfig} from './sslConfig';

export interface PropertiesResult {
  properties: Properties;
  forceSsl: boolean;
}

export function getProperties(
  logger: winston.Logger,
  host: string,
  lang: string,
  ssl: boolean,
): Promise<PropertiesResult> {
  return new Promise((resolve, reject) => {
    const url = `${ssl ? 'https' : 'http'}://${host}/i18n/${lang}.properties`;

    const request = () => {
      const sslConfig = new SSLConfig(logger);
      const options = ssl ? sslConfig.getSSLOptions(host) : {};

      (ssl ? https : http)
        .get(url, options, res => {
          let data = '';

          res.on('data', (chunk: string) => {
            data += chunk;
          });

          res.on('error', (err: Error) => {
            if (!ssl) {
              // Retry with ssl set to true
              getProperties(logger, host, lang, true)
                .then(resolve)
                .catch(reject);
            } else {
              reject(err);
            }
          });

          res.on('end', () => {
            // Optimized properties parsing with reduced array operations
            const properties: Properties = {};
            const lines = data.split('\n');

            for (let i = 0; i < lines.length; i++) {
              const line = lines[i];
              const equalPos = line.indexOf('=');
              if (equalPos > 0) {
                const key = line.substring(0, equalPos);
                const value = line.substring(equalPos + 1);
                if (key && value) {
                  properties[key] = value;
                }
              }
            }
            resolve({properties, forceSsl: ssl});
          });
        })
        .on('error', (err: Error) => {
          if (!ssl) {
            logger.warn(
              'Newer Winet versions require SSL to be enabled. Retrying',
            );
            // Retry with ssl set to true
            getProperties(logger, host, lang, true).then(resolve).catch(reject);
          } else {
            reject(err);
          }
        });
    };

    request();
  });
}
