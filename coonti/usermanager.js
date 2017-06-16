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
var cacheManager = require('cache-manager');
var thunkify = require('thunkify');
var bcrypt = require('bcryptjs');

var coonti;
var userManager;
var storage;

var SESSION_USER = 'coontiUser';

/**
 * Creates a new instance of the User Manager.
 *
 * @class
 * @classdesc User Manager manages user access rights, roles, and groups in Coonti.
 * @param {Coonti} cnti - The Coonti instance owning the manager.
 * @return {CoontiUserManager} The new instance.
 */
function CoontiUserManager(cnti) {
	coonti = cnti;
	userManager = this;

	var usersCollection = 'users'; // ##TODO## Read from config
	var rolesCollection = 'roles'; // ##TODO## Read from config
	var groupsCollection = 'groups'; // ##TODO## Read from config

	var users;
	var roles;
	var groups;
	var rights = {};

	var logger;

	/**
	 * Initialises the UserManager instance. This method is called by Coonti core.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Logging-Init', loggingInitialised);
		logger = coonti.getManager('log').getLogger('coonti-core-usermanager');

		var sm = coonti.getManager('storage');
		storage = sm.getStorageHandler('mongo'); // ##TODO## Read from the configuration

		if(!storage) {
			logger.info('UserManager - Could not find MongoDB storage. Waiting for database subsystem.');
		}

		coonti.addEventListener('Coonti-Module-Start-MongoConnect', this.mongoConnectStarted);
		coonti.addEventListener('Coonti-Module-Stop-MongoConnect', this.mongoConnectStopped);

		users = new UserManagerStorage(usersCollection, 'account', this.importUser);
		roles = new UserManagerStorage(rolesCollection, 'name', this.importRole);
		groups = new UserManagerStorage(groupsCollection, 'name', this.importGroup);

		addSystemRights();
	};

	/**
	 * Initialises the logger.
	 */
	var loggingInitialised = function*() { // eslint-disable-line require-yield
		logger = coonti.getManager('log').getLogger('coonti-core-usermanager');
	};

	/**
	 * Sets the storage when made available.
	 */
	this.mongoConnectStarted = function*() { // eslint-disable-line require-yield
		var sm = coonti.getManager('storage');
		storage = sm.getStorageHandler('mongo'); // ##TODO## Read from the configuration

		if(!storage) {
			logger.warn('UserManager - Could not find MongoDB storage, even if the MongoDB subsystem seems to be running.');
		}
		else {
			logger.info('UserManager - MongoDB storage available.');
		}
	};

	/**
	 * Clears the storage when it becomes unavailable
	 */
	this.mongoConnectStopped = function*() { // eslint-disable-line require-yield
		storage = false;
		logger.info('UserManager - MongoDB storage unavailable.');
	};

	/**
	 * Adds a new user.
	 *
	 * @param {String} account - The user account - must be unique among users.
	 * @param {String} password - The user password - leave empty for disabling user login.
	 * @param {Object} userData - The user fields that are to be stored with the user.
	 * @param {Array} allowed - The allowed rights, optional.
	 * @param {Array} denied - The denied rights, optional.
	 * @param {Array} roles - The roles of the user - given as ids of the role objects, optional.
	 * @param {Array} groups - The groups of the user - given as the ids of the group objects, optional.
	 * @return {User} The new user object, or false if the operation failed.
	 */
	this.addUser = function*(account, password, userData, allowed, denied, roles, groups) {
		if(!!account && storage) {
			userData = userData || {};
			var user = new User(account, userData);

			if(!!password) {
				user.setPassword(password);
			}

			if(allowed && Object.prototype.toString.call(allowed) === '[object Array]') {
				user.addAllowed(allowed);
			}

			if(denied && Object.prototype.toString.call(denied) === '[object Array]') {
				user.addDenied(denied);
			}

			if(roles && Object.prototype.toString.call(roles) === '[object Array]') {
				user.addRole(roles);
			}

			if(groups && Object.prototype.toString.call(groups) === '[object Array]') {
				user.addToGroup(groups);
			}
			var ret = yield users.insertObject(user);
			if(!ret) {
				return false;
			}
			logger.info("UserManager - Added new user '%s'.", account);
			return user;
		}
		return false;
	};

	/**
	 * Updates user data.
	 *
	 * @param {String} id - The user id.
	 * @param {Object} userData - The user fields that are to be stored with the user.
	 * @param {Array} allowed - The allowed rights, optional.
	 * @param {Array} denied - The denied rights, optional.
	 * @param {Array} roles - The roles of the user - given as ids of the role objects, optional.
	 * @param {Array} groups - The groups of the user - given as the ids of the group objects, optional.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateUser = function*(id, userData, allowed, denied, roles, groups) {
		// ##TODO## Replace this function with direct modifications to user object

		if(!id || !storage) {
			return false;
		}

		var user = yield users.getById(id);
		if(!user) {
			return false;
		}

		userData = userData || {};

		user.removeAllParameters();
		user.removeAllAllowed();
		user.removeAllDenied();
		user.removeAllRoles();
		user.removeAllGroups();

		user.setParameters(userData);

		if(allowed && Object.prototype.toString.call(allowed) === '[object Array]') {
			user.addAllowed(allowed);
		}

		if(denied && Object.prototype.toString.call(denied) === '[object Array]') {
			user.addDenied(denied);
		}

		if(roles && Object.prototype.toString.call(roles) === '[object Array]') {
			user.addRole(roles);
		}

		if(groups && Object.prototype.toString.call(groups) === '[object Array]') {
			user.addToGroup(groups);
		}

		var ret = yield users.updateObject(user);
		logger.info("UserManager - Updated user '%s'.", user.account);
		return ret;
	};

	/**
	 * Stores a user to the database.
	 *
	 * @param {User} - The user.
	 * @return {boolean} True on success, false on failure.
	 */
	this.storeUser = function*(user) {
		if(!user) {
			return false;
		}

		var ret = yield users.updateObject(user);
		return ret;
	};

	/**
	 * Fetches a number of users. Do note that this method does not add the fetched users to cache, as it is used typically in user searches and listings.
	 *
	 * @param {Object} keys - The listing criteria.
	 * @param {Object} params - The listing params (fields, sorting, limiting, skipping, etc.).
	 * @return {Array} List of users or an empty array, if there are no matching users.
	 */
	this.getUsers = function*(keys, params) {
		if(!keys) {
			keys = {};
		}
		if(!params) {
			params = {};
		}

		return yield storage.getAllData(usersCollection, keys, params);
	};

	/**
	 * Fetches a user by account.
	 *
	 * @param {String} account - The user account.
	 * @return {User} - The user object or false, if the user is not found.
	 */
	this.getUser = function*(account) {
		return yield users.getByName(account);
	};

	/**
	 * Fetches a user by id.
	 *
	 * @param {String} id - The user id.
	 * @return {Role} The user object or false, if the user is not found.
	 */
	this.getUserById = function*(id) {
		return yield users.getById(id);
	};

	/**
	 * Removes a user by id.
	 *
	 * @param {String} id - The user id.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeUserById = function*(id) {
		// ##TODO## Remove role from users
		return yield users.removeById(id);
	};


	/**
	 * Fetches the current user.
	 *
	 * @param {Context ctx - The Koa context.
	 * @return {User} The current user object or false, if the user is not logged in.
	 */
	this.getCurrentUser = function*(ctx) {
		var userName = ctx.coonti.getFromSession(SESSION_USER);
		if(!!userName) {
			return yield this.getUser(userName);
		}
		return false;
	};

	/**
	 * Fetches the current user account.
	 *
	 * @param {Context ctx - The Koa context.
	 * @return {String} The current user account or false, if the user is not logged in.
	 */
	this.currentUserAccount = function*(ctx) { // eslint-disable-line require-yield
		return ctx.coonti.getFromSession(SESSION_USER);
	};

	/**
	 * Logs a user in.
	 *
	 * @param {String} account - The user account.
	 * @param {String} password - The user password.
	 * @param {Context} ctx - The Koa context.
	 * @return {User} The user object or false, if the user is not found or the password is invalid.
	 */
	this.login = function*(account, password, ctx) {
		if(!account || !password) {
			return false;
		}

		var user = yield users.getByName(account);
		if(!user) {
			return false;
		}

		if(user.checkPassword(password)) {
			ctx.coonti.setInSession(SESSION_USER, account);
			logger.info("UserManager - User '%s' logged in.", account);
			return user;
		}
		return false;
	};

	/**
	 * Logs the current user out.
	 *
	 * @param {Context} ctx - The Koa context.
	 */
	this.logout = function*(ctx) { // eslint-disable-line require-yield
		ctx.coonti.destroySession();
	};

	/**
	 * Checks whether the current user has the given access rights.
	 *
	 * @param {String} accessName - The name of the access.
	 * @param {Context} ctx - The Koa context.
	 * @return {boolean} True, if the access is granted, false otherwise.
	 */
	this.isAllowed = function*(access, ctx) {
		var user = yield this.currentUser(ctx);
		if(!user) {
			return false;
		}

		return yield user.isAllowed(access);
	};

	/**
	 * Adds a new Role.
	 *
	 * @param {String} roleName - The name of the role, must be unique.
	 * @param {String} descr - The role description.
	 * @param {Array} allowed - The allowed rights, optional.
	 * @param {Array} denied - The denied rights, optional.
	 * @return {Role} The Role object or false, if the role could not be created.
	 */
	this.addRole = function*(roleName, descr, allowed, denied) {
		if(!roleName || !storage) {
			return false;
		}

		var role = yield roles.getByName(roleName);
		if(role) {
			return false;
		}

		role = new Role(roleName);
		role.setDescription(descr);

		if(allowed && Object.prototype.toString.call(allowed) === '[object Array]') {
			role.addAllowed(allowed);
		}

		if(denied && Object.prototype.toString.call(denied) === '[object Array]') {
			role.addDenied(denied);
		}

		var ret = yield roles.insertObject(role);
		if(ret) {
			logger.info("UserManager - Added new role '%s'.", roleName);
			return role;
		}
		return false;
	};

	/**
	 * Updates a role.
	 *
	 * @param {String} id - The role id.
	 * @param {String} descr - The role description.
	 * @param {Array} allowed - The allowed rights, optional.
	 * @param {Array} denied - The denied rights, optional.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateRole = function*(id, descr, allowed, denied) {
		if(!id) {
			return false;
		}

		var role = yield roles.getById(id);
		if(!role) {
			return false;
		}

		role.setDescription(descr);

		role.removeAllAllowed();
		role.removeAllDenied();
		if(allowed && Object.prototype.toString.call(allowed) === '[object Array]') {
			role.addAllowed(allowed);
		}

		if(denied && Object.prototype.toString.call(denied) === '[object Array]') {
			role.addDenied(denied);
		}

		var ret = yield roles.updateObject(role);
		logger.info("UserManager - Updated role '%s'.", role.getName());
		return ret;
	};

	/**
	 * Fetches a number of roles. Do note that this method does not add the fetched roles to cache, as it is used typically in role searches and listings.
	 *
	 * @param {Object} keys - The listing criteria.
	 * @param {Object} params - The listing params (fields, sorting, limiting, skipping, etc.).
	 * @return {Array} List of users or an empty array, if there are no matching roles.
	 */
	this.getRoles = function*(keys, params) {
		if(!keys) {
			keys = {};
		}
		if(!params) {
			params = {};
		}

		return yield storage.getAllData(rolesCollection, keys, params);
	};

	/**
	 * Fetches a role by name.
	 *
	 * @param {String} name - The role name.
	 * @return {Role} The role object or false, if the role is not found.
	 */
	this.getRole = function*(name) {
		return yield roles.getByName(name);
	};

	/**
	 * Fetches a role by id.
	 *
	 * @param {String} id - The role id.
	 * @return {Role} The role object or false, if the role is not found.
	 */
	this.getRoleById = function*(id) {
		return yield roles.getById(id);
	};

	/**
	 * Removes a role by id.
	 *
	 * @param {String} id - The role id.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeRoleById = function*(id) {
		// ##TODO## Remove role from users
		return yield roles.removeById(id);
	};

	/**
	 * Adds a new Group.
	 *
	 * @param {String} groupName - The name of the group, must be unique.
	 * @param {String} descr - The description of the group.
	 * @param {Array} allowed - The allowed rights, optional.
	 * @param {Array} denied - The denied rights, optional.
	 * @return {Group} The Group object or false, if the group could not be created.
	 */
	this.addGroup = function*(groupName, descr, allowed, denied) {
		if(!groupName || !storage) {
			return false;
		}

		var grp = yield groups.getByName(groupName);
		if(grp) {
			return false;
		}

		grp = new Group(groupName);
		grp.setDescription(descr);

		if(allowed && Object.prototype.toString.call(allowed) === '[object Array]') {
			grp.addAllowed(allowed);
		}

		if(denied && Object.prototype.toString.call(denied) === '[object Array]') {
			grp.addDenied(denied);
		}

		var ret = yield groups.insertObject(grp);
		if(ret) {
			logger.info("UserManager - Added new group '%s'.", groupName);
			return grp;
		}
		return ret;
	};

	/**
	 * Updates a group.
	 *
	 * @param {String} id - The group id.
	 * @param {String} descr - The group description.
	 * @param {Array} allowed - The allowed rights, optional.
	 * @param {Array} denied - The denied rights, optional.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateGroup = function*(id, descr, allowed, denied) {
		if(!id) {
			return false;
		}

		var group = yield groups.getById(id);
		if(!group) {
			return false;
		}

		group.setDescription(descr);

		group.removeAllAllowed();
		group.removeAllDenied();
		if(allowed && Object.prototype.toString.call(allowed) === '[object Array]') {
			group.addAllowed(allowed);
		}

		if(denied && Object.prototype.toString.call(denied) === '[object Array]') {
			group.addDenied(denied);
		}

		var ret = yield groups.updateObject(group);
		logger.info("UserManager - Updated group '%s'.", group.getName());
		return ret;
	};

	/**
	 * Fetches a number of groups. Do note that this method does not add the fetched groups to cache, as it is used typically in group searches and listings.
	 *
	 * @param {Object} keys - The listing criteria.
	 * @param {Object} params - The listing params (fields, sorting, limiting, skipping, etc.).
	 * @return {Array} List of users or an empty array, if there are no matching groups.
	 */
	this.getGroups = function*(keys, params) {
		if(!keys) {
			keys = {};
		}
		if(!params) {
			params = {};
		}

		return yield storage.getAllData(groupsCollection, keys, params);
	};

	/**
	 * Fetches a group by name.
	 *
	 * @param {String} name - The group name.
	 * @return {Group} The group object or false, if the group is not found.
	 */
	this.getGroup = function*(name) {
		return yield groups.getByName(name);
	};

	/**
	 * Fetches a group by id.
	 *
	 * @param {String} id - The group id.
	 * @return {Group} The group object or false, if the group is not found.
	 */
	this.getGroupById = function*(id) {
		return yield groups.getById(id);
	};

	/**
	 * Removes a group by id.
	 *
	 * @param {String} id - The group id.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeGroupById = function*(id) {
		// ##TODO## Remove group from users
		return yield groups.removeById(id);
	};

	/**
	 * Adds a new right. The method does not store the right to the database, thus this method is to be called whenever a new right is introduced to the system, for example, by a module.
	 *
	 * @param {Object} right - The right in format \{ name: 'name', displayName: 'User Viewable Name', description: 'Description of the right' \}
	 * @return {boolean} True on success, false on failure.
	 */
	this.addRight = function(right) {
		if(!right || !right['name'] || !right['displayName']) {
			return false;
		}

		if(rights[right['name']]) {
			return false;
		}

		rights[right['name']] = right;
		logger.debug("UserManager - Added right '%s'.", right.name);

		return true;
	};

	/**
	 * Fetches all available rights in the system. Do note that the system allows also other rights to be assigned, but this list is shown on the GUI and it is considered a bad user experience to use a right not on this list.
	 *
	 * @return {Object} The rights.
	 */
	this.getRights = function() {
		return rights;
	};

	/**
	 * Adds the basic rights used by the system.
	 */
	var addSystemRights = function() {
		userManager.addRight({ name: '*',
							   displayName: '*',
							   description: 'Allows access to all functionality.' });
		userManager.addRight({ name: 'admin.accessAdmin',
							   displayName: 'Access Admin Interface',
							   description: 'Allows user to use the administration user interface.' });
		userManager.addRight({ name: 'admin.addContent',
							   displayName: 'Add Content',
							   description: 'Allows user to add content.' });
		userManager.addRight({ name: 'admin.manageContent',
							   displayName: 'Manage Content',
							   description: 'Allows user to add, edit and remove content.' });
		userManager.addRight({ name: 'admin.manageContentTypes',
							   displayName: 'Manage Content Types',
							   description: 'Allows user to add, edit and remove content types.' });
		userManager.addRight({ name: 'admin.addMedia',
							   displayName: 'Add Media',
							   description: 'Allows user to add media files.' });
		userManager.addRight({ name: 'admin.manageMedia',
							   displayName: 'Manage Media',
							   description: 'Allows user to add, edit and remove media files.' });
		userManager.addRight({ name: 'admin.manageThemes',
							   displayName: 'Manage Themes',
							   description: 'Allows user to configure and change themes.' });
		userManager.addRight({ name: 'admin.manageAccounts',
							   displayName: 'Manage User Accounts',
							   description: 'Allows user to add, edit and remove user accounts, and their roles, groups and rights.' });
		userManager.addRight({ name: 'admin.manageGroups',
							   displayName: 'Manage User Groups',
							   description: 'Allows user to add, edit and remove user groups and their rights.' });
		userManager.addRight({ name: 'admin.manageRoles',
							   displayName: 'Manage User Roles',
							   description: 'Allows user to add, edit and remove user roles and their rights.' });
		userManager.addRight({ name: 'admin.manageModules',
							   displayName: 'Manage Modules',
							   description: 'Allows user to configure and change states of modules.' });
		userManager.addRight({ name: 'admin.editConfiguration',
							   displayName: 'Edit Configuration',
							   description: 'Allows user to configure Coonti.' });
	};

	/**
	 * Creates a new User object based on the JSON data. ##TODO## Change this into a class level method of User.
	 *
	 * @param {Object} - The user data.
	 * @return {User} A new user object or false, if creation fails.
	 */
	this.importUser = function(data) {
		if(!data || _.size(data) == 0 || !data['account']) {
			return false;
		}

		var acc = data['account'];
		var id = false;
		if(data['_id']) {
			id = data['_id'];
			delete (data['_id']);
		}
		var userData = data['userData'] || {};
		var password = data['password'] || false;
		var u = new User(acc, userData);
		if(id) {
			u.setId(id);
		}

		u.setCryptedPassword(password);
		u.addAllowed(data['allowed']);
		u.addDenied(data['denied']);
		u.addRole(data['roles']);
		u.addToGroup(data['groups']);

		logger.info("UserManager - Imported user '%s'.", acc);
		return u;
	};

	/**
	 * Creates a new Role object based on the JSON data. ##TODO## Change this into a class level method of Role.
	 *
	 * @param {Object} - The role data.
	 * @return {User} A new role object or false, if creation fails.
	 */
	this.importRole = function(data) {
		if(!data || _.size(data) == 0 || !data['name']) {
			return false;
		}

		var name = data['name'];
		var id = false;
		if(data['_id']) {
			id = data['_id'];
			delete (data['_id']);
		}

		var role = new Role(name);
		role.setId(id);
		role.setDescription(data['description']);
		role.addAllowed(data['allowed']);
		role.addDenied(data['denied']);

		logger.info("UserManager - Imported role '%s'.", name);
		return role;
	};

	/**
	 * Creates a new Group object based on the JSON data. ##TODO## Change this into a class level method of Group.
	 *
	 * @param {Object} - The group data.
	 * @return {User} A new group object or false, if creation fails.
	 */
	this.importGroup = function(data) {
		if(!data || _.size(data) == 0 || !data['name']) {
			return false;
		}

		var name = data['name'];
		var id = false;
		if(data['_id']) {
			id = data['_id'];
			delete (data['_id']);
		}

		var group = new Group(name);
		group.setId(id);
		group.setDescription(data['description']);
		group.addAllowed(data['allowed']);
		group.addDenied(data['denied']);

		logger.info("UserManager - Imported group '%s'.", name);
		return group;
	};
}

