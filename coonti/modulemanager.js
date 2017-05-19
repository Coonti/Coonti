/**
 * @module CoontiCore/ModuleManager
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
var fs = require('fs');
var cofs = require('co-fs');
var path = require('path');
var mime = require('mime-types');
var stripJsonComments = require('strip-json-comments');
var tools = require('./tools');
var thunkify = require('thunkify');

/**
 * CoontiModuleManager instance handles all module related functionality in Coonti.
 *
 * @class
 * @classdesc Manages Coonti extension modules.
 * @param {Coonti} cnti - The Coonti instance.
 * @return {CoontiModuleManager} The new instance.
 */
function CoontiModuleManager(cnti) {
	var coonti = cnti;
	var dependencies;

	var moduleConfig = {};

	var webPath = false;

	var modules = {};
	var self = this;

	var moduleFiles = {};

	var readDirsThunk = thunkify(tools.readDirs);

	var logger;

	/**
	 * Initialises the module subsystem. The method adds a listener for configuration and logging init events.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Config-Init', configInitialised);
		coonti.addEventListener('Coonti-Logging-Init', loggingInitialised);
		dependencies = coonti.getManager('dependency');
		logger = coonti.getManager('log').getLogger('coonti-core-modulemanager');
	};

	/**
	 * Initialises the logger.
	 */
	var loggingInitialised = function*() { // eslint-disable-line require-yield
		logger = coonti.getManager('log').getLogger('coonti-core-modulemanager');
	};

	/**
	 * Loads modules based on configuration.
	 */
	var configInitialised = function*() {
		moduleConfig = coonti.getConfigParam('modules');
		webPath = moduleConfig['path'];
		if(!!webPath) {
			var router = coonti.getManager('router');
			router.addRoute(2000, 'moduleFiles', '/' + webPath + '/:module/:file+', false, function*(next) { // eslint-disable-line require-yield
				var module = this.params['module'];
				var file = this.params['file'];
				if(!!module && !!file && moduleFiles[module] && moduleFiles[module][file]) {
					var f = moduleFiles[module][file];
					this.type = mime.lookup(f);
					this.body = fs.createReadStream(f);
				}
				else {
					logger.warn('Requested module file %s/%s/%s does not exist.', webPath, module, file);

					// ##TODO## get 404 from template/config/etc.
					this.status = (404);
					this.body = ('Not found');
				}
			});
		}

		yield loadModules();
	};

	/**
	 * Loads modules and sets them to proper state based on the configuration.
	 */
	var loadModules = function*() {
		var moduleConfig = coonti.getConfigParam('modules');

		var modulePaths = moduleConfig['modulePath'];
		if(!modulePaths) {
			return;
		}

		if(Object.prototype.toString.call(modulePaths) !== '[object Array]') {
			modulePaths = [modulePaths];
		}

		var mdls = [];
		var singleRegexp = /^[^\/]+\.js$/;
		var dirRegexp = /^[^\/]+\/package\.json$/;

		for(var j = 0; j < modulePaths.length; j++) {
			var mPath = modulePaths[j];

			var list = yield readDirsThunk(mPath);
			for(var i in list) {
				if(singleRegexp.test(list[i])) {
					mdls.push(mPath + '/' + list[i]);
				}
				else if(dirRegexp.test(list[i])) {
					mdls.push(mPath + '/' + path.dirname(list[i]));
				}
			}
		}
		if(mdls.length == 0) {
			return;
		}

		for(var i in mdls) {
			yield self.loadModule(mdls[i]);
		}

		var moduleConfigConfig = moduleConfig['moduleConfig'];
		if(moduleConfigConfig) {
			for(var i in moduleConfigConfig) {
				if(moduleConfigConfig[i]['config']) {
					yield _setModuleConfig(i, moduleConfigConfig[i]['config']);
				}
			}
		}

		var moduleNames = _.keys(modules);
		var i = moduleNames.length;
		while(i--) {
			var mn = moduleNames[i];
			if(!moduleConfigConfig[mn]) {
				yield self._stopModule(mn);
				yield self._removeModule(mn);
				moduleNames.splice(i, 1);
			}
			else if(!moduleConfigConfig[mn]['start']) {
				yield self._stopModule(mn);
				if(!moduleConfigConfig[mn]['initialise']) {
					yield self._removeModule(mn);
					moduleNames.splice(i, 1);
				}
			}
		}

		for(;;) {
			var len = moduleNames.length;
			var i = moduleNames.length;
			while(i--) {
				var mn = moduleNames[i];
				var cf = moduleConfigConfig[mn];
				var module = self.getModule(mn);
				if(module['started'] && cf['start']) {
					moduleNames.splice(i, 1);
					continue;
				}
				if(module['initialised'] && cf['initialise'] && !cf['start']) {
					moduleNames.splice(i, 1);
					continue;
				}

				if(!module['initialised'] && cf['initialise']) {
					var ret = yield self._initialiseModule(mn);
					if(ret && !cf['start']) {
						moduleNames.splice(i, 1);
						continue;
					}
				}

				if(module['initialised'] && !module['started'] && cf['start']) {
					var ret = yield self._startModule(mn);
					if(ret) {
						moduleNames.splice(i, 1);
						continue;
					}
				}
			}
			if(len == moduleNames.length || moduleNames.length == 0) {
				break;
			}
		}
	};

	/**
	 * Loads a module from the given path.
	 *
	 * @param {String} file - The path of the module file. This path will be loaded using require() for files ending with .js and by parsing .json file for files ending with .json.
	 * @return {boolean} True on success, false on failure.
	 */
	this.loadModule = function*(file) {
		try {
			var codePath = file;
			var config = {};
			var info = false;
			var name = false;
			var dir = false;
			if(!_s.endsWith(file, '.js')) {
				var fileData = yield cofs.readFile('./' + file + '/package.json', 'utf8');
				var moduleData = JSON.parse(stripJsonComments(fileData));
				if(!moduleData['module']) {
					logger.warn("ModuleManager - Failed to load module '%s', as it is missing 'module' directive.", file);
					return false;
				}
				if(!moduleData['info']) {
					logger.warn("ModuleManager - Failed to load module '%s', as it is missing 'info' directive.", file);
					return false;
				}
				if(!moduleData['info']['name']) {
					logger.warn("ModuleManager - Failed to load module '%s', as it is missing 'info / name' directive.", file);
					return false;
				}
				codePath = file + '/' + moduleData['module'];
				dir = file;
				info = moduleData['info'];
				name = moduleData['info']['name'];
				if(modules['name']) {
					logger.warn("ModuleManager - Failed to load module '%s' that uses already existing name '%s'.", file, name);
					return false;
				}
				if(moduleData['config']) {
					config = moduleData['config'];
				}
			}

			var ModuleClass = require('../' + codePath);  // eslint-disable-line global-require
			if(ModuleClass) {
				var module = new ModuleClass(coonti);
				if(!info || !name) {
					if(module.getInfo) {
						info = module.getInfo();
						if(info && info['name']) {
							name = info['name'];
						}
					}
				}
				if(!info || !name) {
					logger.warn("ModuleManager - Failed to load module '%s', as it does not provide info, name, or both.", file);
					return false;
				}
				if(modules[name]) {
					logger.warn("ModuleManager - Failed to load module '%s' that uses already existing name '%s'.", file, name);
					return false;
				}
				var depComp = dependencies.createComponent('module', name, info.version, 'installed');
				if(info.dependencies && info.dependencies.length > 0) {
					for(var i = 0; i < info.dependencies.length; i++) {
						depComp.addDependencyObject(info.dependencies[i]);
					}
				}

				var moduleLogger = coonti.getManager('log').getLogger('module-' + name.toLowerCase());

				var mdData = {
					name: name,
					info: info,
					path: file,
					dir: dir,
					module: module,
					config: config,
					logger: moduleLogger,
					initialised: false,
					started: false,
					dependency: depComp
				};
				modules[mdData.name] = mdData;

				yield dependencies.addComponent(depComp);

				return true;
			}
			return false;
		}
		catch(e) {
			logger.error("ModuleManager - Loading module '%s' failed due to an exception.", file, e);
		}
		return false;
	};

	/**
	 * Sets configuration for a module.
	 *
	 * @param {String} name - The name of the module.
	 * @param {Object} config - The configuration of the module.
	 * @return {boolean} True on success, false on failure.
	 */
	this.setModuleConfig = function*(name, config) {
		var ret = yield _setModuleConfig(name, config);
		if(ret) {
			yield coonti.setConfigParam('modules.moduleConfig.' + name + '.config', config);
			logger.info("ModuleManager - Set configuration for module '%s'.", name);
		}
		else {
			logger.warn("ModuleManager - Failed to set configuration for module '%s'.", name);
		}
		return ret;
	};

	/**
	 * Internally sets configuration for a module without saving the configuration to the database.
	 *
	 * @ignore
	 * @param {String} name - The name of the module.
	 * @param {Object} config - The configuration of the module.
	 * @return {boolean} True on success, false on failure.
	 */
	var _setModuleConfig = function*(name, config) {
		if(!name) {
			return false;
		}
		var module = self.getModule(name);
		if(!module) {
			return false;
		}
		if(module.module['setConfig']) {
			var ret = yield module.module.setConfig(config);
			if(!ret) {
				return false;
			}
		}
		module.config = config;
		return true;
	};

	/**
	 * Fetches module configuration.
	 *
	 * @param {String} name - The name of the module.
	 * @return {Object} The configuration of the module or false, if the module does not exist.
	 */
	this.getModuleConfig = function(name) {
		if(!name) {
			return false;
		}
		var module = self.getModule(name);
		if(!module) {
			return false;
		}
		return module.config;
	};

	/**
	 * Initialises a loaded module and stores the state into the configuration.
	 *
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Init-{name}
	 * @fires Coonti-Module-Init with name as param.
	 */
	this.initialiseModule = function*(name) {
		var ret = yield this._initialiseModule(name);
		if(ret) {
			yield coonti.setConfigParam('modules.moduleConfig.' + name + '.initialise', true);
		}
		return ret;
	};

	/**
	 * Initialises a loaded module without storing the state into the configuration.
	 *
	 * @private
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Init-{name}
	 * @fires Coonti-Module-Init with name as param.
	 */
	this._initialiseModule = function*(name) {
		var module = self.getModule(name);
		if(!module) {
			logger.warn("ModuleManager - Tried to initialise non-existent module '%s'.", name);
			return false;
		}

		if(module['initialised']) {
			return true;
		}

		if(!module.dependency.isResolved()) {
			return false;
		}

		var ret = yield module.module.initialise({ logger: module.logger });
		if(ret) {
			module['initialised'] = true;
			yield dependencies.updateComponentState(module.dependency, 'initialised');
			yield coonti.fireEvent('Coonti-Module-Init-' + name, false);
			yield coonti.fireEvent('Coonti-Module-Init', name);
			logger.info("ModuleManager - Initialised module '%s'.", name);
			return true;
		}
		return false;
	};

	/**
	 * Starts a module and stores the state into the configuration.
	 *
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Start-{name}
	 * @fires Coonti-Module-Start with name as param.
	 */
	this.startModule = function*(name) {
		var ret = yield this._startModule(name);
		if(ret) {
			yield coonti.setConfigParam('modules.moduleConfig.' + name + '.start', true);
		}
		return ret;
	};

	/**
	 * Starts a module without storing the state into the configuration.
	 *
	 * @private
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Start-{name}
	 * @fires Coonti-Module-Start with name as param.
	 */
	this._startModule = function*(name) {
		var module = self.getModule(name);
		if(!module) {
			return false;
		}

		if(!module['initialised']) {
			return false;
		}

		if(module['started']) {
			return true;
		}

		if(!module.dependency.isResolved()) {
			return false;
		}

		var ret = yield module.module.start();
		if(ret) {
			module['started'] = true;
			yield dependencies.updateComponentState(module.dependency, 'started');
			yield coonti.fireEvent('Coonti-Module-Start-' + name, false);
			yield coonti.fireEvent('Coonti-Module-Start', name);
			logger.info("ModuleManager - Started module '%s'.", name);
			return true;
		}
		return false;
	};

	/**
	 * Stops a module and stores the state into the configuration.
	 *
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Stop-{name}
	 * @fires Coonti-Module-Stop with name as param.
	 */
	this.stopModule = function*(name) {
		var ret = yield this._stopModule(name);
		if(ret) {
			yield coonti.setConfigParam('modules.moduleConfig.' + name + '.start', false);
		}
		return ret;
	};

	/**
	 * Stops a module without storing the state into the configuration.
	 *
	 * @private
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Stop-{name}
	 * @fires Coonti-Module-Stop with name as param.
	 */
	this._stopModule = function*(name) {
		var module = self.getModule(name);
		if(!module) {
			return false;
		}

		if(!module['started']) {
			return false;
		}

		var ret = yield module.module.stop();
		if(ret) {
			module['started'] = false;
			yield dependencies.updateComponentState(module.dependency, 'initialised');
			yield coonti.fireEvent('Coonti-Module-Stop-' + name, false);
			yield coonti.fireEvent('Coonti-Module-Stop', name);
			logger.info("ModuleManager - Stopped module '%s'.", name);
			return true;
		}
		return false;
	};

	/**
	 * Removes a module and stores the state into the configuration. The module disappears on the list of available modules.
	 *
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Remove-{name}
	 * @fires Coonti-Module-Remove with name as param.
	 */
	this.removeModule = function*(name) {
		var ret = yield this._removeModule(name);
		if(ret) {
			yield coonti.setConfigParam('modules.moduleConfig.' + name + '.remove', true);
		}
		return ret;
	};

	/**
	 * Removes a module without storing the state into the configuration.
	 *
	 * @private
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Module-Remove-{name}
	 * @fires Coonti-Module-Remove with name as param.
	 */
	this._removeModule = function*(name) {
		var module = self.getModule(name);
		if(!module) {
			return false;
		}

		if(module['started']) {
			return false;
		}

		var ret = true;
		if(module['initialised']) {
			ret = yield module.module.remove();
			if(ret) {
				module['initialised'] = false;
				yield dependencies.updateComponentState(module.dependency, 'installed');
				yield coonti.fireEvent('Coonti-Module-Remove-' + name, false);
				yield coonti.fireEvent('Coonti-Module-Remove', name);
				logger.info("ModuleManager - Removed module '%s'.", name);
			}
		}
		return ret;
	};

	/**
	 * Lists modules.
	 *
	 * @return {Object} The modules.
	 */
	this.listModules = function() {
		return modules;
	};

	/**
	 * Fetches a module by the name.
	 *
	 * @param {String} name - The name of the module.
	 * @return {Object} The requested module or false, if no module is found.
	 */
	this.getModule = function(name) {
		if(!name || !modules[name]) {
			return false;
		}

		return modules[name];
	};

	/**
	 * Adds a module asset file available for the clients. Only modules that use package.json convention (and have directory) can add asset files.
	 *
	 * @param {String} name - The name of the module.
	 * @param {String} file - The name of the file for the clients.
	 * @param {String} path - The path of the file, relative to the modules directory. The existence of the file is not checked. If set to false, file parameter is used.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addModuleAsset = function(name, file, path) {
		if(!name || !file || !modules[name]) {
			return false;
		}

		if(!path) {
			path = file;
		}

		// ##TODO## Check that path does not have .. in the path

		var md = modules[name];
		if(!md.dir) {
			return false;
		}

		if(!moduleFiles[name]) {
			moduleFiles[name] = {};
		}

		moduleFiles[name][file] = md.dir + '/' + path;
		logger.debug("ModuleManager - Added asset '%s' to module '%s'.", file, name);
		return true;
	};

	/**
	 * Removes a module asset file.
	 *
	 * @param {String} name - The name of the module.
	 * @param {String} file - The name of the file for the clients.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeModuleAsset = function(name, file) {
		if(!name || !file || !modules[name]) {
			return false;
		}

		if(!moduleFiles[name]) {
			return true;
		}

		delete moduleFiles[name][file];
		logger.debug("ModuleManager - Removed asset '%s' from module '%s'.", file, name);
		return true;
	};

	/**
	 * Removes all module's assets.
	 *
	 * @param {String} name - The name of the module.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeAllModuleAssets = function(name) {
		if(!name || !modules[name]) {
			return false;
		}

		delete !moduleFiles[name];
		logger.debug("ModuleManager - Removed all assets from module '%s'.", name);
		return true;
	};

	/**
	 * Fetches module asset path for web browsers.
	 *
	 * @return {String} The web path, relative to the Coonti root web path. Returns false, if the web path has not been congifured and there is no route for fetching the assets.
	 */
	this.getModuleAssetPath = function() {
		if(!webPath) {
			return false;
		}
		return '/' + webPath;
	};

	/**
	 * Fetches assets of a module.
	 *
	 * @param {String} name - The name of the module.
	 * @return {Object} The assets.
	 */
	this.getModuleAssets = function(name) {
		if(!name || !moduleFiles[name]) {
			return {};
		}
		return moduleFiles[name];
	};

	/**
	 * Fetches assets of all modules.
	 *
	 * @return {Object} The assets.
	 */
	this.getAllModuleAssets = function() {
		return moduleFiles;
	};
}

module.exports = CoontiModuleManager;
