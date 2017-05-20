/**
 * @module CoontiSystemModules/Admin
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
var CoontiException = require('../coontiexception.js');
var tools = require('../tools.js');
var MiniRouter = require('../libraries/minirouter.js');
var RestApiHelper = require('../libraries/restapihelper.js');

/**
 * Coonti administration module. The module provides end point for the Angular.js admin front-end and also generates the page that is used to launch admin JS application.
 *
 * @class
 * @classdesc The Coonti administration module.
 * @param {Coonti} cnti - The coonti instance.
 */
function CoontiAdmin(cnti) {
	var coonti = cnti;

	var adminPath = [
		{ name: 'session', priority: 700 },
		{ name: 'route', priority: 600 },
		{ name: 'access',
		  priority: 500,
		  config: {
			  requireLogin: true,
			  requireAccess: 'admin.accessAdmin',
			  loginRoute: '/login',
			  logoutRoute: '/logout'
		  }
		},
		{ name: 'form', priority: 400 },
		{ name: 'adminData', priority: 300 },
		{ name: 'adminTemplateOrJson', priority: 200 },
		{ name: 'end', priority: 100 }
	];

	var adminJsonPath = [
		{ name: 'session', priority: 700 },
		{ name: 'route', priority: 600 },
		{ name: 'accessJson',
		  priority: 500,
		  config: {
			  requireLogin: true,
			  requireAccess: 'admin.accessAdmin'
		  }
		},
		{ name: 'form', priority: 400 },
		{ name: 'adminApi', priority: 300 },
		{ name: 'adminTemplateOrJson', priority: 200 },
		{ name: 'end', priority: 100 }
	];

	var defaultQueryValues = {
		start: 0,
		len: 20,
		sort: '',
		filter: '',
		search: ''
	};

	var initialised = false;

	var formManager = false;
	var contentManager = false;
	var mediaManager = false;
	var userManager = false;
	var moduleManager = false;
	var templateManager = false;

	var minirouter = new MiniRouter(this);

	var angularTemplates = false;
	var adminTheme = false;

	var logger;

	var self = this;

	/**
	 * Fetches the module information for admin users.
	 *
	 * @return {Object} The module info.
	 */
	this.getInfo = function() {
		return {
			name: 'CoontiAdmin',
			description: 'Coonti admin user interface. Stopping this module causes the admin interface to stop working.',
			author: 'Coonti Project',
			authorUrl: 'http://coonti.org',
			version: '0.1.0',
			moduleUrl: 'http://coonti.org'
		};
	};

	/**
	 * Initialises the module.
	 *
	 * @param {Object} params - The initialisation parameters from Coonti.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Admin-Init
	 */
	this.initialise = function*(params) {
		logger = params.logger;

		userManager = coonti.getManager('user');
		templateManager = coonti.getManager('template');
		moduleManager = coonti.getManager('module');

		contentManager = coonti.getManager('content');
		mediaManager = coonti.getManager('media');

		// Create required forms
		formManager = coonti.getManager('form');

		if(!formManager.addCollection('admin')) {
			logger.error('CoontiAdmin - Cannot add admin form collection.');
			throw new CoontiException(CoontiException.FATAL, 4102, 'Cannot add admin form collection.');
		}

		var fm = formManager.addForm('admin', 'login');
		if(!fm) {
			logger.error('CoontiAdmin - Cannot add admin login form.');
			throw new CoontiException(CoontiException.FATAL, 4103, 'Cannot add admin login form.');
		}
		fm.addField('account', 'text', {
			label: 'User Account',
			value: '',
			required: true
		});
		fm.addField('password', 'password', {
			label: 'Password',
			value: '',
			required: true
		});
		fm.addField('submit', 'submit', {
			value: 'Login'
		});

		fm = formManager.addForm('admin', 'contentType');
		if(!fm) {
			logger.error('CoontiAdmin - Cannot add admin content type form.');
			throw new CoontiException(CoontiException.FATAL, 4103, 'Cannot add admin content type form.');
		}
		fm.addField('displayName', 'text', {
			label: 'Content Type Name',
			value: '',
			required: true
		});
		fm.addField('fieldName', 'text', {
			label: 'Field Name',
			value: '',
			required: true
		});
		fm.addField('fieldType', 'select', {
			label: '',
			value: '',
			values: { // ##TODO## This should be configurable
				text: 'Single line text',
				textarea: 'Text area',
				wysiwyg: 'Wysiwyg text area'
			},
			required: true
		});
		fm.addField('submit', 'submit', {
			value: 'Save'
		});

		minirouter.addRoute('menu', '/menu', this.getCoontiMenu);
		minirouter.addRoute('routes', '/routes', this.getCoontiRoutes);
		minirouter.addRoute('assets', '/assets', this.getCoontiAssets);
		minirouter.addRoute('formElements', '/formelements', this.getCoontiFormElements);
		minirouter.addRoute('templates', '/templates/(.+)', this.getTemplate);

		var rah = new RestApiHelper(coonti,
			{ allow: ['admin.addContent', 'admin.manageContentTypes'],
									  handler: this.getContentType },
			{ allow: 'admin.manageContentTypes',
									  handler: this.updateContentType },
			{ allow: 'admin.manageContentTypes',
									  handler: this.addContentType },
			{ allow: 'admin.manageContentTypes',
									 handler: this.removeContentType });
		minirouter.addRoute('contentType', '\/contentType(?:\/(.+))?', rah.serve);

		rah = new RestApiHelper(coonti,
			{ allow: 'admin.manageContent',
								  handler: this.getContent },
			{ allow: 'admin.manageContent',
								  handler: this.updateContent },
			{ allow: 'admin.manageContent',
								  handler: this.addContent },
			{ allow: 'admin.manageContent',
								  handler: this.removeContent });
		minirouter.addRoute('content', '\/content(?:\/([a-zA-Z0-9_-]+))?(?:\/([0-9]*))?(?:\/([0-9]*))?(?:\/([a-zA-Z0-9_-]*))?', rah.serve);

		rah = new RestApiHelper(coonti,
			{ allow: 'admin.manageMedia',
								  handler: this.getMedia },
			{ allow: 'admin.manageMedia',
								  handler: this.updateMedia },
			{ allow: 'admin.manageMedia',
								  handler: this.addMedia },
			{ allow: 'admin.manageMedia',
								  handler: this.removeMedia });
		minirouter.addRoute('media', '\/media(?:\/([^\/]+))?(?:\/(.+))?', rah.serve);

		rah = new RestApiHelper(coonti, false, { loggedIn: true, handler: this.changePassword }, false, false);
		minirouter.addRoute('password', '/users/user/password(?:\/(.+))?', rah.serve);

		rah = new RestApiHelper(coonti,
			{ loggedIn: true,
								  handler: this.getUser },
			{ allow: 'admin.manageUsers',
								  handler: this.updateUser },
			{ allow: 'admin.manageUsers',
								  handler: this.addUser },
			{ allow: 'admin.manageUsers',
								  handler: this.removeUser });
		minirouter.addRoute('user', '\/users\/user(?:\/(.+))?', rah.serve);

		rah = new RestApiHelper(coonti,
			{ allow: 'admin.manageGroups',
								  handler: this.getGroup },
			{ allow: 'admin.manageGroups',
								  handler: this.updateGroup },
			{ allow: 'admin.manageGroups',
								  handler: this.addGroup },
			{ allow: 'admin.manageGroups',
								  handler: this.removeGroup });
		minirouter.addRoute('group', '\/users\/group(?:\/(.+))?', rah.serve);

		rah = new RestApiHelper(coonti,
			{ allow: 'admin.manageRoles',
								  handler: this.getRole },
			{ allow: 'admin.manageRoles',
								  handler: this.updateRole },
			{ allow: 'admin.manageRoles',
								  handler: this.addRole },
			{ allow: 'admin.manageRoles',
								  handler: this.removeRole });
		minirouter.addRoute('role', '\/users\/role(?:\/(.+))?', rah.serve);

		minirouter.addRoute('right', '/users/right', this.getRights);

		rah = new RestApiHelper(coonti,
			{ allow: 'admin.manageModules',
								  handler: this.listModule },
			{ allow: 'admin.manageModules',
								  handler: this.manageModule },
								false, false);
		minirouter.addRoute('module', '\/modules(?:\/(.+))?', rah.serve);

		rah = new RestApiHelper(coonti,
			{ allow: 'admin.manageThemes',
								  handler: this.getTheme },
			{ allow: 'admin.manageThemes',
								  handler: this.manageTheme },
								false, false);
		minirouter.addRoute('theme', '\/themes(?:\/(.+))?', rah.serve);

		self._setDefaults();

		initialised = true;

		yield coonti.fireEvent('Coonti-Admin-Init');
		logger.info('CoontiAdmin - Initialised.');

		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() { // eslint-disable-line require-yield
		return true;
	};

	/**
	 * Starts the module and registers file based content handler.
	 *
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Admin-Starting When the method is called.
	 * @fires Coonti-Admin-Start When the method is finishing.
	 */
	this.start = function*() {
		if(!initialised) {
			return false;
		}

		yield coonti.fireEvent('Coonti-Admin-Starting');

		var router = coonti.getManager('router');
		if(!router.addStateHandler('adminData', this.handleAdmin)) {
			throw new CoontiException(CoontiException.FATAL, 4101, 'Cannot add admin data state handler.');
		}
		if(!router.addStateHandler('adminApi', this.handleAdminApi)) {
			throw new CoontiException(CoontiException.FATAL, 4101, 'Cannot add admin API state handler.');
		}
		if(!router.addStateHandler('adminTemplateOrJson', this.handleAdminTOJ)) {
			throw new CoontiException(CoontiException.FATAL, 4101, 'Cannot add admin template/JSON state handler.');
		}

		try {
			router.addExecutionPath('admin/api', adminJsonPath);
			router.addExecutionPath('admin', adminPath);
		}
		catch(e) {
			logger.error('CoontiAdmin - Could not add admin execution paths due to an exception.', e);
			return false;
		}

		if(!coonti.addManager('admin', adminManager)) {
			logger.error('CoontiAdmin - Could not add itself as a manager.');
			return false;
		}

		yield coonti.fireEvent('Coonti-Admin-Start');
		logger.info('CoontiAdmin - Started.');

		return true;
	};

	/**
	 * Stops the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Admin-Stopping When the method is called.
	 * @fires Coonti-Admin-Stop When the method is finishing.
	 */
	this.stop = function*() {
		yield coonti.fireEvent('Coonti-Admin-Stopping');

		var router = coonti.getManager('router');
		router.removeExecutionPath('admin/api');
		router.removeExecutionPath('admin');
		router.removeStateHandler('adminData');
		router.removeStateHandler('adminTemplateOrJson');

		coonti.removeManager('admin');

		yield coonti.fireEvent('Coonti-Admin-Stop');
		logger.info('CoontiAdmin - Stopped.');
		return true;
	};

	/**
	 * Removes the module.
	 *
	 * @return {boolean} True on success, false on failure.
	 */
	this.remove = function*() { // eslint-disable-line require-yield
		return true;
	};

	/**
	 * Provides Coonti administration menu.
	 *
	 * @return {Object} The Coonti menu.
	 */
	this.getCoontiMenu = function*() {
		var user = yield userManager.getCurrentUser(this);
		if(!user) {
			this.status = (401);
			return;
		}

		var mn = yield self.stripArrayWithAccessRights(user, self.menu);
		this.coonti.setItem('response', mn);
	};

	/**
	 * Provides Coonti administration routes for Angular.
	 */
	this.getCoontiRoutes = function*() {
		var user = yield userManager.getCurrentUser(this);
		if(!user) {
			this.status = (401);
			return;
		}

		var routes = yield self.stripArrayWithAccessRights(user, self.routes);
		this.coonti.setItem('response', routes);
	};

	/**
	 * Provides Coonti administration assets for Angular.
	 */
	this.getCoontiAssets = function*() { // eslint-disable-line require-yield
		const ret = [];

		const modulePath = moduleManager.getModuleAssetPath();
		if(!!modulePath) {
			const assets = moduleManager.getAllModuleAssets();
			const assetsKeys = Object.keys(assets);
			for(let i = 0; i < assetsKeys.length; i++) {
				const path = '/' + assetsKeys[i] + '/';
				const innerKeys = Object.keys(assets[assetsKeys[i]]);
				for(let j = 0; j < innerKeys.length; j++) {
					ret.push(modulePath + path + innerKeys[j]);
				}
			}
		}

		this.coonti.setItem('response', ret);
	};

	/**
	 * Provides Coonti form elements for Angular.
	 */
	this.getCoontiFormElements = function*() { // eslint-disable-line require-yield
		var ret = formManager.getFormElements();

		this.coonti.setItem('response', ret);
	};

	/**
	 * Removes all items of the given array that have 'allow' key set and the user does not have required credentials.
	 *
	 * @param {User} user - The user object.
	 * @param {Array} arr - The array to be stripped.
	 * @return {Array} The stripped array.
	 */
	this.stripArrayWithAccessRights = function*(user, arr) {
		if(!user || !user) {
			return [];
		}

		var i = arr.length;
		while(i--) {
			var add = true;
			if(arr[i]['allow']) {
				add = false;
				if(typeof (arr[i]['allow']) == 'string') {
					add = yield user.isAllowed(arr[i]['allow']);
				}
				else {
					for(let j = 0; j < arr[i]['allow'].length; j++) {
						var ret = yield user.isAllowed(arr[i]['allow'][j]);
						if(ret) {
							add = true;
							break;
						}
					}
				}
				if(!add) {
					arr.splice(i, 1);
				}
			}

			// ##TODO## Add deny
		}
		return arr;
	};

	/**
	 * Provides Angular templates to the admin user interface.
	 *
	 * @param {String} name - The name of the template.
	 */
	this.getTemplate = function*(name) {
		if(!name) {
			return;
		}

		var tmpl = yield angularTemplates.getFileContents(name);
		if(!!tmpl) {
			this.coonti.setItem('response', tmpl);
			this.coonti.setItem('responseType', 'text/html');
		}
	};

	/**
	 * Handles content. Besides parameters in URL, handles the following query string parameters: sort - The field used in sorting, start - The starting point of the listing, len - The length of the listing, type - The ContentType that should be shown. All are optional.
	 *
	 * @param {String=} contentId - The id of the content to be fetched. Optional.
	 */
	this.getContent = function*(contentId) {
		if(!!contentId) {
			var ch = contentManager.getContentHandler();
			var ret = yield ch.getContentById(contentId);
			if(ret) {
				this.coonti.setItem('response', ret);
			}
			return;
		}

		var ret = getQueryParams(this.query);

		var ch = contentManager.getContentHandler();
		var cnt = yield ch.listContent({}, { fields: { contentType: 1, path: 1, 'content.title': 1, mtime: 1 } }, ret.pagination);
		ret.items = cnt;

		this.coonti.setItem('response', ret);
	};

	/**
	 * Updates content from Angular.
	 */
	this.updateContent = function*() {
		// ##TODO## Need to check content validity

		if(this.request['fields'] && this.request.fields['_id']) {
			var content = this.request.fields;
			yield contentManager.updateContent(content);
			var ch = contentManager.getContentHandler();
			var cnt = yield ch.getContentById(this.request.fields['_id']);
			this.coonti.setItem('response', cnt);
			return;
		}

		// ##TODO## Send an error code instead
		this.coonti.setItem('response', {});
	};

	/**
	 * Adds content from Angular.
	 */
	this.addContent = function*() {
		// ##TODO## Need to check rights + content validity

		if(this.request['fields']) {
			var content = this.request.fields;
			var ct = content['contentType'];
			yield contentManager.addContent(ct, content);
		}
		this.coonti.setItem('response', {});
	};

	/**
	 * Removes the specified content item.
	 *
	 * @param {String} id - The id of the content item.
	 */
	this.removeContent = function*(id) {
		this.coonti.setItem('response', {});
		if(!!id) {
			var res = yield contentManager.removeContent(id);
			if(!res) {
				this.status = (404);
			}
			return;
		}
		this.status = (404);
	};

	/**
	 * Lists content types or shows one content type.
	 *
	 * @param {String=} name - The content type name. Optional.
	 */
	this.getContentType = function*(name) { // eslint-disable-line require-yield
		if(!name) {
			name = false;
		}

		var res = false;
		if(!!name) {
			res = contentManager.getContentType(name);
		}
		if(res === false) {
			var tmp = contentManager.listContentTypes();
			tmp = _.pluck(tmp, 'contentType');
			res = { contentTypes: [] };
			_.each(tmp, function(t) {
				res.contentTypes.push(_.pick(t, 'name', 'displayName', 'description'));
			});
		}

		this.coonti.setItem('response', res);
	};

	/**
	 * Updates a content type.
	 *
	 * @param {String} name - The content type name.
	 */
	this.updateContentType = function*(name) {
		if(this.request['fields'] && this.request['fields']['contentType']) {
			var ct = this.request.fields.contentType;
			var nm = ct['name'];
			yield contentManager.updateContentType(nm, ct);
		}
		this.coonti.setItem('response', {});
	};

	/**
	 * Adds a new content type.
	 */
	this.addContentType = function*() {
		if(this.request['fields'] && this.request['fields']['contentType']) {
			var ct = this.request.fields.contentType;
			var nm = ct['name'];
			yield contentManager.addContentType(nm, ct);
		}
		this.coonti.setItem('response', {});
	};

	/**
	 * Removes a content type.
	 *
	 * @param {String} name - The content type name.
	 */
	this.removeContentType = function*(name) {
		this.coonti.setItem('response', {});
		if(!!name) {
			var res = yield contentManager.removeContentType(name);
			if(!res) {
				this.status = (404);
			}
			return;
		}
		this.status = (404);
	};

	/**
	 * Fetches media files. Besides parameters in URL, handles the following query string parameters: sort - The field used in sorting, start - The starting point of the listing, and len - The length of the listing. All are optional.
	 *
	 * @param {String=} dir - The name of the directory. Optional.
	 */
	this.getMedia = function*(dir) {
		if(!dir) {
			dir = mediaManager.getDefaultDirectory();
		}

		var ret = getQueryParams(this.query);
		ret.path = mediaManager.getWebPath();
		ret.dir = dir;

		var dirs = mediaManager.getMediaDirectoriesByType('content');
		ret.directories = dirs;

		var files = yield mediaManager.getMediaFiles(dir, ret.pagination);
		ret.items = files;
		this.coonti.setItem('response', ret);
	};

	/**
	 * Updates a media file from Angular.
	 */
	this.updateMedia = function*() {
		// ##TODO## Need to check rights + media validity

		if(this.request['fields']) {
			var dir = this.request.fields['dir'];
			var file = this.request.fields['file'];
			var newDir = this.request.fields['newDir'];
			var newFile = this.request.fields['newFile'];

			if(dir && file && newDir && newFile) {
				if(dir == newDir && file == newFile) {
					this.coonti.setItem('response', { dir: dir, file: file });
					return;
				}

				var newFile = yield mediaManager.moveFile(dir, file, newDir, newFile);
				if(newFile) {
					this.coonti.setItem('response', { dir: newDir, file: newFile });
					return;
				}
			}
		}
		this.status = (400);
		this.coonti.setItem('response', {});
	};

	/**
	 * Adds a media file from Angular.
	 *
	 * @param {String=} dir - The name of the directory. Optional.
	 */
	this.addMedia = function*(dir) {
		// ##TODO## Need to check media validity?

		if(this.request['files']) {
			if(!dir) {
				dir = mediaManager.getDefaultDirectory();
			}
			var newFile = yield mediaManager.moveFileIntoDirectory(this.request.files[0].path, dir, this.request.files[0].name);
			if(newFile) {
				this.coonti.setItem('response', { dir: dir, file: newFile });
				return;
			}
		}
		this.status = (400);
		this.coonti.setItem('response', {});
	};

	/**
	 * Removes the specified media file.
	 *
	 * @param {String} dir - The name of the media directory
	 * @param {String} name - The name of the media file.
	 */
	this.removeMedia = function*(dir, name) {
		this.coonti.setItem('response', {});
		if(!!dir && !!name) {
			var res = yield mediaManager.removeFile(dir, name);
			if(!res) {
				this.status = (404);
			}
			return;
		}
		this.status = (404);
	};

	/**
	 * Lists users or shows one user.
	 *
	 * @param {String=} id - The user id. Optional.
	 */
	this.getUser = function*(id) {
		var currentUser = yield userManager.getCurrentUser(this);
		if(!!id) {
			if(id == '0') {
				var userJson = currentUser.exportData();
				delete userJson['password'];
				this.coonti.setItem('response', userJson);
				return;
			}

			if(!currentUser.isAllowed('admin.manageUsers')) {
				this.status = (403);
				return;
			}

			var user = yield userManager.getUserById(id);
			if(user) {
				var userJson = user.exportData();
				delete userJson['password'];
				this.coonti.setItem('response', userJson);
			}
			else {
				this.status = (404);
			}
			return;
		}

		if(!currentUser.isAllowed('admin.manageUsers')) {
			this.status = (403);
			return;
		}

		var ret = getQueryParams(this.query);
		var users = yield userManager.getUsers({}, { fields: { account: 1, 'userData.email': 1, 'userData.name': 1 } });

		ret.users = users;
		this.coonti.setItem('response', ret);
	};

	/**
	 * Updates an user.
	 */
	this.updateUser = function*() {
		if(this.request.fields['_id']) {
			var fields = this.request.fields;
			if(!fields['_id']) {
				this.status = (404);
				return;
			}

			var ret = yield userManager.updateUser(fields['_id'], fields['userData'], fields['allowed'], fields['denied'], fields['roles'], fields['groups']);
			if(!ret) {
				this.status = (404);
				return;
			}
			this.coonti.setItem('response', {});
			return;
		}
		this.status = (404);
	};

	/**
	 * Adds a new user.
	 */
	this.addUser = function*() {
		if(this.request['fields']) {
			var fields = this.request.fields;
			if(!fields['account']) {
				this.status = (400);
				return;
			}

			// ##TODO## Handle initial password somehow
			// ##TODO## Check existence of the user and complain to the admin UI
			var ret = yield userManager.addUser(fields['account'], false, fields['userData'], fields['allowed'], fields['denied'], fields['roles'], fields['groups']);
			if(!ret) {
				this.status = (500);
				return;
			}
			this.coonti.setItem('response', {});
			return;
		}
		this.status = (404);
	};

	/**
	 * Removes an user.
	 *
	 * @param {String} id - The user id.
	 */
	this.removeUser = function*(id) {
		this.coonti.setItem('response', {});
		if(!!id) {
			var res = yield userManager.removeUserById(id);
			if(!res) {
				this.status = (404);
			}
			return;
		}
		this.status = (404);
	};

	/**
	 * Changes user password.
	 *
	 * @param {String=} id - The user id. Optional.
	 */
	this.changePassword = function*(id) {
		if(!this.request['fields']) {
			this.status = (404);
			return;
		}
		var password = this.request.fields['password'];
		if(!password) {
			password = false;
		}

		this.coonti.setItem('response', {});

		var user = yield userManager.getCurrentUser(this);
		if(!!id || id != user.getId()) {
			// Let's change someone else's password
			if(!user.isAllowed('admin.manageUsers')) {
				this.status = (403);
				return;
			}

			var targetUser = yield userManager.getUserById(id);

			if(!targetUser) {
				this.status = (404);
				return;
			}

			targetUser.setPassword(password);
			yield userManager.storeUser(targetUser);
			this.coonti.setItem('response', { success: 1 });
			return;
		}

		var currentPassword = this.request.fields['currentPassword'];
		if(!currentPassword) {
			this.status = (401);
			return;
		}

		if(user.checkPassword(currentPassword)) {
			user.setPassword(password);
			yield userManager.store(targetUser);
			this.coonti.setItem('response', { success: 1 });
		}
		else {
			this.status = (401);
		}
	};

	/**
	 * Lists groups or shows one group.
	 *
	 * @param {String=} id - The group id. Optional.
	 */
	this.getGroup = function*(id) {
		if(!!id) {
			var group = yield userManager.getGroupById(id);
			if(group) {
				this.coonti.setItem('response', group.exportData());
			}
			else {
				this.status = (404);
			}
			return;
		}

		var ret = getQueryParams(this.query);
		var groups = yield userManager.getGroups({}, { fields: { name: 1, description: 1 } });

		ret.groups = groups;
		this.coonti.setItem('response', ret);
	};

	/**
	 * Updates a group.
	 */
	this.updateGroup = function*() {
		if(this.request.fields['_id']) {
			var fields = this.request.fields;
			if(!fields['name']) {
				this.status = (404);
				return;
			}

			var ret = yield userManager.updateGroup(fields['_id'], fields['description'], fields['allowed'], fields['denied']);
			if(!ret) {
				this.status = (404);
				return;
			}
			this.coonti.setItem('response', {});
			return;
		}
		this.status = (404);
	};

	/**
	 * Adds a new group.
	 */
	this.addGroup = function*() {
		if(this.request['fields']) {
			var fields = this.request.fields;
			if(!fields['name']) {
				this.status = (400);
				return;
			}

			// ##TODO## Check existence of the group first
			var ret = yield userManager.addGroup(fields['name'], fields['description'], fields['allowed'], fields['denied']);
			if(!ret) {
				this.status = (500);
				return;
			}
			this.coonti.setItem('response', {});
			return;
		}
		this.status = (404);
	};

	/**
	 * Removes a group.
	 *
	 * @param {String} id - The group id.
	 */
	this.removeGroup = function*(id) {
		this.coonti.setItem('response', {});
		if(!!id) {
			var res = yield userManager.removeGroupById(id);
			if(!res) {
				this.status = (404);
			}
			return;
		}
		this.status = (404);
	};

	/**
	 * Lists roles or shows one roles.
	 *
	 * @param {String=} id - The role id. Optional.
	 */
	this.getRole = function*(id) {
		if(!!id) {
			var role = yield userManager.getRoleById(id);
			if(role) {
				this.coonti.setItem('response', role.exportData());
			}
			else {
				this.status = (404);
			}
			return;
		}

		var ret = getQueryParams(this.query);
		var roles = yield userManager.getRoles({}, { fields: { name: 1, description: 1 } });

		ret.roles = roles;
		this.coonti.setItem('response', ret);
	};

	/**
	 * Updates a role.
	 *
	 * @param {String} name - The role name.
	 */
	this.updateRole = function*() {
		if(this.request.fields['_id']) {
			var fields = this.request.fields;
			if(!fields['name']) {
				this.status = (404);
				return;
			}

			var ret = yield userManager.updateRole(fields['_id'], fields['description'], fields['allowed'], fields['denied']);
			if(!ret) {
				this.status = (404);
				return;
			}
			this.coonti.setItem('response', {});
			return;
		}
		this.status = (404);
	};

	/**
	 * Adds a new role.
	 */
	this.addRole = function*() {
		if(this.request['fields']) {
			var fields = this.request.fields;
			if(!fields['name']) {
				this.status = (400);
				return;
			}

			// ##TODO## Check existence of the role first
			var ret = yield userManager.addRole(fields['name'], fields['description'], fields['allowed'], fields['denied']);
			if(!ret) {
				this.status = (500);
				return;
			}
			this.coonti.setItem('response', {});
			return;
		}
		this.status = (404);
	};

	/**
	 * Removes a role.
	 *
	 * @param {String} id - The role id.
	 */
	this.removeRole = function*(id) {
		this.coonti.setItem('response', {});
		if(!!id) {
			var res = yield userManager.removeRoleById(id);
			if(!res) {
				this.status = (404);
			}
			return;
		}
		this.status = (404);
	};

	/**
	 * Lists the available rights.
	 */
	this.getRights = function*() { // eslint-disable-line require-yield
		this.coonti.setItem('response', userManager.getRights());
	};

	/**
	 * Lists the modules in the system.
	 */
	this.listModule = function*() { // eslint-disable-line require-yield
		var ret = moduleManager.listModules();
		this.coonti.setItem('response', ret);
	};

	/**
	 * Manages the modules in the system. The action is given as a query parameter (init, start, stop).
	 *
	 * @param {String} name - The name of the module.
	 */
	this.manageModule = function*(name) {
		this.coonti.setItem('response', {});
		if(!name || !this.request['query']) {
			this.status = (404);
			return;
		}

		var md = moduleManager.getModule(name);
		if(!md) {
			this.status = (404);
			return;
		}

		var query = this.request.query;
		var res = false;
		if(query['init']) {
			res = yield moduleManager.initialiseModule(name);
		}
		else if(query['start']) {
			res = yield moduleManager.startModule(name);
		}
		else if(query['stop']) {
			res = yield moduleManager.stopModule(name);
		}

		if(!res) {
			this.status = (500);
		}
	};

	/**
	 * Fetches all or single theme.
	 *
	 * @param {String=} name - The name of the theme, optional.
	 */
	this.getTheme = function*(name) { // eslint-disable-line require-yield
		if(!!name) {
			var ret = templateManager.getTheme(name);
			if(!ret) {
				this.status = (404);
				return;
			}
			this.coonti.setItem('response', ret);
			return;
		}

		ret = templateManager.getThemes();
		this.coonti.setItem('response', tools.stringifyExclude(ret, ['staticCollections', 'routes', 'routesRegexp']));
	};

	/**
	 * Activates or deactivates a given theme, based on query parameter (activate, deactivate).
	 *
	 * @param {String} name - The name of the theme.
	 */
	this.manageTheme = function*(name) {
		this.coonti.setItem('response', {});
		if(!name || !this.request['query']) {
			this.status = (404);
			return;
		}

		var th = templateManager.getTheme(name);
		if(!th) {
			this.status = (404);
			return;
		}

		var query = this.request.query;
		var res = false;
		if(query['activate']) {
			res = yield templateManager.activateTheme(name);
		}
		else if(query['deactivate']) {
			res = yield templateManager.deactivateTheme(name);
		}

		if(!res) {
			this.status = (500);
		}
	};

	/**
	 * Handles Coonti administration
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleAdmin = function*(csm, config, next) {
		if(!adminTheme) {
			adminTheme = templateManager.getRenderTheme(this);
			angularTemplates = templateManager.getStaticCollection(adminTheme, 'angular');
		}

		var route = this.coonti.getItem('route');
		if(!route) {
			route = '/';
		}

		if(route == '/') {
			this.coonti.setItem('content', {
				content: {
					title: 'Coonti Admin',
				},
				contentType: 'Admin'
			});
			yield next;
			return;
		}
		if(route == '/login') {
			var formSubmitted = this.coonti.getForm('admin/login');
			if(formSubmitted && formSubmitted.isOk()) {
				var account = formSubmitted.getValue('account');
				var password = formSubmitted.getValue('password');
				if(yield userManager.login(account, password, this)) {
					this.redirect('/admin');
					return;
				}

				formSubmitted.addMessage('Invalid user account or password. Please try again.');
			}

			this.coonti.setItem('content', {
				content: {
					title: 'Coonti Admin',
					form: 'admin/login'
				},
				contentType: 'Admin'
			});
			yield next;
			return;
		}
		if(route == '/logout') {
			yield userManager.logout(this);
			this.coonti.setItem('content', {
				content: {
					title: 'Logged Out',
					content: 'You have logged out.'
				},
				contentType: 'Admin'
			});
			yield next;
			return;
		}

		yield next;
	};

	/**
	 * Handles Coonti administration API.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleAdminApi = function*(csm, config, next) {
		var route = this.coonti.getItem('route');
		if(!route) {
			route = '/';
		}

		var func = minirouter.route(route);
		if(func) {
			yield func(this);
		}
		else {
			this.status = (404);
			return;
		}

		yield next;
	};

	/**
	 * Shows the admin data either through a template or as JSON. If there is item 'content', it will be rendered. Otherwise, item 'response' will be send out as JSON.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleAdminTOJ = function*(csm, config, next) {
		var content = this.coonti.getItem('content');
		if(content) {
			var ctm = coonti.getManager('template');
			yield ctm.render(this);
			yield next;
			return;
		}

		var response = this.coonti.getItem('response');
		if(response) {
			var responseType = this.coonti.getItem('responseType');
			if(!!responseType) {
				this.body = response;
				this.response.type = responseType;
			}
			else {
				this.body = response;
			}
			yield next;
			return;
		}

		logger.warn('CoontiAdmin - No content or response for a request.');
		yield next;
	};

	/**
	 * Fetches the typical query parameters into a hashmap and uses default values for missing and/or invalid values.
	 *
	 * @param {Object} query - The Koa query Object.
	 * @return {Object} The values in a hashmap.
	 */
	var getQueryParams = function(query) {
		var ret = {
			pagination: {}
		};

		if(query['start']) {
			ret.pagination.start = parseInt(query['start'], 10);
			if(isNaN(ret.pagination.start) || ret.pagination.start < 0) {
				ret.pagination.start = defaultQueryValues['start'];
			}
		}
		else {
			ret.pagination.start = defaultQueryValues['start'];
		}

		if(query['len']) {
			ret.pagination.len = parseInt(query['len'], 10);
			if(isNaN(ret.pagination.len) || ret.pagination.len < 0) {
				ret.pagination.len = defaultQueryValues['len'];
			}
		}
		else {
			ret.pagination.len = defaultQueryValues['len'];
		}

		if(query['sort']) {
			ret.pagination.sort = query['sort'];
			if(!ret.pagination.sort) {
				ret.pagination.sort = defaultQueryValues['sort'];
			}
		}
		else {
			ret.pagination.sort = defaultQueryValues['sort'];
		}

		if(query['filter']) {
			ret.pagination.filter = query['filter'];
			if(!ret.pagination.filter) {
				ret.pagination.filter = defaultQueryValues['filter'];
			}
		}
		else {
			ret.pagination.filter = defaultQueryValues['filter'];
		}

		if(query['search']) {
			ret.pagination.search = query['search'];
			if(!ret.pagination.search) {
				ret.pagination.search = defaultQueryValues['search'];
			}
		}
		else {
			ret.pagination.search = defaultQueryValues['search'];
		}
		return ret;
	};

	/**
	 * @class
	 * @classdesc Admin manager containing the functions other modules can use from this module.
	 */
	var adminManager = {

		/**
		 * Adds a new item to the admin menu.
		 *
		 * @param {String} name - The name of the item, used as a key - do not use spaces.
		 * @param {String} title - The user visible title.
		 * @param {String} url - The url of the item.
		 * @param {String|Array|boolean} allow - The rights that are needed to see the item. If the item is available to everyone, use false.
		 * @param {integer} depth - The depth of the item, starting from 0.
		 * @param {String} after - The name of the menu item that should precede the new item. Leave empty or false to add as the last item.
		 * @return {boolean} True on success, false on failure.
		 */
		addMenuItem: function(name, title, url, allow, depth, after) {
			if(!name || !title || !url) {
				return false;
			}
			if(depth <= 0) {
				depth = 0;
			}
			var menuItem = {
				name: name,
				title: title,
				url: url,
				depth: depth
			};
			if(allow) {
				menuItem.allow = allow;
			}

			if(after && self.menu.length > 0) {
				for(var i = 0; i < self.menu.length; i++) {
					if(self.menu[i].name == after) {
						self.menu.splice(i + 1, 0, menuItem);
						return true;
					}
				}
			}

			self.menu.push(menuItem);
			return true;
		},

		/**
		 * Removes an item from the admin menu.
		 *
		 * @param {String} name - The name of the item, used as a key - do not use spaces.
		 * @return {boolean} True on success, false on failure.
		 */
		removeMenuItem: function(name) {
			if(!name) {
				return false;
			}

			for(var i = 0; i < self.menu.length; i++) {
				if(self.menu[i].name == name) {
					self.menu.splice(i, 1);
				}
			}
			return true;
		},

		/**
		 * Adds a new Angular route to the admin system.
		 *
		 * @param {String} module - The name of the module. Used as the key together with the route.
		 * @param {String} route - The Angular route. Used as the key together with the module name.
		 * @param {String} templateUrl - The url of the template.
		 * @param {String} controller - The name of the Angular controller.
		 * @param {String|Array|boolean} allow - The rights that are needed to use the route. If the route is available to everyone, use false.
		 * @return {boolean} True on success, false on failure.
		 */
		addRoute: function(module, route, templateUrl, controller, allow) {
			if(!module || !templateUrl || !controller) {
				return false;
			}
			if(!route) {
				route = '';
			}
			else if(!route.startsWith('/')) {
				route = '/' + route;
			}
			var routeItem = {
				route: '/module/' + module + route,
				template: templateUrl,
				controller: controller
			};
			if(allow) {
				routeItem.allow = allow;
			}

			self.routes.push(routeItem);
			return true;
		},

		/**
		 * Removes an Angular route from the admin system. Currently, routes are not removed from existing Angular clients.
		 *
		 * @param {String} module - The name of the module.
		 * @param {String} route - The name of the route to be removed.
		 * @return {boolean} True on success, false on failure.
		 */
		removeRoute: function(module, route) {
			if(!module) {
				return false;
			}
			if(!route) {
				route = '';
			}
			else if(!route.startsWith('/')) {
				route = '/' + route;
			}

			var route = '/module/' + module + route;
			for(var i = 0; i < self.routes.length; i++) {
				if(self.routes[i].route == route) {
					self.routes.splice(i, 1);
					return true;
				}
			}
			return true;
		},

		/**
		 * Adds a new admin route. The route will be in form of /api/module/[ModuleName]/[RegExp]
		 *
		 * @param {String} module - The name of the module.
		 * @param {String} name - The name of the route, must be unique for the module.
		 * @param {String} re - The regexp string to match URLs.
		 * @param {Function} fn - The function* that will be called, if the route is matched.
		 * @return {boolean} True on success, false on failure.
		 */
		addAdminRoute: function(module, name, re, fn) {
			if(!module || !name) {
				return false;
			}
			var nm = module + ':' + name;
			var route = '\/module\/' + module + '\/' + re;
			return minirouter.addRoute(nm, route, fn);
		},

		/**
		 * Removes an admin route.
		 *
		 * @param {String} module - The name of the module.
		 * @param {String} name - The name of the route, must be unique.
		 * @return {boolean} True on success, false on failure.
		 */
		removeAdminRoute: function(module, name) {
			if(!module || !name) {
				return false;
			}
			var nm = module + ':' + name;
			return minirouter.removeRoute(nm);
		}
	};

	/**
	 * Sets the default values for menu, routes, and assets. Called when the module is initialised and exists to keep the code tidier in initialisation.
	 *
	 * @private
	 */
	this._setDefaults = function() {
		self.menu = [
			{
				allow: 'admin.manageContent',
				name: 'content',
				title: 'Content',
				url: '#/content',
				depth: 0
			},
			{
				allow: ['admin.manageContent', 'admin.addContent'],
				name: 'content-add',
				title: 'Add Content',
				url: '#/content/add',
				depth: 1
			},
			{
				allow: 'admin.manageContentTypes',
				name: 'content-manage-types',
				title: 'Manage Content Types',
				url: '#/contentType/',
				depth: 1
			},
			{
				allow: 'admin.manageMedia',
				name: 'media',
				title: 'Media',
				url: '#/media',
				depth: 0
			},
			{
				allow: 'admin.manageThemes',
				name: 'themes',
				title: 'Themes',
				url: '#/themes',
				depth: 0
			},
			{
				allow: 'admin.manageUsers',
				name: 'users',
				title: 'Accounts',
				url: '#/users/user',
				depth: 0
			},
			{
				allow: 'admin.manageGroups',
				name: 'users-groups',
				title: 'Groups',
				url: '#/users/group',
				depth: 1
			},
			{
				allow: 'admin.manageRoles',
				name: 'users-roles',
				title: 'Roles',
				url: '#/users/role',
				depth: 1
			},
			{
				name: 'users-rights',
				title: 'Rights',
				url: '#/users/right',
				depth: 1
			},
			{
				allow: 'admin.manageModules',
				name: 'modules',
				title: 'Modules',
				url: '#/modules',
				depth: 0
			}
		];

		self.routes = [
			{
				route: '/',
				redirectTo: '/content'
			},
			{
				allow: 'admin.manageContent',
				route: '/content',
				template: '/angular/stem/content-list.html',
				controller: 'ContentCtrl'
			},
			{
				allow: ['admin.manageContent', 'admin.addContent'],
				route: '/content/add/:contentType',
				template: '/angular/stem/content-add.html',
				controller: 'ContentCtrl'
			},
			{
				allow: ['admin.manageContent', 'admin.addContent'],
				route: '/content/add',
				template: '/angular/stem/content-add.html',
				controller: 'ContentCtrl'
			},
			{
				allow: 'admin.manageContent',
				route: '/content/duplicate/:_id',
				template: '/angular/stem/content-add.html',
				controller: 'ContentCtrl'
			},
			{
				allow: 'admin.manageContent',
				route: '/content/edit/:_id',
				template: '/angular/stem/content-edit.html',
				controller: 'ContentCtrl'
			},
			{
				allow: 'admin.manageContentTypes',
				route: '/contentType',
				template: '/angular/stem/content-type.html',
				controller: 'ContentTypeCtrl'
			},
			{
				allow: 'admin.manageContentTypes',
				route: '/contentType/edit/:name',
				template: '/angular/stem/content-type-edit.html',
				controller: 'ContentTypeCtrl'
			},
			{
				allow: 'admin.manageContentTypes',
				route: '/contentType/add',
				template: '/angular/stem/content-type-edit.html',
				controller: 'ContentTypeCtrl'
			},
			{
				allow: 'admin.manageContentTypes',
				route: '/contentType/view/:name',
				template: '/angular/stem/content-type-view.html',
				controller: 'ContentTypeCtrl'
			},
			{
				allow: 'admin.manageMedia',
				route: '/media/:dir?',
				template: '/angular/stem/media-list.html',
				controller: 'MediaCtrl'
			},
			{
				allow: ['admin.manageMedia', 'admin.addMedia'],
				route: '/media/add/:dir',
				template: '/angular/stem/media-add.html',
				controller: 'MediaCtrl'
			},
			{
				allow: 'admin.manageThemes',
				route: '/themes',
				template: '/angular/stem/themes-list.html',
				controller: 'ThemesCtrl'
			},
			{
				allow: 'admin.manageThemes',
				route: '/themes/config/:name',
				template: '/angular/stem/themes-edit.html',
				controller: 'ThemesCtrl'
			},
			{
				allow: 'admin.manageUsers',
				route: '/users/user',
				template: '/angular/stem/users-list.html',
				controller: 'UsersCtrl'
			},
			{
				allow: 'admin.manageUsers',
				route: '/users/user/view/:_id',
				template: '/angular/stem/users-view.html',
				controller: 'UsersCtrl'
			},
			{
				route: '/profile',
				template: '/angular/stem/users-view.html',
				controller: 'UsersCtrl'
			},
			{
				allow: 'admin.manageUsers',
				route: '/users/user/edit/:_id',
				template: '/angular/stem/users-edit.html',
				controller: 'UsersCtrl'
			},
			{
				allow: 'admin.manageUsers',
				route: '/users/user/add',
				template: '/angular/stem/users-edit.html',
				controller: 'UsersCtrl'
			},
			{
				route: '/users/user/password',
				template: '/angular/stem/users-password.html',
				controller: 'UsersPasswordCtrl'
			},
			{
				allow: 'admin.manageUsers',
				route: '/users/user/password/:_id',
				template: '/angular/stem/users-password.html',
				controller: 'UsersPasswordCtrl'
			},
			{
				allow: 'admin.manageGroups',
				route: '/users/group',
				template: '/angular/stem/groups-list.html',
				controller: 'UsersGroupsCtrl'
			},
			{
				allow: 'admin.manageGroups',
				route: '/users/group/view/:_id',
				template: '/angular/stem/groups-view.html',
				controller: 'UsersGroupsCtrl'
			},
			{
				allow: 'admin.manageGroups',
				route: '/users/group/edit/:_id',
				template: '/angular/stem/groups-edit.html',
				controller: 'UsersGroupsCtrl'
			},
			{
				allow: 'admin.manageGroups',
				route: '/users/group/add',
				template: '/angular/stem/groups-edit.html',
				controller: 'UsersGroupsCtrl'
			},
			{
				allow: 'admin.manageRoles',
				route: '/users/role',
				template: '/angular/stem/roles-list.html',
				controller: 'UsersRolesCtrl'
			},
			{
				allow: 'admin.manageRoles',
				route: '/users/role/view/:_id',
				template: '/angular/stem/roles-view.html',
				controller: 'UsersRolesCtrl'
			},
			{
				allow: 'admin.manageRoles',
				route: '/users/role/edit/:_id',
				template: '/angular/stem/roles-edit.html',
				controller: 'UsersRolesCtrl'
			},
			{
				allow: 'admin.manageRoles',
				route: '/users/role/add',
				template: '/angular/stem/roles-edit.html',
				controller: 'UsersRolesCtrl'
			},
			{
				route: '/users/right',
				template: '/angular/stem/rights-list.html',
				controller: 'UsersRightsListCtrl'
			},
			{
				allow: 'admin.manageModules',
				route: '/modules',
				template: '/angular/stem/modules-list.html',
				controller: 'ModulesCtrl'
			},
			{
				route: '/error/400',
				template: '/angular/stem/error-400.html',
				controller: 'ErrorCtrl'
			},
			{
				route: '/error/404',
				template: '/angular/stem/error-404.html',
				controller: 'ErrorCtrl'
			},
			{
				route: '/error/500',
				template: '/angular/stem/error-500.html',
				controller: 'ErrorCtrl'
			},
			{
				route: '/error',
				template: '/angular/stem/error.html',
				controller: 'ErrorCtrl'
			}

		];

		self.assets = [];
	};
}

module.exports = CoontiAdmin;
