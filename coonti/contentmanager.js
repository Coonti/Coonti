/**
 * @module CoontiCore/ContentManager
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
var slug = require('slug');

/**
 * Creates a new instance of the content manager that reads content from various sources and handles content types.
 *
 * @class
 * @classdesc Content Manager handles content inside Coonti.
 * @param {Coonti} cnti - The Coonti instance owning the manager.
 * @return {CoontiContentManager} The new instance.
 */
function CoontiContentManager(cnti) {
	var coonti = cnti;
	var app = coonti.getApplication();
	var formManager;
	
	var contents = {};
	var defContent = false;

	var contentTypes = {};

	var formCollection = 'contentType';
	
	/**
	 * Initialises the content subsystem.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Config-Init', configInitialised);
	}

	/**
	 * Finalises content manager initialisation.
	 */
	var configInitialised = function*() {
		formManager = coonti.getManager('form');
		formManager.addCollection(formCollection);
	}

	/**
	 * Adds a new ContentHandler instance.
	 *
	 * @param {String} name - The name of the ContentHandler.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContentHandler = function(name, handler) {
		if(!!name && typeof handler == 'object') {
			contents[name] = handler;
			return true;
		}
		return false;
	}

	/**
	 * Sets the default ContentHandler.
	 *
	 * @param {String} name - The name of the default ContentHandler. This handler must exist.
	 * @return {bool} True on success, false on failure.
	 */
	this.setDefaultContentHandler = function(name) {
		if(!!name && contents[name]) {
			defContent = contents[name];
			return true;
		}
		return false;
	}

	/**
	 * Fetches a ContentHandler instance.
	 *
	 * @param {String} name - The name of the ContentHandler. If not defined, returns the default ContentHandler.
	 * @return {ContentHandler} The handler or false, if there is no such handler.
	 */
	this.getContentHandler = function(name) {
		if(!!name) {
			if(contents[name]) {
				return contents[name];
			}
			return false;
		}
		else {
			return defContent;
		}
	}

	/**
	 * Lists available ContentHandlers.
	 *
	 * @return {Array} List of ContentHandlers.
	 */
	this.listContentHandlers = function() {
		return _.keys(contents);
	}

	/**
	 * Adds a new content type.
	 *
	 * @param {String} name - The name of the content type.
	 * @param {Object} ct - The content type object.
	 * @param {Object} ch - The content handler that manages this content type. If not defined or false, default handler is used.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContentType = function*(name, ct, ch) {
		if(!name || !ct) {
			return false;
		}

		if(!ch) {
			ch = this.getContentHandler();
			if(!ch) {
				return false;
			}
		}
		if(contentTypes[name]) {
			return false;
		}

		var res = yield ch.addContentType(name, ct);
		if(!res) {
			return false;
		}

		contentTypes[name] = { name: name, contentType: ct, contentHandler: ch };
		this.saveContentTypeForm(name, ct);
	}

	/**
	 * Registers a new content type. The procedure is the same, but the function does not try to add the content type to content handler. This function is supposed to be called by content handlers themselves during initialisation.
	 *
	 * @param {String} name - The name of the content type.
	 * @param {Object} ct - The content type object.
	 * @param {Object} ch - The content handler that manages this content type.
	 * @return {boolean} True on success, false on failure.
	 */
	this.registerContentType = function(name, ct, ch) {
		if(!name || !ct || !ch) {
			return false;
		}

		if(contentTypes[name]) {
			return false;
		}

		contentTypes[name] = { name: name, contentType: ct, contentHandler: ch };
		this.saveContentTypeForm(name, ct);
	}

	/**
	 * Updates a content type.
	 *
	 * @param {String} name - The name of the (old) content type.
	 * @param {Object} ct - The content type object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateContentType = function*(name, ct) {
		if(!name || !ct) {
			return false;
		}
		var oldCt = contentTypes[name];
		if(!oldCt) {
			return false;
		}
		var ch = oldCt.contentHandler;

		var res = yield ch.updateContentType(name, ct);
		if(!res) {
			return false;
		}

		delete contentTypes[name];
		contentTypes[ct['name']] = { name: ct['name'], contentType: ct, contentHandler: ch };
		this.saveContentTypeForm(ct['name'], ct);
	}
	
	/**
	 * Removes a content type.
	 *
	 * @param {String} name - The name of the content type.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeContentType = function*(name) {
		if(!name || !contentTypes[name]) {
			return false;
		}

		var ch = contentTypes[name].contentHandler;
		delete(contentTypes[name]);
		formManager.removeForm(formCollection, name);
		return yield ch.removeContentType(name);
	}

	/**
	 * Fetches a content type.
	 *
	 * @param {String} name - The name of the content type.
	 * @return {object} The content type or false, if the content type is not found.
	 */
	this.getContentType = function(name) {
		if(!name || !contentTypes[name]) {
			return false;
		}

		return contentTypes[name];
	}

	/**
	 * Checks whether a content type exists.
	 *
	 * @param {String} name - The name of the content type.
	 * @return {boolean} True, if the content type exists, false otherwise.
	 */
	this.hasContentType = function(name) {
		if(!name || !contentTypes[name]) {
			return false;
		}

		return true;
	}

	/**
	 * Lists content types.
	 *
	 * @return {Array} The content types.
	 */
	this.listContentTypes = function() {
		return contentTypes;
	}

	/**
	 * Adds content. The content will be stored using the content handler stored with the content type.
	 *
	 * @param {String} ct - The name of the content type.
	 * @param {Object} content - The content object.
	 * @return {True} on success, false on failure.
	 */
	this.addContent = function*(ct, content) {
		if(!ct || !content) {
			return false;
		}

		var ctObj = contentTypes[ct];
		if(!ctObj) {
			return false;
		}

		var ch = ctObj.contentHandler;
		if(!ch) {
			return false;
		}
		
		var tmp = yield updatePath(ch, content);
		if(tmp != content.path) {
			content.path = tmp;
			content.pathEdited = true;
		}
		
		content['contentType'] = ct;
		return yield ch.addContent(content);
	}

	/**
	 * Updates content. The content will be stored using the content handler stored with the content type.
	 *
	 * @param {Object} content - The content object.
	 * @return {bool} True on success, false on failure.
	 */
	this.updateContent = function*(content) {
		if(!content || !content['contentType']) {
			return false;
		}

		var ctObj = contentTypes[content['contentType']];
		if(!ctObj) {
			return false;
		}

		var ch = ctObj.contentHandler;
		var tmp = yield updatePath(ch, content);
		if(tmp != content.path) {
			content.path = tmp;
			content.pathEdited = true;
		}
		
		return yield ch.updateContent(content);
	}

	/**
	 * Provides a new path for the content item.
	 *
	 * @param {ContentHandler} ch - The content handler that manages this content.
	 * @param {Object} content - The content item.
	 * @return {String} The content path.
	 */
	var updatePath = function*(ch, content) {
		var path = '';
		if(content.path) {
			path = content.path;
		}

		var id = false;
		if(content._id) {
			id = content._id;
		}

		// Check whether we already have a front page. If yes, create a new path based on content type name.
		if(path == '') {
			var tmp = yield ch.getDirectContent('');
			if(tmp) {
				if(id && id != tmp._id) {
					path = slug(ctObj.name, { lower: true }) + '-1';
				}
			}
		}

		if(path != '') {
			var split = path.match(/^(.+?)-?([0-9]*)$/);
			var stem = split[1];
			var count = 0;
			if(!!split[2]) {
				count = parseInt(split[2], 10);
			}
			
			// ##TODO## This code does not lock the content for writing, so two content might end with the same path
			for(;;) {
				var tmp = yield ch.getDirectContent(path);
				if(!tmp || (id && id == tmp._id)) {
					break;
				}
				count++;
				path = stem + '-' + count;
			}
		}

		return path;
	}
	
	/**
	 * Removes content.
	 *
	 * @param {String} id - The id of the content item.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeContent = function*(id) {
		if(!id) {
			return false;
		}

		// ##TODO## go through all content handlers or give content type in function parameters?
		return yield defContent.removeContent(id);
	}

	/**
	 * Creates a form representation of the content type and saves it into FormManager.
	 *
	 * @param {String} name - The name of the content type.
	 * @param {Object} ct - The content type fields.
	 * @return {boolean} True on success, false on failure.
	 */
	this.saveContentTypeForm = function(name, ct) {
		formManager.removeForm(formCollection, name);
		var form = formManager.addForm(formCollection, name);
		if(!form) {
			return false;
		}
	
		if(ct['fields']) {
			_.each(ct.fields, function(c, n) {
				if(c['type']) {
					var field = c['type'];
					var localDef = _.clone(c);
					delete localDef['type'];
					delete localDef['json'];
 					form.addField(c['id'], field, localDef);
				}

				// ##TODO## Add some intelligence in the process
			});

			form.addField('coontiSubmit', 'submit', { value: 'Ok' });
		}
	}
}

module.exports = CoontiContentManager;
