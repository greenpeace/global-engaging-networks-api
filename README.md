# Engaging Networks API

`engaging-networks-api` lets you access the API of [Engaging Networks](https://engagingnetworks.net) system easily using Node.js

Currently this module supports only a subset of EN API, as follows:

* Download transactions for specified time periods

## ENAPI

The main class containing methods to call supported APIs

    const ENAPI = require('engaging-networks-api');

    const enapi = new ENAPI({
        privateToken: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
        publicToken:  'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx'
    });

### new ENAPI([config]);

Create a new ENAPI instance. Optional `config` is an object that can have following properties:

* `privateToken`: token that will be used for all private API calls by default
* `publicToken`: token that will be used for all public API calls by default

### ENAPI.DownloadTransactions(dateStart, dateEnd, [options]);

Download transactions for a specified time period, from `dateStart` to `dateEnd` inclusively. This is a wrapper around [EN Export API](http://support.engagingnetworks.net/export-api-overview?rfm=1471&rfs=1472).

* `dateStart`, `dateEnd`: date strings in YYYY-MM-DD format. The specified dates are assumed to be in EN timezone
* `options`: an optional object containing any of the following properties:
  * `privateToken`: a token to use during this API call
  * `backupDir`: if you want to save downloaded transactions on the disk as they've been downloaded, this will be the path to the  directory where the files will be saved. File names will have the time of the call in UTC followed by dateStart and optionally dateEnd

Returns an instance of `ENAPI#ENTransactionDownloader` which is essentially a readable stream emitting parsed transaction objects one at a time. A subclass of `ENAPI#ENTransactionCSVReader`.

    const transactionDownloader = enapi.DownloadTransactions('2016-04-23', '2016-04-23', { backupDir: 'downloaded' });
