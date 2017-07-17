/**
 * @module CoontiSystemModules/MongoConnect
 * @author Janne Kalliola
 *
 * Copyright 2016 Coonti Project
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var _s = require('underscore.string');
var mongo = require('monk');
var coMonk = require('co-monk');

var CoontiException = require('../coontiexception.js');

/**
 * MongoDB connector.
 *
 * @class
 * @classdesc DB connector implementation that reads from MongoDB. The default DB connector for Coonti.
 * @param {Coonti} cnti - The coonti instance.
 * @return {MongoConnect} The new instance.
 */
function MongoConnect(cnti) {
	var coonti = cnti;

	var connections = {};

	var storageManager = false;

	/**
	 * Fetches the module information for admin users.
	 *
	 * @return {Object} The module info.
	 */
	this.getInfo = function() {
		return {
			name: 'MongoConnect',
			description: 'Connects to MongoDB.',
			author: 'Coonti Project',
			authorUrl: 'http://coonti.org',
			version: '0.1.0',
			moduleUrl: 'http://coonti.org'
		};
	};

	/**
	 * Initialises the module and connects to the MongoDB databases as specified in Coonti configuration.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*() {
		storageManager = coonti.getManager('storage');
		const dbs = coonti.getConfigParam('databases');
		for(let i = 0; i < dbs.length; i++) {
			var db = dbs[i];
			if(db.type == 'mongodb') {
				if(!db.name && !db.url) {
					throw new CoontiException(CoontiException.ERROR, 10001, 'Missing database name or url.');
				}
				if(connections[db.name]) {
					throw new CoontiException(CoontiException.ERROR, 10002, 'MongoDB connection "' + db.name + '" already exists.');
				}

				// ##TODO## MongoDB authentication
				var mdb = yield mongo(db.url);
				connections[db.name] = mdb;

				// ##TODO## How to check whether there is a connection or not with comonk?
				/*				var driver = coMonk(mdb.driver.open());
				var admin = coMonk(mdb.driver.admin());
				var ret = yield admin.ping();
*/
					/*
					admin.ping(function(pingErr, pr) {
						if(pingErr) {
							cb(pingErr);
						}
						cb(false);
					});
				});
*/
			}
		}
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*(cb) { // eslint-disable-line require-yield
		// ##TODO## Close connections

		return true;
	};

	/**
	 * Starts the module and registers MongoDB based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.start = function*() { // eslint-disable-line require-yield
		const keys = Object.keys(connections);
		for(let i = 0; i < keys.length; i++) {
			const mdb = connections[keys[i]];
			const mh = new MongoHandler(this, mdb);
			storageManager.addStorageHandler(keys[i], mh);
		}
		return true;
	};

	/**
	 * Stops the module and unregisters MongoDB based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() { // eslint-disable-line require-yield
		const keys = Object.keys(connections);
		for(let i = 0; i < keys.length; i++) {
			storageManager.removeStorageHandler(keys[i]);
		}
		return true;
	};
}

function MongoHandler(mongoCnnct, db) {
	var mongoDb = db;

	var collections = {};

	/**
	 * Fetches the MongoDB connection.
	 *
	 * @return {Object} MongoDB connection object.
	 */
	this.getMongo = function() {
		return mongoDb;
	};

	/**
	 * Fetches a unique id for the given collection.
	 *
	 * @param {String} collection - The name of the collection.
	 * @return {Object} A new id or false, if the key cannot be generated.
	 */
	this.getId = function*(collection) { // eslint-disable-line require-yield
		return mongo.id();
/*		var col = this.getCollection(collection);
		if(!col) {
			return false;
		}

		return col.id();*/
	};

	/**
	 * Fetches one item from the database.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} key - The search key(s).
	 * @param {Object} params - The listing params (fields, sorting, limiting, skipping, etc.).
	 * @return {Object} The item.
	 */
	this.getData = function*(collection, key, params) {
		if(!collection || !key) {
			// ##TODO## Throw an exception?
			return {};
		}
		var col = this.getCollection(collection);
		return yield col.findOne(key, params);
	};

	/**
	 * Fetches all matching data from a collection.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} key - The search key.
	 * @param {Object} params - The listing params (fields, sorting, limiting, skipping, etc.).
	 * @param {Object=} pg - The pagination object - this Object is modified by the method. Optional.
	 * @return {Array} The items.
	 */
	this.getAllData = function*(collection, key, params, pg) {
		if(!collection || !key) {
			// ##TODO## Throw an exception?
			return [];
		}

		pg = pg || {};
		if(!pg['start']) {
			pg['start'] = 0;
		}
		if(!pg['len']) {
			pg['len'] = Number.MAX_VALUE;
		}
		if(!pg['sort']) {
			pg['sort'] = false;
		}
		params = params || {};
		params.skip = pg['start'];
		params.limit = pg['len'];
		if(pg.sort) {
			var st = pg.sort.split('|');
			var mst = {};
			for(let i = 0; i < st.length; i++) {
				let k = st[i];
				let dir = 1;
				if(_s.startsWith(k, '-')) {
					dir = -1;
					k = k.substring(1);
				}
				mst[k] = dir;
			}
			params.sort = mst;
		}

		var col = this.getCollection(collection);
		return yield col.find(key, params);
	};

	/**
	 * Writes new data to the database.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} data - The data to be written.
	 * @return {String|Boolean} The _id of the inserted data or false, if the data could not be inserted.
	 */
	this.insertData = function*(collection, data) {
		if(!collection || !data) {
			return false;
		}

		const col = this.getCollection(collection);
		try {
			const res = yield col.insert(data);
			if(!!res._id) {
				return res._id;
			}
			return false;
		}
		catch(e) {
			return false;
		}
	};

	/**
	 * Updates data to the database. The update is done based on _id field. If the _id field is not present, the method calls this.insertData().
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} data - The data to be written.
	 * @return {String|Boolean} The _id on success, false on failure.
	 */
	this.updateData = function*(collection, data) {
		if(!collection || !data) {
			return false;
		}

		const col = this.getCollection(collection);
		let tmp;
		if(!!data['_id']) {
			tmp = yield col.update({ _id: data['_id'] }, data);
		}
		else {
			return yield this.insertData(collection, data);
		}
		if(tmp && tmp.ok == 1) {
			return data['_id'];
		}
		return false;
	};

	/**
	 * Removes data from the database using id.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {String} id - The id of the data.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeDataById = function*(collection, id) {
		if(!!id) {
			return yield this.removeData(collection, { _id: id });
		}
		return false;
	};

	/**
	 * Removes data from the database.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {String} query - The query to find the data items.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeData = function*(collection, query) {
		if(!collection || !query) {
			return false;
		}

		var col = this.getCollection(collection);
		return yield col.remove(query); // ##TODO## Check what this actually returns
	};

	/**
	 * Drops the collections in the database.
	 */
	this.dropDatabase = function*() {
		const items = yield mongoDb._db.listCollections().toArray();
		if(items.length > 0) {
			for(let i = 0; i < items.length; i++) {
				const col = items[i]['name'];
				if(col.indexOf('system.') == 0) {
					continue;
				}

				const mongoCol = this.getCollection(col);
				yield mongoCol.drop();
			}
		}

		collections = {};
	};

	/**
	 * Fetches a collection, either from collection cache or by connecting. The collection is wrapped by CoMonk.
	 *
	 * @param {String} collection - The name of the collection.
	 * @return {CoMonk} CoMonk object representing the collection.
	 */
	this.getCollection = function(collection) {
		if(!!collection) {
			if(collections[collection]) {
				return collections[collection];
			}

			var col = coMonk(mongoDb.get(collection));
			collections[collection] = col;
			return col;
		}
		return false;
	};
}

module.exports = MongoConnect;
