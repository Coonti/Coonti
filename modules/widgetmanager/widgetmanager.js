/**
 * @module CoontiModules/WidgetManager
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

var cacheManager = require('cache-manager');
var thunkify = require('thunkify');
var RestApiHelper = require('../../coonti/libraries/restapihelper.js');

/**
 * Module that handles Coonti widgets
 *
 * @class
 * @classdesc Module for Coonti widgets.
 * @param {Coonti} cnti The coonti instance.
 * @return {MenuManager} The new instance.
 */
function WidgetManager(cnti) {
	const coonti = cnti;
	const config = {};
	const self = this;

	let started = false;

	let storage = false;

	const widgetAreaCache = cacheManager.caching({ store: 'memory', max: 100 });
	const _getWidgetAreaFromCache = thunkify(widgetAreaCache.get);
	const _setWidgetAreaToCache = thunkify(widgetAreaCache.set);
	const _delWidgetAreaFromCache = thunkify(widgetAreaCache.del);

	const widgets = {};

	let logger;

	let formManager;

	/**
	 * Initialises the module.
	 *
	 * @param {Object} params - The initialisation parameters from Coonti.
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*(params) { // eslint-disable-line require-yield
		logger = params.logger;

		config.widgetAreaCollection = 'widgetarea';

		const templates = coonti.getManager('template');
		if(templates) {
			templates.extendTwig(function(Twig) {
				var ret =
					{
						extension: 'tag',
						type: 'widgetArea',
						regex: /^widgetArea\s+([a-zA-Z0-9_]+)$/,
						next: [],
						open: true,
						compile: function(token) {
							token.name = token.match[1].trim();
							delete token.match;
							return token;
						},
						parseGenerator: function*(token, context, chain) {
							let widgetArea = false;
							let output = '';

							if(started) {
								widgetArea = yield self.getWidgetArea(token.name);
								if(widgetArea) {
									output += '<div class="widgetArea widgetArea-' + widgetArea.name + '" id="widgetArea-' + widgetArea.name + '">'; // ##TODO## Tokenise name
									if(widgetArea.widgets) {
										for(let i = 0; i < widgetArea.widgets.length; i++) {
											const widget = widgetArea.widgets[i];
											const widgetCode = self.getWidget(widget.name);
											let widgetClass = '';
											if(i == 0) {
												widgetClass += ' widget-first';
											}
											if(i == widgetArea.widgets.length - 1) {
												widgetClass += ' widget-last';
											}
											if(widgetCode) {
												output += '<div class="widget widget-' + i + ' widget-' + widget.name + widgetClass + '">'; // ##TODO## Tokenise name + add id
												output += widgetCode.renderWidget(widget.config); // ##TODO## Add support for yield
												output += '</div>';
											}
										}
									}
									output += '</div>';
								}
							}

							return {
								chain: false,
								output: output
							};
						}
					};
				return ret;
			});
		}
		else {
			logger.warn("WidgetManager - Could not add 'widgetarea' tag to Twig.");
			return false;
		}

		formManager = coonti.getManager('form');
		if(!formManager) {
			logger.warn('WidgetManager - Could not get form manager.');
			return false;
		}

		if(!formManager.addCollection('widget')) {
			logger.warn('WidgetManager - Could not add form collection.');
			return false;
		}

		logger.debug('WidgetManager - Initialised.');
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() { // eslint-disable-line require-yield
		logger.debug('WidgetManager - Removed.');
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

		if(!self.addDefaultWidgets()) {
			logger.warn('WidgetManager - Could not add default widgets.');
			return false;
		}

		const sm = coonti.getManager('storage');
		storage = sm.getStorageHandler('mongo'); // ##TODO## Read from the configuration

		if(!storage) {
			logger.warn('WidgetManager - Could not find MongoDB storage.');
			return false;
		}

		if(!coonti.addManager('widget', widgetManager)) {
			logger.warn('WidgetManager - Could not add a manager instance.');
			return false;
		}

		var modules = coonti.getManager('module');
		var modulePath = false;
		if(modules) {
			modulePath = modules.getModuleAssetPath();
			if(!modulePath) {
				logger.warn('WidgetManager - No module asset path found.');
				return false;
			}

			modules.addModuleAsset('WidgetManager', 'angular/widget-list.html');
			modules.addModuleAsset('WidgetManager', 'angular/widget-edit.html');
			modules.addModuleAsset('WidgetManager', 'js/widgetmanager.js');
			modules.addModuleAsset('WidgetManager', 'css/widgetmanager.css');
		}
		else {
			logger.warn('WidgetManager - Could not add assets.');
			coonti.removeManager('widget');
			return false;
		}

		var admin = coonti.getManager('admin');
		if(admin) {
			admin.addRoute('widget', '', modulePath + '/WidgetManager/angular/widget-list.html', 'WidgetManagerAreaCtrl', 'admin.manageContent');
			admin.addRoute('widget', '/add', modulePath + '/WidgetManager/angular/widget-edit.html', 'WidgetManagerAreaCtrl', 'admin.manageContent');
			admin.addRoute('widget', '/edit/:name', modulePath + '/WidgetManager/angular/widget-edit.html', 'WidgetManagerAreaCtrl', 'admin.manageContent');
			admin.addMenuItem('content-widget', 'Widgets', '#/module/widget', 'admin.manageContent', 0, 'themes');

			var rah = new RestApiHelper(coonti,
				{ allow: 'admin.manageContent',
				  handler: widgetManagerAdmin.getWidgetArea },
				{ allow: 'admin.manageContent',
				  handler: widgetManagerAdmin.updateWidgetArea },
				{ allow: 'admin.manageContent',
				  handler: widgetManagerAdmin.addWidgetArea },
				{ allow: 'admin.manageContent',
				  handler: widgetManagerAdmin.removeWidgetArea });
			admin.addAdminRoute('WidgetManager', 'widgetarea', 'widgetarea(?:\/(.+))?', rah.serve);
			admin.addAdminRoute('WidgetManager', 'widget', 'widget', widgetManagerAdmin.getWidget);

			// ##TODO## Add widget routes
		}
		else {
			logger.warn('WidgetManager - Could not add admin routes.');
			coonti.removeManager('widget');
			modules.removeAllModuleAssets('WidgetManager');
			return false;
		}

		started = true;

		logger.debug('WidgetManager - Started.');
		return true;
	};

	/**
	 * Stops the module and unregisters widget manager and admin interfaces.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() { // eslint-disable-line require-yield
		if(!coonti.removeManager('widget')) {
			return false;
		}

		var admin = coonti.getManager('admin');
		if(admin) {
			admin.removeAdminRoute('WidgetManager', 'widgetarea');
			admin.removeAdminRoute('WidgetManager', 'widget');
			admin.removeMenuItem('content-widget');
			admin.removeRoute('/widgetarea');
			admin.removeRoute('/widgetarea/add');
			admin.removeRoute('/widgetarea/edit/:name');
		}

		var modules = coonti.getManager('module');
		if(modules) {
			modules.removeAllModuleAssets('WidgetManager');
		}

		started = false;
		logger.debug('WidgetManager - Stopped.');
		return true;
	};

	/**
	 * Lists available widget areas.
	 *
	 * @return {Array} Widget area names.
	 */
	this.listWidgetAreas = function*() {
		var res = yield storage.getAllData(config.widgetAreaCollection, {}, { fields: { name: 1, _id: 1 } });
		return res;
	};

	/**
	 * Fetches the given widget area.
	 *
	 * @param {String} name - The name of the widget area.
	 * @return {Object} The widget area or false, if the widget area does not exist.
	 */
	this.getWidgetArea = function*(name) {
		logger.debug("WidgetManager - getWidgetArea called with widget area '%s'.", name);
		if(!started || !name) {
			return false;
		}

		var res = yield _getWidgetAreaFromCache(name);
		if(res) {
			return res;
		}

		var query = { name: name };
		var res = yield storage.getData(config.widgetAreaCollection, query);

		if(res) {
			if(res.widgetItems && res.widgetItems.length > 0) {
				for(var i = 0; i < res.widgetItems.length; i++) {
					if(!res.widgetItems[i].external) {
						res.widgetItems[i].url = coonti.getWebPath(res.widgetItems[i].url);
					}
				}
			}

			yield _setWidgetAreaToCache(name, res);
			return res;
		}
		return false;
	};

	/**
	 * Adds a new widget area.
	 *
	 * @param {String} name - The name of the new widget area.
	 * @param {Object} widgetArea - The widget area.
	 * @return {bool} True on success, false on failure.
	 */
	this.addWidgetArea = function*(name, widgetArea) {
		if(!started || !name || !widgetArea) {
			return false;
		}

		var res = yield this.getWidgetArea(name);
		if(res) {
			return false;
		}

		widgetArea.name = name;
		delete widgetArea._id;

		// ##TODO## Return value
		yield storage.insertData(config.widgetAreaCollection, widgetArea);

		yield _setWidgetAreaToCache(name, widgetArea);
		return true;
	};

	/**
	 * Removes a widget area.
	 *
	 * @param {String} name - The name of the widget area.
	 * @return {bool} True on success, false on failure.
	 */
	this.removeWidgetArea = function*(name) {
		if(!started || !name) {
			return false;
		}

		const res = yield this.getWidgetArea(name);
		if(!res) {
			return true;
		}

		yield storage.removeData(config.widgetAreaCollection, { name: name });
		yield _delWidgetAreaFromCache(name);
		return true;
	};

	/**
	 * Updates an existing widget area.
	 *
	 * @param {String} name - The name of the widget area.
	 * @param {Object} widgetArea - The new content of the widget area. Key _id must be defined.
	 * @return {bool} True on success, false on failure.
	 */
	this.updateWidgetArea = function*(name, widgetArea) {
		if(!started || !name || !widgetArea) {
			return false;
		}

		if(!widgetArea._id) {
			return false;
		}
		widgetArea.name = name;

		yield storage.updateData(config.widgetAreaCollection, widgetArea);
		yield _setWidgetAreaToCache(name, widgetArea);

		return true;
	};

	/**
	 * Lists available widgets.
	 *
	 * @return {Array} Widget names.
	 */
	this.listWidgets = function() {
		return widgets;
	};

	/**
	 * Fetches the given widget.
	 *
	 * @param {String} name - The name of the widget.
	 * @return {Object} The widget or false, if the widget does not exist.
	 */
	this.getWidget = function(name) {
		if(!started || !name) {
			return false;
		}

		const res = widgets[name];
		if(!res) {
			return false;
		}
		return res;
	};

	/**
	 * Adds a new widget.
	 *
	 * @param {String} name - The name of the new widget.
	 * @param {Object} widget - The widget.
	 * @return {bool} True on success, false on failure.
	 */
	this.addWidget = function(name, widget) {
		if(started) {
			return _addWidget(name, widget);
		}
		return false;
	};

	/**
	 * Internally adds a new widget, does not check whether the module has been started or not.
	 *
	 * @param {String} name - The name of the new widget.
	 * @param {Object} widget - The widget.
	 * @return {bool} True on success, false on failure.
	 */
	const _addWidget = function(name, widget) {
		if(!name || !widget) {
			return false;
		}

		if(widgets[name]) {
			return false;
		}

		widget.name = name;
		widgets[name] = widget;
		return true;
	};

	/**
	 * Removes a widget.
	 *
	 * @param {String} name - The name of the widget.
	 * @return {bool} True on success, false on failure.
	 */
	this.removeWidget = function(name) {
		if(!started || !name) {
			return false;
		}

		if(widgets[name]) {
			delete widgets[name];
		}
		return true;
	};

	/**
	 * Updates an existing widget.
	 *
	 * @param {String} name - The name of the widget.
	 * @param {Object} widget - The new content of the widget.
	 * @return {bool} True on success, false on failure.
	 */
	this.updateWidget = function(name, widget) {
		if(!started || !name || !widget) {
			return false;
		}

		widget.name = name;
		widgets[name] = widget;

		return true;
	};

	/**
	 * Adds the default widgets. Called when the module is started.
	 *
	 * @return {Bool} True on success, false on failure.
	 */
	this.addDefaultWidgets = function() {
		let fm = formManager.addForm('widget', 'simpleText');
		if(!fm) {
			return false;
		}
		fm.addField('content', 'wysiwyg', {
			label: 'Content',
			value: ''
		});

		fm = formManager.addForm('widget', 'image');
		if(!fm) {
			return false;
		}
		fm.addField('image', 'image', {
			label: 'Image'
		});

		_addWidget('text',
					   {
						   title: 'Simple Text',
						   description: 'Shows a snippet of text.',
						   renderWidget: function(config) {
							   return config.content;
						   },
						   configForm: 'widget/simpleText'
					   });


		_addWidget('image',
					   {
						   title: 'Image',
						   description: 'Shows an image.',
						   renderWidget: function(config) {
							   console.log(config);
							   return '<img class="widgetImage" src="' + config.image + '"/>';
						   },
						   configForm: 'widget/image'
					   });
		return true;
	};

	/**
	 * Widget Manager object that is registered as a manager to Coonti, so that it can be used by other modules.
	 *
	 * @class
	 * @classdesc Manager object for Coonti core.
	 * @ignore
	 */
	var widgetManager = {

		/**
		 * Lists available widget areas.
		 *
		 * @return {Array} Widget area names.
		 * @ignore
		 */
		listWidgetAreas: function*() {
			return yield self.listWidgetAreas();
		},

		/**
		 * Fetches the given widget area.
		 *
		 * @param {String} name - The name of the widget area.
		 * @return {Object} The widget area or false, if the widget area does not exist.
		 * @ignore
		 */
		getWidgetArea: function*(name) {
			return yield self.getWidgetArea(name);
		},

		/**
		 * Adds a new widget area.
		 *
		 * @param {String} name - The name of the new widget area.
		 * @param {Object} widgetArea - The widget area.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		addWidgetArea: function*(name, widgetArea) {
			return yield self.addWidgetArea(name, widgetArea);
		},

		/**
		 * Removes a widget area.
		 *
		 * @param {String} name - The name of the widget area.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		removeWidgetArea: function*(name) {
			return yield self.removeWidgetArea(name);
		},

		/**
		 * Updates an existing widget area.
		 *
		 * @param {String} name - The name of the widget area.
		 * @param {Object} widgetArea - The new content of the widget area.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		updateWidgetArea: function*(name, widgetArea) {
			return yield self.updateWidgetArea(name, widgetArea);
		},

		/**
		 * Lists available widgets.
		 *
		 * @return {Array} Widget names.
		 * @ignore
		 */
		listWidgets: function() {
			return self.listWidgets();
		},

		/**
		 * Fetches the given widget.
		 *
		 * @param {String} name - The name of the widget.
		 * @return {Object} The widget or false, if the widget does not exist.
		 * @ignore
		 */
		getWidget: function(name) {
			return self.getWidget(name);
		},

		/**
		 * Adds a new widget.
		 *
		 * @param {String} name - The name of the new widget.
		 * @param {Object} widget - The widget.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		addWidget: function(name, widget) {
			return self.addWidget(name, widget);
		},

		/**
		 * Removes a widget.
		 *
		 * @param {String} name - The name of the widget.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		removeWidget: function(name) {
			return self.removeWidget(name);
		},

		/**
		 * Updates an existing widget.
		 *
		 * @param {String} name - The name of the widget.
		 * @param {Object} widget - The new content of the widget.
		 * @return {bool} True on success, false on failure.
		 * @ignore
		 */
		updateWidget: function(name, widget) {
			return self.updateWidget(name, widget);
		}
	};

	/**
	 * Object containing methods used by Admin module.
	 *
	 * @ignore
	 */
	var widgetManagerAdmin = {

		/**
		 * Fetches the given widget area or lists widget areas.
		 *
		 * @param {String=} name - The name of the widget area. Optional.
		 * @ignore
		 */
		getWidgetArea: function*(name) {
			if(!name) {
				var ret = yield self.listWidgetAreas();
				this.coonti.setItem('response', { items: ret });
				return;
			}
			var ret = yield self.getWidgetArea(name);
			if(!ret) {
				this.status=(404); // eslint-disable-line space-infix-ops
				return;
			}
			this.coonti.setItem('response', ret);
		},

		/**
		 * Updates an existing widget area.
		 *
		 * @param {String} name - The name of the widget area.
		 * @ignore
		 */
		updateWidgetArea: function*(name) {
			if(!name) {
				this.status=(404); // eslint-disable-line space-infix-ops
				return;
			}
			if(!this.request.fields ||
			   !this.request.fields['_id']) {
				this.status=(404); // eslint-disable-line space-infix-ops
				return;
			}
			var id = this.request.fields['_id'];

			var ret = false;
			if(this.request.fields &&
			   this.request.fields['originalName']) {
				var ret = yield self.getWidgetArea(this.request.fields['originalName']);
			}
			else {
				var ret = yield self.getWidgetArea(name);
			}
			if(!ret) {
				this.status=(404); // eslint-disable-line space-infix-ops
				return;
			}

			if(ret._id != id) {
				this.status=(404); // eslint-disable-line space-infix-ops
				return;
			}

			var widgets = [];
			if(this.request.fields['widgets']) {
				widgets = this.request.fields['widgets'];
			}
			var widgetArea = {
				_id: id,
				widgets: widgets
			};

			var res = yield self.updateWidgetArea(name, widgetArea);
			if(res) {
				this.coonti.setItem('response', {});
			}
			else {
				this.status=(500); // eslint-disable-line space-infix-ops
			}
		},

		/**
		 * Adds a new empty widget area.
		 *
		 * @param {String} name - The name of the new widget area.
		 * @ignore
		 */
		addWidgetArea: function*(name) {
			var ret = yield self.addWidgetArea(name, {});
			if(ret) {
				this.coonti.setItem('response', true);
			}
			else {
				this.status=(406); // eslint-disable-line space-infix-ops
				this.coonti.setItem('response', false);
			}
		},

		/**
		 * Removes a widget area.
		 *
		 * @param {String} name - The name of the widget area.
		 * @ignore
		 */
		removeWidgetArea: function*(name) {
			var ret = yield self.removeWidgetArea(name);
			if(ret) {
				this.coonti.setItem('response', true);
			}
			else {
				this.status=(406); // eslint-disable-line space-infix-ops
				this.coonti.setItem('response', false);
			}
		},

		/**
		 * Fetches the given widget or lists widgets.
		 *
		 * @param {String=} name - The name of the widget. Optional.
		 * @ignore
		 */
		getWidget: function*(name) { // eslint-disable-line require-yield
			if(!name) {
				var ret = self.listWidgets();
				this.coonti.setItem('response', { items: ret });
				return;
			}
			var ret = self.getWidget(name);
			if(!ret) {
				this.status=(404); // eslint-disable-line space-infix-ops
				return;
			}
			this.coonti.setItem('response', ret);
		}
	};
}
module.exports = WidgetManager;
