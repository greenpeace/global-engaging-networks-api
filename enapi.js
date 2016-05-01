'use strict';

const ENTransactionCSVReader = require('./transaction-csv-reader.js');
const ENTransactionDownloader = require('./transaction-downloader.js');

const TIME_ZONE = "America/New_York";

const VERSION = '1.0.2';

class ENAPI {
    constructor(config) {
        if (config === undefined) return;

        if (!(config instanceof Object)) {
            throw new Error("ENAPI constructor parameter must be an object");
        }

        if (config.privateToken !== undefined) this.privateToken = config.privateToken;
        if (config.publicToken !== undefined) this.publicToken = config.publicToken;
    }

    DownloadTransactions(dateStart, dateEnd, options) {
        return new ENTransactionDownloader(dateStart, dateEnd, options, this);
    }
};

ENAPI.TIME_ZONE = TIME_ZONE;
ENAPI.VERSION = VERSION;

ENAPI.ENTransactionCSVReader = ENTransactionCSVReader;

module.exports = ENAPI;