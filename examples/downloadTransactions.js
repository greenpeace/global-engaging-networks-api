'use strict';

const ENAPI = require('./enapi.js');
const logger = require('log4js').getLogger('downloadTransactions.js');

logger.setLevel("TRACE");

const enapi = new ENAPI({privateToken: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'});

let records = 0;
const transactionStream = enapi.DownloadTransactions('2016-04-23', '2016-04-23', { backupDir: 'backup' });
transactionStream.on('error', (err) => { logger.warn('got transaction stream error:', err.message) });
transactionStream.on('data', (data) => { ++records;  });
transactionStream.on('end', () => { logger.info(`Successfully downloaded transactions, got ${records} records`) });
