/**
 * @module CoontiCore/Router
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

var _ = require('underscore');
var _s = require('underscore.string');
var koaBody = require('koa-better-body');
var koaRouter = require('koa-router');
var session = require('koa-session');
var convert = require('koa-convert');
var SortedArray = require('./libraries/sortedarray.js');
var CoontiException = require('./coontiexception.js');

/**
 * CoontiRouter handles all routing inside Coonti by executing state machines as defined in the configuration and triggered by the incoming requests.
 *
 * @class
 * @classdesc Router component for managing routing inside Coonti.
 * @param {Coonti} cnti The Coonti instance.
 */
function CoontiRouter(cnti) {
	var coonti = cnti;
	var app = coonti.getApplication();
	var router;
	var users;

	var redirects = new SortedArray();  // eslint-disable-line no-unused-vars
	var firstInit = true;

	var stateMachines = {};
	var stateHandlers = {};

	var coontiPath = '';
	var sessionConfig;

	var forms;
	var templates;
	var contents;

	var logger;

	// ##TODO## Add uploaddir etc.
	var koaBodyParams = {
		multipart: true,
	};

	var self = this;

	/**
	 * Initialises CoontiRouter instance by setting up routing as specified in the Coonti configuration.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Config-Init', configInitialised);
		coonti.addEventListener('Coonti-Logging-Init', loggingInitialised);

		users = coonti.getManager('user');

		router = koaRouter();

		var res = true;
		res = self.addStateHandler('cookies', this.handleCookies) && res;
		res = self.addStateHandler('session', this.handleSession) && res;
		res = self.addStateHandler('route', this.handleRoute) && res;
		res = self.addStateHandler('access', this.handleAccess) && res;
		res = self.addStateHandler('accessJson', this.handleAccessJson) && res;
		res = self.addStateHandler('form', this.handleForm) && res;
		res = self.addStateHandler('content', this.handleContent) && res;
		res = self.addStateHandler('template', this.handleTemplate) && res;
		res = self.addStateHandler('json', this.handleJson) && res;
		res = self.addStateHandler('end', this.handleEnd) && res;

		if(!res) {
			throw new CoontiException(CoontiException.FATAL, 4004, 'Could not initialise internal handlers.');
		}
	};

	/**
	 * Initialises the logger.
	 */
	var loggingInitialised = function*() { // eslint-disable-line require-yield
		logger = coonti.getManager('log').getLogger('coonti-core-router');
	};

	/**
	 * Sets up routes based on configuration
	 */
	var configInitialised = function*() { // eslint-disable-line require-yield
		coontiPath = coonti.getConfigParam('pathPrefix');

		sessionConfig = coonti.getConfigParam('session');
		if(!sessionConfig.key) {
			sessionConfig.key = 'coontiSession';
		}
		if(!sessionConfig.cookiePath) {
			sessionConfig.cookiePath = '/';
		}
		else {
			sessionConfig.cookiePath = '/' + sessionConfig.cookiePath;
		}

		app.keys = [coonti.getConfigParam('cookieKey')];

		if(firstInit) {
			// app.use(session(app));
			app.use(convert(session(app)));
			app.use(router.routes());
			forms = coonti.getManager('form');
			templates = coonti.getManager('template');
			contents = coonti.getManager('content');
		}
		else {
			self.removeAllStateMachines();
		}
		firstInit = false;

		var sms = coonti.getConfigParam('executionPaths');
		_.each(sms, function(sm, name) {
			self.addExecutionPath(name, sm);
		});
	};

	/**
	 * Adds a new execution path to the system.
	 *
	 * @param {String} name - The name of the execution path. "default" is used to mark the execution path with no prefix, i.e. the default one.
	 * @param {Array} sm - The execution path components - Objects with the following fields: name (String), priority (int)
	 * @return {CoontiStateMachine} The new state machine that handles the execution path.
	 */
	this.addExecutionPath = function(name, sm) {
		var stateMachine = self.addStateMachine(name);
		if(stateMachine === false) {
			throw new CoontiException(CoontiException.FATAL, 4001, 'Invalid execution path name "' + name + '".');
		}
		_.each(sm, function(st) {
			var fn = self.getStateHandler(st.name);
			var config = st.config || {};
			if(typeof fn != 'function') {
				throw new CoontiException(CoontiException.FATAL, 4002, 'Missing function for path state "' + st.name + '" in path "' + name + '".');
			}
			if(stateMachine.addState(st.name, fn, st.priority, config) === false) {
				throw new CoontiException(CoontiException.FATAL, 4003, 'Invalid execution path state "' + st.name + '" in path "' + name + '".');
			}
		});
		var path = '/' + name + '*';
		if(name === 'default') {
			path = '*';
		}
		if(!!coontiPath) {
			if(path === '*') {
				path = '/' + coontiPath + '*';
			}
			else {
				path = '/' + coontiPath + path;
			}
		}
		stateMachine.setPath(path);

		// ##TODO## Make configurable
		stateMachine.setErrorHandler(self.handleError);

		var priority = 100;
		if(name == 'default') {
			priority = 99;
		}

		self.addRoute(priority, 'router_' + name, path, false, convert(koaBody(koaBodyParams)), function*(ctx, next) {
			this.coonti = new CoontiContext(coonti, self, this);
			yield stateMachine.execute(this, next);
		});
		return stateMachine;
	};

	/**
	 * Removes an execution path from the system.
	 *
	 * @param {String} name - The name of the execution path.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeExecutionPath = function(name) {
		if(!name) {
			return false;
		}
		return this.removeStateMachine(name);
	};

	/**
	 * Adds a new state machine.
	 *
	 * @param {String} name - The name of the state machine.
	 * @return {StateMachine} the new StateMachine instance or false should the addition fail.
	 */
	this.addStateMachine = function(name) {
		if(!name) {
			return false;
		}
		if(stateMachines[name]) {
			return false;
		}
		var sm = new CoontiStateMachine(this, name);
		stateMachines[name] = sm;
		return sm;
	};

	/**
	 * Fetches a state machine.
	 *
	 * @param {String} name - The name of the machine.
	 * @return {CoontiStateMachine} The state machine or false, if no such machine was found.
	 */
	this.getStateMachine = function(name) {
		if(!name) {
			return false;
		}
		if(stateMachines[name]) {
			return stateMachines[name];
		}
		return false;
	};

	/**
	 * Removes all state machines.
	 *
	 * @return {bool} True on removal, false otherwise.
	 */
	this.removeAllStateMachines = function() {
		var names = _.keys(stateMachines);
		_.each(names, function(nm) {
			self.removeStateMachine(nm);
		});
		return true;
	};

	/**
	 * Removes a state machine.
	 *
	 * @param {String} name - The name of the machine to be removed.
	 * @return {bool} True on removal, false otherwise.
	 */
	this.removeStateMachine = function(name) {
		if(!name) {
			return false;
		}
		if(!stateMachines[name]) {
			return false;
		}
		self.removeRoute('router_' + name);
		delete stateMachines[name];
		return true;
	};

	/**
	 * Adds a route to the system.
	 *
	 * @param {integer} priority - The priority of the route. Higher priority will be handled before smaller ones.
	 * @param {String} name - The name of the route.
	 * @param {String|RegExp} - path The route description (as specified in koa-router). ##TODO## Add Coonti basepath
	 * @param {Array} methods - The methods as an array of strings. If methods is empty, all methods are used.
	 * @param {Function} fn - The function that will handle the route.
	 * @return {bool} True on success, false on failure.
	 */
	this.addRoute = function(priority, name, path, methods, fn) {
		if(!name || !path || !fn) {
			return false;
		}

		priority = -priority;

		var args = Array.prototype.slice.call(arguments);
		args.shift();

		for(var i = 0; i < args.length; i++) {
			if(typeof args[i] == 'function' && args[i].constructor.name == 'GeneratorFunction') {
				args[i] = convert(args[i]);
			}
		}

		if(!methods || methods.length == 0 || (methods.length == 1 && methods[0] == 'all')) {
			args.splice(2, 1);
			router.all(...args);
		}
		else {
			router.register(...args);
		}
		_.each(router.stack, function(r) {
			if(r.name == name) {
				r['priority'] = priority;
			}
			if(!r['priority']) {
				r.priority = 1;
			}
		});
		router.stack = _.sortBy(router.stack, 'priority');
		return true;
	};

	/**
	 * Removes a route from the system.
	 *
	 * @param {String} name - The name of the route.
	 * @return {bool} True on removal, false otherwise.
	 */
	this.removeRoute = function(name) {
		if(!name) {
			return false;
		}
		var r = router.stack;
		for(let i = 0; i < r.length; i++) {
			if(r[i]['name'] == name) {
				r.splice(i, 1);
				return true;
			}
		}
		return false;
	};

	/**
	 * Adds a new handler for a state machine phase.
	 *
	 * @param {String} name - The name of the handler.
	 * @param {Function} fn - The function that is to be called to handle the phase.
	 * @return {bool} True on success, false on failure.
	 */
	this.addStateHandler = function(name, fn) {
		if(!name) {
			return false;
		}
		if(stateHandlers[name]) {
			return false;
		}
		stateHandlers[name] = fn;
		return true;
	};


	/**
	 * Fetches a state handler.
	 *
	 * @param {String} name - The name of the handler.
	 * @return {Function} The state handler function or false, if no such handler was found.
	 */
	this.getStateHandler = function(name) {
		if(!name) {
			return false;
		}
		if(stateHandlers[name]) {
			return stateHandlers[name];
		}
		return false;
	};


	/**
	 * Removes a state handler.
	 *
	 * @param {String} name - The name of the handler to be removed.
	 * @return {bool} True on removal, false otherwise.
	 */
	this.removeStateHandler = function(name) {
		if(!name) {
			return false;
		}
		if(!stateHandlers[name]) {
			return false;
		}
		delete stateHandlers[name];
		return true;
	};


	/**
	 * Adds a new redirect.
	 *
	 * @param {String} oldPath - The path that needs to be redirected.
	 * @param {String} newPath - The destination for the redirection.
	 * @param {integer} weight - The weight of the the redirect (higher is handled earlier).
	 */
	this.addRedirect = function(oldPath, newPath, weight) {
		// ##TODO## Implement
	};

	/**
	 * Reads in cookies from the request.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleCookies = function*(csm, config, next) {
		logger.debug('HandleCookies');
		yield next;
	};

	/**
	 * Forms session from the request.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleSession = function*(csm, config, next) {
		logger.debug('HandleSession');
		var session = this.session;  // eslint-disable-line no-unused-vars

		yield next;
	};

	/**
	 * Calculates route from the request.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleRoute = function*(csm, config, next) {
		logger.debug('HandleRoute');
		var path = this.path;
		var route = this.path;
		var smPath = csm.getPath();
		if(_s.endsWith(smPath, '*')) {
			smPath = _s.rtrim(smPath, '*');
		}
		if(smPath === '') {
			smPath = '/';
		}
		if(_s.startsWith(path, smPath)) {
			route = path.substr(smPath.length);
		}
		if(!route) {
			route = '';
		}

		this.coonti.setItem('coontiPath', coontiPath);
		this.coonti.setItem('prefix', smPath);
		this.coonti.setItem('route', route);
		this.coonti.setItem('fullRoute', path);

		logger.debug('Routed to %s', route);

		yield next;
	};

	/**
	 * Checks user access to the content.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 * @return {boolean} True on success (continue), false on failure (show error).
	 */
	this.handleAccess = function*(csm, config, next) {
		logger.debug('HandleAccess');

		if(config['requireLogin']) {
			var prefix = this.coonti.getItem('prefix');
			var user = yield users.getCurrentUser(this);
			var login = config['loginRoute'];
			if(!login) {
				login = prefix + '/login';
			}
			else {
				login = prefix + login;
			}

			var r = this.coonti.getItem('fullRoute');
			if(!user) {
				var logout = config['logoutRoute'];
				if(!logout) {
					logout = prefix + '/logout';
				}
				else {
					logout = prefix + logout;
				}
				if(r != login && r != logout) {
					this.redirect(login);
					return;
				}
			}
			else if(r == login) {
				this.redirect(prefix);
				return;
			}

			var access = config['requireAccess'];
			if(!!access) {
				if(user) {
					var allowed = yield user.isAllowed(access);
					if(!allowed) {
						// ##TODO## Add error message through session
						this.redirect(login);
						return;
					}
				}
			}
		}

		yield next;
	};

	/**
	 * Checks user access to JSON content. Works like handleAccess, but uses error code 401 instead of redirects.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 * @return {boolean} True on success (continue), false on failure (show error).
	 */
	this.handleAccessJson = function*(csm, config, next) {
		logger.debug('HandleAccessJson');
		if(config['requireLogin']) {
			var user = yield users.getCurrentUser(this);
			if(!user) {
				this.status = (401);
				return;
			}

			var access = config['requireAccess'];
			if(!!access) {
				if(user) {
					var allowed = yield user.isAllowed(access);
					if(!allowed) {
						this.status = (401);
						return;
					}
				}
			}
		}

		yield next;
	};

	/**
	 * Reads submitted form data, populates and validates the relevant form.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 * @return {boolean} True on success (continue), false on failure (show error).
	 */
	this.handleForm = function*(csm, config, next) {
		if(this.request.fields) {
			logger.debug('HandleForm');
			var fields = this.request.fields;
			var submission = forms.createFormSubmission(fields);
			if(submission !== false) {
				submission.validate();
				this.coonti.addForm(submission);
			}
		}

		yield next;
	};

	/**
	 * Produces content based on the request.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleContent = function*(csm, config, next) {
		logger.debug('HandleContent');
		var ch = false;
		var chName = this.coonti.getItem('contentHandler');
		if(!!chName) {
			ch = contents.getContentHandler(chName);
		}
		else {
			ch = contents.getContentHandler();
		}
		if(!ch) {
			logger.warn('No Content Handler found in HandleContent');
			// ##TODO## Show 500 page
			return;
		}

		var content = yield ch.getContent(this);
		this.coonti.mergeItem('content', content);
		yield next;
	};

	/**
	 * Selects and executes template.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleTemplate = function*(csm, config, next) {
		logger.debug('HandleTemplate');

		var content = this.coonti.getItem('content');
		if(!content) {
			// ##TODO## Show 404 page
			logger.warn('No content in HandleTemplate');
			return;
		}

		yield templates.render(this);
		yield next;
	};

	/**
	 * Filters and outputs the content as JSON object.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleJson = function*(csm, config, next) {
		logger.debug('HandleJson');
		var content = this.coonti.getItem('content');
		if(!content || !content['contentType']) {
			// ##TODO## Show 404 page
			logger.warn('No content in HandleJson');
			return;
		}

		var ct = content.contentType;
		var ctData = contents.getContentType(ct);
		if(!ctData || !ctData.contentType || !ctData.contentType.fields) {
			// ##TODO## Show an error
			logger.warn('No content type in HandleJson');
			return;
		}

		var self = this;

		// Filter content by content type field json attribute
		_.each(ctData.contentType.fields, function(f, key) {
			if(!f.json) {
				delete (self.coonti.content.content[key]);
			}
		});

		this.body = (JSON.stringify(content));
		yield next;
	};

	/**
	 * Ends request / response cycle.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleEnd = function*(csm, config, next) {
		logger.debug('HandleEnd');
		yield next;
	};

	/**
	 * Checks admin level access to the resources.
	 *
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 * @param {Object} config - The configuration of the state.
	 * @param {Function} next - The next Koa handler.
	 */
	this.handleAdminAccess = function*(csm, config, next) {
		logger.debug('HandleAdminAccess');
		yield next;
	};

	/**
	 * Handles errors in state machine execution. Note that the state machine stops when it has called this method.
	 *
	 * @param {integer} error - HTTP status code.
	 * @param {CoontiStateMachine} csm - The CoontiStateMachine instance.
	 */
	this.handleError = function*(error, csm) { // eslint-disable-line require-yield
		logger.debug('HandleError');
	};
}

