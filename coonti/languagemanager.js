/**
 * @module CoontiCore/LanguageManager
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
var Gettext = require('node-gettext');
var _ = require('underscore');
var _s = require('underscore.string');
var tools = require('./tools');

var gt = new Gettext();

var coonti;
var app;

/**
 * CoontiLanguageManager handles Coonti language support. This manager is under heavy construction.
 *
 * @class
 * @classdesc Coonti language manager.
 * @param {Coonti} cnti - The Coonti instance owning the manager.
 * @return {CoontiLanguageManager} The new instance.
 */
function CoontiLanguageManager(cnti) {
	coonti = cnti;
	app = coonti.getApplication();

	var languages = {};
	var defaultLanguage = false;

	var self = this;

	/**
	 * Initialises the LanguageManager instance. This method is called by Coonti core.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Config-Init', configInitialised);
	};

	/**
	 * Loads the languages based on configuration
	 */
	var configInitialised = function*() {
		var lc = coonti.getConfigParam('languages');
		if(!lc) {
			return;
		}
		if(lc.directory) {
			var files = tools.readDirsSync(lc.directory);

			// Read in first language definition JSON files
			_.each(files, function(f) {
				if(_s.endsWith(f, '.json')) {
					var tmp = f.split('/');
					if(tmp.length > 1) {
						var langData = tools.readJSONFile(lc.directory + '/' + f);
						if(langData === false || !langData.language) {
							// ##TODO## Add verbosity with error logging
							return;
						}
						self.addLanguage(tmp[0], langData);
					}
				}
			});

			// Read in translation files
			_.each(files, function(f) {
				if(_s.endsWith(f, '.po')) {
					var tmp = f.split('/');
					if(tmp.length > 1) {
						self.addTranslation(tmp, lc.directory + '/' + f);
					}
				}
			});
		}
		if(lc.defaultLanguage) {
			self.setDefaultLanguage(lc.defaultLanguage);
		}
		else {
			self.setDefaultLanguage('en_GB');
		}
	};

	/**
	 * Returns the current default language.
	 *
	 * @return {String} The name of the default language.
	 */
	this.getDefaultLanguage = function() {
		return gt.textdomain();
	};

	/**
	 * Sets the current default language. The language must be added to the system.
	 *
	 * @param {String} lang - The new default language.
	 * @return {boolean} True on success, false on failure.
	 */
	this.setDefaultLanguage = function(lang) {
		if(!lang || !languages[lang]) {
			return false;
		}
		defaultLanguage = lang;
		gt.textdomain(lang);
		return true;
	};

	/**
	 * Adds a new language.
	 *
	 * @param {String} lang - The language, with optional country ('en_GB', 'fi_FI', etc.)
	 * @param {Object} def - The language definition object, loaded from language JSON.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addLanguage = function(lang, def) {
		if(!lang || !def) {
			return false;
		}

		if(languages[lang]) {
			return false;
		}

		languages[lang] = def;
		return true;
	};

	/**
	 * Fetches currently available languages.
	 *
	 * @return {Object} Language definitions.
	 */
	this.getLanguages = function() {
		return languages;
	};

	/**
	 * Adds a new translation file to the given language.
	 *
	 * @param {String} lang - The language.
	 * @param {String} file - The file to be loaded.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addTranslation = function(lang, file) {
		if(!lang || !file) {
			return false;
		}

		if(!languages[lang]) {
			return false;
		}

		var fileContents = fs.readFileSync(file);
		gt.addTextdomain(lang, fileContents);
		return true;
	};

	/**
	 * Translates a given string.
	 *
	 * @param {String} msg - The message to be translated.
	 * @param {String} lang - The language to be used, optional - default language will be used when not specified.
	 * @return {String} The translated string.
	 */
	this.trans = function(msg, lang) {
		if(!!msg) {
			if(lang) {
				return gt.dgettext(lang, msg);
			}
			return gt.gettext(msg);
		}
		return '';
	};

	/**
	 * Translates a given string taking plural into account.
	 *
	 * @param {String} msg - The message to be translated, single.
	 * @param {String} msgp - The message to be translated, plural.
	 * @param {integer} count - The count of items.
	 * @param {String} lang - The language to be used, optional - default language will be used when not specified.
	 * @return {String} The translated string.
	 */
	this.trans = function(msg, msgp, count, lang) {
		if(!!msg) {
			if(lang) {
				return gt.dngettext(lang, msg, msgp, count);
			}
			return gt.ngettext(msg, msg, count);
		}
		return '';
	};
}

module.exports = CoontiLanguageManager;
