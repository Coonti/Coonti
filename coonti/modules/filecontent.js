/**
 * @module CoontiSystemModules/FileContent
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

var co = require('co');
var _ = require('underscore');

/**
 * File content connector for reading content from JSON files.
 *
 * @class
 * @classdesc Content handler that uses FileConnect to read data from files.
 * @param {Coonti} cnti - The coonti instance.
 * @return {FileContent} The new instance.
 */
function FileContent(cnti) {
	var coonti = cnti;
	var config = {};
	var storage = false;
	var contentTypes = {};

	/**
	 * Fetches the module information for admin users.
	 *
	 * @return {Object} The module info.
	 */
	this.getInfo = function() {
		return {
			name: 'FileContent',
			description: 'Reads content from files. Requires FileConnect module.',
			author: 'Coonti Project',
			authorUrl: 'http://coonti.org',
			version: '0.1.0',
			moduleUrl: 'http://coonti.org',
			dependencies: [{
				collection: 'module',
				name: 'FileConnect',
				states: 'started'
			}]
		};
	}

	/**
	 * Receives a new configuration for the module.
	 *
 	 * @return {boolean} True on success, false on failure.
	 */
	this.setConfig = function*(cf) {
		config = cf;
		return true;
	}
	
	/**
	 * Initialises the module and reads in the configuration
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*() {
		var name = 'file';
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
			logger.warn('FileContent - Initialisation failed, as there is no file storage handler yet.');
			return false;
		}

		var self = this;
		var tps = yield storage.getAllData(config.contentTypeCollection, {});
		_.each(tps, function(r) {
			if(!r || !r.name) {
				// ##TODO## Log about error
				return;
			}
			var nm = r.name;
			coonti.getManager('content').addContentType(nm, r, self);
		});
		return true;
	}

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() {
		return true;
	}

	/**
	 * Starts the module and registers file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.start = function*() {
		return true;
	}

	/**
	 * Stops the module and unregisters file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() {
		return true;
	}

	/**
	 * Fetches content.
	 *
	 * @param {Context} ctx - Koa context.
	 * @return {Object} The content or false, if content is not found.
	 */
	this.getContent = function*(ctx) {
		var cnt = yield storage.getData(config.contentCollection, { path: ctx.coonti.getItem('route') });
		return cnt;
	}

	/**
	 * Fetches content with direct access.
	 *
	 * @param {String} path - The path of the content.
	 * @return {Object} The content or false, if content is not found.
	 */
	this.getDirectContent = function*(path) {
		var cnt = yield storage.getData(config.contentCollection, { path: path });
		return cnt;
	}

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
	}

	/**
	 * Adds a new content type.
	 *
	 * @param {String} name - The name of the content type.
	 * @param {Object} ct - The content type object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContentType = function*(name, ct) {
		if(!name || !ct) {
			return false;
		}

		if(!!contentTypes[name]) {
			return false;
		}

		contentTypes[name] = ct;
		
		// ##TODO## Save to the database
	}
}

module.exports = FileContent;
