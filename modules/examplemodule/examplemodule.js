/**
 * @module CoontiModules/ExampleModules
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
var shortid = require('shortid');
var RestApiHelper = require('../../coonti/libraries/restapihelper.js');

/**
 * An example Coonti Module that contains instructions to build your own modules. The module provides interfaces for managing and storing quotes.
 *
 * @class
 * @classdesc An example of a Coonti module.
 * @param {Coonti} cnti - The coonti instance.
 * @return {ExampleModule} The new instance.
 */
function ExampleModule(cnti) {
	var coonti = cnti;
	var config = {
		configurationName: 'exampleModuleConfig'
	};

	// Use self to access the module itself, helpful inside nested classes and objects
	var self = this;

	var configManager = false;
	var quoteStorage = {};

	var started = false;

	/*
	 * First, the methods that are used to initialise, start, stop, and remove the module within Coonti.
	 */

	/**
	 * Initialises the module. Use this method to prepare for the start of the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*() {
		// If needed, check here whether the module has been initialised earlier in the lifecycle and skip parts that can be done only once.

		// Get the required Coonti Managers
		configManager = coonti.getConfig();
		var templates = coonti.getManager('template');

		// Add Twig method to fetch a random quote. To understand how to extend Twig.js, study its documentation.
		if(templates) {
			templates.extendTwig(function(Twig) {
				var ret =
					{
						extension: 'tag',
						type: 'quote',
						regex: /^quote\s+([a-zA-Z0-9_]+)$/,
						next: [],
						open: true,
						compile: function(token) {
							var key = token.match[1].trim();
							token.key = key;
							delete token.match;
							return token;
						},

					// We could also use parseGenerator function* should we need a yieldable function. For an example, study MenuManager module
						parse: function(token, context, chain) {
							var key = token.key;
							var mn = '';

						// If the module is stopped, it needs to return an empty string.
							if(started) {
								mn = self.getQuote();
							}
							context[key] = mn;
							return {
								chain: chain,
								context: context
							};
						}
					};
				return ret;
			});
		}
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() {
		// The Twig extension we added in initiate() cannot be removed, as some templates might break.
		// We are already stopped here, so the extension returns empty strings.
		return true;
	};

	/**
	 * Starts the module and registers file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.start = function*() {
		// If we are already running, let's skip everything.
		if(started) {
			return true;
		}

		// The quotes are stored in a configuration object
		quoteStorage = yield configManager.readConfigFromDb(config.configurationName);

		// If this is the first time the module is started, there might not be a configuration file
		if(!quoteStorage) {
			quoteStorage = {};
		}
		if(!quoteStorage['quotes']) {
			quoteStorage['quotes'] = {};
		}

		// Add a manager object for other modules use.
		if(!coonti.addManager('quote', quoteManager)) {
			return false;
		}

		// Add required Angular assets for the admin interface. These are dynamically loaded when the module is started.
		var modules = coonti.getManager('module');
		var modulePath = false;
		if(modules) {
			modulePath = modules.getModuleAssetPath();
			if(!modulePath) {
				return false;
			}

			// Angular views
			modules.addModuleAsset('ExampleModule', 'angular/quote-list.html');
			modules.addModuleAsset('ExampleModule', 'angular/quote-add.html');

			// Angular JS code
			modules.addModuleAsset('ExampleModule', 'js/quotemanager.js');
		}

		// Add relevant routes and other items to the admin interface
		var admin = coonti.getManager('admin');
		if(admin) {
			// Each view needs to have a route, see admin module addRoute for details.
			admin.addRoute('quote', '', modulePath + '/ExampleModule/angular/quote-list.html', 'ExampleModuleQuoteCtrl', 'admin.manageContent');
			admin.addRoute('quote', '/add', modulePath + '/ExampleModule/angular/quote-add.html', 'ExampleModuleQuoteCtrl', 'admin.manageContent');

			// Add an admin menu item
			admin.addMenuItem('content-quote', 'Manage Quotes', '#/module/quote', 'admin.manageContent', 1, 'content-manage-types');

			// Register a REST interface that can be used if the user has 'admin.manageContent' rights.
			var rah = new RestApiHelper(coonti,
				{ allow: 'admin.manageContent',
										  handler: exampleModuleAdmin.listQuotes },
										{},
				{ allow: 'admin.manageContent',
										  handler: exampleModuleAdmin.addQuote },
				{ allow: 'admin.manageContent',
										  handler: exampleModuleAdmin.removeQuote });
			admin.addAdminRoute('ExampleModule', 'quote', 'quote(?:\/(.+))?', rah.serve);
		}

		started = true;
		return true;
	};

	/**
	 * Stops the module and unregisters file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() {
		// If the module is not running, there is no need to stop it.
		if(!started) {
			return true;
		}

		// Remove the manager for other modules
		if(!coonti.removeManager('quote')) {
			return false;
		}

		// Remove routes and menu items
		var admin = coonti.getManager('admin');
		if(admin) {
			admin.removeAdminRoute('ExampleModule', 'quote');
			admin.removeMenuItem('content-quote');
			admin.removeRoute('/quote');
			admin.removeRoute('/quote/add');
			admin.removeRoute('/quote/edit/:id');
		}

		// Remove module assets to be pushed to the admin interface. Already loaded interfaces are not affected.
		var modules = coonti.getManager('module');
		if(modules) {
			modules.removeAllModuleAssets('ExampleModule');
		}

		started = false;
		return true;
	};

	/*
	 * The functions that form the internal functionality of the module.
	 */

	/**
	 * List available quotes.
	 *
	 * @return {Object} quotes.
	 */
	this.listQuotes = function() {
		if(!started) {
			return {};
		}

		// Note that this leaks the internal state outside of the module. Fixing is left as an exercise for the reader.
		return quoteStorage.quotes;
	};

	/**
	 * Fetches a random quote.
	 *
	 * @return {String} A quote or an empty string, if there are no quotes.
	 */
	this.getQuote = function() {
		if(!started || !quoteStorage || !quoteStorage['quotes']) {
			return '';
		}

		var keys = _.keys(quoteStorage.quotes);
		return quoteStorage.quotes[keys[Math.floor(Math.random() * keys.length)]];
	};

	/**
	 * Adds a new quote.
	 *
	 * @param {String} quote A new quote.
	 * @return {bool} True on success, false on failure.
	 */
	this.addQuote = function*(quote) {
		if(!started || !quote) {
			return false;
		}

		var sid = shortid.generate();

		quoteStorage.quotes[sid] = quote;
		var tmp = yield this._saveQuotes();
		return tmp;
	};

	/**
	 * Removes a quote.
	 *
	 * @param {String} key The key of the quote to be removed.
	 * @return {bool} True on success, false on failure.
	 */
	this.removeQuote = function*(key) {
		if(!!key) {
			delete quoteStorage.quotes[key];
			var tmp = yield this._saveQuotes();
			return tmp;
		}
		return false;
	};

	/**
	 * Saves the quotes.
	 *
	 * @private
	 * @return {bool} True on success, false on failure.
	 */
	this._saveQuotes = function*() {
		var tmp = yield configManager.writeConfigToDb(config.configurationName, quoteStorage);
		return tmp;
	};

	/**
	 * Quote Manager object that is registered as a manager to Coonti, so that it can be used by other modules.
	 *
	 * @class
	 * @classdesc Manager object for Coonti core.
	 * @ignore
	 */
	var quoteManager = {

		/**
		 * Lists available quotes.
		 *
		 * @return {Array} quotes.
		 * @ignore
		 */
		listQuotes: function*() {
			return yield self.listQuotes();
		},

		/**
		 * Fetches a random quote.
		 *
		 * @return {String} A quote.
		 * @ignore
		 */
		getQuote: function*() {
			return yield self.getQuote();
		},

		/**
		 * Adds a new quote.
		 *
		 * @param {String} quote - The quote
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		addQuote: function*(quote) {
			return yield self.addQuote(quote);
		},

		/**
		 * Removes a quote.
		 *
		 * @param {String} key The key of the quote.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		removeQuote: function*(key) {
			return yield self.removeQuote(key);
		}
	};

	/**
	 * Object containing methods used by Admin module to control the module from the admin user interface.
	 *
	 * @ignore
	 */
	var exampleModuleAdmin = {

		/**
		 * Fetches the list of available quotes.
		 *
		 * @ignore
		 */
		listQuotes: function*() {
			var ret = yield self.listQuotes();
			if(ret) {
				this.coonti.setItem('response', { items: ret });
			}
			else {
				this.coonti.setItem('response', { items: {} });
			}
		},

		/**
		 * Adds a new quote.
		 */
		addQuote: function*() {
			if(this.request.body && this.request.body['fields'] && this.request.body['fields']['quote']) {
				var quote = this.request.body['fields']['quote'];
				var ret = yield self.addQuote(quote);
				if(ret) {
					this.coonti.setItem('response', true);
					return;
				}
			}
			this.status = (404);
			this.coonti.setItem('response', false);
		},

		/**
		 * Removes a quote.
		 *
		 * @param {String} key The index of the quote to be removed.
		 * @ignore
		 */
		removeQuote: function*(key) {
			var ret = yield self.removeQuote(key);
			if(ret) {
				this.coonti.setItem('response', true);
				return;
			}
			this.status = (404);
			this.coonti.setItem('response', false);
		}
	};
}

module.exports = ExampleModule;
