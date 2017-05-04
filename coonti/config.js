/**
 * @module CoontiCore/CoontiConfig
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
var mongo = require('monk');
var coMonk = require('co-monk');
var path = require('path');
var fs = require('fs');
var objectPath = require('object-path');
var stripJsonComments = require('strip-json-comments');

/**
 * Creates a new instance of the Coonti configuration manager.
 *
 * @class
 * @classdesc Handles Coonti configurations
 * @param {Coonti} cnti - The Coonti instance owning the manager.
 * @return {CoontiConfig} The new instance.
 */
function CoontiConfig(cnti) {
	var coonti = cnti;
	var app = coonti.getApplication();
	var self = this;

	var initListeners = [];

	var basePath = path.join(__dirname, '..') + '/';
	var baseConfig = {
		basePath: basePath,
		extensionPath: basePath + 'extensions/',
		themePath: basePath + 'themes/',
	};

	var config = false;
	var dbUrl = false;

	var defaultConfig = {
		httpPort: '8080',
		adminPath: 'admin',
		cookieKey: 'ratiritiralla',
		session: {
			key: 'coontiSession',
			cookiePath: ''
		},
		languages: {
			directory: 'languages',
			defaultLanguage: 'en'
		},
		media: {
			path: 'media'
		},
		logging: {
			coonti: {
				transports: {
					console: {
						level: 'warn',
						timestamp: true,
						colorize: true
					},
					file: {
						name: 'coonti.log',
						level: 'debug',
						filename: 'logs/coonti.log'
					}
				}
			},
			'coonti-core-welcome': {
				transports: {
					console: {
						level: 'info'
					}
				}
			}
		},
		themes: [
			{
				name: 'Seed',
				active: true,
				routes: '/',
			}
		],
		modules: {
			modulePath: 'coonti/modules',
			moduleConfig: {
				CoontiInstall:
				{
					name: 'CoontiInstall',
					initialise: true,
					start: true
				},
				FileConnect:
				{
					name: 'FileConnect',
					initialise: true,
					start: true
				},
				FileContent:
				{
					name: 'FileContent',
					config: {
						handlerName: 'installContent',
						database: 'install',
						contentCollection: 'content',
						contentTypeCollection: 'contentType',
						default: true
					},
					initialise: true,
					start: true
				},
				MongoConnect:
				{
					name: 'MongoConnect'
				},
				MongoContent:
				{
					name: 'MongoContent'
				}
			}
		},
		databases: [
			{
				name: 'install',
				type: 'file',
				dir: 'coonti/installation',
				encoding: 'utf-8'
			}
		]
	};

	/**
	 * Initialises configuration. If this method is called, the current configuration is flushed, so use proper care.
	 *
	 * @param {Function} cb - The callback that gets called when the initialisation is done.
	 * @fires Coonti-Config-Init
	 */
	this.initialise = function(cb) {
		config = JSON.parse(JSON.stringify(defaultConfig));
		for(var i in baseConfig) {
			config[i] = baseConfig[i];
		}
		var fc = false;
		try {
			fc = fs.readFileSync(baseConfig.basePath + 'config/coontiConfig.json');
		}
		catch(e) {
		}

		if(fc) {
			fc = fc.toString();
			if(fc.charAt(0) === '\uFEFF') {
				fc = fc.substr(1);
			}
			fc = JSON.parse(stripJsonComments(fc));
			if(fc) {
				for(var i in fc) {
					config[i] = fc[i];
				}
			}
		}

		// The configuration was not found, we are in installation mode
		if(!config['coontiMode']) {
			console.log('Coonti in installation mode.');
			config.coontiMode = 'install';
		}

		var db = config['databases'];
		if(db && db.length > 0) {
			for(var i in db) {
				if(db[i]['name'] && db[i]['name'] == 'mongo') {
					dbUrl = db[i]['url'];
					self._readCoontiConfigFromDb(function(err) {
						if(err) {
							console.log('ERROR: Coonti could not connect to the database "' + db[i]['name'] + '". Exiting.');
							process.exit(1);
						}
						coonti.fireEventCallback('Coonti-Config-Init', false, cb);
					});
					return;
				}
			}
		}
		coonti.fireEventCallback('Coonti-Config-Init', false, cb);
	};

	/**
	 * Gets a configuration parameter value.
	 *
	 * @param {String} param - The name of the parameter.
	 * @return {String} The parameter value or undefined, if the parameter is not found.
	 */
	this.getConfigParam = function(param) {
		return objectPath.get(config, param, false);
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
		if(!!param) {
			objectPath.set(config, param, value);
			yield this.writeConfigToDb('coontiConfiguration', config);
			yield coonti.fireEvent('Coonti-Config-Changed');
			return true;
		}
		return false;
	};

	/**
	 * Removes a configuration parameter. The change is written to the database, unless Coonti is in installation mode.
	 *
	 * @param {String} param - The name of the parameter.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Config-Changed
	 */
	this.removeConfigParam = function*(param) {
		if(!!param) {
			objectPath.del(config, param);
			yield this.writeConfigToDb('coontiConfiguration', config);
			yield coonti.fireEvent('Coonti-Config-Changed');
			return true;
		}
		return false;
	};

	/**
	 * Reads configuration from MongoDB, from collection 'config'.
	 *
	 * @private
	 * @param {Function} cb - The callback function to be called when everything is ready.
	 */
	this._readCoontiConfigFromDb = function(cb) {
		co(function*() {
			var cf = yield self.readConfigFromDb('coontiConfiguration');
			if(cf) {
				_.each(cf, function(v, k) {
					if(k != '_id') {
						config[k] = v;
					}
				});
			}
		}).then(function() {
			cb();
		}, function() {
			cb(true);
		});
	};

	/**
	 * Reads and parses a configuration set from database. This set is not added as part of Coonti configuration, but used only by the requester. The set is to be located in the config collection in MongoDB. If Coonti is in installation mode, this function always succeeds and returns an empty object.
	 *
	 * @param {String} name - The config name.
	 * @return {Object} The config or false, if the config is not found.
	 */
	this.readConfigFromDb = function*(name) {
		if(!!name) {
			if(config['coontiMode'] == 'install') {
				return {};
			}
			if(!!dbUrl) {
				var mdb = yield mongo(dbUrl);
				var col = coMonk(mdb.get('config'));
				return yield col.findOne({ config: name });
			}
		}
		return false;
	};

	/**
	 * Saves a configuration set from database. This set is not added as part of Coonti configuration, but to be used only by the requester. The set is to be located in the config collection in MongoDB. If Coonti is in installation mode, this function always fails and returns an empty object.
	 *
	 * @param {String} name - The config name.
	 * @param {Object} cfg - The config.
	 * @return {boolean} True on success, false on failure.
	 */
	this.writeConfigToDb = function*(name, cfg) {
		if(!!name) {
			if(config['coontiMode'] == 'install') {
				return false;
			}
			if(!!dbUrl) {
				cfg.config = name;
				var mdb = yield mongo(dbUrl);
				var col = coMonk(mdb.get('config'));
				yield col.update({ config: name }, cfg, { upsert: true });
				return true;
			}
		}
		return false;
	};
}

module.exports = CoontiConfig;
