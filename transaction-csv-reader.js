'use strict';

var Stream = require('stream');
var BabyParse = require('babyparse');
var StringDecoder = require('string_decoder').StringDecoder;

// This is kind of an arbitrary "minimum" set of transactions fields, without
// which transactional file will provide little sense.
// Mainly used to check wherther input stream is actually EN transactions file,
// or just some nonsence.
var EN_TRANSACTIONS_MANDATORY_FIELDS =
    ['Supporter Email', 'Campaign Type', 'Campaign ID'];

// A subclass of Stream.Transform that transforms some input CSV stream into
// JS objects representing EN Transactions.
// The input data stream should emit Buffer objects with CSV utf8 encoded data.
//
// Main purpose of this class is to parse CSV data into objects and check for
// CSV errors.
class ENTransactionCSVReader extends Stream.Transform {

    // options may be:
    //     delimiter: ',' - CSV record delimiter value passed on to CSV parser.
    //
    constructor(options) {
        super({readableObjectMode: true});

        // if the pushed data chunk ends with an incomplete line, which happens
        // most of the time, store the beginning of a line in a buffer.
        this._buffer = [];

        // data chunks may end with an incomplete utf8 character, so we use
        // StringDecored to help handle that.
        this._utf8Decoder = new StringDecoder('utf8');

        // CSV parser config as passed on to Papa Parser.
        // header is false because we extract header fields manually.
        this._csvConfig = {
            delimiter: ',',
            newline: '\n',
            header: false
        };
        if (options && options.delimiter)
            this._csvConfig.delimiter = options.delimiter;

        // column names of a currently downloaded CSV file.
        this._fieldNames = undefined;

        // records downloaded so far.
        this.recordCount = 0;
    }

    _checkFieldNames() {
        let o = {};
        for (let field of this._fieldNames) o[field] = 1;

        let missingFields = [];

        for (let field of EN_TRANSACTIONS_MANDATORY_FIELDS) {
            if (!o[field])
                missingFields.push(field);
        }

        if (missingFields.length > 0)
            throw new Error('Missing mandatory fields in transactions file header: ' +
                missingFields);
    }

    // parse and process a number of complete CSV lines.
    _processCSV(csv) {
        const self = this;
        const parsed = BabyParse.parse(csv, this._csvConfig);

        // do not tolerate any kinds of errors in CSV.
        if (parsed.errors.length > 0) {
            throw new Error(`error parsing row ${self.recordCount + parsed.errors[0].row + 1}: ${parsed.errors[0].message}`);
        }

        // extracting first row of the downloaded file - this will be header row.
        if (self._fieldNames === undefined) {
            self._fieldNames = parsed.data.shift();

            self._checkFieldNames();
        }
        const fieldNames = self._fieldNames, fieldsCount = fieldNames.length;

        for (let row of parsed.data) {
            // putting each CSV row into an object with properties named after
            // column names of a CSV file.
            let o = {};

            // normally PapaParser would look out for incorrect numbers of columns,
            // but in the extreme edge-cases, when all records in the chunk have
            // different column number from all previous chunks, PapaParser will
            // have no means to detect such atrifact.
            if (row.length != fieldsCount) {
                throw new Error(`error parsing row ${self.recordCount + 1}: ${row.length} fields instead of ${fieldsCount}`);
            }

            for (let i = 0; i < fieldsCount; ++i) {
                // usually the last column of a transactional CSV has empty name,
                // which is silly, but that's the reality.
                if (fieldNames[i] == '') continue;
                o[fieldNames[i]] = row[i];
            }

            // processing assembled object in a special way and pushing it down
            // the readable stream.
            self.push(self._processTransaction(o));

            ++self.recordCount;
        }
    }

    // here is where we receive raw chunks.
    _transform(chunk, encoding, callback) {
        const self = this;
        chunk = self._utf8Decoder.write(chunk);

        let csv;
        let i;
        // looking for last '\n' in the current chunk.
        // buffered part from last chunk and everything before last '\n'
        // will be parsed as CSV data.
        for (i = chunk.length - 1; i >= 0; --i) {
            if (chunk[i] == '\n') {
                self._buffer.push(chunk.substr(0, i));
                csv = self._buffer.join('');
                self._buffer = [];
                break;
            }
        }
        // everything after the last '\n' will be stored in the buffer
        // to prepend to the next chunk.
        self._buffer.push(chunk.substr(i + 1));

        // here, if i is negative, this means the chunk didn't have '\n' at all.
        // so the whole chunk was an incomplete CSV line that we can't parse yet
        if (i >= 0) {
            // _processCSV has many reasons to throw. Make sure to catch everything.
            try {
                self._processCSV(csv);
            } catch(e) {
                return callback(e);
            }
        }

        callback();
    }

    // sometimes the file doesn't end with a '\n' character, usually when the file
    // is incomplete. This means that the line will be still in the this._buffer
    // because _transform parses only data that it found before '\n'.
    // we need to treat it as a normal line and try to parse it to get the error
    // it deserves. And who knows, maybe in the future even complete files will
    // not have '\n' at the end.
    _flush(callback) {
        let csv = this._buffer.join('');
        this._buffer = [];

        if (csv != '') {
            try {
                this._processCSV(csv);
            } catch(e) {
                return callback(e);
            }
        }

        callback();
    }

    // nothing fancy on the processing side, but plan to add a whole lot of classes
    // specific to each transaction type, and distribute the transactions between them
    // accordingly.
    _processTransaction(o) {
        return o;
    }
};

module.exports = ENTransactionCSVReader;