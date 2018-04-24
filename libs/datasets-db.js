'use strict';

let Db = require('nedb');
let DbPromise = require('nedb-promise');
let path = require('path');
let config = require('./config.js');

let dbFile = path.join(config.dbFolder, 'datasets.json');
let db = new Db({
    filename: path.resolve(dbFile),
    autoload: true,
});

db.persistence.compactDatafile();
db.ensureIndex({ fieldName: 'id', unique: true });
db.ensureIndex({ fieldName: 'name', unique: true });

module.exports = DbPromise.fromInstance(db);
