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

### ENAPI#ENTransactionDownloader

This class should not be instantiated directly and thus is not exported by this package. Instead, it is returned by the `ENAPI.DownloadTransactions` call.

This class is a subclass of `Stream.Readable` in object mode, and it emits parsed transaction objects in 'data' events.

#### ENTransactionDownloader.on('error', (err) => { ... })

When downloading transactions over the internet plenty of things can go wrong. This event is emitted when some of these things happen:

* You specify invalid start or end date to the `ENAPI.DownloadTransactions` call
* You don't specify a private token or EN rejects your private token
* The connection can't be made, or connection is reset
* The connection is interrupted and you receive incomplete file
* There was an error during parsing of a CSV file. Most likely caused by connection issues
* You wanted to save downloaded file to a backup directory but I/O error occured

So it is of utmost importance that you listen to this event and expect it to fire from time to time.

#### ENTransactionDownloader.on('data', (transaction) => { ... })

In this event you get your transactions. `transaction` is an object emitted by `ENAPI#ENTransactionCSVReader`. For now they are just plain objects with transaction fields represented as object properties.

#### ENTransactionDownloader.on('end', () => { ... })

This event should fire if and only if the file was completely downloaded and parsed with no errors.

### ENAPI#ENTransactionCSVReader

Subclass of `Stream.Transform` that is designed to consume CSV and emit parsed transaction objects