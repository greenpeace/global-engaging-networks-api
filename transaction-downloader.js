'use strict'

const request = require('request');
const logger = require('log4js').getLogger('ENAPI Transaction Downloader');
const fs = require('fs');
const moment = require('moment-timezone');
const ENTransactionCSVReader = require('./transaction-csv-reader.js');

// ENTransactionDownloader class is a Readable stream that emits downloaded
// EN transactions. Downloaded transactions come in a form of a CSV file,
// and special checks need to be prerformed at the start and the end of
// the input stream, so it is easier to make it as an extension of CSV reader
class ENTransactionDownloader extends ENTransactionCSVReader {

    // dateStart and dateEnd are YYYY-MM-DD strings in EN timezone. Dates are
    // inclusive.
    //
    // options is an object with optional properties:
    //  -   csvDelimiter: record delimiter that we expect to see in the
    //      incoming file. This per-account EN setting is configured in
    //      Data API -> Manage General Settings -> export settings ->
    //      File Delimiter
    //
    //  -   backupDir: if specified, this directory will be used to store
    //      downloaded filed as-is. Backup file will be stored under a name
    //      containign current timestamp in UTC timezone, starting date and
    //      end date. If you wish to have a less elaborate file naming, you
    //      can use backupFileName option to override default.
    //
    //  - backupFileName: overrides default backup file naming, see backupDir
    //
    // enapi is an instance of ENAPI class
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

        const datesErr = this._checkDates(dateStart, dateEnd, options);
        if (datesErr) {
            process.nextTick( () => this.emit('error', datesErr) );
            return;
        }

        const privateToken = options && options.privateToken || enapi.privateToken;
        if (!privateToken) {
            const e = new Error("private token is required");
            process.nextTick( () => this.emit('error', e) );
            return;
        }

        // end date is inclusive, say so in the logs
        const trueEndDate = this.ENDateEnd.clone().add(1, 'days').subtract(1, 'ms');
        logger.info(`downloading transactions from ${this.ENDateStart.toISOString()} to ${trueEndDate.toISOString()}`);

        let backupFileStream = null;
        let backupFilePath = null;
        if (options && options.backupDir) {
            if (!options.backupFileName) {
                const now = moment().tz('UTC');
                backupFilePath = options.backupDir + '/' + now.format('YYYY-MM-DD-HH-mm') + '_' + this.ENDateStart.format('YYYY-MM-DD');
                if (!this.ENDateStart.isSame(this.ENDateEnd)) backupFilePath += '_' + this.ENDateEnd.format('YYYY-MM-DD');
                backupFilePath += '.csv';
            } else {
                backupFilePath = options.backupDir + '/' + options.backupFileName;
            }
            this.backupFilePath = backupFilePath

            logger.info(`saving downloaded transactions into backup file ${backupFilePath}`);
            backupFileStream = fs.createWriteStream(backupFilePath);
        }

        const requestOptions = {
            url: `https://www.e-activist.com/ea-dataservice/export.service?type=csv&token=${privateToken}` +
                    `&startDate=${this.ENDateStart.format('MMDDYYYY')}&endDate=${this.ENDateEnd.format('MMDDYYYY')}`,
            headers: {
                'User-Agent': `node.js engaging-networks-api v${this.ENAPI_VERSION}`
            }
        };

        const csvStream = request.get(requestOptions);

        // we have a special flag to see if we already had an error.
        // this is to protect from multiple error events from request.
        this.downloadFailed = false;
        this.on('error', () => this.downloadFailed = true);

        csvStream.on('error', (err) => {
            if (this.downloadFailed) return;

            this.emit('error', err);
        });

        // we need to extract the 'total' header from response to know how many
        // records to expect from the server.
        csvStream.on('response', (response) => {
            if (response.statusCode != 200) {
                return this.emit('error', new Error(`EN server responded with ${response.statusCode} ${response.statusMessage}`));
            }

            // if you download records for the current day, EN will not say
            // how many records to expect. We need to be prepared for that
            if (response.headers['total'] === undefined) {
                logger.warn('server did not send the Total header');
                this.recordsExpected = null;
            } else {
                this.recordsExpected = response.headers['total'];
                logger.info(`received response, expecting ${this.recordsExpected} records`);
            }

            // notify users that the download begins
            this.emit('start', this.recordsExpected);
        });

        csvStream.pipe(this);

        if (backupFileStream) {
            csvStream.pipe(backupFileStream);

            // if there was an error saving backup file, fail and stop the
            // download.
            backupFileStream.on('error', err => {
                this.emit('error', err);
                csvStream.pause();
            });
        }
    }

    // process the first chunk here to see if EN answered with ERROR code.
    // If not - replace the function with that of a super class to not
    // process next chunks in this class.
    // Hope this doesn't break too much of the code optimization.
    _transform(chunk, encoding, callback) {
        if (chunk.indexOf('\x0a\x0aERROR:') == 0) {
            return callback(new Error('EN returned ' + chunk.toString().trim()));
        }
        this._transform = super._transform;
        return super._transform(chunk, encoding, callback);
    }

    // process the last chunk and check the resulting number of records
    // received. This must match the number from the response header
    _flush(callback) {
        super._flush((err) => {
            if (err) return callback(err);

            if (this.recordsExpected !== null && this.recordCount != this.recordsExpected)
                return callback(new Error(`received incomplete file: ${this.recordCount} records instead of ${this.recordsExpected}`));

            callback();
        });
    }

    // checking date formats. Also don't let people download records for the current day
    _checkDates(dateStart, dateEnd, options) {
        if (!(typeof dateStart === 'string') || !(typeof dateEnd === 'string')) {
            return new Error("dateStart and dateEnd should be strings");
        }

        if (!dateStart.match(/^\d{4}-\d\d-\d\d$/) || !dateEnd.match(/^\d{4}-\d\d-\d\d$/)) {
            return new Error("dateStart and dateEnd should be YYYY-MM-DD date strings");
        }

        const ENDateStart = moment.tz(dateStart, this.EN_TIME_ZONE);
        const ENDateEnd = moment.tz(dateEnd, this.EN_TIME_ZONE);
        this.ENDateStart = ENDateStart;
        this.ENDateEnd = ENDateEnd;

        if (!ENDateStart.isValid() || !ENDateEnd.isValid()) {
            return new Error(`dateStart or dateEnd are invalid dates: ${dateStart}, ${dateEnd}`);
        }

        if (ENDateStart.isAfter(ENDateEnd)) {
            return new Error(`dateStart is after dateEnd: ${dateStart} is after ${dateEnd}`);
        }

        const ENStartOfToday = moment().tz(this.EN_TIME_ZONE).startOf('day');

        if (ENDateEnd.isSameOrAfter(ENStartOfToday)) {
            return new Error(`dateEnd is later than the beginning of a current day in EN timezone (${ENStartOfToday.format("YYYY-MM-DD")})`);
        }

        return null;
    }
}

module.exports = ENTransactionDownloader;