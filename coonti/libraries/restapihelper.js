/**
 * @module CoontiLibraries/RestApiHelper
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

/**
 * Creates a new RestApiHelper object that handles GET/POST/PUT/DELETE requests and check user access rights, if needed.
 *
 * @class
 * @classdesc RestApiHelper is an utility class that routes various HTTP requests based on the request type to functions that handle such requests.
 * @param {Coonti} cnti - The coonti instance.
 * @param {Object} get - The definition of get request handler. If the API does not support such request, use false. All request handlers are objects that may contain the following keys:
 * \{ loggedIn: boolean, true to require a logged in user for the operation.
 *   allow: String|Array, name for an allow right that the user must have or an array of names of rights; one match is enough to allow. Implies loggedIn = true.
 *   deny: String|Array, name for a deny right that the user must not have or an array of names of rights; one match is enough to deny. Implies loggedIn = true.
 *   handler: Function, the function* that will be called to handle the request. The function gets Koa context as 'this'.
 * \}
 * @param {Object} post - The definition of post request handler.
 * @param {Object} put - The definition of put request handler.
 * @param {Object} del - The definition of delete request handler.
 * @return {RestApiHelper} A new RestApiHelper that can consume Koa requests.
 */
function RestApiHelper(cnti, get, post, put, del) {
	var self = this;
	var coonti = cnti;
	var userManager = coonti.getManager('user');

	this.handlers = [];
	this.handlers['GET'] = get;
	this.handlers['POST'] = post;
	this.handlers['PUT'] = put;
	this.handlers['DELETE'] = del;

	/**
	 * Serves a Koa request. If the request is denied due to user missing login, the function return HTTP error code 401; rights related reasons, error code 403; and if the request type is not supported, error code 405.
	 */
	this.serve = function*(...args) {
		var method = this.request.method;
		var handler = self.handlers[method];
		if(!handler || !handler['handler']) {
			this.set('Allow', 'GET, POST, PUT, DELETE');
			this.status=(405); // eslint-disable-line space-infix-ops
			return;
		}

		if(handler['loggedIn'] || handler['allow'] || handler['deny']) {
			var user = yield userManager.getCurrentUser(this);

			// If not logged in
			if(!user) {
				this.status=(401); // eslint-disable-line space-infix-ops
				return;
			}

			var pass = true;
			if(handler['allow']) {
				pass = false;
				if(typeof handler['allow'] == 'string') {
					handler['allow'] = [handler['allow']];
				}
				for(let i = 0; i < handler['allow'].length; i++) {
					const ret = yield user.isAllowed(handler['allow'][i]);
					if(ret) {
						pass = true;
						break;
					}
				}
			}

			if(!pass) {
				this.status=(403); // eslint-disable-line space-infix-ops
				return;
			}

			if(handler['deny']) {
				if(typeof handler['deny'] == 'string') {
					handler['deny'] = [handler['deny']];
				}
				for(let i = 0; i < handler['deny'].length; i++) {
					const ret = yield user.isDenied(handler['deny'][i]);
					if(ret) {
						pass = false;
						break;
					}
				}
			}

			if(!pass) {
				this.status=(403); // eslint-disable-line space-infix-ops
				return;
			}
		}

		yield handler.handler.apply(this, args);
	};
}

module.exports = RestApiHelper;