/**
 * Creates a new state machine to handle an execution path.
 *
 * @class
 * @classdesc State Machine handles Coonti execution paths from state to state.
 * @param {CoontiRouter} rtr - The CoontiRouter instance owning this state machine.
 * @param {String} nm - The name of the state machine.
 * @return {CoontiStateMachine} A new empty state machine.
 */
function CoontiStateMachine(rtr, nm) {
	var router = rtr;
	var states = {};
	var errorHandler = false;
	var statesOrder = [];
	var path = false;
	var beforeStates = {};
	var afterStates = {};
	var disabled = false;

	/**
	 * Adds a new state to the state machine.
	 *
	 * @param {String} name - The name of the state.
	 * @param {Function} handler - The function that is executed when the state is processed.
	 * @param {integer} priority - The priority of the function. Bigger number gets executed earlier.
	 * @param {Object} configuration - Any configuration for the handler.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addState = function(name, handler, priority, configuration) {
		if(!name) {
			return false;
		}
		if(states[name]) {
			return false;
		}

		priority = parseInt(priority, 10);
		if(isNaN(priority)) {
			return false;
		}

		configuration = configuration || {};

		var state = {
			name: name,
			handler: handler,
			priority: priority,
			config: configuration
		};

		states[name] = state;
		var s = _.sortedIndex(statesOrder, state, function(st) {
			return -st.priority;
		});

		statesOrder.splice(s, 0, state);

		beforeStates[name] = [];
		afterStates[name] = [];

		return true;
	};

	/**
	 * Sets the error handler for the state machine.
	 *
	 * @param {Function} handler - The function that is executed when an error occurs.
	 * @return {boolean} True on success, false on failure.
	 */
	this.setErrorHandler = function(handler) {
		errorHandler = handler;
		return true;
	};

	/**
	 * Removes a state.
	 *
	 * @param {String} name - The name of the state.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeState = function(name) {
		if(!name) {
			return false;
		}

		if(!states[name]) {
			return false;
		}

		delete states[name];
		statesOrder = _.reject(statesOrder, function(item) {
			if(item.name === name) {
				return true;
			}
			return false;
		});

		delete beforeStates[name];
		delete afterStates[name];

		return true;
	};

	/**
	 * Adds a callback function that is executed after the state has been processed.
	 *
	 * @param {String} state - The name of the state.
	 * @param {String} name - The name of the callback.
	 * @param {Function} fn - The callback function.
	 * @param {integer} priority - The priority of the function (bigger gets executed earlier).
	 * @return {boolean} True on successa, false on failure.
	 */
	this.addBeforeStateCallback = function(state, name, fn, priority) {
		return addStateCallback(beforeStates, state, name, fn, priority);
	};

	/**
	 * Adds a callback function that is executed after the state has been processed.
	 *
	 * @param {String} state - The name of the state.
	 * @param {String} name - The name of the callback.
	 * @param {Function} fn - The callback function.
	 * @param {integer} priority - The priority of the function (bigger gets executed earlier).
	 * @return {boolean} True on successa, false on failure.
	 */
	this.addAfterStateCallback = function(state, name, fn, priority) {
		return addStateCallback(afterStates, state, name, fn, priority);
	};

	/**
	 * Adds a callback function to a state. This function is called by addBefore... and addAfter... state callback functions.
	 *
	 * @param {Object} store - The store that the callback is to be added to.
	 * @param {String} state - The name of the state.
	 * @param {String} name - The name of the callback.
	 * @param {Function} fn - The callback function.
	 * @param {integer} priority - The priority of the function (bigger gets executed earlier).
	 * @return {boolean} True on successa, false on failure.
	 */
	function addStateCallback(store, state, name, fn, priority) {
		if(!state || !name || !fn) {
			return false;
		}

		if(!states[state]) {
			return false;
		}

		// ##TODO## Test fn for functioness

		var cb = {
			name: name,
			callback: fn,
			priority: priority
		};

		var s = _.sortedIndex(store, cb, function(st) {
			return -st.priority;
		});

		store[state].splice(s, 0, cb);
		return true;
	}

	/**
	 * Executes a state in the state machine.
	 *
	 * @param {Context} ctx - Koa context.
	 * @param {Function} next - The function to yield.
	 * @param {String} csn - The name of the state. If set to false, the first state is selected.
	 * @return {boolean} True on success, false on failure.
	 */
	this.execute = function*(ctx, next, csn) {
		if(statesOrder.length == 0) {
			return true;
		}

		var st = false;
		if(!csn) {
			st = statesOrder[0];
		}
		else {
			st = states[csn];
			if(!st) {
				return false;
			}
		}

		var self = this;

		if(beforeStates[st.name]) {
			for(let s = 0; s < beforeStates[st.name].length; s++) {
				var cb = beforeStates[st.name][s];
				try {
					yield cb.callback(ctx, st);
				}
				catch(e) {
					if(errorHandler) {
						yield errorHandler(500, this);
					}
					return false;
				}
			}
		}

		var invoker = function*() {
			var nst = self.getNextState(st);
			if(nst === false) {
				return;
			}
			yield st.handler.call(ctx, self, st.config, function*() { yield self.execute(ctx, next, nst); });
		};

		yield invoker();

		if(afterStates[st.name]) {
			for(let s = 0; s < afterStates[st.name].length; s++) {
				var cb = afterStates[st.name][s];
				try {
					yield cb.callback(ctx, st);
				}
				catch(e) {
					if(errorHandler) {
						yield errorHandler(500, this);
					}
					return false;
				}
			}
		}

/*
		if(!error) {
			st.handler(crr, this, executeAfterStates);
		}*/

		return true;
	};

	/**
	 * Returns the name of the next state.
	 *
	 * @param {String} stName - The name of the state.
	 * @return {String} The name of the next state. If there is no next state, false is returned.
	 */
	this.getNextState = function(stName) {
		var i = statesOrder.indexOf(stName);
		if(i == -1) {
			return false;
		}

		i++;
		if(i >= statesOrder.length) {
			return false;
		}

		return statesOrder[i].name;
	};

	/**
	 * Sets the path of the state machine. This path is removed from HTTP request path when the request internal path is constructed.
	 *
	 * @param {String} pth - The new path.
	 */
	this.setPath = function(pth) {
		path = pth;
	};

	/**
	 * Fetches the path of the state machine.
	 *
	 * @return {String} The path.
	 */
	this.getPath = function() {
		return path;
	};

	/**
	 * Disables the state machine. Disabled state machines will pass through any requests.
	 */
	this.disable = function() {
		disabled = true;
	};

	/**
	 * Checks whether the state machine is disabled.
	 *
	 * @return {Bool} Disabled (true) or not (false).
	 */
	this.isDisabled = function() {
		return disabled;
	};

	/**
	 * Fetches the router instance the state machine is bound to.
	 *
	 * @return {CoontiRouter} The router instance.
	 */
	this.getRouter = function() {
		return router;
	};
}


