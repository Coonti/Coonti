/**
 * @module CoontiSystemModules/FileConnect
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

var _ = require('underscore');
var _s = require('underscore.string');
var fs = require('co-fs');
var stripJsonComments = require('strip-json-comments');

var logger;

/**
 * File based DB connector.
 *
 * @class
 * @classdesc DB connector implementation that reads from files. Used in Coonti installation phase.
 * @param {Coonti} cnti - The coonti instance.
 * @return {FileConnect} The new instance.
 */
function FileConnect(cnti) {
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
			name: 'FileConnect',
			description: 'Uses file system as a content database.',
			author: 'Coonti Project',
			authorUrl: 'http://coonti.org',
			version: '0.1.0',
			moduleUrl: 'http://coonti.org'
		};
	};

	/**
	 * Initialises the module.
	 *
	 * @param {Object} params - The initialisation parameters from Coonti.
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*(params) {
		logger = params.logger;

		storageManager = coonti.getManager('storage');

		var dbs = coonti.getConfigParam('databases');
		var self = this;
		_.each(dbs, function(db) {
			if(db.type == 'file') {
				if(!db.name && !db.dir) {
					logger.error('FileConnect - Connection name or directory is missing from the configuration.');
					// ##TODO## Handle error
				}
				if(connections[db.name]) {
					logger.error("FileConnect - Connection '%s' already in use.", db.name);
					// ##TODO## Handle error
				}

				if(!_s.endsWith(db.dir, '/')) {
					db.dir += '/';
				}
				if(!db.encoding) {
					db.encoding = 'utf-8';
				}

				connections[db.name] = db;
			}
		});

		logger.info('FileConnect - Initialised.');
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() {
		return true;
	};

	/**
	 * Starts the module and registers file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.start = function*() {
		for(var i in connections) {
			var db = connections[i];
			var fh = new FileHandler(this, connections[i].dir, connections[i].encoding);
			storageManager.addStorageHandler(i, fh);
		}
		logger.info('FileConnect - Started.');
		return true;
	};

	/**
	 * Stops the module and unregisters file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() {
		for(var i in connections) {
			storageManager.removeStorageHandler(i);
		}
		logger.info('FileConnect - Stopped.');
		return true;
	};
}

/**
 * Class that handles reading and writing to the file system.
 *
 * @class
 * @classdesc Class for reading and writing to the file system.
 * @param {fileConnect} fileCnnct - FileConnect The owner of the handler.
 * @param {String} dr - The directory that contains the content.
 * @param {String} enc - The encoding that is used.
 */
function FileHandler(fileCnnct, dr, enc) {
	var fileConnect = fileCnnct;
	var dir = dr;
	var encoding = enc;

	/**
	 * Fetches one item from the database.
	 *
	 * @param {String} collection - The name of the collection (subdirectory).
	 * @param {Object} key - The search key (file).
	 * @return {Object} The contents of the file, parsed from JSON.
	 */
	this.getData = function*(collection, key) {
		if(!collection || !key || !key.path) {
			// ##TODO## Throw an exception?
			return false;
		}
		try {
			var cnt = yield fs.readFile(dir + collection + '/' + key.path, enc);
		}
		catch(e) {
			logger.error("FileConnect / FileHandler - Caught an exception during reading file '%s%s/%s'.", dir, collection, key.path, e);
			return false;
		}
		if(cnt) {
			try {
				return JSON.parse(stripJsonComments(cnt));
			}
			catch(e) {
				logger.error("FileConnect / FileHandler - Caught an exception during reading file '%s%s/%s'.", dir, collection, key.path, e);
				return false;
			}
		}
		return false;
	};

	/**
	 * Fetches all matching data from a collection.
	 *
	 * @param {String} collection - The name of the collection (subdirectory).
	 * @param {Object} key - The search key (file).
	 * @return {Object} The contents of the files, parsed from JSON.
	 */
	this.getAllData = function*(collection, key) {
		if(!collection || !key) {
			// ##TODO## Throw an exception?
			return false;
		}

		var ret = [];
		try {
			var files = yield fs.readdir(dir + collection);
			for(f in files) {
				try {
					var fc = yield fs.readFile(dir + collection + '/' + files[f], enc);
					ret.push(JSON.parse(fc));
				}
				catch(e) {
					logger.error("FileConnect / FileHandler - Caught an exception during reading file '%s%s/%s'.", dir, collection, files[f], e);
				}
			}
		}
		catch(e) {
			logger.error("FileConnect / FileHandler - Caught an exception during reading directory '%s%ss'.", dir, collection, e);
			return false;
		}
		return ret;
	};

	this.setData = function(collection, path, data) {
	};

	this.removeData = function(collection, path) {
	};
}

module.exports = FileConnect;
