/* eslint-disable no-console */
/**
 * @module CoontiCore/Core
 * @author Janne Kalliola
 *
 * Copyright 2017 Coonti Project
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
var _s = require('underscore.string');

var CoontiDependencyManager = require('./dependencymanager');
var CoontiConfig = require('./config');
var CoontiLogManager = require('./logmanager');
var CoontiRouter = require('./router');
var CoontiStorageManager = require('./storagemanager');
var CoontiContentManager = require('./contentmanager');
var CoontiModuleManager = require('./modulemanager');
var CoontiFormManager = require('./formmanager');
var CoontiLanguageManager = require('./languagemanager');
var CoontiTemplateManager = require('./templatemanager');
var CoontiUserManager = require('./usermanager');
var CoontiMediaManager = require('./mediamanager');

/**
 * The Coonti Core that initialises the system and connects managers together.
 *
 * @class
 * @classdesc The Coonti Core functionality.
 * @param {Koa} koaApp - The Koa application.
 * @return {Coonti} The Coonti instance.
 */
function Coonti(koaApp) {
	var meta = {
		name: 'Coonti',
		version: '0.1.1',
		release: 'Pine',
		author: 'Coonti Project',
		authorUrl: 'http://coonti.org'
	};

	var app = koaApp;
	var initialised = false;

	var managers = {};
	var eventListeners = {};

	var logger;

	var self = this;

	/**
	 * Initialises Coonti and starts to listen to the configured port.
	 */
	this.initialise = function() {
		if(initialised) {
			return;
		}

		config = new CoontiConfig(self);
		this.addEventListener('Coonti-Config-Init', configInitialised);

		managers['log'] = new CoontiLogManager(self);
		managers['log'].initialise();

		managers['dependency'] = new CoontiDependencyManager(self);
		managers['dependency'].initialise();

		managers['storage'] = new CoontiStorageManager(self);
		managers['storage'].initialise();

		managers['content'] = new CoontiContentManager(self);
		managers['content'].initialise();

		managers['form'] = new CoontiFormManager(self);
		managers['form'].initialise();

		managers['language'] = new CoontiLanguageManager(self);
		managers['language'].initialise();

		managers['media'] = new CoontiMediaManager(self);
		managers['media'].initialise();

		managers['user'] = new CoontiUserManager(self);
		managers['user'].initialise();

		managers['router'] = new CoontiRouter(self);
		managers['router'].initialise();

		managers['module'] = new CoontiModuleManager(self);
		managers['module'].initialise();

		managers['template'] = new CoontiTemplateManager(self);
		managers['template'].initialise();

		config.initialise(this._start);
	};

	/**
	 * Initialises rest of Coonti when the configuration has been initialised.
	 */
	var configInitialised = function*() {
		var depComp = managers['dependency'].createComponent('coonti', 'core', meta.version, '');
		yield managers['dependency'].addComponent(depComp);
	};

	/**
	 * Starts Coonti after initialisation, called by the configuration initialisation method after firing config-init event.
	 *
	 * @ignore
	 * @param {Object} err - Any errors that might have happened during initialisation.
	 */
	this._start = function(err) {
		var welcome = self.getManager('log').getLogger('coonti-core-welcome');
		logger = self.getManager('log').getLogger('coonti-core-core');

		var ports = [];
		var httpPort = config.getConfigParam('httpPort');
		var httpsPort = config.getConfigParam('httpsPort');
		try {
			if(httpPort > 0) {
				var http = require('http');  // eslint-disable-line global-require
				http.createServer(app.callback()).listen(httpPort);
				ports.push(httpPort);
			}
		}
		catch(e) {
			logger.error('Coonti could not bind to port "%d". It is probably in other use.', httpPort);
			process.exit(1);
		}
		try {
			if(httpsPort > 0) {
				var https = require('https');  // eslint-disable-line global-require
				https.createServer(app.callback()).listen(httpsPort);
				ports.push(httpsPort);
			}
		}
		catch(e) {
			logger.error('Coonti could not bind to port "%d". It is probably in other use.', httpsPort);
			process.exit(1);
		}

		if(ports.length === 0) {
			logger.error('Coonti started successfully, but no ports were defined in the configuration. Exiting.');
			process.exit(1);
		}
		welcome.info('Coonti ready and listening to port' + (ports.length > 1 ? 's' : '') + ' ' + _s.toSentence(ports, ', ', ' and ') + '.');

		initialised = true;
	};

	/**
	 * Fetches Coonti configuration object.
	 *
	 * @return {Object} The Coonti configuration object.
	 */
	this.getConfig = function() {
		return config;
	};

	/**
	 * Gets a configuration parameter value.
	 *
	 * @param {String} param - The name of the parameter.
	 * @return {String} The parameter value or undefined, if the parameter is not found.
	 */
	this.getConfigParam = function(param) {
		return config.getConfigParam(param);
	};

	/**
	 * Sets a configuration parameter value. The new value is written to the database, unless Coonti is in installation mode.
	 *
	 * @param {String} param - The name of the parameter. Use dot notation to refer inside the objects, see ObjectPath Node module for more information.
	 * @param {Object} value - The value of the parameter.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Config-Changed
	 */
	this.setConfigParam = function*(param, value) {
		return yield config.setConfigParam(param, value);
	};

	/**
	 * Fetches a Coonti manager.
	 *
	 * @param {String} name - The manager name.
	 * @return {Object} The manager object or false, if the manager was not found.
	 */
	this.getManager = function(name) {
		if(!!name && managers[name]) {
			return managers[name];
		}
		return false;
	};

	/**
	 * Adds a new Coonti manager.
	 *
	 * @param {String} name - The manager name.
	 * @param {Object} manager - The manager object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addManager = function(name, manager) {
		if(!!name && manager && !managers[name]) {
			managers[name] = manager;
			return true;
		}
		return false;
	};

	/**
	 * Removes a Coonti manager.
	 *
	 * @param {String} name - The manager name.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeManager = function(name) {
		if(!!name && managers[name]) {
			delete managers[name];
			return true;
		}
		return false;
	};

	/**
	 * Returns Koa application object.
	 */
	this.getApplication = function() {
		return app;
	};

	/**
	 * Adds an event listener.
	 *
	 * @param {String} eventName - The name of the event.
	 * @param {Function} eventHandler - The function to be called when the event is emitted.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addEventListener = function(eventName, eventHandler) {
		if(!eventName || !eventHandler) {
			return false;
		}

		if(!eventListeners[eventName]) {
			eventListeners[eventName] = [];
		}

		eventListeners[eventName].push(eventHandler);
		return true;
	};

	/**
	 * Removes an event listener.
	 *
	 * @param {String} eventName - The name of the event.
	 * @param {Function} eventHandler - The function to be called when the event is emitted.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeEventListener = function(eventName, eventHandler) {
		if(!eventName || !eventHandler || !eventListeners[eventName]) {
			return false;
		}

		for(;;) {
			var pos = eventListeners[eventName].indexOf(eventHandler);
			if(pos == -1) {
				break;
			}

			eventListeners[eventName].splice(pos, 1);
		}
		return true;
	};

	/**
	 * Fires an event.
	 *
	 * @param {String} eventName - The name of the event.
	 * @param {Object} params - The event parameters, if any.
	 */
	this.fireEvent = function*(eventName, params) {
		if(eventListeners[eventName]) {
			for(var i = 0; i < eventListeners[eventName].length; i++) {
				yield eventListeners[eventName][i](params);
			}
		}
	};

	/**
	 * Fires an event with a callback.
	 *
	 * @param {String} eventName - The name of the event.
	 * @param {Object} params - The event parameters, if any.
	 * @param {Function} cb - The callback.
	 */
	this.fireEventCallback = function(eventName, params, cb) {
		co(function*() {
			yield self.fireEvent(eventName, params);
		}).then(function() {
			cb();
		}, function(err) {
			var eventLogger = self.getManager('log').getLogger('coonti-core-events');
			if(!eventLogger) {
				console.log('An event callback did not succeed and logging is not available.');
				console.log(err);
			}
			else {
				eventLogger.error('An event callback did not succeed.', err);
			}
		});
	};

	/**
	 * Fetches the Coonti Core meta information.
	 *
	 * @return {Object} The core meta oject.
	 */
	this.getMeta = function() {
		return meta;
	};

	/**
	 * Calculates web paths relative to the installation configuration.
	 *
	 * @param {String} path - The rest of the path.
	 * @return {String} The path to be used.
	 */
	this.getWebPath = function(path) {
		var coontiPath = this.getConfigParam('pathPrefix');

		if(!_s.startsWith(path, '/')) {
			path = '/' + path;
		}
		if(!!coontiPath) {
			path = '/' + coontiPath + path;
		}
		return path;
	};

	/**
	 * Creates an error object. The error is actually a nameless object that can be amended as seen fit. This method must be used to ensure that the basic data is always available for the error.
	 *
	 * @param {integer} code - The status code of the error.
	 * @param {Object} source - The source component of the error.
	 * @param {String} text - Any text that should be shown to the user.
	 * @return {Object} An error object.
	 */
	this.createError = function(code, object, string) {
		return {
			code: code,
			object: object,
			string: string
		};
	};
}

module.exports = Coonti;
