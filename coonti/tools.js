/**
 * @module CoontiCore/Tools
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
var fs = require('fs');
var path = require('path');
var stripJsonComments = require('strip-json-comments');

/**
 * Library for various functions needed around Coonti.
 *
 * @class
 * @classdesc Utility class holding numerous tools.
 */
function CoontiTools() {

	/**
	 * Gets the Coonti directory.
	 *
	 * @return {String} An absolute path to Coonti directory.
	 */
	this.getCoontiDir = function() {
		return path.join(__dirname, '..') + '/';
	};


	/**
	 * Reads a directory and returns list of files in it and subdirectories.
	 *
	 * @param {String} baseDir - The path of the directory to be read.
	 * @param {integer} depth - The depth of the search. Omit or set to false to read without depth limits.
	 * @param {Function} callback - The callback that is called when the directory and its subdirectories have been read.
	 */
	this.readDirs = function(baseDir, depth, callback) {
		var res = [];
		if(typeof depth === 'function') {
			callback = depth;
			depth = false;
		}

		var intRead = function(dir, dp, cb) {
			fs.readdir(baseDir + '/' + dir, function(err, list) {
				if(err) {
					cb(err);
					return;
				}

				var left = list.length;
				if(!left) {
					cb(null, res);
					return;
				}
				list.sort();

				_.each(list, function(f) {
					if(dir != '') {
						f = dir + '/' + f;
					}
					var path = baseDir + '/' + f;
					fs.stat(path, function(err, st) {
						if(st && st.isDirectory() && dp !== 0) {
							intRead(f, (dp === false ? dp : dp - 1), function(err, recursive) {
								if(!--left) {
									cb(null, res);
								}
							});
						} else {
							res.push(f);
							if(!--left) {
								cb(null, res);
							}
						}
					});
				});
			});
		};
		intRead('', depth, callback);
	};

	/**
	 * Synchronously reads a directory and returns list of files in it and in subdirectories.
	 *
	 * @param {String} baseDir - The path of the directory to be read.
	 * @return {Array} The files.
	 */
	this.readDirsSync = function(baseDir) {
		var res = [];
		var intRead = function(dir) {
			var list = fs.readdirSync(baseDir + '/' + dir);
			if(list.length == 0) {
				return;
			}

			list.sort();
			_.each(list, function(f) {
				if(dir != '') {
					f = dir + '/' + f;
				}
				var path = baseDir + '/' + f;
				var st = fs.statSync(path);
				if(st && st.isDirectory()) {
					intRead(f);
				}
				else {
					res.push(f);
				}
			});
		};
		intRead('');
		return res;
	};

	/**
	 * Reads and parses a JSON data from the given file.
	 *
	 * @param {String} file - The name of the file.
	 * @return {Object} The parsed JSON or false, if the file reading fails.
	 */
	this.readJSONFile = function(file) {
		if(!file) {
			return false;
		}

		try {
			var tmp = fs.readFileSync(file, 'utf8');
			data = JSON.parse(stripJsonComments(tmp));
			return data;
		}
		catch(e) {
			console.dir(e);
			return false;
		}
	};

	/**
	 * Stringifies an Object into JSON string and excludes the given keys (on all levels of the object tree).
	 *
	 * @param {Object} obj - The object to be stringified.
	 * @param {Array} exclude - The keys to be excluded.
	 * @return {String} JSON String without excluded keys.
	 */
	this.stringifyExclude = function(obj, exclude) {
		if(!exclude || Object.prototype.toString.call(exclude) !== '[object Array]') {
			return JSON.stringify(obj);
		}
		return JSON.stringify(obj, function(key, value) {
			if(exclude.indexOf(key) != -1) {
				return undefined;
			}
			return value;
		});
	};
}

/*  Copyright (C) 2012-2014  Kurt Milam - http://xioup.com | Source: https://gist.github.com/1868955
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
 *  The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
 *
 *  THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
**/

// Based conceptually on the _.extend() function in underscore.js ( see http://documentcloud.github.com/underscore/#extend for more details )

function deepExtend(obj) {
	var parentRE = /#{\s*?_\s*?}/,
		slice = Array.prototype.slice;

	_.each(slice.call(arguments, 1), function(source) {
		for(var prop in source) {
			if(_.isUndefined(obj[prop]) || _.isFunction(obj[prop]) || _.isNull(source[prop]) || _.isDate(source[prop])) {
				obj[prop] = source[prop];
			}
			else if(_.isString(source[prop]) && parentRE.test(source[prop])) {
				if(_.isString(obj[prop])) {
					obj[prop] = source[prop].replace(parentRE, obj[prop]);
				}
			}
			else if(_.isArray(obj[prop]) || _.isArray(source[prop])) {
				if(!_.isArray(obj[prop]) || !_.isArray(source[prop])) {
					throw new Error('Trying to combine an array with a non-array (' + prop + ')');
				} else {
					obj[prop] = _.reject(_.deepExtend(_.clone(obj[prop]), source[prop]), function (item) { return _.isNull(item); });
				}
			}
			else if(_.isObject(obj[prop]) || _.isObject(source[prop])) {
				if(!_.isObject(obj[prop]) || !_.isObject(source[prop])) {
					throw new Error('Trying to combine an object with a non-object (' + prop + ')');
				} else {
					obj[prop] = _.deepExtend(_.clone(obj[prop]), source[prop]);
				}
			} else {
				obj[prop] = source[prop];
			}
		}
	});
	return obj;
}

_.mixin({ deepExtend: deepExtend });

module.exports = new CoontiTools();
