/**
 * @module CoontiCore/StorageManager
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
var thunkify = require('thunkify');

/**
 * Storage manager that contains all storage handlers.
 *
 * @class
 * @classdesc Storage Manager manages external storages, such as MongoDB.
 * @param {Coonti} cnti - The coonti instance.
 * @return {CoontiStorageManager} The new instance.
 */
function CoontiStorageManager(cnti) {
	var storages = {};

	/**
	 * Initialises the storage subsystem.
	 */
	this.initialise = function() {
		return true;
	};

	/**
	 * Adds a new StorageHandler instance.
	 *
	 * @param {String} name - The name of the StorageHandler.
	 * @param {StorageHandler} handler - The handler object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addStorageHandler = function(name, handler) {
		if(!!name && typeof handler == 'object') {
			storages[name] = handler;
			return true;
		}
		return false;
	};

	/**
	 * Removes a StorageHandler instance.
	 *
	 * @param {String} name - The name of the StorageHandler.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeStorageHandler = function(name) {
		if(!!name) {
			delete storages[name];
			return true;
		}
		return false;
	};

	/**
	 * Fetches a StorageHandler instance.
	 *
	 * @param {String} name - The name of the StorageHandler.
	 * @return {StorageHandler} The handler or false, if there is no such handler.
	 */
	this.getStorageHandler = function(name) {
		if(!!name && storages[name]) {
			return storages[name];
		}
		return false;
	};

	/**
	 * Lists all available StorageHandlers.
	 *
	 * @return {Array} Names of available StorageHandlers.
	 */
	this.listStorageHandlers = function() {
		return _.keys(storages);
	};
}

/**
 * Creates a new caching storage handler.
 *
 * @class
 * @classdesc A wrapper for caching StorageHandler that could be used to speed things up. Currently requires heavy refactoring and should not be used.
 * @param {StorageHandler} sh - The StorageHandler object that needs to be wrapped.
 * @return {CachingStorageHandler} A new instance.
 */
function CachingStorageHandler(sh) {  // eslint-disable-line no-unused-vars
	// ##TODO## Needs to be replanned, as currently does not work as should

	/**
	 * The wrapped handler.
	 */
	this.handler = sh;

	/**
	 * The cached collections.
	 */
	this.caches = {};

	/**
	 * Fetches one item from the database.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} key - The search key.
	 */
	this.getData = function*(collection, key) {
		if(!collection || !key) {
			// ##TODO## Throw an exception?
			return {};
		}

		var ch = this.getCacheForCollection(collection);
		var obj = yield ch.get(key);
		if(obj) {
			return obj;
		}

		var obj = yield sh.getData(collection, key);
		yield ch.set(key, obj);
		return obj;
	};

	/**
	 * Fetches all matching data from a collection.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} key - The search key.
	 * @return {Object} The contents.
	 */
	this.getAllData = function*(collection, key) {
		if(!collection || !key) {
			// ##TODO## Throw an exception?
			return {};
		}

		yield sh.getAllData(collection, key);
	};

	/**
	 * Writes data to the database.
	 *
	 * @param {String} collection - The name of the collection.
	 * @param {Object} data - The data to be written.
	 */
	this.setData = function*(collection, data) {
		// ##TODO##
	};

	/**
	 * Removes data from the database.
	 *
	 * @param {String} Collection - The name of the collection.
	 * @param {String} id - The id of the data.
	 */
	this.removeData = function*(collection, id) {
		// ##TODO##
	};

	/**
	 * Fetches a cache for the given collection. If the cache does not exist, it is created.
	 *
	 * @param {String} collection - The name of the collection.
	 * @return {CacheManager} A new CacheManager memory cache.
	 */
	this.getCacheForCollection = function(collection) {
		if(this.caches[collection]) {
			return this.caches[collection];
		}

		var cache = {
			cache: cacheManager.caching({ store: 'memory', max: 100 }),
			get: thunkify(cache.get),
			set: thunkify(cache.set),
			del: thunkify(cache.del)
		};

		this.caches[collection] = cache;
		return cache;
	};
}

module.exports = CoontiStorageManager;
