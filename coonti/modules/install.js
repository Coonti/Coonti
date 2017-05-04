/**
 * @module CoontiSystemModules/Install
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
var fs = require('co-fs-extra');
var thunkify = require('thunkify');
var CoontiException = require('../coontiexception.js');
var tools = require('../tools.js');

var userManager = false;

/**
 * Coonti installation and configuration module. Is used to set up the system and then deactivated.
 *
 * @class
 * @classdesc The Coonti installation module.
 * @param {Coonti} cnti - The coonti instance.
 */
function CoontiInstall(cnti) {
	var coonti = cnti;

	var installPath = [
		{ "name": "session", "priority": 700 },
		{ "name": "form", "priority": 600 },
		{ "name": "install", "priority": 500 },
		{ "name": "content", "priority": 400 },
		{ "name": "template", "priority": 300 },
		{ "name": "end", "priority": 100 }
	];
	
	var initialised = false;
	var locked = false;

	var formManager = false;

	var language = false;
	var language = 'en'; // ##TODO## Remove when MongoDB testing is done
	var mongoConnected = false;
	var userCreated = false;
	var allDone = false;

	var originalDatabaseConfig = false;
	var newDatabaseConfig = false;

	var logger;

	/**
	 * Fetches the module information for admin users.
	 *
	 * @return {Object} The module info.
	 */
	this.getInfo = function() {
		return {
			name: 'CoontiInstall',
			description: 'Coonti installation module. This module should not be started after Coonti installation.',
			author: 'Coonti Project',
			authorUrl: 'http://coonti.org',
			version: '0.1.0',
			moduleUrl: 'http://coonti.org',
			dependencies: [{
				collection: 'module',
				name: 'FileContent',
				states: 'started'
			}]
		};
	}

	/**
	 * Initialises the module.
	 *
	 * @param {Object} params - The initialisation parameters from Coonti.
	 * @return {boolean} True on success, false on failure.
	 */
	this.initialise = function*(params) {
		logger = params.logger;

		var coontiMode = coonti.getConfigParam('coontiMode');
		if(coontiMode != 'install') {
			logger.warn('CoontiInstall - Trying to initialise module Coonti is not in install mode.');
			return false;
		}

		var router = coonti.getManager('router');
		if(!router.addStateHandler('install', this.handleInstall)) {
			logger.error('CoontiInstall - Cannot add installation state handler.');
			throw new CoontiException(CoontiException.FATAL, 4101, 'Cannot add installation state handler.');
		}

		var sm = router.addExecutionPath('default', installPath);
		sm.addAfterStateCallback('end', 'installEnds', this.endInstall, 0);

		var lm = coonti.getManager('language');
		var langs = lm.getLanguages();

		var langsForForms = {};
		_.each(langs, function(l, i) {
			langsForForms[i] = l.countryName + ' / ' + l.languageName;
		});

		// Create required forms
		formManager = coonti.getManager('form');

		if(!formManager.addCollection('installation')) {
			logger.error('CoontiInstall - Cannot add installation form collection.');
			throw new CoontiException(CoontiException.FATAL, 4102, 'Cannot add installation form collection.');
		}

		var fm = formManager.addForm('installation', 'languageSelection');
		if(!fm) {
			logger.error('CoontiInstall - Cannot add installation language form.');
			throw new CoontiException(CoontiException.FATAL, 4103, 'Cannot add installation language form.');
		}
		fm.addField('language', 'select', {
			label: 'Please select language',
			values: langsForForms
		});
		fm.addField('submit', 'submit', {
			value: 'Next'
		});

		fm = formManager.addForm('installation', 'mongoDB');
		if(!fm) {
			logger.error('CoontiInstall - Cannot add installation database form.');
			throw new CoontiException(CoontiException.FATAL, 4103, 'Cannot add installation database form.');
		}
		fm.addField('mongoUrl', 'text', {
			label: 'MongoDB connection URL',
			value: 'mongodb://localhost:27017/coonti',
			required: true
		});
		fm.addField('submit', 'submit', {
			value: 'Next'
		});

		fm = formManager.addForm('installation', 'userAccount');
		if(!fm) {
			logger.error('CoontiInstall - Cannot add installation user account form.');
			throw new CoontiException(CoontiException.FATAL, 4103, 'Cannot add installation user account form.');
		}
		fm.addField('account', 'text', {
			label: 'Administrator account',
			required: true
		});
		fm.addField('password', 'password', {
			label: 'Administrator password',
			required: true
		});
		fm.addField('password2', 'password', {
			label: 'Please repeat the password',
			required: true
		});
		fm.addField('email', 'email', {
			label: 'Administrator email address',
			required: true
		});
		fm.addField('submit', 'submit', {
			value: 'Next'
		});


		fm = formManager.addForm('installation', 'dbContent');
		if(!fm) {
			logger.error('CoontiInstall - Cannot add installation example content form.');
			throw new CoontiException(CoontiException.FATAL, 4103, 'Cannot add installation example content form.');
		}

		fm.addField('users', 'checkbox', {
			label: 'Default user roles and groups',
			value: true
		});
		fm.addField('content', 'checkbox', {
			label: 'Demo content',
			value: false
		});
		fm.addField('submit', 'submit', {
			value: 'Next'
		});

		var config = coonti.getConfig();
		originalDatabaseConfig = config.getConfigParam('databases');

		initialised = true;
		logger.info('CoontiInstall - Initialised.');
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
		if(!initialised) {
			return false;
		}

		logger.info('CoontiInstall - Started.');
		return true;
	}

	/**
	 * Stops the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.stop = function*() {
		logger.info('CoontiInstall - Stopped.');
		return true;
	}

	/**
	 * Handles Coonti installation
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleInstall = function*(csm, config, next) {

		// Remove any logins from client-side sessions
		if(this.coonti.hasSession()) {
			this.coonti.removeFromSession('coontiUser');
		}
		
		// Check whether installation is already in progress by a browser
		if(locked) {
			if(this.coonti.getFromSession('installLock') != locked) {
				// ##TODO## Show error message
				yield next;
				return;
			}
		}
		else {
			locked = new Date().toString();
			this.coonti.setInSession('installLock', locked);
		}

		var phase = this.path;
		// Handle install phases, and if user has provided something else as request, redirect back to root
		/*
		if(phase == '/') {
			this.coonti.setItem('route', 'start');
			var formSubmitted = this.coonti.getForm('installation/languageSelection');
			if(formSubmitted && formSubmitted.isOk()) {
				language = formSubmitted.getValue('language');

				// ##TODO## Set language environment

				this.redirect('/mongo');
				return;
			}

		}
		else if(phase == '/mongo' && language) {
		*/

		if(phase == '/') {
			this.coonti.setItem('route', 'mongo');
			var formSubmitted = this.coonti.getForm('installation/mongoDB');
			if(formSubmitted && formSubmitted.isOk()) {
				var mongoUrl = formSubmitted.getValue('mongoUrl');

				var mongoConfig = {
					name: 'mongo', 
					type: 'mongodb',
					url: mongoUrl
				};

				var mongoContentConfig = {
					handlerName: 'mongo',
					database: 'mongo',
					contentCollection: 'content',
					contentTypeCollection: 'contentType',
					'default': false
				};

				var config = coonti.getConfig();
				newDatabaseConfig = [mongoConfig];
				yield config.setConfigParam('databases', newDatabaseConfig);

				var mongoOk = true;

				var modules = coonti.getManager('module');

				try {
					yield modules.setModuleConfig('MongoConnect', mongoConfig);
					var ret = yield modules.initialiseModule('MongoConnect');
					if(ret) {
						ret = yield modules.startModule('MongoConnect');
					}
					if(!ret) {
						formSubmitted.addError('mongoUrl', 'Could not start MongoDB related modules. Please check that Coonti installation and configuration are correct.');
						mongoOk = false;
					}
				}
				catch(e) {
					formSubmitted.addError('mongoUrl', 'Could not connect to MongoDB. Please check that it is available and try again.');
					mongoOk = false;
				}

				if(mongoOk) {
					var sm = coonti.getManager('storage');
					var mongodb = sm.getStorageHandler('mongo');
					yield mongodb.dropDatabase();

					var cm = coonti.getManager('content');

					var fch = cm.getContentHandler('installContent');
					var defaultConfig = yield fch.getDirectContent('defaultConfig.json');
					var contentTypeConfig = yield fch.getDirectContent('defaultThumbnails.json');
					
					if(!defaultConfig || !contentTypeConfig) {
						formSubmitted.addError('mongoUrl', 'Could not read default configuration files.');
						mongoOk = false;
					}
					else {
						defaultConfig.databases = newDatabaseConfig;
						
						try {
							yield mongodb.insertData('config', defaultConfig);
							yield mongodb.insertData('config', contentTypeConfig);
							
							yield modules.setModuleConfig('MongoContent', mongoContentConfig);
							yield modules.initialiseModule('MongoContent');
							yield modules.startModule('MongoContent');
						}
						catch(e) {
							formSubmitted.addError('mongoUrl', 'Could not connect to MongoDB. Please check that it is available and try again.');
							mongoOk = false;
						}
					}
					
					if(mongoOk) {
						mongoConnected = true;
						cm.setDefaultContentHandler('mongo');
						this.redirect('/account');
						return;
					}
				}
			}
		}

		else if(phase == '/account' && mongoConnected) {
			this.coonti.setItem('route', 'account');
			var formSubmitted = this.coonti.getForm('installation/userAccount');
			if(formSubmitted && formSubmitted.isOk()) {

				var pw1 = formSubmitted.getValue('password');
				var pw2 = formSubmitted.getValue('password2');

				if(pw1 != pw2) {
					formSubmitted.addError('password2', 'Passwords do not match.');					
				}
				else {
					var account = formSubmitted.getValue('account');
					var email = formSubmitted.getValue('email');
					
					userManager = coonti.getManager('user');
					userCreated = true;
					try {
						var r = yield userManager.addRole('Admin', 'System Administrators.', ['*']);
						yield userManager.addUser(account, pw1, { email: email }, false, false, [r.getId()]);
					}
					catch(e) {
						console.log(e);
						formSubmitted.addError('account', 'Could not write to MongoDB. Please check that it is available and try again.');
						userCreated = false;
					}
					
					if(userCreated) {
						this.redirect('/examples');
						return;
					}
				}
			}
		}

		else if(phase == '/examples' && userCreated) {
			this.coonti.setItem('route', 'examples');
			var formSubmitted = this.coonti.getForm('installation/dbContent');
			if(formSubmitted && formSubmitted.isOk()) {
				var defUsers = formSubmitted.getValue('users');
				var defContent = formSubmitted.getValue('content');

				allDone = true;
				if(defUsers || defContent) {
					var cm = coonti.getManager('content');
					var fch = cm.getContentHandler('installContent');

					try {
						if(defUsers) {
							var userData = yield fch.getDirectContent('defaultUsers.json');
							if(userData['roles'] && _.size(userData.roles) > 0) {
								for(var i in userData.roles) {
									var role = userData.roles[i];
									if(!!role['name']) {
										var name = role['name'];
										var descr = role['description'];
										var allowed = false;
										var denied = false;
										if(role['allowed']) {
											allowed = role['allowed'];
										}
										if(role['denied']) {
											denied = role['denied'];
										}
										var res = yield userManager.addRole(name, descr, allowed, denied);
										if(res === false) {
											logger.error('CoontiInstall - Adding a role failed.');
										}
									}
								}
							}

							if(userData['groups'] && _.size(userData.groups) > 0) {
								for(var i in userData.groups) {
									var grp = userData.groups[i];
									if(!!grp['name']) {
										var name = grp['name'];
										var descr = grp['description'];
										var allowed = false;
										var denied = false;
										if(grp['allowed']) {
											allowed = grp['allowed'];
										}
										if(grp['denied']) {
											denied = grp['denied'];
										}
										var res = yield userManager.addGroup(name, descr, allowed, denied);
										if(res === false) {
											logger.error('CoontiInstall - Adding a group failed.');
										}
									}
								}
							}

							if(userData['users'] && _.size(userData.users) > 0) {
								for(var i in userData.users) {
									var user = userData.users[i];
									if(!!user['account']) {
										var account = user['account'];
										var password = user['password'];
										var userDt = {};
										var allowed = false;
										var denied = false;
										var roles = false;
										var groups = false;
										if(user['userData']) {
											userDt = user['userData'];
										}
										if(user['allowed']) {
											allowed = user['allowed'];
										}
										if(user['denied']) {
											denied = user['denied'];
										}
										if(user['roles']) {
											roles = [];
											for(var i in user['roles']) {
												var r = user['roles'][i];
												var rl = yield userManager.getRole(r);
												if(rl) {
													roles.push(rl.getId());
												}
											}
										}
										if(user['groups']) {
											groups = [];
											for(var i in user['groups']) {
												var g = user['groups'][i];
												var gr = yield userManager.getGroup(g);
												if(gr) {
													groups.push(gr.getId());
												}
											}
										}
										var res = yield userManager.addUser(account, password, userDt, allowed, denied, roles, groups);
										if(res === false) {
											logger.error('CoontiInstall - Adding a user failed.');
										}
									}
								}
							}
						}

						// Store example content to MongoDB and copy media files, if so required
						if(defContent) {
							var content = yield fch.getDirectContent('defaultContent.json');
							var mch = cm.getContentHandler('mongo');
							if(content['contentTypes']) {
								for(var i in content.contentTypes) {
									var ct = content.contentTypes[i];
									if(!ct['name']) {
										continue;
									}
									if(ct['mtime']) {
										ct['mtime'] = new Date(ct['mtime']);
									}
									yield cm.addContentType(ct['name'], ct, mch);
								}
							}
							if(content['content']) {
								for(var i in content.content) {
									var ct = content.content[i];
									if(!ct['contentType']) {
										continue;
									}
									if(ct['mtime']) {
										ct['mtime'] = new Date(ct['mtime']);
									}
									yield cm.addContent(ct['contentType'], ct);
								}
							}
							if(content['menus']) {
								var sm = coonti.getManager('storage');
								var mongodb = sm.getStorageHandler('mongo');

								for(var i in content.menus) {
									var mn = content.menus[i];
									if(!mn['name']) {
										continue;
									}
									yield mongodb.insertData('menu', mn)
								}
							}
						}

						// Empty content/media directory and copy files over
						yield fs.emptyDir('content/media');
						yield fs.copy('coonti/installation/content/defaultMedia', 'content/media');
					}
					catch(e) {
						formSubmitted.addError('users', 'Could not write to MongoDB. Please check that it is available and try again.');
						allDone = false;
					}
				}

				if(allDone) {
					this.redirect('/ready');
					return;
				}
			}
		}

		else if(phase == '/ready' && allDone) {
			this.coonti.setItem('route', 'ready');

			var fileConfig = {
				coontiMode: 'development',
				databases: newDatabaseConfig
			};

			var fileConfigStr = JSON.stringify(fileConfig, null, 2);
			var basePath = tools.getCoontiDir();
			try {
				yield fs.writeFile(basePath + 'config/coontiConfig.json', fileConfigStr);
			}
			catch(e) {
				console.error('CoontiInstall - Could not write the configuration file due to an exception.', e);
				// ##TODO## Handle error and tell user.
			}

			var coontiPath = coonti.getConfigParam('pathPrefix');
			if(!!coontiPath) {
				coontiPath += '/';
			}
			else {
				coontiPath = '';
			}
			coontiPath = '/' + coontiPath;
			this.coonti.mergeItem('content', {
				coontiSite: coontiPath,
				coontiAdmin: coontiPath + 'admin/'
			});

		}
		else if(phase == '/drop' && allDone) {
			this.coonti.setItem('route', 'drop');
			this.coonti.setItem('installationDone', true);
		}

		else {
			this.redirect('/');
			return;
		}

		this.coonti.setItem('contentHandler', 'installContent');

		yield next;
	}

	/**
	 * After state callback that is used to remove installation after everything is done.
	 *
	 * @param {Context} ctx - Koa context.
	 * @param {State} state - The state.
	 */
	this.endInstall = function*(ctx, state) {
		if(ctx.coonti.getItem('installationDone')) {
			var config = coonti.getConfig();

			var moduleManager = coonti.getManager('module');
			yield moduleManager.stopModule('install');
			yield moduleManager.removeModule('install');

			var tm = coonti.getManager('template');
			yield tm.deactivateTheme('Seed');
			
			var init = thunkify(config.initialise);
			yield init();
		}
	}
}

module.exports = CoontiInstall;