/**
 * Creates a new CoontiContext object that encapsulates all Coonti related items on the Koa request and response context object.
 *
 * @class
 * @classdesc CoontiContext object wraps Koa context object and adds Coonti specific items.
 * @param {Coonti} cnti - The Coonti instance.
 * @param {CoontiRouter} rtr - The CoontiRouter instance.
 * @param {Context} ctx - The Koa context owning this object.
 * @return {CoontiContext} A new encapsulation object.
 */
function CoontiContext(cnti, rtr, ctx) {
	var coonti = cnti;
	var router = rtr;
	var context = ctx;

	var items = {};
	var forms = {};

	this.getCoonti = function() {
		return coonti;
	};

	this.getRouter = function() {
		return router;
	};

	/**
	 * Returns the session object.
	 *
	 * @return {Object} The Koa session object.
	 */
	this.getSession = function() {
		if(context['session']) {
			return context.session;
		}
		return false;
	};

	/**
	 * Checks whether the context has session.
	 *
	 * @return {boolean} True if there is at least one item in the session, false if none.
	 */
	this.hasSession = function() {
		return (_.size(context['session']) > 0);
	};

	/**
	 * Fetches an item from the session.
	 *
	 * @param {String} key - The key of the item.
	 * @return {Object} value The item value or false, if the key is not found.
	 */
	this.getFromSession = function(key) {
		if(!!key && context['session'] && context.session[key]) {
			return context.session[key];
		}
		return false;
	};

	/**
	 * Adds a new item to session object.
	 *
	 * @param {String} key - The key of the item.
	 * @param {Object} value - The item value.
	 */
	this.setInSession = function(key, value) {
		if(!!key) {
			context.session[key] = value;
		}
	};

	/**
	 * Removes an item to session object.
	 *
	 * @param {String} key - The key of the item.
	 * @return {boolean} True on success, false on failure
	 */
	this.removeFromSession = function(key) {
		if(!!key && context.session[key]) {
			delete context.session[key];
			return true;
		}
		return false;
	};

	/**
	 * Destroys the session.
	 */
	this.destroySession = function() {
		context.session = null;
	};

	// ##TODO## Removing items from session

	/**
	 * Adds a new form to the object.
	 *
	 * @param {CoontiForm|CoontiFormSubmission} form - The form to be attached. If a CoontiForm is added, it is encapsulated into an empty form submission. A new form overwrites the previous one, except form submissions from the browser cannot be overwritten.
	 */
	this.addForm = function(form) {
		var name = form.getCollection() + '/' + form.getName();
		if(!!name && form) {
			if(forms[name] && forms[name].isSubmitted()) {
				return;
			}
			if(form.constructor.name == 'CoontiForm') {
				form = forms.createEmptyFormSubmission(form);
			}
			forms[name] = form;
		}
	};

	/**
	 * Checks whether the context has forms.
	 *
	 * @return {boolean} True if there is at least one form, false if none.
	 */
	this.hasForms = function() {
		return (_.size(forms) > 0);
	};

	/**
	 * Fetches a form.
	 *
	 * @param {String|CoontiForm} form - The name of the form (String) or a CoontiForm object.
	 * @return {CoontiFormSubmission}, either submitted by the user or empty submission for non-submitted forms, or false, if no form is found.
	 */
	this.getForm = function(form) {
		if(form) {
			var name = form;
			if(form.constructor.name == 'CoontiForm') {
				name = form.getCollection() + '/' + form.getName();
			}
			if(forms[name]) {
				return forms[name];
			}
		}
		return false;
	};

	/**
	 * Fetches all forms in the context.
	 *
	 * @return {Object} The forms.
	 */
	this.getForms = function() {
		return forms;
	};

	/**
	 * Sets a new item to the object, either creating or updating the current value.
	 *
	 * @param {String} key - The key for the item.
	 * @param {Object} value - The item value.
	 */
	this.setItem = function(key, value) {
		if(!!key) {
			items[key] = value;
		}
	};

	/**
	 * Merges a new item to the object.
	 *
	 * @param {String} key - The key for the item.
	 * @param {Object} value - The item value.
	 */
	this.mergeItem = function(key, value) {
		if(!!key) {
			if(!items[key]) {
				items[key] = value;
			}
			else {
				items[key] = _.extend(items[key], value);
			}
		}
	};

	/**
	 * Fetches a single item.
	 *
	 * @param {String} key - The item key.
	 * @return {Object} The - value or false, if the key was not found.
	 */
	this.getItem = function(key) {
		if(!!key && typeof items[key] != 'undefined') {
			return items[key];
		}
		return false;
	};

	/**
	 * Fetches all items.
	 *
	 * @return {Object} Object holding all keys and values.
	 */
	this.getItems = function() {
		return items;
	};
}

module.exports = CoontiRouter;
