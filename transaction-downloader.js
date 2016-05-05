'use strict'

const request = require('request');
const logger = require('log4js').getLogger('ENAPI Transaction Downloader');
const fs = require('fs');
const moment = require('moment-timezone');
const ENTransactionCSVReader = require('./transaction-csv-reader.js');

const MAX_DAYS_AGO = 30;

class ENTransactionDownloader extends ENTransactionCSVReader {
    constructor(dateStart, dateEnd, options, enapi) {
        const csvReaderOptions = {};

        if (options) {
            if (options.csvDelimiter !== undefined)
                csvReaderOptions.delimiter = options.csvDelimiter;
        }

        super(csvReaderOptions);

        this.enapi = enapi;
        this.EN_TIME_ZONE = enapi.constructor.TIME_ZONE;
        this.ENAPI_VERSION = enapi.constructor.VERSION;

        const argsErr = this._checkArgs(dateStart, dateEnd, options);
        if (argsErr) {
            process.nextTick( () => this.emit('error', argsErr) );
            return;
        }

        // end date is inclusive, say so in the logs
        const trueEndDate = this.ENDateEnd.clone().add(1, 'days').subtract(1, 'ms');
        logger.info(`downloading transactions from ${this.ENDateStart.toISOString()} to ${trueEndDate.toISOString()}`);

        const privateToken = options && options.privateToken || enapi.privateToken;
        if (!privateToken) {
            const e = new Error("private token is required");
            process.nextTick( () => this.emit('error', e) );
            return;
        }

        let backupFileStream = null;
        let backupFileName = null;
        if (options && options.backupDir) {
            // the user might choose to backup downloaded transactions file on the disk by specifying backupDir option
            const now = moment().tz('UTC');
            backupFileName = options.backupDir + '/' + now.format('YYYY-MM-DD-HH-mm') + '_' + this.ENDateStart.format('YYYY-MM-DD');
            if (!this.ENDateStart.isSame(this.ENDateEnd)) backupFileName += '_' + ENDateEnd.format('YYYY-MM-DD');
            backupFileName += '.csv';
            this.backupFileName = backupFileName

            logger.info(`saving downloaded transactions into backup file ${backupFileName}`);
            backupFileStream = fs.createWriteStream(backupFileName);
        }

        const requestOptions = {
            url: `https://www.e-activist.com/ea-dataservice/export.service?type=CSV&token=${privateToken}` +
                    `&startDate=${this.ENDateStart.format('MMDDYYYY')}&endDate=${this.ENDateEnd.format('MMDDYYYY')}`,
            headers: {
                'User-Agent': `node.js engaging-networks-api v${this.ENAPI_VERSION}`
            }
        };

        const csvStream = request.get(requestOptions);

        this.downloadFailed = false;
        this.on('error', () => this.downloadFailed = true);

        csvStream.on('error', (err) => {
            if (this.downloadFailed) return;

            this.emit('error', err);
        });

        csvStream.on('response', (response) => {
            if (response.statusCode != 200) {
                return this.emit('error', new Error(`server returned bad response: ${response.statusCode} ${response.statusMessage}`));
            }

            if (response.headers['total'] === undefined) {
                logger.warn('server did not send the Total header');
                this.recordsExpected = null;
            } else {
                this.recordsExpected = response.headers['total'];
                logger.info(`received response, expecting ${this.recordsExpected} records`);
            }
            this.emit('start', this.recordsExpected);
        });

        csvStream.pipe(this);
        if (backupFileStream) {
            csvStream.pipe(backupFileStream);
            backupFileStream.on('error', err => {
                this.emit('error', err);
                csvStream.pause();
            });
        }
    }

    _transform(chunk, encoding, callback) {
        if (chunk.indexOf('\x0a\x0aERROR:') == 0) {
            return callback(new Error('EN returned ' + chunk.toString().trim()));
        }
        this._transform = super._transform;
        return super._transform(chunk, encoding, callback);
    }

    _flush(callback) {
        super._flush((err) => {
            if (err) return callback(err);

            if (this.recordsExpected !== null && this.recordCount != this.recordsExpected)
                return callback(new Error(`received incomplete file: ${this.recordCount} records instead of ${this.recordsExpected}`));

            callback();
        });
    }

    _checkArgs(dateStart, dateEnd, options) {
        debugger;
        if (!(typeof dateStart === 'string') || !(typeof dateEnd === 'string')) {
            return new Error("dateStart and dateEnd should be strings");
        }

        if (!dateStart.match(/^\d{4}-\d\d-\d\d$/) || !dateEnd.match(/^\d{4}-\d\d-\d\d$/)) {
            return new Error("dateStart and dateEnd should be YYYY-MM-DD date strings");
        }

        let ENDateStart = moment.tz(dateStart, this.EN_TIME_ZONE);
        let ENDateEnd = moment.tz(dateEnd, this.EN_TIME_ZONE);
        this.ENDateStart = ENDateStart;
        this.ENDateEnd = ENDateEnd;

        if (!ENDateStart.isValid() || !ENDateEnd.isValid()) {
            return new Error(`dateStart or dateEnd are invalid dates: ${dateStart}, ${dateEnd}`);
        }

        if (ENDateStart.isAfter(ENDateEnd)) {
            return new Error(`dateStart is after dateEnd: ${dateStart} is after ${dateEnd}`);
        }

        let ENStartOfToday = moment().tz(this.EN_TIME_ZONE).startOf('day');

        if (ENDateEnd.isSameOrAfter(ENStartOfToday)) {
            return new Error(`dateEnd is later than the beginning of a current day in EN timezone (${ENStartOfToday.format("YYYY-MM-DD")})`);
        }

        let ENMinAllowedDay = ENStartOfToday.clone().add(-1 * MAX_DAYS_AGO, 'days');
        if (ENDateStart.isBefore(ENMinAllowedDay)) {
            return new Error(`dateStart is earlier than the minimum allowed day (${ENMinAllowedDay.format("YYYY-MM-DD")})`);
        }

        return null;
    }
}

module.exports = ENTransactionDownloader;