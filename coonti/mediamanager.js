/**
 * @module CoontiCore/MediaManager
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

var fs = require('fs');
var cofs = require('co-fs');
var gm = require('gm');
var _ = require('underscore');
var _s = require('underscore.string');
var mime = require('mime-types');
var path = require('path');
var cacheManager = require('cache-manager');
var thunkify = require('thunkify');
var tools = require('./tools');
var exec = require('child_process').exec;

var coonti;
var config;

/**
 * CoontiMediaManager provides functionality for media support.
 *
 * @class
 * @classdesc Manages media files in Coonti.
 * @param {Coonti} cnti - The Coonti instance.
 * @return {CoontiMediaManager} The new instance.
 */
function CoontiMediaManager(cnti) {
	coonti = cnti;

	var self = this;
	var cacheDir = false;
	var webPath;

	var gmInstalled = false;
	var iconDefinition = false;
	var thumbnailIcons = {};

	var dirs;
	var fileNameCache;
	var _getFromCache;
	var _setToCache;
//	var _delFromCache;

	var logger;

	/**
	 * Initialises the media manager.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Config-Init', configInitialised);
		logger = coonti.getManager('log').getLogger('coonti-core-mediamanager');
	};

	/**
	 * Loads the media configuration.
	 */
	var configInitialised = function*() {
		config = coonti.getConfig();
		dirs = {};

		// ##TODO## This filename caching could be replaced by caching actual images in the memory
		fileNameCache = cacheManager.caching({ store: 'memory', max: 100 }); // ##TODO## Read max from configuration
		_getFromCache = thunkify(fileNameCache.get);
		_setToCache = thunkify(fileNameCache.set);
//		_delFromCache = thunkify(fileNameCache.del);

		var mediaConfig = coonti.getConfigParam('media');
		if(!mediaConfig) {
			mediaConfig = {};
		}
		if(!mediaConfig['path']) {
			mediaConfig['path'] = 'media';
		}
		if(!mediaConfig['directories']) {
			mediaConfig['directories'] = {};
		}

		// Check whether GM has been installed or not
		exec('gm version', function (error, stdout, stderr) {
			if(!error) {
				gmInstalled = true;
			}
			else {
				logger.warn("'gm' not available, image resizing will not work.");
			}
		});

		if(!_s.endsWith(mediaConfig['path'], '/')) {
			mediaConfig['path'] += '/';
		}
		webPath = coonti.getWebPath(mediaConfig['path']);

		if(!mediaConfig['cacheDirectory']) {
			mediaConfig['cacheDirectory'] = 'content/cache';
		}
		if(!_s.endsWith(mediaConfig['cacheDirectory'], '/')) {
			mediaConfig['cacheDirectory'] += '/';
		}
		cacheDir = mediaConfig['cacheDirectory'];

		if(mediaConfig['iconDefinition']) {
			iconDefinition = mediaConfig['iconDefinition'];
		}

		var defaultFound = false;
		var firstDir = false;
		_.each(mediaConfig['directories'], function(dir, key) {
			dirs[key] = dir;
			if(dir['default']) {
				defaultFound = true;
			}
			if(!firstDir && dir['type'] == 'content') {
				firstDir = key;
			}
		});
		if(!defaultFound && firstDir) {
			dirs[firstDir].default = true;
		}

		var router = coonti.getManager('router');
		router.removeRoute('mediamanager');
		router.addRoute(500, 'mediamanager', webPath + '*', false, function*(next) {
			var origFile = this.params[0];
			if(!!origFile) {
				var cached = yield _getFromCache(origFile);
				if(cached) {
					this.type = mime.lookup(origFile);
					this.set('Cache-Control', 'max-age=60');
					this.body = yield self._safeCreateReadStream(cached);
					return;
				}
				var dir = origFile.split('/');
				if(dir.length > 0) {
					if(dir[0] == '_') {
						if(dir.length < 4) {
							this.res.status = (404);
							this.res.body = ('Not found');
							return;
						}
						dir = dir[0] + '/' + dir[1] + '/' + dir[2];
					}
					else {
						dir = dir[0];
					}
					var file = origFile.substring(dir.length + 1);
					if(dirs[dir]) {
						var realFile = dirs[dir].path + '/' + file;
						try {
							this.type = mime.lookup(file);
							this.set('Cache-Control', 'max-age=60');
							this.body = yield self._safeCreateReadStream(realFile);
							yield _setToCache(origFile, realFile);
						} catch(e) {
							yield self._cacheCreateServe(this, dir, file);
						}
						return;
					}
				}
			}
			// ##TODO## get 404 from template/config/etc.
			this.res.status = (404);
			this.res.body = ('Not found');
			yield next;
		});

		var tnConfig = yield config.readConfigFromDb('coontiThumbnails');
		if(!tnConfig) {
			return;
		}
		thumbnailIcons = {};
		if(tnConfig['thumbnails']) {
			_.each(tnConfig['thumbnails'], function(t) {
				var icon = t.icon;
				_.each(t['types'], function(type) {
					thumbnailIcons[type] = icon;
				});
			});
		}
	};

	/**
	 * Adds a new theme media directory.
	 *
	 * @param {String} theme - The name of the theme.
	 * @param {String} webPath - The web path that is used to access the directory.
	 * @param {String} mediaDir - The media directory to be added.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addThemeMediaDirectory = function(theme, webPath, mediaDir) {
		if(!theme || !webPath || !mediaDir) {
			return false;
		}

		webPath = '_/' + theme + '/' + webPath;
		if(dirs[webPath]) {
			return false;
		}
		dirs[webPath] = {
			path: mediaDir,
			type: 'theme'
		};
		return true;
	};

	/**
	 * Removes a theme media directory.
	 *
	 * @param {String} theme - The name of the theme.
	 * @param {String} webPath - The web path that is used to access the directory.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeThemeMediaDirectory = function(theme, webPath) {
		if(!theme || !webPath) {
			return false;
		}

		webPath = '_/' + theme + '/' + webPath;

		if(!dirs[webPath]) {
			return true;
		}

		delete dirs[webPath];
		return true;
	};

	/**
	 * Adds a new file to a media directory.
	 *
	 * @param {String} dir - The virtual directory. The directory must be of type 'content'.
	 * @param {String} file - The name of the file.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addFile = function*(dir, file) { // eslint-disable-line require-yield
		// ##TODO##

		return false;
	};

	/**
	 * Removes a file from a media directory.
	 *
	 * @param {String} dir - The virtual directory. The directory must be of type 'content'.
	 * @param {String} file - The name of the file.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeFile = function*(dir, file) {
		if(!dir || !file || !dirs[dir]) {
			return false;
		}

		if(dirs[dir].type != 'content') {
			return false;
		}

		try {
			yield cofs.unlink(dirs[dir].path + '/' + file);
			yield this._purgeFileFromCache(dir, file);
			return true;
		}
		catch(e) {
			// No action
		}
		return false;
	};

	/**
	 * Fetches the web path of the media manager.
	 *
	 * @return {string} The web path for the media.
	 */
	this.getWebPath = function() {
		return webPath;
	};

	/**
	 * Fetches the available media directories of the given type.
	 *
	 * @param {String} type - The required type. Currently the system uses 'content' for directories that contain content related files and 'theme' for theme directories. Only content directories should be managed by the web admin interface.
	 * @return {Object} The available media directories of the given type.
	 */
	this.getMediaDirectoriesByType = function(type) {
		if(!type) {
			return {};
		}

		var ret = {};
		_.each(dirs, function(d, i) {
			if(d.type == type) {
				ret[i] = d;
			}
		});
		return ret;
	};

	/**
	 * Fetches the available media directories.
	 *
	 * @return {Object} The available media directories.
	 */
	this.getMediaDirectories = function() {
		return dirs;
	};

	/**
	 * Fetches the default directory.
	 *
	 * @return {String} The name of the default directory.
	 */
	this.getDefaultDirectory = function() {
		const dk = Object.keys(dirs);
		for(let i = 0; i < dk.length; i++) {
			if(dirs[dk[i]].default) {
				return dk[i];
			}
		}
		return false;
	};

	/**
	 * Fetches the media files from the given (virtual) media directory.
	 *
	 * @param {String} dir - The directory name.
	 * @param {Object} pg - The pagination object - this Object is modified by the method.
	 * @return {Array} The file names or false, if the directory is not registered.
	 */
	this.getMediaFiles = function*(dir, pg) {
		if(!dir || !dirs[dir]) {
			return false;
		}

		if(!pg['start'] || pg['search']) {
			pg['start'] = 0;
		}
		if(!pg['len']) {
			pg['len'] = Number.MAX_VALUE;
		}
		var reader = thunkify(tools.readDirs);
		var files = yield reader(dirs[dir].path);

		if(!!pg.filter) {
			var nFiles = [];
			var checker = new RegExp(pg.filter);
			for(var i = 0; i < files.length; i++) {
				if(checker.test(files[i])) {
					nFiles.push(files[i]);
				}
			}
			files = nFiles;
		}

		pg['total'] = files.length;
		var ret = [];

		if(pg['start'] >= files.length) {
			return ret;
		}
		var end = pg['start'] + pg['len'];
		if(end > files.length) {
			end = files.length;
		}

		var st = pg['start'];
		var en = end;
		if(pg['sort'] != 'name' && pg['sort'] != '-name') {
			st = 0;
			en = files.length;
		}
		if(pg['sort'] == '-name') {
			files.reverse();
		}
		if(pg['search'] && (pg['sort'] == 'name' || pg['sort'] == '-name')) {
			for(var i = 0; i < files.length; i++) {
				if(files[i] == pg['search']) {
					st = Math.floor(i / pg['len']) * pg['len'];
					pg['start'] = st;
					en = Math.min(pg['start'] + pg['len'], files.length);
					end = en;
				}
			}
		}

		for(var i = st; i < en; i++) {
			var st = yield cofs.stat(dirs[dir].path + '/' + files[i]);
			var fileData = {
				name: files[i],
				size: st.size,
				mtime: st.mtime.getTime(),
				type: mime.lookup(files[i]),
				thumbnail: this.getThumbnail(dir, files[i])
			};
			ret.push(fileData);
		}
		if(pg['sort'] != 'name' && pg['sort'] != '-name') {
			var reverse = false;
			var sortKey = pg['sort'];
			if(_s.startsWith(sortKey, '-')) {
				reverse = true;
				sortKey = sortKey.substring(1);
			}
			ret = _.sortBy(ret, sortKey);
			if(reverse) {
				ret.reverse();
			}
			if(pg['search']) {
				for(var i = 0; i < ret.length; i++) {
					if(ret[i].name == pg['search']) {
						pg['start'] = Math.floor(i / pg['len']) * pg['len'];
						end = Math.min(pg['start'] + pg['len'], files.length);
					}
				}
			}
			ret = ret.slice(pg['start'], end);
		}

		return ret;
	};

	/**
	 * Provides thumbnail web path for the given file.
	 *
	 * @param {String} dir - The virtual directory.
	 * @param {String} file - The name of the file.
	 * @return {String} The path of the thumbnail or false, if there is no thumbnail available.
	 */
	this.getThumbnail = function(dir, file) {
		if(!dir || !file) {
			return false;
		}

		var mimeType = mime.lookup(file);
		if(!mimeType) {
			mimeType = 'default';
		}

		if(gmInstalled && iconDefinition && (mimeType == 'image/jpeg' || mimeType == 'image/png' || mimeType == 'image/gif')) {
			var split = file.match(/^(.+)\.(\w+)$/);
			if(split) {
				return dir + '/' + split[1] + '_' + iconDefinition + '.' + split[2];
			}
		}

		if(thumbnailIcons[mimeType]) {
			return thumbnailIcons[mimeType];
		}

		mimeType = 'default';

		if(thumbnailIcons[mimeType]) {
			return thumbnailIcons[mimeType];
		}

		return false;
	};

	/**
	 * Moves and renames a file to the given directory. If the new name is already taken, the method creates a new name.
	 *
	 * @param {String} oldDir - The source directory.
	 * @param {String} oldFile - The file to be moved.
	 * @param {String} dir - The virtual directory in which the file will be moved.
	 * @param {String} file - The new name for the file.
	 * @return {String} The (new) name of the moved file, or false if the move failed.
	 */
	this.moveFile = function*(oldDir, oldFile, dir, file) {
		if(!oldDir || !dirs[oldDir] || !oldFile) {
			return false;
		}

		var odf = dirs[oldDir].path + '/' + oldFile;
		return yield this.moveFileIntoDirectory(odf, dir, file);
	};

	/**
	 * Moves a (temporary) file to the given directory. If the name is already taken, the method renames the file.
	 *
	 * @param {String} oldFile - The file (with full path) to be moved.
	 * @param {String} dir - The virtual directory in which the file will be moved.
	 * @param {String} file - The new name for the file.
	 * @return {String} The (new) name of the moved file, or false if the move failed.
	 */
	this.moveFileIntoDirectory = function*(oldFile, dir, file) {
		if(!oldFile || !dir || !dirs[dir] || !file) {
			return false;
		}

		try {
			yield cofs.stat(oldFile);
		}
		catch(e) {
			return false;
		}

		var destFileBase = path.basename(file);
		var destFileExt = path.extname(file);
		var destFileName = path.basename(file, destFileExt);
		var finalFile = destFileBase;
		for(var i = 1; ; i++) {
			try {
				yield cofs.stat(dirs[dir].path + '/' + finalFile);
				finalFile = destFileName + '-' + i + destFileExt;
			}
			catch(e) {
				break;
			}
		}
		try {
			yield cofs.rename(oldFile, dirs[dir].path + '/' + finalFile);
		}
		catch(e) {
			return false;
		}
		return finalFile;
	};

	/**
	 * Checks whether a resized version of the media is cached or can be created and serves that to the client.
	 *
	 * @param {Context} ctx - The Koa context.
	 * @param {String} dir - The virtual directory of the file.
	 * @param {String} file - The name of the file.
	 */
	this._cacheCreateServe = function*(ctx, dir, file) {
		if(!gmInstalled) {
			// ##TODO## get 404 from template/config/etc.
			ctx.status = (404);
			ctx.body = ('Not found');
			return;
		}

		var cacheFile = cacheDir + dir.replace(/\//g, '-_-') + '-_-' + file.replace(/\//g, '-_-');
		var realFile = dirs[dir].path + '/' + file;
		try {
			ctx.body = yield self._safeCreateReadStream(cacheFile);
			yield _setToCache(dir + '/' + file, cacheFile);
			return;
		} catch(e) {
			// Fall through
		}

		var re = /^(.+)_(\d+|-)x(\d+|-)([a-z]*)\.(\w+)$/;
		var split = realFile.match(re);
		if(split) {
			var origFile = split[1] + '.' + split[5];
			var w, h;
			if(split[2] == '-') {
				w = -1;
			}
			else {
				w = parseInt(split[2], 10);
			}
			if(split[3] == '-') {
				h = -1;
			}
			else {
				h = parseInt(split[3], 10);
			}
			var method = split[4];
			try {
				var img = gm(origFile);
				if(img) {
					var sizer = function(img) {
						return function(callback) {
							img.size(callback);
						};
					};
					var size = yield sizer(img);
					if(size) {
						var ow = size.width;
						var oh = size.height;

						if(w == -1) {
							w = h / oh * ow;
						}
						else if(h == -1) {
							h = w / ow * oh;
						}

						var nw = w;
						var nh = h;

						var cw = w;
						var ch = h;
						var cx = 0;
						var cy = 0;

						var scale = false;

						// Crop
						if(method[0] == 'c') {
							nw = Math.max(nw, w * ow / oh * h / w);
							nh = Math.max(nh, h * oh / ow * w / h);

							cx = Math.floor((nw - cw) / 2);
							cy = Math.floor((nh - ch) / 2);

							if(method[1]) {
								if(method[1] == 'l') {
									cx = 0;
								}
								if(method[1] == 'r') {
									cx = nw - cw;
								}
							}

							if(method[2]) {
								if(method[2] == 't') {
									cy = 0;
								}
								if(method[2] == 'b') {
									cy = nh - ch;
								}
							}
						}

						// Scale
						else if(method[0] == 's') {
							scale = true;
						}

						// Pad
						else if(method[0] == 'p') {
							// ##TODO##
						}

						var resizer = function(file) {
							return function(callback) {
								img.resize(nw, nh, (scale ? '' : '!')).crop(cw, ch, cx, cy).write(cacheFile, callback);
							};
						};

						yield resizer(file);
						ctx.body = yield self._safeCreateReadStream(cacheFile);
						yield _setToCache(dir + '/' + file, cacheFile);
						return;
					}
				}
			}
			catch(e) {
				// Pass through
			}
		}

		// ##TODO## get 404 from template/config/etc.
		this.status = (404);
		this.body = ('Not found');
	};

	/**
	 * Removes all versions of file from cache. Must be called when file is removed or updated.
	 *
	 * @ignore
	 * @param {String} dir - The virtual directory.
	 * @param {String} file - The name of the file.
	 */
	this._purgeFileFromCache = function*(dir, file) {
		if(!dir || !file || !dirs[dir]) {
			return;
		}

		const cacheFiles = yield cofs.readdir(cacheDir);
		if(!cacheFiles || cacheFiles.length == 0) {
			return;
		}

		let fileRe = file;
		const split = file.match(/^(.+)\.(\w+)$/);
		if(split) {
			fileRe = split[1] + '_(\\d+)x(\\d+)([a-z]*)\\.' + split[2];
		}

		const fileRegexp = new RegExp('^' + dir + '-_-' + fileRe + '$');

		for(let i = 0; i < cacheFiles.length; i++) {
			if(fileRegexp.test(cacheFiles[i])) {
				try {
					yield cofs.unlink(cacheDir + cacheFiles[i]);
				}
				catch(e) {
					// Fall through
				}
			}
		}
	};

	/**
	 * Creates a ReadStream instance through opening the file first and passing the handle to the fs.createReadStream(). This ensures that if the file does not exist, the error is thrown inside Coonti and not Koa code.
	 *
	 * @private
	 * @param {String} file - The name of the file.
	 * @return {ReadStream} The new ReadStream instance.
	 */
	this._safeCreateReadStream = function*(file) {
		var fd = yield cofs.open(file, 'r');
		return fs.createReadStream(file, { fd: fd });
	};
}

module.exports = CoontiMediaManager;
