/**
 * @module CoontiModules/MenuManager
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
var clone = require('clone');
var cacheManager = require('cache-manager');
var thunkify = require('thunkify');
var RestApiHelper = require('../../coonti/libraries/restapihelper.js');

/**
 * Module that handles Coonti menus
 *
 * @class
 * @classdesc Module for Coonti menus.
 * @param {Coonti} cnti The coonti instance.
 * @return {MenuManager} The new instance.
 */
function MenuManager(cnti) {
	var coonti = cnti;
	var config = {};
	var contentManager = false;
	var self = this;

	var started = false;

	var storage = false;

	var menuCache = cacheManager.caching({ store: 'memory', max: 100 });
	var _getMenuFromCache = thunkify(menuCache.get);
	var _setMenuToCache = thunkify(menuCache.set);
	var _delMenuFromCache = thunkify(menuCache.del);

	var logger;

	/**
	 * Initialises the module.
	 *
	 * @param {Object} params - The initialisation parameters from Coonti.
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*(params) { // eslint-disable-line require-yield
		logger = params.logger;

		config.menuCollection = 'menu';

		contentManager = coonti.getManager('content');
		var templates = coonti.getManager('template');
		if(templates) {
			templates.extendTwig(function(Twig) {
				var ret =
					{
						extension: 'tag',
						type: 'menu',
						regex: /^menu\s+([a-zA-Z0-9_]+)\s+from\s+(.*?)(\s+with\s+(.*?))?$/,
						next: [],
						open: true,
						compile: function(token) {
							var key = token.match[1].trim();
							var expression = token.match[2];

							var expressionStack = Twig.expression.compile.apply(this, [{
								type: Twig.expression.type.expression,
								value: expression
							}]).stack;

							token.key = key;
							token.expression = expressionStack;
							token.items = false;

							if(typeof token.match[4] != 'undefined') {
								var items = token.match[4];
								var itemStack = Twig.expression.compile.apply(this, [{
									type: Twig.expression.type.expression,
									value: items
								}]).stack;
								token.items = itemStack;
							}

							delete token.match;
							return token;
						},
						parseGenerator: function*(token, context, chain) {
							var value = Twig.expression.parse.apply(this, [token.expression, context]);
							var items = false;
							if(token.items) {
								var tmp = Twig.expression.parse.apply(this, [token.items, context]);
								var items = tmp.split(',');
								if(items.length == 0) {
									items = false;
								}
							}

							var key = token.key;
							var mn = false;

							if(started) {
								mn = yield self.getMenu(value);
								if(items) {
									mn = yield self.enrichMenu(mn, items);
								}
							}
							context[key] = mn;

							return {
								chain: chain,
								content: context
							};
						}
					};
				return ret;
			});
		}

		logger.debug('MenuManager - Initialised.');
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() { // eslint-disable-line require-yield
		logger.debug('MenuManager - Removed.');
		return true;
	};

	/**
	 * Starts the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.start = function*() { // eslint-disable-line require-yield
		if(started) {
			return true;
		}

		var sm = coonti.getManager('storage');
		storage = sm.getStorageHandler('mongo'); // ##TODO## Read from the configuration

		if(!storage) {
			logger.warn('MenuManager - Could not find MongoDB storage.');
			return false;
		}

		if(!coonti.addManager('menu', menuManager)) {
			logger.warn('MenuManager - Could not add a manager instance.');
			return false;
		}

		var modules = coonti.getManager('module');
		var modulePath = false;
		if(modules) {
			modulePath = modules.getModuleAssetPath();
			if(!modulePath) {
				logger.warn('MenuManager - No module asset path found.');
				return false;
			}
			modules.addModuleAsset('MenuManager', 'angular/menu-list.html');
			modules.addModuleAsset('MenuManager', 'angular/menu-edit.html');
			modules.addModuleAsset('MenuManager', 'js/menumanager.js');
			modules.addModuleAsset('MenuManager', 'css/menumanager.css');
		}

		var admin = coonti.getManager('admin');
		if(admin) {
			admin.addRoute('menu', '', modulePath + '/MenuManager/angular/menu-list.html', 'MenuManagerMenuCtrl', 'admin.manageContent');
			admin.addRoute('menu', '/add', modulePath + '/MenuManager/angular/menu-edit.html', 'MenuManagerMenuCtrl', 'admin.manageContent');
			admin.addRoute('menu', '/edit/:name', modulePath + '/MenuManager/angular/menu-edit.html', 'MenuManagerMenuCtrl', 'admin.manageContent');
			admin.addMenuItem('content-menu', 'Manage Menus', '#/module/menu', 'admin.manageContent', 1, 'content-add');

			var rah = new RestApiHelper(coonti,
				{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.getMenu },
				{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.updateMenu },
				{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.addMenu },
				{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.removeMenu });
			admin.addAdminRoute('MenuManager', 'menu', 'menu(?:\/(.+))?', rah.serve);
		}

		started = true;
		logger.debug('MenuManager - Started.');
		return true;
	};

	/**
	 * Stops the module and unregisters file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() { // eslint-disable-line require-yield
		if(!coonti.removeManager('menu')) {
			return false;
		}

		var admin = coonti.getManager('admin');
		if(admin) {
			admin.removeAdminRoute('MenuManager', 'menu');
			admin.removeMenuItem('content-menu');
			admin.removeRoute('/menu');
			admin.removeRoute('/menu/add');
			admin.removeRoute('/menu/edit/:name');
		}

		var modules = coonti.getManager('module');
		if(modules) {
			modules.removeAllModuleAssets('MenuManager');
		}

		started = false;
		logger.debug('MenuManager - Stopped.');
		return true;
	};

	/**
	 * Lists available menus.
	 *
	 * @return {Array} Menu names.
	 */
	this.listMenus = function*() {
		var res = yield storage.getAllData(config.menuCollection, {}, { fields: { name: 1, _id: 1 } });
		return res;
	};

	/**
	 * Fetches the given menu.
	 *
	 * @param {String} name - The name of the menu.
	 * @return {Object} The menu or false, if the menu does not exist.
	 */
	this.getMenu = function*(name) {
		logger.debug("MenuManager - getMenu called with menu '%s'.", name);
		if(!started || !name) {
			return false;
		}

		var res = yield _getMenuFromCache(name);
		if(res) {
			return res;
		}

		var query = { name: name };
		var res = yield storage.getData(config.menuCollection, query);

		if(res) {
			if(res.menuItems && res.menuItems.length > 0) {
				for(var i = 0; i < res.menuItems.length; i++) {
					if(!res.menuItems[i].external) {
						res.menuItems[i].url = coonti.getWebPath(res.menuItems[i].url);
					}
				}
			}

			yield _setMenuToCache(name, res);
			return res;
		}
		return false;
	};

	/**
	 * Adds external information from referred content to the menu, used by getMenu().
	 *
	 * @param {Object} menu - The menu object.
	 * @param {Array} keys - The keys of the extra information.
	 * @return {Object} A copy of the menu with the extra information added or false, if the given menu was not a proper menu Object.
	 */
	this.enrichMenu = function*(menu, keys) {
		if(!menu || !menu['menuItems']) {
			return false;
		}

		var newMenu = clone(menu);

		if(!keys || keys.length == 0) {
			return newMenu;
		}

		var contentIds = [];
		var idPicker = function(mn) {
			_.each(mn.menuItems, function(el) {
				if(el['id']) {
					contentIds.push(el.id);
				}
				if(el['menuItems']) {
					idPicker(el);
				}
			});
		};
		idPicker(newMenu);

		if(contentIds.length == 0) {
			return newMenu;
		}

		var dbKeys = {};
		for(var i in keys) {
			dbKeys[keys[i].trim()] = 1;
		}

		var ch = contentManager.getContentHandler();
		var cnt = yield ch.listContent({}, { fields: dbKeys });
		if(cnt.length == 0) {
			return newMenu;
		}

		var cntObject = {};
		for(var i in cnt) {
			if(!!cnt[i]['_id']) {
				cntObject[cnt[i]['_id']] = cnt[i];
				delete cnt[i]['_id'];
				delete cnt[i]['menuItems'];
			}
		}

		var idInjector = function(mn) {
			_.each(mn.menuItems, function(el) {
				if(el['id'] && cntObject[el['id']]) {
					_.extendOwn(el, cntObject[el['id']]);
				}
				if(el['menuItems']) {
					idInjector(el);
				}
			});
		};
		idInjector(newMenu);

		return newMenu;
	};

	/**
	 * Adds a new menu.
	 *
	 * @param {String} name - The name of the new menu.
	 * @param {Object} menu - The menu.
	 * @return {bool} True on success, false on failure.
	 */
	this.addMenu = function*(name, menu) {
		if(!started || !name || !menu) {
			return false;
		}

		var res = yield this.getMenu(name);
		if(res) {
			return false;
		}

		menu.name = name;
		delete (menu._id);

		// ##TODO## Return value
		yield storage.insertData(config.menuCollection, menu);

		yield _setMenuToCache(name, menu);
		return true;
	};

	/**
	 * Removes a menu.
	 *
	 * @param {String} name - The name of the menu.
	 * @return {bool} True on success, false on failure.
	 */
	this.removeMenu = function*(name) {
		if(!started || !name) {
			return false;
		}

		var res = yield this.getMenu(name);
		if(!res) {
			return true;
		}

		yield storage.removeData(config.menuCollection, { name: name });
		yield _delMenuFromCache(name);
		return true;
	};

	/**
	 * Updates an existing menu.
	 *
	 * @param {String} name - The name of the menu.
	 * @param {Object} menu - The new content of the menu. Key _id must be defined.
	 * @return {bool} True on success, false on failure.
	 */
	this.updateMenu = function*(name, menu) {
		if(!started || !name || !menu) {
			return false;
		}

		if(!menu._id) {
			return false;
		}
		menu.name = name;

		yield storage.updateData(config.menuCollection, menu);
		yield _setMenuToCache(name, menu);

		return true;
	};

	/**
	 * Menu Manager object that is registered as a manager to Coonti, so that it can be used by other modules.
	 *
	 * @class
	 * @classdesc Manager object for Coonti core.
	 * @ignore
	 */
	var menuManager = {

		/**
		 * Lists available menus.
		 *
		 * @return {Array} Menu names.
		 * @ignore
		 */
		listMenus: function*() {
			return yield self.listMenus();
		},

		/**
		 * Fetches the given menu.
		 *
		 * @param {String} name - The name of the menu.
		 * @return {Object} The menu or false, if the menu does not exist.
		 * @ignore
		 */
		getMenu: function*(name) {
			return yield self.getMenu(name);
		},

		/**
		 * Adds a new menu.
		 *
		 * @param {String} name - The name of the new menu.
		 * @param {Object} menu - The menu.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		addMenu: function*(name, menu) {
			return yield self.addMenu(name, menu);
		},

		/**
		 * Removes a menu.
		 *
		 * @param {String} name - The name of the menu.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		removeMenu: function*(name) {
			return yield self.removeMenu(name);
		},

		/**
		 * Updates an existing menu.
		 *
		 * @param {String} name - The name of the menu.
		 * @param {Object} menu - The new content of the menu.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		updateMenu: function*(name, menu) {
			return yield self.updateMenu(name, menu);
		}
	};

	/**
	 * Object containing methods used by Admin module.
	 *
	 * @ignore
	 */
	var menuManagerAdmin = {

		/**
		 * Fetches the given menu or lists menus.
		 *
		 * @param {String=} name - The name of the menu. Optional.
		 * @ignore
		 */
		getMenu: function*(name) {
			if(!name) {
				var ret = yield self.listMenus();
				this.coonti.setItem('response', { items: ret });
				return;
			}
			var ret = yield self.getMenu(name);
			if(!ret) {
				this.status = (404);
				return;
			}
			this.coonti.setItem('response', ret);
		},

		/**
		 * Updates an existing menu.
		 *
		 * @param {String} name - The name of the menu.
		 * @ignore
		 */
		updateMenu: function*(name) {
			if(!name) {
				this.status = (404);
				return;
			}
			if(!this.request.body.fields ||
			   !this.request.body.fields['_id']) {
				this.status = (404);
				return;
			}
			var id = this.request.body.fields['_id'];

			var ret = false;
			if(this.request.body.fields &&
			   this.request.body.fields['originalName']) {
				var ret = yield self.getMenu(this.request.body.fields['originalName']);
			}
			else {
				var ret = yield self.getMenu(name);
			}
			if(!ret) {
				this.status = (404);
				return;
			}

			if(ret._id != id) {
				this.status = (404);
				return;
			}

			var menuItems = [];
			if(this.request.body.fields['menuItems']) {
				menuItems = this.request.body.fields['menuItems'];
			}
			var menu = {
				_id: id,
				menuItems: menuItems
			};

			var res = yield self.updateMenu(name, menu);
			if(res) {
				this.coonti.setItem('response', {});
			}
			else {
				this.status = (500);
			}
		},

		/**
		 * Adds a new empty menu.
		 *
		 * @param {String} name - The name of the new menu.
		 * @ignore
		 */
		addMenu: function*(name) {
			var ret = yield self.addMenu(name, {});
			if(ret) {
				this.coonti.setItem('response', true);
			}
			else {
				this.status = (406);
				this.coonti.setItem('response', false);
			}
		},

		/**
		 * Removes a menu.
		 *
		 * @param {String} name - The name of the menu.
		 * @ignore
		 */
		removeMenu: function*(name) {
			var ret = yield self.removeMenu(name);
			if(ret) {
				this.coonti.setItem('response', true);
			}
			else {
				this.status = (406);
				this.coonti.setItem('response', false);
			}
		}
	};
}
module.exports = MenuManager;
