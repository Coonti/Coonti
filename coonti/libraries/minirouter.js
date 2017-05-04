/**
 * @module CoontiLibraries/MiniRouter
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

/**
 * Creates a new MiniRouter instance that can be used to dispatch control flow to methods based on URLs.
 *
 * @class
 * @classdesc Minirouter can be used to dispatch control flows based on URLs.
 * @return {MiniRouter} A MiniRouter with no routes.
 */
function MiniRouter() {
	this.routes = [];
}

/**
 * Adds a new route.
 *
 * @param {String} name - The name of the route, must be unique.
 * @param {String} re - The regexp string to match URLs. The regepx is automatically prepended with ^ to make sure that all routes start matching from the beginning.
 * @param {Function} fn - The function* that will be called, if the route is matched.
 * @return {boolean} True on success, false on failure.
 */
MiniRouter.prototype.addRoute = function(name, re, fn) {
	if(!name || !re || !fn) {
		return false;
	}

	if(this.getRoute(name)) {
		return false;
	}

	var route = {
		name: name,
		regexp: new RegExp('^' + re),
		func: fn
	};

	this.routes.push(route);
	return true;
};

/**
 * Removes a route.
 *
 * @param {String} name - The name of the route.
 * @return {boolean} True on success, false on failure.
 */
MiniRouter.prototype.removeRoute = function(name) {
	if(!name) {
		return false;
	}

	for(var i = 0; i < this.routes.length; i++) {
		if(routes[i].name == name) {
			routes.splice(i, 1);
			return true;
		}
	}
	return true;
};

/**
 * Routes a request.
 *
 * @param {String} request - The request.
 * @return {Function} The function that handles such requests or false, if no route was found.
 */
MiniRouter.prototype.route = function(request) {
	for(var i = 0; i < this.routes.length; i++) {
		var r = this.routes[i];
		var params = request.match(r.regexp);
		if(params) {
			var callParams = [];
			for(var j = 1; j < params.length; j++) {
				if(params[j]) {
					callParams[j - 1] = decodeURIComponent(params[j]);
				}
				else {
					callParams[j - 1] = params[j];
				}
			}
			var func = r.func;
			return function*(ctx) {
				return yield func.apply(ctx, callParams);
			};
		}
	}
};

/**
 * Fetches a route by name.
 *
 * @param {String} name - The name of the route.
 * @return {Object} The route object or false, if the route was not found.
 */
MiniRouter.prototype.getRoute = function(name) {
	if(!!name) {
		var route = _.find(this.routes, function(r) {
			if(r.name == name) {
				return true;
			}
			return false;
		});

		if(!route) {
			return false;
		}
		return route;
	}
	return false;
};

module.exports = MiniRouter;