/**
 * Creates a new instance of storage for user manager. The storage reads, writes, caches various data by id and name using UserManager storage.
 *
 * @class
 * @classdesc Storage class used by UserManager to cache frequently used items, and also to abstract database operations.
 * @param {String} col - The collection to use.
 * @param {String} key - The key denoting 'name' in the collection.
 * @param {Function} factory - Factory method to create new instances of the object using data read from the storage.
 * @return {UserManagerStorage} A new instance of the storage.
 */
function UserManagerStorage(collection, key, factory) {
	var nameCache = cacheManager.caching({ store: 'memory', max: 100 }); // ##TODO## Read max from configuration

	var _getName = thunkify(nameCache.get);
	var _setName = thunkify(nameCache.set);
	var _delName = thunkify(nameCache.del);

	var idCache = cacheManager.caching({ store: 'memory', max: 100 });

	var _getId = thunkify(idCache.get);
	var _setId = thunkify(idCache.set);
	var _delId = thunkify(idCache.del);

	/**
	 * Fetches an object from storage by its name.
	 *
	 * @param {String} name - The name of the object.
	 * @return {Object} The object in question, or false if nothing was found.
	 */
	this.getByName = function*(name) {
		if(!name) {
			return false;
		}

		var res = yield _getName(name);
		if(res) {
			return res;
		}

		if(!storage) {
			return false;
		}

		var query = {};
		query[key] = name;
		var jsonRes = yield storage.getData(collection, query);
		if(jsonRes) {
			var obj = factory(jsonRes);
			if(obj) {
				yield _setName(name, obj);
				var id = obj.getId();
				if(id) {
					yield _setId(id, obj);
				}
				return obj;
			}
		}
		return false;
	};

	/**
	 * Fetches an object from storage by its database id.
	 *
	 * @param {String} id - The id of the object.
	 * @return {Object} The object in question, or false if nothing was found.
	 */
	this.getById = function*(id) {
		if(!id) {
			return false;
		}

		var res = yield _getId(id);
		if(res) {
			return res;
		}

		if(!storage) {
			return false;
		}

		var query = { _id: id };
		var jsonRes = yield storage.getData(collection, query);
		if(jsonRes) {
			var obj = factory(jsonRes);
			if(obj) {
				var name = obj.getName();
				yield _setName(name, obj);
				yield _setId(id, obj);
				return obj;
			}
		}
		return false;
	};

	/**
	 * Inserts a new object.
	 *
	 * @param {Object} obj - The object to be inserted.
	 * @return {boolean} True on success, false on failure.
	 */
	this.insertObject = function*(obj) {
		if(!obj || !storage) {
			return false;
		}

		var name = obj.getName();
		if(!name) {
			return false;
		}

		if(obj.getId() === false) {
			var nid = yield storage.getId(collection);
			obj.setId(nid);
		}

		yield storage.insertData(collection, obj.exportData());

		yield _setName(name, obj);
		yield _setId(obj.getId(), obj);

		return true;
	};

	/**
	 * Updates an object.
	 *
	 * @param {Object} obj - The object to be updated. If the object does not have id, it will be inserted instead.
	 * @return {boolean} True on success, false on failure.
	 */
	this.updateObject = function*(obj) {
		if(!obj || !storage) {
			return false;
		}

		var id = obj.getId();
		if(!id) {
			return yield this.insertObject(obj);
		}

		var name = obj.getName();
		if(!name) {
			return false;
		}

		yield storage.updateData(collection, obj.exportData());
		yield _setName(name, obj);
		yield _setId(id, obj);

		return true;
	};

	/**
	 * Removes an object from the cache and also from the database.
	 *
	 * @param {Object} obj - The object to be removed.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeObject = function*(obj) {
		if(!obj || !storage) {
			return false;
		}

		var id = obj.getId();
		if(!id) {
			return yield this.removeByName(obj.getName());
		}

		var res = yield storage.removeDataById(collection, id);
		if(!res) {
			return false;
		}
		yield _delId(id);

		var name = obj.getName();
		if(name) {
			yield _delName(name);
		}
		else {
			// ##TODO## Purge name cache
		}
		return true;
	};

	/**
	 * Deletes an object by its name.
	 *
	 * @param {String} name - The name of the object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeByName = function*(name) {
		if(!name || !storage) {
			return false;
		}

		var obj = yield _getName(name);

		var query = {};
		query[key] = name;
		yield storage.removeData(collection, query); // ##TODO## Check response

		if(obj) {
			var id = obj.getId();
			if(id) {
				yield _delId(id);
			}
			yield _delName(name);
		}
		else {
			// ##TODO## Purge ID cache?
		}
		return true;
	};

	/**
	 * Deletes an object by its database id.
	 *
	 * @param {String} name - The id of the object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeById = function*(id) {
		if(!id || !storage) {
			return false;
		}

		var obj = yield _getId(id);

		yield storage.removeDataById(collection, id); // ##TODO## Check response

		if(obj) {
			var name = obj.getName();
			yield _delId(id);
			yield _delName(name);
		}
		else {
			// ##TODO## Purge name cache?
		}
		return true;
	};
}

/**
 * User object.
 *
 * @class
 * @classdesc This class represents a user in Coonti.
 * @param {String} account - The user account - must be unique among users.
 * @param {Object} userData - The user fields that are to be stored with the user.
 * @return {User} The new user object, or false if the operation failed.
 */
function User(account, userData) {
	// The database id of the user
	var id = false;

	// The user name of the user
	var account = account;

	// The user password, hashed
	var password = false;

	// The user data
	var userData = userData;

	// The user roles, stored as id Strings
	var roles = {};

	// The groups the user belongs to, stored as id Strings
	var groups = {};

	// The allowed rights, stored as Strings
	var allowed = {};

	// The denied rights, stored as Strings
	var denied = {};


	/**
	 * Fetches the user account.
	 *
	 * @return {String} The user account.
	 */
	this.getName = function() {
		return account;
	};

	/**
	 * Sets the user database id. This method must not be called outside UserManager.
	 *
	 * @param {String} dbid - The database id.
	 */
	this.setId = function(dbid) {
		id = dbid;
	};

	/**
	 * Fetches the user database id. If the user is not yet stored, it might not have an id and false is returned.
	 *
	 * @return {String} The database id.
	 */
	this.getId = function() {
		return id;
	};

	/**
	 * Sets the user password in plain text form.
	 *
	 * @param {String} pw - The password in plain text.
	 */
	this.setPassword = function(pw) {
		if(!pw) {
			password = false;
			return;
		}

		var hash = bcrypt.hashSync(pw, 8);
		password = hash;
	};

	/**
	 * Sets the user password in crypted form.
	 *
	 * @param {String} pw - The crypted password.
	 */
	this.setCryptedPassword = function(pw) {
		if(!pw) {
			password = false;
			return;
		}
		password = pw;
	};

	/**
	 * Checks the user password.
	 *
	 * @param {String} pw - The password to be checked.
	 * @return {boolean} True, if the passwords match, false otherwise.
	 */
	this.checkPassword = function(pw) {
		if(!pw || !password) {
			return false;
		}

		return bcrypt.compareSync(pw, password);
	};

	/**
	 * Fetches a user parameter.
	 *
	 * @param {String} key - The key of the parameter.
	 * @return {String} The value or false, if the value is not defined.
	 */
	this.getParameter = function(key) {
		if(!!key && userData[key]) {
			return userData[key];
		}
		return false;
	};

	/**
	 * Sets a user parameter.
	 *
	 * @param {String} key - The key of the parameter.
	 * @param {String} value - The value of the parameter.
	 * @return {boolean} True on success, false on failure.
	 */
	this.setParameter = function(key, value) {
		if(!!key) {
			this.userData[key] = value;
			// ##TODO## Store
			return true;
		}
		return false;
	};

	/**
	 * Removes a user parameter.
	 *
	 * @param {String} key - The key of the parameter.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeParameter = function(key) {
		if(!!key) {
			delete this.userData[key];
			// ##TODO## Store
			return true;
		}
		return false;
	};

	/**
	 * Removes all user parameters.
	 */
	this.removeAllParameters = function(key) {
		this.userData = [];
	};

	/**
	 * Sets several user parameters.
	 *
	 * @param {Object} params - The params in an object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.setParameters = function(params) {
		_.each(params, function(v, k) {
			if(!!k) {
				userData[k] = v;
			}
		});
		// ##TODO## Store
		return true;
	};

	/**
	 * Lists all user parameter keys.
	 *
	 * @return {Array} The keys.
	 */
	this.listParameterKeys = function() {
		return _.keys(userData);
	};

	/**
	 * Adds an allowed access to the user. If the access is currently denied, the deny item is deleted simultaneously.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addAllowed = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(allowed[tmp[i]]) {
				continue;
			}
			delete denied[tmp[i]];
			allowed[tmp[i]] = tmp[i];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Remove an allowed access from the user.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeAllowed = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete allowed[tmp[i]];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Removes all allowed access.
	 */
	this.removeAllAllowed = function() {
		allowed = [];
	};

	/**
	 * List the allowed accesses of the user.
	 *
	 * @return {Array} The allowed accesses.
	 */
	this.listAllowed = function() {
		return _.keys(allowed);
	};

	/**
	 * Adds a denied access to the user. If the access is currently allowed, the allow item is deleted simultaneously.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addDenied = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(denied[tmp[i]]) {
				continue;
			}
			delete allowed[tmp[i]];
			denied[tmp[i]] = access;
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Remove a denied access from the user.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeDenied = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete denied[tmp[i]];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Removes all denied access.
	 */
	this.removeAllDenied = function() {
		denied = [];
	};

	/**
	 * List the denied accesses of the user.
	 *
	 * @return {Array} The denied accesses.
	 */
	this.listDenied = function() {
		return _.keys(denied);
	};

	/**
	 * Checks whether user is allowed for the given access. The user is allowed when either the user, its role, or its group contains allowed access.
	 *
	 * @param {String} access - The name of the access.
	 * @return {boolean} True, if the user is allowed, false otherwise.
	 */
	this.isAllowed = function*(access) {
		if(!!access) {
			if(allowed[access]) {
				return true;
			}

			if(allowed['*']) {
				return true;
			}

			const roleKeys = Object.keys(roles);
			for(let i = 0; i < roleKeys.length; i++) {
				const roleId = roleKeys[i];
				const role = yield userManager.getRoleById(roleId);
				const res = yield role.isAllowed(access);
				if(res) {
					return true;
				}
			}

			const groupKeys = Object.keys(groups);
			for(let i = 0; i < groupKeys.length; i++) {
				const groupId = groupKeys[i];
				const group = yield userManager.getGroupById(groupId);
				const res = yield group.isAllowed(access);
				if(res) {
					return true;
				}
			}
		}
		return false;
	};

	/**
	 * Checks whether user is denied of the given access. The user is denied when either the user, its role, or its group contains denied access.
	 *
	 * @param {String} access - The name of the access.
	 * @return {boolean} True, if the user is denied, false otherwise.
	 */
	this.isDenied = function*(access) {
		if(!!access) {
			if(denied[access]) {
				return true;
			}

			const roleKeys = Object.keys(roles);
			for(let i = 0; i < roleKeys.length; i++) {
				const roleId = roleKeys[i];
				const role = yield userManager.getRoleById(roleId);
				const res = yield role.isDenied(access);
				if(res) {
					return true;
				}
			}

			const groupKeys = Object.keys(groups);
			for(let i = 0; i < groupKeys.length; i++) {
				const groupId = groupKeys[i];
				const group = yield userManager.getGroupById(groupId);
				const res = yield group.isDenied(access);
				if(res) {
					return true;
				}
			}
		}
		return false;
	};

	/**
	 * Adds a role to the user.
	 *
	 * @param {String|Array} role - The id of the role or array of role ids.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addRole = function(role) {
		if(!role) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(role) === '[object Array]') {
			tmp = role;
		}
		else {
			tmp = [role];
		}

		// ##TODO## Check existence of the role
		for(let i = 0; i < tmp.length; i++) {
			if(roles[tmp[i]]) {
				continue;
			}

			roles[tmp[i]] = tmp[i];
		}
		return true;
	};

	/**
	 * Removes a role from the user.
	 *
	 * @param {String|Array} role - The id of the role or an array of role ids.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeRole = function(role) {
		if(!role) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(role) === '[object Array]') {
			tmp = role;
		}
		else {
			tmp = [role];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete (roles[tmp[i]]);
		}
		return true;
	};

	/**
	 * Removes all roles.
	 */
	this.removeAllRoles = function() {
		roles = [];
	};

	/**
	 * List the roles of the user.
	 *
	 * @return {Array} The roles.
	 */
	this.listRoles = function() {
		return _.keys(roles);
	};

	/**
	 * Checks whether the user has the given role.
	 *
	 * @param {String} role - The id of the role.
	 * @return {boolean} True, if the user has the role, false otherwise.
	 */
	this.hasRole = function(role) {
		if(!role) {
			return false;
		}

		if(roles[role]) {
			return true;
		}

		return false;
	};

	/**
	 * Adds user to a group.
	 *
	 * @param {String|Array} group - The id of the group or an array of group ids.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addToGroup = function(group) {
		if(!group) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(group) === '[object Array]') {
			tmp = group;
		}
		else {
			tmp = [group];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(groups[tmp[i]]) {
				return true;
			}

			groups[tmp[i]] = tmp[i];
		}
		// ##TODO## Add user to the group, too
		return true;
	};

	/**
	 * Removes the user from a group.
	 *
	 * @param {String|Array} group - The id of the group or an array of group ids.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeFromGroup = function(group) {
		if(!group) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(group) === '[object Array]') {
			tmp = group;
		}
		else {
			tmp = [group];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(!groups[tmp[i]]) {
				continue;
			}

			delete (groups[tmp[i]]);
			// ##TODO## Remove user from the group, too
		}
		return true;
	};

	/**
	 * Removes all groups.
	 */
	this.removeAllGroups = function() {
		groups = [];
	};

	/**
	 * List the groups of the user.
	 *
	 * @return {Array} The groups.
	 */
	this.listGroups = function() {
		return _.keys(groups);
	};

	/**
	 * Checks whether the user belongs to the given group.
	 *
	 * @param {String} group - The id of the group.
	 * @return {boolean} True, if the user belongs to the group, false otherwise.
	 */
	this.belongsToGroup = function(group) {
		if(!group) {
			return false;
		}

		if(groups[group]) {
			return true;
		}

		return false;
	};

	/**
	 * Returns a simple JS object containing data of the user, ready to be written to the database.
	 *
	 * @return {Object} The User data.
	 */
	this.exportData = function() {
		return {
			_id: id,
			account: account,
			password: password,
			userData: userData,
			groups: _.keys(groups),
			roles: _.keys(roles),
			allowed: _.keys(allowed),
			denied: _.keys(denied)
		};
	};

	/**
	 * Returns a read-only Proxy object for this User instance.
	 *
	 * @return {Proxy} A Proxy object that provides access to the User data without allowing any changes.
	 */
	this.getReadOnly = function() {
		return new Proxy(this, {
			deleteProperty: function(target, name) {
				return false;
			},
			set: function(target, name, val, receiver) {
				return false;
			},
			has: function(target, name) {
				if(this.get(target, name, false) !== undefined) {
					return true;
				}
				return false;
			},
			get: function(target, name, receiver) {
				if(name == 'account') {
					return account;
				}
				if(name == 'password') {
					return false;
				}
				if(name == 'roles') {
					return roles; // ##TODO## Make read-only
				}
				if(name == 'groups') {
					return groups;
				}
				if(name == 'allowed') {
					return allowed;
				}
				if(name == 'denied') {
					return denied;
				}
				if(userData[name]) {
					return userData[name];
				}
				return undefined;
			}
		});
	};
}

/**
 * Role object.
 *
 * @class
 * @classdesc The class representing a user role in Coonti.
 * @param {String} nm - The role name, must be unique among roles.
 */
function Role(nm) {
	// The id of the role
	var id = false;

	// The name of the role
	var name = nm;

	// The description of the role
	var description = '';

	// The allowed rights, stored as Strings
	var allowed = {};

	// The denied rights, stored as Strings
	var denied = {};

	/**
	 * Fetches the role name.
	 *
	 * @return {String} The role name.
	 */
	this.getName = function() {
		return name;
	};

	/**
	 * Sets the role database id. This method must not be called outside UserManager.
	 *
	 * @param {String} dbid - The database id.
	 */
	this.setId = function(dbid) {
		id = dbid;
	};

	/**
	 * Fetches the role database id. If the role is not yet stored, it might not have an id and false is returned.
	 *
	 * @return {String} dbid The database id.
	 */
	this.getId = function() {
		return id;
	};

	/**
	 * Sets the role description.
	 *
	 * @param {String} descr - The description.
	 */
	this.setDescription = function(descr) {
		description = descr;
	};

	/**
	 * Fetches the role description.
	 *
	 * @return {String} The description.
	 */
	this.getDescription = function() {
		return description;
	};

	/**
	 * Adds an allowed access to the role. If the access is currently denied, the deny item is deleted simultaneously.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addAllowed = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(allowed[tmp[i]]) {
				continue;
			}
			delete denied[tmp[i]];
			allowed[tmp[i]] = tmp[i];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Remove an allowed access from the role.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeAllowed = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete allowed[tmp[i]];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Removes all allowed access.
	 */
	this.removeAllAllowed = function() {
		allowed = [];
	};

	/**
	 * List the allowed accesses of the role.
	 *
	 * @return {Array} The allowed accesses.
	 */
	this.listAllowed = function() {
		return _.keys(allowed);
	};

	/**
	 * Adds a denied access to the role. If the access is currently allowed, the allow item is deleted simultaneously.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addDenied = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(denied[tmp[i]]) {
				continue;
			}
			delete allowed[tmp[i]];
			denied[tmp[i]] = tmp[i];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Remove a denied access from the role.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeDenied = function(access) {
		if(!access) {
			return false;
		}
		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete denied[tmp[i]];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Removes all denied access.
	 */
	this.removeAllDenied = function() {
		denied = [];
	};

	/**
	 * List the denied accesses of the role.
	 *
	 * @return {Array} The denied accesses.
	 */
	this.listDenied = function() {
		return _.keys(denied);
	};

	/**
	 * Checks whether role is allowed for the given access.
	 *
	 * @param {String} access - The name of the access.
	 * @return {boolean} True, if the role is allowed, false otherwise.
	 */
	this.isAllowed = function*(access) { // eslint-disable-line require-yield
		if(!!access) {
			if(allowed[access]) {
				return true;
			}

			if(allowed['*']) {
				return true;
			}
		}
		return false;
	};

	/**
	 * Checks whether role is denied of the given access.
	 *
	 * @param {String} access - The name of the access.
	 * @return {boolean} True, if the user is denied, false otherwise.
	 */
	this.isDenied = function*(access) { // eslint-disable-line require-yield
		if(!!access) {
			if(denied[access]) {
				return true;
			}
		}
		return false;
	};

	/**
	 * Returns a simple JS object containing data of the role, ready to be written to the database.
	 *
	 * @return {Object} The Role data.
	 */
	this.exportData = function() {
		return {
			_id: id,
			name: name,
			description: description,
			allowed: _.keys(allowed),
			denied: _.keys(denied)
		};
	};
}


/**
 * User Group object.
 *
 * @class
 * @classdesc The class representing a user group in Coonti.
 * @param {String} nm - The group name, must be unique among groups.
 */
function Group(nm) {
	// The database id of the group
	var id = false;

	// The name of the group
	var name = nm;

	// The description of the group
	var description = '';

	// The allowed rights, stored as Strings
	var allowed = {};

	// The denied rights, stored as Strings
	var denied = {};

	/**
	 * Fetches the group name.
	 *
	 * @return {String} The group name.
	 */
	this.getName = function() {
		return name;
	};

	/**
	 * Sets the group database id. This method must not be called outside UserManager.
	 *
	 * @param {String} dbid - The database id.
	 */
	this.setId = function(dbid) {
		id = dbid;
	};

	/**
	 * Fetches the group database id. If the group is not yet stored, it might not have an id and false is returned.
	 *
	 * @return {String} The database id.
	 */
	this.getId = function() {
		return id;
	};

	/**
	 * Sets the group description.
	 *
	 * @param {String} descr - The description.
	 */
	this.setDescription = function(descr) {
		description = descr;
	};

	/**
	 * Fetches the group description.
	 *
	 * @return {String} The description.
	 */
	this.getDescription = function() {
		return description;
	};

	/**
	 * Adds an allowed access to the group. If the access is currently denied, the deny item is deleted simultaneously.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addAllowed = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(allowed[tmp[i]]) {
				continue;
			}
			delete denied[tmp[i]];
			allowed[tmp[i]] = tmp[i];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Remove an allowed access from the group.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeAllowed = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete allowed[tmp[i]];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Removes all allowed access.
	 */
	this.removeAllAllowed = function() {
		allowed = [];
	};

	/**
	 * List the allowed accesses of the group.
	 *
	 * @return {Array} The allowed accesses.
	 */
	this.listAllowed = function() {
		return _.keys(allowed);
	};

	/**
	 * Adds a denied access to the group. If the access is currently allowed, the allow item is deleted simultaneously.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addDenied = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			if(denied[tmp[i]]) {
				continue;
			}
			delete allowed[tmp[i]];
			denied[tmp[i]] = tmp[i];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Remove a denied access from the group.
	 *
	 * @param {String|Array} access - The name of the access or an array of names.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeDenied = function(access) {
		if(!access) {
			return false;
		}

		var tmp;
		if(Object.prototype.toString.call(access) === '[object Array]') {
			tmp = access;
		}
		else {
			tmp = [access];
		}

		for(let i = 0; i < tmp.length; i++) {
			delete denied[tmp[i]];
		}

		// ##TODO## Store
		return true;
	};

	/**
	 * Removes all denied access.
	 */
	this.removeAllDenied = function() {
		denied = [];
	};

	/**
	 * List the denied accesses of the group.
	 *
	 * @return {Array} The denied accesses.
	 */
	this.listDenied = function() {
		return _.keys(denied);
	};

	/**
	 * Checks whether group is allowed for the given access.
	 *
	 * @param {String} access - The name of the access.
	 * @return {boolean} True, if the group is allowed, false otherwise.
	 */
	this.isAllowed = function*(access) { // eslint-disable-line require-yield
		if(!!access) {
			if(allowed[access]) {
				return true;
			}

			if(allowed['*']) {
				return true;
			}
		}
		return false;
	};

	/**
	 * Checks whether group is denied of the given access.
	 *
	 * @param {String} access - The name of the access.
	 * @return {boolean} True, if the user is denied, false otherwise.
	 */
	this.isDenied = function*(access) { // eslint-disable-line require-yield
		if(!!access) {
			if(denied[access]) {
				return true;
			}
		}
		return false;
	};

	/**
	 * Returns a simple JS object containing data of the group, ready to be written to the database.
	 *
	 * @return {Object} The Group data.
	 */
	this.exportData = function() {
		return {
			_id: id,
			name: name,
			description: description,
			allowed: _.keys(allowed),
			denied: _.keys(denied)
		};
	};
}

module.exports = CoontiUserManager;
