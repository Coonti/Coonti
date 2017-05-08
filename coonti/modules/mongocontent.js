/**
 * @module CoontiSystemModules/MongoContent
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

/**
 * MongoDB content handler
 *
 * @class
 * @classdesc Content handler that uses MongoDB as the data source. The default content handler.
 * @param {Coonti} cnti - The coonti instance.
 * @return {MongoConnect} The new instance.
 */
function MongoContent(cnti) {
	var coonti = cnti;
	var config = {};
	var storage = false;
	var contentTypes = {};

	var logger;

	/**
	 * Fetches the module information for admin users.
	 *
	 * @return {Object} The module info.
	 */
	this.getInfo = function() {
		return {
			name: 'MongoContent',
			description: 'Reads content from MongoDB databases. Requires MongoConnect module.',
			author: 'Coonti Project',
			authorUrl: 'http://coonti.org',
			version: '0.1.0',
			moduleUrl: 'http://coonti.org',
			dependencies: [{
				collection: 'module',
				name: 'MongoConnect'
			}]
		};
	};

	/**
	 * Receives a new configuration for the module.
	 *
 	 * @return {boolean} True on success, false on failure.
	 */
	this.setConfig = function*(cf) { // eslint-disable-line require-yield
		config = cf;
		return true;
	};

	/**
	 * Initialises the module and reads in the configuration
	 *
	 * @param {Object} params - The initialisation parameters from Coonti.
 	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*(params) {
		logger = params.logger;

		var name = 'mongo';
		if(!!config.handlerName) {
			name = config.handlerName;
		}
		coonti.getManager('content').addContentHandler(name, this);
		if(config.default) {
			coonti.getManager('content').setDefaultContentHandler(name);
		}
		if(!!config.contentCollection) {
			config.contentCollection = 'content';
		}
		if(!!config.contentTypeCollection) {
			config.contentTypeCollection = 'contentType';
		}

		var storageManager = coonti.getManager('storage');
		storage = storageManager.getStorageHandler(config.database);
		if(!storage) {
			logger.warn('MongoContent - Initialisation failed, as there is no database storage handler yet.');
			return false;
		}

		var self = this;

		var cm = coonti.getManager('content');
		var tps = yield storage.getAllData(config.contentTypeCollection, {});
		_.each(tps, function(r) {
			if(!r || !r.name) {
				logger.warn('MongoContent - Invalid contentType row', r);
				return;
			}
			var nm = r.name;
			cm.registerContentType(nm, r, self);
			contentTypes[nm] = r;
		});

		logger.debug('MongoContent - Initialised.');
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() { // eslint-disable-line require-yield
		logger.debug('MongoContent - Removed.');
		return true;
	};

	/**
	 * Starts the module and registers MongoDB based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.start = function*() { // eslint-disable-line require-yield
		logger.debug('MongoContent - Started.');
		return true;
	};

	/**
	 * Stops the module and unregisters MongoDB based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() { // eslint-disable-line require-yield
		logger.debug('MongoContent - Stopped.');
		return true;
	};

	/**
	 * Lists content items based on the criteria.
	 *
	 * @param {Object} keys - The listing criteria.
	 * @param {Object} params - The listing params (fields, sorting, limiting, skipping, etc.).
	 * @param {Object=} pg - The pagination object - this Object is modified by the method. Optional.
	 * @return {Array} The matching content items.
	 */
	this.listContent = function*(keys, params, pg) {
		var cnt = yield storage.getAllData(config.contentCollection, keys, params, pg);
		return cnt;
	};

	/**
	 * Fetches content.
	 *
	 * @param {Context} ctx - The Koa context.
	 * @return {Object} The content object or false, if there is no such content.
	 */
	this.getContent = function*(ctx) {
		logger.debug("MongoContent - getContent called with route '%s'.", ctx.coonti.getItem('route'));
		var cnt = yield storage.getData(config.contentCollection, { path: ctx.coonti.getItem('route') });
		if(_.size(cnt) == 0) {
			return false;
		}
		return cnt;
	};

	/**
	 * Fetches content with direct access.
	 *
	 * @param {String} path - The path of the content.
	 * @return {Object} The content object or false, if there is no such content.
	 */
	this.getDirectContent = function*(path) {
		logger.debug("MongoContent - getDirectContent called with route '%s'.", path);
		var cnt = yield storage.getData(config.contentCollection, { path: path });
		if(_.size(cnt) == 0) {
			return false;
		}
		return cnt;
	};

	/**
	 * Fetches content by id.
	 *
	 * @param {String} id - The id of the content.
	 * @return {Object} The content object or false, if there is no such content.
	 */
	this.getContentById = function*(id) {
		logger.debug("MongoContent - getContentById called with id '%s'.", id);
		if(!id) {
			return false;
		}
		var cnt = yield storage.getData(config.contentCollection, { _id: id });
		if(_.size(cnt) == 0) {
			return false;
		}
		return cnt;
	};

	/**
	 * Adds new content.
	 *
	 * @param {Object} ct - The content object. The content must specify contentType field and the field must contain a contentType that is available in this handler.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContent = function*(ct) {
		if(!ct || !ct['contentType']) {
			return false;
		}

		if(!contentTypes[ct['contentType']]) {
			return false;
		}

		if(!ct['_id']) {
			ct['_id'] = yield storage.getId(config.contentCollection);
		}
		ct['mtime'] = new Date();
		yield storage.insertData(config.contentCollection, ct);
		return true;
	};

	/**
	 * Updates a content item.
	 *
	 * @param {Object} ct - The content object. The content must specify id and contentType field and the field must contain a contentType that is available in this handler.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateContent = function*(ct) {
		if(!ct || !ct['_id'] || !ct['contentType']) {
			return false;
		}

		if(!contentTypes[ct['contentType']]) {
			return false;
		}

		ct['mtime'] = new Date();
		yield storage.updateData(config.contentCollection, ct);
		return true;
	};

	/**
	 * Removes a content item.
	 *
	 * @param {String} id - The id of the content item.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeContent = function*(id) {
		if(!id) {
			return false;
		}

		yield storage.removeDataById(config.contentCollection, id);
		return true;
	};

	/**
	 * Fetches content type object.
	 *
	 * @param {String} name - The name of the content type.
	 * @return {object} The content type object or false, if no such object is available.
	 */
	this.getContentType = function(name) {
		if(!name) {
			return false;
		}

		if(!contentTypes[name]) {
			return false;
		}

		return contentTypes[name];
	};

	/**
	 * Adds a new content type.
	 *
	 * @param {String} name - The name of the content type.
	 * @param {Object} ct - The content type object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContentType = function*(name, ct) {
		if(!name || !ct) {
			logger.error("MongoContent - Failed to add content type, as '%s' is missing ct parameter.", name);
			return false;
		}

		if(contentTypes[name]) {
			logger.error("MongoContent - Failed to add content type, as '%s' already exists.", name);
			return false;
		}

		if(!ct['_id']) {
			ct['_id'] = yield storage.getId(config.contentTypeCollection);
		}
		yield storage.insertData(config.contentTypeCollection, ct);

		contentTypes[name] = ct;
		return true;
	};

	/**
	 * Updates a content type.
	 *
	 * @param {String} name - The name of the (old) content type.
	 * @param {Object} ct - The content type object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateContentType = function*(name, ct) {
		if(!name || !ct || !ct['_id'] || !ct['name']) {
			return false;
		}

		if(!contentTypes[name]) {
			logger.error("MongoContent - Failed to update content type, as '%s' does not exist.", name);
			return false;
		}

		yield storage.updateData(config.contentTypeCollection, ct);
		delete contentTypes[name];
		contentTypes[ct['name']] = ct;
		return true;
	};

	/**
	 * Removes a content type.
	 *
	 * @param {String} name - The name of the content type.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeContentType = function*(name) {
		if(!name) {
			return false;
		}

		if(!contentTypes[name]) {
			return false;
		}

		var id = contentTypes[name]._id;
		if(!id) {
			delete contentTypes[name];
			return true;
		}

		yield storage.removeDataById(config.contentTypeCollection, id);
		delete contentTypes[name];
		return true;
	};
}

module.exports = MongoContent;
