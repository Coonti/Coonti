/**
 * @module CoontiCore/UserManager
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
var winston = require('winston');

var coonti;
var logManager;

/**
 * Creates a new instance of the log manager. Use this manager to gain access to Coonti's log files to provide error, debug and notification information.
 *
 * @class
 * @classdesc Log Manager handles all logging related tasks in Coonti.
 * @param {Coonti} cnti - The Coonti instance that owns this manager.
 * @return {CoontiLogManager} The new instance.
 */
function CoontiLogManager(cnti) {
	coonti = cnti;
	logManager = this;

	var defaultLogger = 'coonti';
	var defaultConfig = {};

	/**
	 * Initialises the LogManager instance. This method is called by Coonti core.
	 */
	this.initialise = function() {
		// The default configuration logs everything to console
		winston.loggers.add(defaultLogger, {
			console: {
				level: 'info'
			}
		});

		coonti.addEventListener('Coonti-Config-Init', configInitialised);
	};

	/**
	 * Initialises the logging subsystem after the configuration has been loaded.
	 *
	 * @fires Coonti-Logging-Init
	 */
	var configInitialised = function*() {
		var logConfig = coonti.getConfigParam('logging');
		_.each(logConfig, function(val, key) {
			if(val['transports']) {
				var tmp = val['transports'];
				val.transports = [];
				_.each(tmp, function(trConf, trKey) {
					if(trKey == 'console') {
						val.transports.push(new (winston.transports.Console)(trConf));
					}
					else if(trKey == 'file') {
						val.transports.push(new (winston.transports.File)(trConf));
					}
				});
			}
			if(key == defaultLogger) {
				var logger = logManager.getLogger(key);
				logger.configure(val);
				return;
			}
			winston.loggers.add(key, val);
		});
		yield coonti.fireEvent('Coonti-Logging-Init', false);
	};

	/**
	 * Fetches a logger instance. Each module should have their own instance to allow debugging only limited parts of the system.
	 *
	 * @param {String=} name - The name of the logger. The name is split with dashes to get more generic logger, if the name is not found, e.g. coonti-core-modulemanager > coonti-core > coonti.
	 * @return {Logger} A preconfigured Logger instance. If there is no such Logger, a generic one is returned.
	 */
	this.getLogger = function(name) {
		if(!name) {
			return winston.loggers.get(defaultLogger);
		}

		if(winston.loggers.has(name)) {
			return winston.loggers.get(name);
		}

		var dash = name.lastIndexOf('-');
		if(dash > 0) {
			return this.getLogger(name.substring(0, dash));
		}

		return winston.loggers.get(defaultLogger);
	};

	/**
	 * Adds a logger instance. If the logger exists, the existing one is returned untouched.
	 *
	 * @param {String} name - The name of the logger.
	 * @param {Object=} conf - The logger configuration, if any.
	 * @return {Logger} The new Logger instance.
	 * @fires Coonti-Logging-Logger-Added with name as param.
	 */
	this.addLogger = function*(name, conf) {
		if(!name || winston.loggers.get(name)) {
			return this.getLogger();
		}

		winston.loggers.add(name, conf);
		yield coonti.fireEvent('Coonti-Logging-Logger-Added', name);
		return this.getLogger(name);
	};
}

module.exports = CoontiLogManager;
