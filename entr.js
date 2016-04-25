'use strict';

var Stream = require('stream');
var BabyParse = require('babyparse');
var StringDecoder = require('string_decoder').StringDecoder;

var EN_TRANSACTIONS_MANDATORY_FIELDS =
    ['Supporter Email', 'Campaign Type', 'Campaign ID'];

class ENTransactionCSVReader extends Stream.Transform {
    constructor(options) {
        const streamOptions = {readableObjectMode: true};
        if (options && options.highWaterMark !== undefined)
            streamOptions.highWaterMark = options.highWaterMark;
        super(streamOptions);

        this._buffer = [];

        this._utf8Decoder = new StringDecoder('utf8');

        this._csvConfig = {
            delimiter: ',',
            newline: '\n',
            header: false
        };

        this._fieldNames = undefined;

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

    _processCSV(csv) {
        const self = this;
        const parsed = BabyParse.parse(csv, this._csvConfig);

        if (parsed.errors.length > 0) {
            throw new Error(`error parsing row ${self.recordCount + parsed.errors[0].row + 1}: ${parsed.errors[0].message}`);
        }

        if (self._fieldNames === undefined) {
            self._fieldNames = parsed.data.shift();

            self._checkFieldNames();
        }
        const fieldNames = self._fieldNames, fieldsCount = fieldNames.length;

        for (let row of parsed.data) {
            let o = {};

            if (row.length != fieldsCount) {
                throw new Error(`error parsing row ${self.recordCount + 1}: ${row.length} fields instead of ${fieldsCount}`);
            }

            for (let i = 0; i < fieldsCount; ++i) {
                if (fieldNames[i] == '') continue;
                o[fieldNames[i]] = row[i];
            }

            self.push(self._processTransaction(o));
            ++self.recordCount;
        }
    }

    _transform(chunk, encoding, callback) {
        const self = this;
        chunk = self._utf8Decoder.write(chunk);

        let csv;
        let i;
        for (i = chunk.length; i >= 0; --i) {
            if (chunk[i] == '\n') {
                self._buffer.push(chunk.substr(0, i));
                csv = self._buffer.join('');
                self._buffer = [];
                break;
            }
        }
        self._buffer.push(chunk.substr(i + 1));

        if (i >= 0) {
            try {
                self._processCSV(csv);
            } catch(e) {
                return callback(e);
            }
        }

        callback();
    }

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

    _processTransaction(o) {
        return o;
    }
};

module.exports = ENTransactionCSVReader;