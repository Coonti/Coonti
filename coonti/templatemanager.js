/**
 * @module CoontiCore/TemplateManager
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

var twig = require('twig');
var fs = require('fs');
var cofs = require('co-fs');
var _ = require('underscore');
var _s = require('underscore.string');
var thunkify = require('thunkify');
var path = require('path');
var stripJsonComments = require('strip-json-comments');
var tools = require('./tools');
var CoontiException = require('./coontiexception.js');

var coonti;
var app;

var readFileThunk = thunkify(fs.readFile);
var readDirsThunk = thunkify(tools.readDirs);

/**
 * Creates a new instance of the template manager that handles Twig based themes and their static files.
 *
 * @class
 * @classdesc Template Manager publishes content using Twig.js templates.
 * @param {Coonti} cnti - The Coonti instance owning the manager.
 * @return {CoontiTemplateManager} The new instance.
 */
function CoontiTemplateManager(cnti) {
	coonti = cnti;
	app = coonti.getApplication();

	var contents = coonti.getManager('content');

	var themeDir = '';

	var self = this;

	var templateConfig = {};
	var staticCollections = {};
	var contentTypeThemes = {};
	var contentTypeTemplates = {};
	var specialTemplates = {};
	var mediaManager;

	var themes;
	var themesOrder;
	var twigTags = {};
	
	var languageManager;
	var formManager;
	var users;
	var dependencies;
	
	var logger;
	
	/**
	 * Initialises the TemplateManager instance. This method is called by Coonti core. The method adds a listener for configuration init events.
	 */
	this.initialise = function() {
		coonti.addEventListener('Coonti-Config-Init', configInitialised);
		coonti.addEventListener('Coonti-Logging-Init', loggingInitialised);
		logger = coonti.getManager('log').getLogger('coonti-core-templatemanager');
	}

	/**
	 * Initialises the logger.
	 */
	var loggingInitialised = function*() {
		logger = coonti.getManager('log').getLogger('coonti-core-templatemanager');
	}
		
	/**
	 * Loads the templates based on configuration.
	 */
	var configInitialised = function*() {
		languageManager = coonti.getManager('language');
		formManager = coonti.getManager('form');
		users = coonti.getManager('user');
		mediaManager = coonti.getManager('media');
		dependencies = coonti.getManager('dependency');
		config = coonti.getConfig();

		self._extendTwig();
		yield coonti.fireEvent('Coonti-Theme-Init-Twig');

		var themesConfig = coonti.getConfigParam('themes');
		self.removeAllStaticCollections();
		themes = {};
		themesOrder = [];

		if(!themesConfig) {
			return;
		}

		themeDir = coonti.getConfigParam('themePath');
		if(!_s.endsWith(themeDir, '/')) {
			themeDir += '/';
		}

		var files = yield readDirsThunk(themeDir, 1);
		files.sort();
		
		var themeDirs = [];
		var dirRegexp = /^[^\/]+\/package\.json$/;
		for(var i in files) {
			if(dirRegexp.test(files[i])) {
				themeDirs.push(path.dirname(files[i]));
			}
		}

		for(var i in themeDirs) {
			try {
				var fileData = yield cofs.readFile(themeDir + themeDirs[i] + '/package.json', 'utf8');
				var themeData = JSON.parse(stripJsonComments(fileData));
				if(!themeData['name']) {
					logger.error("TemplateManager - Could not load theme '%s', as it is missing 'name' directive.", themeDirs[i]);
					continue;
				}
				if(themes[themeData['name']]) {
					logger.error("TemplateManager - Could not load theme '%s', as theme with name '%s' is already loaded.", themeDirs[i], themeData['name']);
					continue;
				}
				var themeCfg = false;
				for(var j in themesConfig) {
					if(themesConfig[j]['name'] == themeData['name']) {
						themeCfg = themesConfig[j];
						break;
					}
				}
				if(themeCfg) {
					_.deepExtend(themeData, themeCfg);
				}
				themeData.directory = themeDir + themeDirs[i] + '/';
				var depComp = dependencies.createComponent('theme', themeData.name, themeData.version, 'installed');
				if(themeData.dependencies && themeData.dependencies.length > 0) {
					for(var i = 0; i < themeData.dependencies.length; i++) {
						depComp.addDependencyObject(themeData.dependencies[i]);
					}
				}
				themeData.dependency = depComp;
				themes[themeData['name']] = themeData;
				themesOrder.push(themeData);
				yield dependencies.addComponent(depComp);
			}
			catch(e) {
				logger.error("TemplateManager - Could not load '" + themeDir + themeDirs[i] + "/package.json'.");
			}
		}
		for(var i in themesOrder) {
			var t = themesOrder[i];

			if(!t.active) {
				continue;
			}
			yield self._activateTheme(t.name, false);
		}
	}

	/**
	 * Adds a new static collection.
	 *
	 * @param {String} theme - The name of the theme.
	 * @param {String} name - The name of the collection.
	 * @param {Object} st - Static collection properties.
	 * @retun bool True on success, false on failure.
	 */
	this.addStaticCollection = function(theme, name, st) {
		if(!theme || !name || !st) {
			return false;
		}

		var t = this.getTheme(theme);
		if(!t) {
			return false;
		}
		
		var nm = theme.toLowerCase() + '_' + name;
		
		if(staticCollections[nm]) {
			return false;
		}
		
		if(st['path']) {
			st['webPath'] = st['path'] + '/' + theme;
		}
		else {
			st['webPath'] = name + '/' + theme;
		}
		var sc = new CoontiStaticCollection(this, nm, st);
		sc.initialise();
		staticCollections[nm] = sc;
		return sc;
	}

	/**
	 * Removes all static collections.
	 *
	 * @return {boolean} True on removal, false otherwise.
	 */
	this.removeAllStaticCollections = function() {
		var names = _.keys(staticCollections);
		_.each(names, function(nm) {
			self._removeStaticCollection(nm);
		});
		return true;
	}

	/**
	 * Removes a static collection.
	 *
	 * @param {String} theme - The name of the theme.
	 * @param {String} name - The name of the collection.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeStaticCollection = function(theme, name) {
		if(!theme || !name) {
			return false;
		}

		var nm = theme.toLowerCase() + '_' + name;
		self._removeStaticCollection(nm);
	}

	/**
	 * Removes a static collection, internal method.
	 *
	 * @private
	 * @param {String} name - The internal name of the collection.
	 * @return {boolean} True on success, false on failure.
	 */
	this._removeStaticCollection = function(name) {
		if(!name) {
			return false;
		}

		if(!staticCollections[name]) {
			return false;
		}
		var sc = staticCollections[name];
		sc.remove();
		delete staticCollections[name];
	}

	/**
	 * Fetches a static collection.
	 *
	 * @param {String} theme - The name of the theme.
	 * @param {String} name - The name of the collection.
	 * @return {CoontiStaticCollection} The collection or false, if no collection is found.
	 */
	this.getStaticCollection = function(theme, name) {
		if(!theme || !name) {
			return false;
		}

		var nm = theme.toLowerCase() + '_' + name;
		if(staticCollections[nm]) {
			return staticCollections[nm];
		}
		return false;
	}

	/**
	 * Lists static collections.
	 *
	 * @return {Array} The static collection names.
	 */
	this.listStaticCollections = function() {
		return _.keys(staticCollections);
	}

	/**
	 * Registers a theme for the given content type or other specific element, such as forms.
	 *
	 * @param {String} ct - The content type name.
	 * @param {String} theme - The theme name.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContentTypeTheme = function(ct, theme) {
		if(!!ct && !!theme) {
			contentTypeThemes[ct] = tmpl;
			return true;
		}
		return false;
	}

	/**
	 * Registers a template for the given content type or other specific element, such as forms.
	 *
	 * @param {String} ct - The content type name.
	 * @param {String} tmpl - The template name.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addContentTypeTemplate = function(ct, tmpl) {
		if(!!ct && !!tmpl) {
			if(ct.indexOf('/') != -1) {
				var ctSplit = ct.split('/');
				if(ctSplit[0] == 'forms') {
					specialTemplates[ct] = tmpl;
				}
				else {
					return false;
				}
			}
			else {
				contentTypeTemplates[ct] = tmpl;
				return true;
			}
		}
		return false;
	}

	/**
	 * Fetches all themes in the system.
	 *
	 * @return {Object} - The themes as key-value pairs.
	 */
	this.getThemes = function() {
		return themes;
	}

	/**
	 * Fetches a single theme from the system
	 *
	 * @param {String} name - The name of the theme.
	 * @return {Object} - The theme or false, if the theme is not found.
	 */
	this.getTheme = function(name) {
		if(!name || !themes[name]) {
			return false;
		}

		return themes[name];
	}

	/**
	 * Activates a theme. The static collections, routes, and templates of the theme are activated. The theme configuration in database is updated accordingly.
	 *
	 * @param {String} name - The theme name.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Theme-Activate-{name}
	 * @fires Coonti-Theme-Activate with name as param.
	 */
	this.activateTheme = function*(name) {
		var ret = yield this._activateTheme(name, true);
		if(ret) {
			// ##TODO## Update config
			return true;
		}
		return false;
	}
	
	/**
	 * Deactivates a theme. The static collections, routes, and templates of the theme are deactivated. The theme configuration in database is updated accordingly.
	 *
	 * @param {String} name - The theme name.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Theme-Deactivate-{name}
	 * @fires Coonti-Theme-Deactivate with name as param.
	 */
	this.deactivateTheme = function*(name) {
		if(!name || !themes[name]) {
			return false;
		}

		var t = themes[name];
		if(!t.active) {
			return true;
		}

		t.active = false;
		// ##TODO## Write configuration
		if(t['staticCollections']) {
			_.each(t['staticCollections'], function(static, key) {
				self.removeStaticCollection(t.name, key);
			});
		}
		if(t['mediaDirectories']) {
			_.each(t['mediaDirectories'], function(dir, key) {
				mediaManager.removeThemeMediaDirectory(t.name.toLowerCase(), key, dir);
			});
		}
		self._removeThemeTemplates(name);
		
		yield coonti.fireEvent('Coonti-Theme-Deactivate-' + t.name, false);
		yield coonti.fireEvent('Coonti-Theme-Deactivate', t.name);
		
		return true;
	}
	
	/**
	 * Activates a theme. The static collections, routes, and templates of the theme are activated.
	 *
	 * @private
	 * @param {String} name - The theme name.
	 * @param {boolean} updateConfig - Flag to indicate whether to update configuration (true) or not (false).
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Theme-Activate-{name}
	 * @fires Coonti-Theme-Activate with name as param.
	 */
	this._activateTheme = function*(name, updateConfig) {
		if(!name || !themes[name]) {
			return false;
		}

		var t = themes[name];
		if(!t.dependency.isResolved()) {
			logger.warn("TemplateManager - Dependency failed for '%s'.", name);
			t.active = false;
			return false;
		}

		t.active = true;
		if(t['staticCollections']) {
			_.each(t['staticCollections'], function(static, key) {
				if(!self.addStaticCollection(t.name, key, static)) {
					logger.error("TemplateManager - Invalid static collection '%s' in theme '%s'.", key, t.name);
					throw new CoontiException(CoontiException.FATAL, 4004, 'Invalid static collection "' + key + '" in theme "' + t.name + '".');
				}
			});
		}
		if(t['routes']) {
			t.routesRegexp = [];
			_.each(t.routes, function(r) {
				t.routesRegexp.push(new RegExp(r));
			});
		}
		var res = yield self.loadTemplates(t.name);
		if(res) {
			if(t['mediaDirectories']) {
				_.each(t['mediaDirectories'], function(dir, key) {
					mediaManager.addThemeMediaDirectory(t.name.toLowerCase(), key, t.directory + dir);
				});
			}
		}
		
		yield coonti.fireEvent('Coonti-Theme-Activate-' + t.name, false);
		yield coonti.fireEvent('Coonti-Theme-Activate', t.name);

		return true;
	}
		
	/**
	 * Returns theme for the given request.
	 *
	 * @param {Context} ctx - The Koa context.
	 * @return {String} The name of the theme.
	 */
	this.getRenderTheme = function(ctx) {
		var theme = false;
		var content = ctx.coonti.getItem('content');

		if(!!content['theme']) {
			theme = content.theme;
		}
		else if(!!content['contentType']) {
			var tmp = contentTypeThemes[content.contentType];
			if(!!tmp) {
				theme = tmp;
			}
			if(!theme) {
				tmp = contentTypeTemplates[content.contentType];
				if(!!tmp) {
					tmp = tmp.split('_');
					theme = tmp[0];
				}
			}
		}
		if(theme) {
			if(!themes[theme]) {
				theme = false;
			}
			if(!themes[theme].active) {
				theme = false;
			}
		}
		
		if(theme === false) {
			var route = ctx.coonti.getItem('fullRoute');
			_.find(themesOrder, function(t) {
				if(!t.active) {
					return false;
				}
				if(!t.routesRegexp) {
					return false;
				}
				var m = _.some(t.routesRegexp, function(r) {
					if(r.test(route)) {
						return true;
					}
					return false;
				});
				if(m) {
					theme = t.name;
					return true;
				}
				return false;
			});
		}
		if(theme === false) {
			for(var i = 0; i < themesOrder.length; i++) {
				if(themesOrder[i].active) {
					theme = themesOrder[i].name;
				}
			}
		}
		return theme;
	}

	/**
	 * Renders the page. The template is selected based on the route, content, and content type.
	 * 
	 * @param {Context} ctx - The Koa context.
	 */
	this.render = function*(ctx) {
		var theme = this.getRenderTheme(ctx);
		var tmpl = false;
		var content = ctx.coonti.getItem('content');
		if(!!content['template']) {
			tmpl = theme + '_' + content.template;
		}
		else if(!!content['contentType']) {
			var tmp = contentTypeTemplates[content.contentType];
			if(!!tmp) {
				tmpl = tmp;
			}
		}
		if(tmpl === false) {
			logger.warn("TemplateManager - No template found for route '%s'.", ctx.coonti.route);
			return;
		}

		var templateVars = {};
		if(ctx.coonti.hasSession()) {
			templateVars.session = ctx.coonti.getSession();	
			var user = yield users.getCurrentUser(ctx);
			if(user) {
				templateVars.user = user.getReadOnly();
			}
		}

		templateVars.http = {};
		templateVars.http.host = ctx.request['host'];
		templateVars.http.method = ctx.request['method'];
		templateVars.http.query = ctx.request['query'];
		templateVars.http.querystring = ctx.request['querystring'];
		templateVars.http.protocol = ctx.request['protocol'];
		templateVars.http.secure = ctx.request['secure'];
		templateVars.http.ip = ctx.request['ip'];

		templateVars.routing = {};
		templateVars.routing.coontiPath = ctx.coonti.getItem('coontiPath');
		templateVars.routing.prefix = ctx.coonti.getItem('prefix');
		templateVars.routing.route = ctx.coonti.getItem('route');
		templateVars.routing.fullRoute = ctx.coonti.getItem('fullRoute');

		templateVars.coonti = coonti.getMeta();
		
		var content = ctx.coonti.getItem('content');
		if(content) {
			_.extend(templateVars, content);
		}
		templateVars.forms = templateVars.forms || {};
		if(ctx.coonti.hasForms()) {
			_.each(ctx.coonti.getForms(), function(f, n) {
				templateVars.forms[n] = f.simpleSerialise();
			});
		}
		templateVars.theme = {};
		templateVars.theme.theme = theme;
		templateVars.theme.template = tmpl;
		if(themes[theme]['themeSettings']) {
			templateVars.theme.themeSettings = themes[theme]['themeSettings'];
		}
		
		var storedTemplate = twig.twig({ ref: tmpl });
		if(!storedTemplate) {
			logger.warn("TemplateManager - Template '%s' not found.", tmpl);
			// ##TODO## Show error 500
		}
		else {
			var html = yield storedTemplate.renderGenerator(templateVars);
			ctx.body=(html);
		}
	}

	/**
	 * Renders an error page. The template is selected based on the error code.
	 * 
	 * @param {CoontiRequestResponse} crr - The request/response object containing the data.
	 * @param {Function} callback - The callback to be called when the content is rendered or an error has occurred.
	 */
	this.renderError = function(crr, callback) {
		var code = 500;
		if(crr.error && crr.error.code) {
			code = crr.error.code;
		}

		// ##TODO## Fix the method to work with Koa

		// ##TODO## Check existence of the template
		var tmpl = code;
	}

	/**
	 * Adds a new Twig tag or other functionality to the template handler.
	 *
	 * @param {Object} ext - The extension object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.extendTwig = function(func) {	
		twig.extend(function(Twig) {
			var ext = func(Twig);
			if(!ext || !ext.extension) {
				return false;
			}
			if(ext.extension == 'tag') {
				if(!ext['type']) {
					return false;
				}
				if(twigTags[ext.type]) {
					return false;
				}
				twigTags[ext.type] = ext;
			}
			var type = ext.extension;
			delete ext.extension;

			if(type == 'tag') {
				Twig.exports.extendTag(ext);
			}
		});
		return true;
	}
	
	/**
	 * Extends Twig functionality with built-in Coonti Twig tags. Private method.
	 *
	 * @private
	 */
	this._extendTwig = function() {
		// ##TODO## Change extension to use self.extend() method
		
		twig.extend(function(Twig) {

			Twig.Templates.remove = function(id) {
				delete Twig.Templates.registry[id];
			}

			self._removeTemplate = function(name) {
				if(!!name) {
					delete Twig.Templates.registry[name];
				}
			}

			self._removeThemeTemplates = function(theme) {
				if(!!theme) {
					theme += '_';
					for(var i in Twig.Templates.registry) {
						if(_s.startsWith(i, theme)) {
							delete Twig.Templates.registry[i];
						}
					}
				}
			}
			
			self.removeAllTemplates = Twig.Templates.removeAll = function() {
				Twig.Templates.registry = {};
			}

			Twig.Template.prototype.renderGenerator = function*(context, params) {
				params = params || {};
				
				var output,
				url;
				
				this.context = context || {};
				
				// Clear any previous state
				this.reset();
				if (params.blocks) {
					this.blocks = params.blocks;
				}
				if (params.macros) {
					this.macros = params.macros;
				}

				output = yield Twig.parseGenerator.apply(this, [this.tokens, this.context]);

				// Does this template extend another
				if (this.extend) {
					var ext_template;
					
					// check if the template is provided inline
					if ( this.options.allowInlineIncludes ) {
						ext_template = Twig.Templates.load(this.extend);
						if ( ext_template ) {
							ext_template.options = this.options;
						}
					}
					
					// check for the template file via include
					if (!ext_template) {
						url = relativePath(this, this.extend);
						
						ext_template = Twig.Templates.loadRemote(url, {
							method: this.url?'ajax':'fs',
							base: this.base,
							async: false,
							id: url,
							options: this.options
						});
					}
					
					this.parent = ext_template;

					var tmp = yield this.parent.renderGenerator(this.context, {
						blocks: this.blocks
					});
					return tmp;
				}
				
				if (params.output == 'blocks') {
					return this.blocks;
				} else if (params.output == 'macros') {
					return this.macros;
				} else {
					return output;
				}
			};

			Twig.parseGenerator = function*(tokens, context) {
				try {
					var output = [],
					// Track logic chains
					chain = true,
					that = this;
					
					// Default to an empty object if none provided
					context = context || { };

					var parseToken = function*(token) {
						Twig.log.debug("Twig.parse: ", "Parsing token: ", token);
						switch(token.type) {
						case Twig.token.type.raw:
							output.push(token.value);
							break;
							
						case Twig.token.type.logic:
							var logic_token = token.token,
                            logic = yield Twig.logic.parseGenerator.apply(that, [logic_token, context, chain]);
							
							if(logic.chain !== undefined) {
								chain = logic.chain;
							}
							if(logic.context !== undefined) {
								context = logic.context;
							}
							if(logic.output !== undefined) {
								output.push(logic.output);
							}
							break;
							
						case Twig.token.type.comment:
							// Do nothing, comments should be ignored
							break;
							
						case Twig.token.type.output:
							Twig.log.debug("Twig.parse: ", "Output token: ", token.stack);
							// Parse the given expression in the given context
							output.push(yield Twig.expression.parseGenerator.apply(that, [token.stack, context]));
							break;
						}
					}
					for(var i in tokens) {
						yield parseToken(tokens[i]);
					}
					return Twig.output.apply(this, [output]);
					return output.join("");
				} catch(ex) {
					Twig.log.error("Error parsing twig template " + this.id + ": ");
					if(ex.stack) {
						Twig.log.error(ex.stack);
					}
					else {
						Twig.log.error(ex.toString());
					}
					
					if(this.options.rethrow) {
						throw ex;
					}
					
					if(Twig.debug) {
						return ex.toString();
					}
				}
			};

			Twig.logic.parseGenerator = function*(token, context, chain) {
				var output = '',
					token_template;
				
				context = context || { };
				
				Twig.log.debug("Twig.logic.parseGenerator: ", "Parsing logic token ", token);
				
				token_template = Twig.logic.handler[token.type];
				
				if(token_template.parseGenerator) {
					output = yield token_template.parseGenerator.apply(this, [token, context, chain]);
				}
				else if(token_template.parse) {
					output = token_template.parse.apply(this, [token, context, chain]);
				}
				return output;
			};
			
			Twig.expression.parseGenerator = function*(tokens, context) {
				var that = this;
				
				// If the token isn't an array, make it one.
				if(!(tokens instanceof Array)) {
					tokens = [tokens];
				}
				
				// The output stack
				var stack = [],
				token_template = null;

				var handler = function*(token) {
					token_template = Twig.expression.handler[token.type];
					if(token_template.parseGenerator) {
						yield token_template.parseGenerator.apply(that, [token, stack, context]);
					}
					else {
						token_template.parse && token_template.parse.apply(that, [token, stack, context]);
					}
				}

				for(var i in tokens) {
					yield handler(tokens[i]);
				}

				// Pop the final value off the stack
				return stack.pop();
			};

			Twig.logic.handler['Twig.logic.type.include'].parseGenerator = function*(token, context, chain) {
				// Resolve filename
                var innerContext = {},
                    withContext,
                    i,
                    template;

                if(!token.only) {
                    innerContext = Twig.ChildContext(context);
                }

                if(token.withStack !== undefined) {
                    withContext = Twig.expression.parse.apply(this, [token.withStack, context]);

                    for(i in withContext) {
                        if(withContext.hasOwnProperty(i)) {
                            innerContext[i] = withContext[i];
						}
                    }
                }

                var file = Twig.expression.parse.apply(this, [token.stack, innerContext]);

                if(file instanceof Twig.Template) {
                    template = file;
                } else {
                    // Import file
                    template = this.importFile(file);
                }

				var tmp = yield template.renderGenerator(innerContext);
				
                return {
                    chain: chain,
                    output: tmp
                };
            }

			// Debug tag for dumping Coonti template variables
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "debug",
					regex: /debug/,
					next: [],
					open: true,
					compile: function(token) {
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var output = JSON.stringify(context, null, 4);
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			// Angular tags to print out angular open and close tags
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "ng",
					regex: /^ng\s+(.+)$/,
					next: [],
					open: true,
					compile: function(token) {
						token.expression = token.match[1];
						
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var output = '{{ ' + token.expression + ' }}'
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "startng",
					regex: /^startng$/,
					next: ['endng'],
					open: true,
					compile: function(token) {
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var output = '{{ ' + Twig.parse.apply(this, [token.output, context]) + ' }}'
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "endng",
					regex: /^endng$/,
					next: [],
					open: false
				}
				return ret;
			});

			// GetContent tag for fetching new content from a database
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "getContent",
					regex: /^getContent\s+([a-zA-Z0-9_]+)\s+from\s+(.+)$/,
					next: [],
					open: true,
					compile: function(token) {
						var key = token.match[1].trim();
						var expression = token.match[2];
						
						expression_stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						token.key = key;
						token.expression = expression_stack;
						
						delete token.match;
						return token;
					},
					parseGenerator: function*(token, context, chain) {
						var value = Twig.expression.parse.apply(this, [token.expression, context]);
						var key = token.key;
						
						value = value.split(':');
						
						var handler = false;
						var path = false;
						if(value.length == 2) {
							handler = value[0];
							path = value[1];
						}
						else {
							path = value[0];
						}
						
						var ch = contents.getContentHandler(handler);
						var cnt = false;
						if(ch) {
							var self = this;
							var fetcher = function *() {
								var cnt = yield ch.getDirectContent(path);
								self.context[key] = cnt.content;
								context[key] = cnt.content;
							};
							yield fetcher();
						}
						
						return {
							chain: chain,
							context: context
						};
					}
				}
				return ret;
			});

			// static tag for fetching lists of static content
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "static",
					regex: /^static\s+([a-zA-Z0-9_]+)\s*=\s*(.+)$/,
					next: [],
					open: true,
					compile: function(token) {
						var key = token.match[1].trim();
						var expression = token.match[2];
						
						expression_stack = Twig.expression.compile.apply(this, [{
							type:  Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						token.key = key;
						token.expression = expression_stack;
						
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var theme = context.theme.theme;
						var value = Twig.expression.parse.apply(this, [token.expression, context]);
						var key = token.key;
						
						var coll = self.getStaticCollection(theme, value);
						if(coll) {
							// ##TODO## Read values from template and request-response collections, too
							
							var tmp = coll.listFilePaths();
							this.context[key] = tmp;
							context[key] = tmp;
						}
						
						return {
							chain: chain,
							content: context
						};
					}
				}
				return ret;
			});

			// css tag for printing out CSS files
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "css",
					regex: /^css\s*([a-zA-Z0-9_]*)$/,
					next: [],
					open: true,
					compile: function(token) {
						var expression = token.match[1];
						
						expression_stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						token.expression = expression_stack;
						
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var theme = context.theme.theme;
						var value = Twig.expression.parse.apply(this, [token.expression, context]);
						var coll = false;
						if(!!value) {
							coll = self.getStaticCollection(theme, value);
						}
						else {
							coll = self.getStaticCollection(theme, 'css');
						}
						
						var output = '';
						if(coll) {
							// ##TODO## Read values from template and request-response collections, too
							
							var files = coll.listFilePaths();
							var ct = coll.getConfigItem('contentType');
							if(!ct) {
								ct = 'text/css';
							}
							
							_.each(files, function(f) {
								if(path.extname(f) == '.css') {
									output += '<link rel="stylesheet" href="' + f + '" type="' + ct + "\"/>\n";
								}
							});
						}
						
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			// js tag for printing out JS files, uses head.js or prints out script tags
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "js",
					regex: /^js\s*(.*)$/,
					next: [],
					open: true,
					compile: function(token) {
						var expression = token.match[1];
						
						expression_stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						token.expression = expression_stack;
						
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var theme = context.theme.theme;
						var value = Twig.expression.parse.apply(this, [token.expression, context]);
						var coll = false;
						if(!!value) {
							coll = self.getStaticCollection(theme, value);
						}
						else {
							coll = self.getStaticCollection(theme, 'js');
						}
						var output = '';
						if(coll && coll.getLength() > 0) {
							var ct = coll.getConfigItem('contentType');
							if(!ct) {
								ct = 'text/javascript';
							}
							
							// ##TODO## Read values from template and request-response collections, too
							
							if(!context.theme._jsPrinted) {
								output += '<script type="' + ct  + "\"><!--\nvar coonti={routing:{prefix:'" + context.routing.prefix + "',route:'" + context.routing.route + "',coontiPath:'" + context.routing.coontiPath + "'},theme:{theme:'" + context.theme.theme + "',template:'" + context.theme.template + "',themeSettings:{";
								if(context.theme.themeSettings && context.theme.themeSettings.js) {
									for(var i in context.theme.themeSettings.js) {
										output += i + ":'" + context.theme.themeSettings.js[i] + "',";
									}
								}
								output += "}},user:";
								if(context.user) {
									output += "{account:'" + context.user.account + "'}";
								}
								else {
									output += 'false';
								}
								output += "};\n//--></script>";
							}
							context.theme._jsPrinted = true;
							
							var useHead = false;
							
							if(coll.checkFile('head.load.min.js')) {
								useHead = true;
								output += '<script src="' + coll.getFile('head.load.min.js') + '" type="' + ct + "\"></script>\n<script type=\"" + ct + "\">\n<!--\nhead.load(";
							}
					
							var files = coll.listFilePaths();
							_.each(files, function(f) {
								if(useHead) {
									output += "'" + f + "', ";
								}
								else {
									output += '<script src="' + f + '" type="' + ct + "\"></script>\n";
								}
							});
							
							if(useHead) {
								output = output.substr(0, output.length - 2) + ");\n//-->\n</script>\n";
							}
						}
						
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			// media tag for providing media paths, including also image resizing
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "media",
					regex: /^media\s+(?:(.+)\s+resize\s+(\d+|-)x(\d+|-)\s+(.+)|(.+))$/,
					next: [],
					open: true,
					compile: function(token) {
						var expression;
						if(typeof token.match[1] == 'undefined') {
							expression = token.match[5];
						}
						else {
							expression = token.match[1];
						}
						expression_stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						token.expression = expression_stack;
						token.w = token.match[2];
						token.h = token.match[3];
						token.mode = token.match[4];
						
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var value = Twig.expression.parse.apply(this, [token.expression, context]);
						var output = mediaManager.getWebPath();
						
						var resize = '';
						if(!!token.w) {
							var mode = 's';
							var hor = '';
							var ver = '';
							var w = token.w;
							var h = token.h;
							if(!!token.mode) {
								if(token.mode.indexOf('crop') != -1) {
									mode = 'c';
								}
								else if(token.mode.indexOf('pad') != -1) {
									mode = 'p';
								}
								
								if(token.mode.indexOf('top') != -1) {
									ver = 't';
								}
								else if(token.mode.indexOf('middle') != -1) {
									ver = 'm';
								}
								else if(token.mode.indexOf('bottom') != -1) {
									ver = 'b';
								}
								
								if(token.mode.indexOf('left') != -1) {
									hor = 'l';
								}
								else if(token.mode.indexOf('center') != -1) {
									hor = 'c';
								}
								else if(token.mode.indexOf('right') != -1) {
									hor = 'r';
								}
							}
							
							resize = '_' + w + 'x' + h + mode + hor + ver;
							var fileSplit = value.match(/^(.+)\.(\w+)$/);
							if(fileSplit) {
								value = fileSplit[1] + resize + '.' + fileSplit[2];
							}
							else {
								value += resize;
							}
						}
						output += value;
						
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			// templateName to print out the name of the template for debugging purposes
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "templateName",
					regex: /^templateName/,
					next: [],
					open: true,
					nameOfTemplate: false,
					compile: function(token) {
						nameOfTemplate = this.id;
						token.stack = Twig.expression.compile.apply(this, [{
							type:  Twig.expression.type.expression,
							value: ''
						}]).stack;
						
						delete token.match;
						return token;
					},
					parse: function(token, context, chain) {
						var name = Twig.expression.parse.apply(this, [token.stack, context]);
						
						return {
							chain: false,
							output: nameOfTemplate
						};
					}
				}
				return ret;
			});

			// Form tag to print out a form
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "form",
					regex: /^form\s+(.+)$/,
					next: [],
					open: true,
					compile: function(token) {
						var expression = token.match[1];
						
						token.stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						delete token.match;
						return token;
					},
					parse: function (token, context, chain) {
						var name = Twig.expression.parse.apply(this, [token.stack, context]);
						var ret = {
							chain: false,
							output: ""
						};
						if(!name) {
							return ret;
						}
						
						var formName = name.split('/');
						if(!formName || formName.length != 2) {
							return ret;
						}
						
						var form = false;
						if(context.forms[name]) {
							form = context.forms[name].submission;
						}
						
						if(form === false) {
							form = formManager.getForm(formName[0], formName[1]);
							if(form) {
								form = formManager.createEmptyFormSubmission(form);
							}
						}
						
						if(!form) {
							return ret;
						}
						
						var innerContext = {},
							withContext,
							i,
							template;
						
						if(!token.only) {
							innerContext = Twig.ChildContext(context);
						}
						
						if(token.withStack !== undefined) {
							withContext = Twig.expression.parse.apply(this, [token.withStack, context]);
							
							for(i in withContext) {
								if(withContext.hasOwnProperty(i)) {
									innerContext[i] = withContext[i];
								}
							}
						}
						
						innerContext['coontiForm'] = form;
						
						var formTemplate = specialTemplates['forms/form'];
						if(!formTemplate) {
							// ##TODO## Use generic form template provided by the system?
							return ret;
						}
						
						template = Twig.Templates.load(formTemplate);
						return {
							chain: false,
							output: template.render(innerContext)
						};
					}
				}
				return ret;
			});

			// FormElement tag to print out a form element
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "formElement",
					regex: /^formElement\s+(.+)$/,
					next: [],
					open: true,
					compile: function(token) {
						var expression = token.match[1];
						
						token.stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						delete token.match;
						return token;
					},
					parse: function (token, context, chain) {
						var name = Twig.expression.parse.apply(this, [token.stack, context]);
						var ret = {
							chain: false,
							output: ""
						};
						
						if(!name) {
							return ret;
						}
						
						var innerContext = {},
							withContext,
							i,
							template;
						if(!token.only) {
							innerContext = Twig.ChildContext(context);
						}
						
						if(token.withStack !== undefined) {
							withContext = Twig.expression.parse.apply(this, [token.withStack, context]);
							
							for(i in withContext) {
								if(withContext.hasOwnProperty(i)) {
									innerContext[i] = withContext[i];
								}
							}
						}
						
						if(!innerContext['coontiForm']) {
							return ret;
						}
						
						var form = innerContext['coontiForm'];
						var formElement = form.getFieldByName(name);
						if(!formElement) {
							return ret;
						}
						
						var type = formElement.get('type');
						if(!type) {	
							return ret;
						}
						
						var formElementTemplate = specialTemplates['forms/formElement/' + type];
						if(!formElementTemplate) {
							formElementTemplate = specialTemplates['forms/formElement/*'];
							if(!formElementTemplate) {
								// ##TODO## Use generic form template provided by the system?
								return ret;
							}
						}
						template = Twig.Templates.load(formElementTemplate);
						
						innerContext['coontiFormElement'] = formElement;
						return {
							chain: false,
							output: template.render(innerContext)
						};
					}
				}
				return ret;
			});

			// ContentType tag to set the content types the template can serve
			// ##TODO## Add similar function for setting theme in a template
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "contentType",
					regex: /^contentType\s+(.+)$/,
					next: [],
					open: true,
					compile: function(token) {
						var expression = token.match[1];
						if(!!expression) {
							expression = expression.replace(/'/g, '"');
							var dt = JSON.parse(expression);
							var tmpl = this.id;
							if(typeof dt == 'string') {
								self.addContentTypeTemplate(dt, tmpl);
							}
							else if(typeof dt == 'object') {
								_.each(dt, function(dti) {
									self.addContentTypeTemplate(dti, tmpl);
								});
							}
						}
						
						// ##TODO## Is this really needed?
						token.stack = Twig.expression.compile.apply(this, [{
							type:  Twig.expression.type.expression,
							value: expression
						}]).stack;
						
						delete token.match;
						return token;
					},
					parse: function (token, context, chain) {
						return {
							chain: false,
							output: ''
						};
					}
				}
				return ret;
			});
							
			// Trans tag translates static texts
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "trans",
					regex: /^trans(\s+with\s+{(.*)})?(\s+into\s+"(.+)")?$/,
					next: ['endtrans'],
					open: true,
					localVars: false,
					language: false,
					compile: function(token) {
						
						// Copy local variable definitions to internal object after preparing them
						if(token.match[2]) {
							var tmp = token.match[2].replace(/'%([^%]+)%'/g, '"$1"');
							tmp = tmp.replace(/"%([^%]+)%"/g, '"$1"');
							tmp = tmp.replace(/":\s*'(.*)'/g, '": "$1"');
							localVars = JSON.parse('{ ' + tmp + ' }');
							
							_.each(localVars, function(l, i) {
								localVars[i] = Twig.prepare(l);
							});
						}
						
						// Store defined language, if exists
						if(token.match[4]) {
							language = token.match[4];
						}
						delete token.match;
						return token;
					},
					parse: function (token, context, chain) {
						var innerContext = context;
						if(localVars) {
							innerContext = {};
							if(!token.only) {
								innerContext = Twig.ChildContext(context);
							}
							if(token.withStack !== undefined) {
								withContext = Twig.expression.parse.apply(this, [token.withStack, context]);
								
								for(i in withContext) {
									if(withContext.hasOwnProperty(i)) {
										innerContext[i] = withContext[i];
									}
								}
							}
							
							_.each(localVars, function(v, i) {
								innerContext[i] = Twig.parse.apply(this, [v, innerContext]);
							});
						}
						
						var rawValues = '';
						_.each(token.output, function(t, i) {
							if(t.type == 'raw') {
								rawValues += t.value;
							}
						});
						
						// ##TODO## Get actual translation before local variable substitution

						rawValues = rawValues.replace(/%([A-Za-z0-9_]+)%/g, "{{$1}}");
						rawValues = rawValues.replace(/%%/g, '%');
						token.output = Twig.prepare(rawValues);
						var output = Twig.parse.apply(this, [token.output, innerContext]);
						
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			// Endtrans tag marks the end of a static translation
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "endtrans",
					regex: /^endtrans$/,
					next: [],
					open: false
				}
				return ret;
			});

			// Transchoice tag translates static texts with choices based on number
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "transchoice",
					regex: /^transchoice\s+([A-Za-z0-9_]+)(\s+with\s+{(.*)})?(\s+into\s+"(.+)")?$/,
					next: ['endtranschoice'],
					open: true,
					localVars: false,
					language: false,
					compile: function(token) {
						var expression = token.match[1];
						
						expression_stack = Twig.expression.compile.apply(this, [{
							type: Twig.expression.type.expression,
							value: expression
						}]).stack;
						token.expression = expression_stack;
						
						// Copy local variable definitions to internal object after preparing them
						if(token.match[3]) {
							var tmp = token.match[3].replace(/'%([^%]+)%'/g, '"$1"');
							tmp = tmp.replace(/"%([^%]+)%"/g, '"$1"');
							tmp = tmp.replace(/":\s*'(.*)'/g, '": "$1"');
							localVars = JSON.parse('{ ' + tmp + ' }');
							
							_.each(localVars, function(l, i) {
								localVars[i] = Twig.prepare(l);
							});
						}
						
						// Store defined language, if exists
						if(token.match[5]) {
							language = token.match[5];
						}
						delete token.match;
						return token;
					},
					parse: function (token, context, chain) {
						var count = Twig.expression.parse.apply(this, [token.expression, context]);
						if(!count) {
							count = 0;
						}
						else {
							count = parseInt(count, 10);
						}
						
						var innerContext = context;
						if(localVars) {
							innerContext = {};
							if(!token.only) {
								innerContext = Twig.ChildContext(context);
							}
							if(token.withStack !== undefined) {
								withContext = Twig.expression.parse.apply(this, [token.withStack, context]);
								
								for(i in withContext) {
									if(withContext.hasOwnProperty(i)) {
										innerContext[i] = withContext[i];
									}
								}
							}
							
							_.each(localVars, function(v, i) {
								innerContext[i] = Twig.parse.apply(this, [v, innerContext]);
							});
						}
						
						var rawValues = '';
						_.each(token.output, function(t, i) {
							if(t.type == 'raw') {
								rawValues += t.value;
							}
						});
						
						// ##TODO## Support getting pluralisations from locale
						// https://github.com/papandreou/node-cldr
						// cldr.extractPluralRuleFunction(localeId='root')
						
						var chosenText = rawValues;
						var choicesText = rawValues.split('|');
						if(choicesText.length > 1) {
							var choices = {};
							_.find(choicesText, function(ct) {
								var found = false;
								ct = _s.trim(ct);
								var ctMatch = ct.match(/^(\{(.+)\})|((\[|\])(.+)(\]|\[))/);
								
								// Handle default 
								if(!ctMatch) {
									chosenText = ct;
									found = true;
									return true;
								}
								
								// Handle curly braces
								if(ctMatch[1]) {
									var str = ct.substr(ctMatch[1].length);
									var tests = ctMatch[2].split(',');
									_.find(tests, function(t) {
										t = _s.trim(t);
										if(t == count) {
											chosenText = str;
											found = true;
											return true;
										}
										else if(t == 'NaN' && isNaN(count)) {
											chosenText = str;
											found = true;
											return true;
										}
									});
								}
								
								// Handle square brackets
								else if(ctMatch[3]) {
									var str = ct.substr(ctMatch[3].length);
									var tests = ctMatch[5].split(',');
									
									// ##TODO## Should we provide an error?
									if(tests.length == 2) {
										var lower = _s.trim(tests[0]);
										var upper = _s.trim(tests[1]);
										
										if(lower == 'Inf' || lower == '+Inf') {
											lower = Number.POSITIVE_INFINITY;
										}
										else if(lower == '-Inf') {
											lower = Number.NEGATIVE_INFINITY;
										}
										else {
											lower = parseInt(lower, 10);
										}
										
										if(upper == 'Inf' || upper == '+Inf') {
											upper = Number.POSITIVE_INFINITY;
										}
										else if(upper == '-Inf') {
											upper = Number.NEGATIVE_INFINITY;
										}
										else {
											upper = parseInt(upper, 10);
										}
										
										if(!isNaN(lower) && !isNaN(upper)) {
											var lowerMatches = false;
											var upperMatches = false;
											
											if(ctMatch[4] == ']') {
												lowerMatches = (lower < count);
											}
											else {
												lowerMatches = (lower <= count);
											}
											
											if(ctMatch[6] == ']') {
												upperMatches = (upper >= count);
											}
											else {
												upperMatches = (upper > count);
											}
											
											if(lowerMatches && upperMatches) {
												chosenText = str;
												found = true;
												return true;
											}
										}
									}
								}
								return found;
							});
						}
						
						// ##TODO## Get actual translation before local variable substitution
						
						chosenText = chosenText.replace(/%([A-Za-z0-9_]+)%/g, "{{$1}}");
						chosenText = chosenText.replace(/%%/g, '%');
						token.output = Twig.prepare(chosenText);
						var output = Twig.parse.apply(this, [token.output, innerContext]);
						
						return {
							chain: false,
							output: output
						};
					}
				}
				return ret;
			});

			// Endtranschoice tag marks the end of a static translation choice
			self.extendTwig(function(Twig) {
				var ret = {
					extension: 'tag',
					type: "endtranschoice",
					regex: /^endtranschoice$/,
					next: [],
					open: false
				}
				return ret;
			});
		});

		// ##TODO## Add filters to templateManager.extendTwig
/*		twig.extendFilter('trans', function(value) {
			return languageManager.trans(value);
			return value;
		});
*/
	}

	/**
	 * Loads the templates from the theme directory and compiles them. Also static collections are filled. This step is required to run certain compilation time tags.
	 *
	 * @param {String} theme - The name of the theme.
	 * @return {boolean} True on success, false on failure.
	 */
	this.loadTemplates = function*(theme) {
		if(!theme) {
			return false;
		}

		var themeData = themes[theme];
		if(!themeData) {
			return false;
		}
		var themeLoc = themeData.directory; //Dir + theme;
		var tmp = [];
		if(_.size(themes[theme].clientDenyList) > 0) {
			_.each(themes[theme].clientDenyList, function(cd) {
				tmp.push(new RegExp(cd));
			});
		}
		themes[theme].clientDenyListRegexp = tmp;

		if(themes[theme]['staticCollections'] &&
		   themes[theme]['staticCollections']['angular'] &&
		   _.size(themes[theme]['staticCollections']['angular'].load) > 0) {
			tmp = [];
			_.each(themes[theme]['staticCollections']['angular'].load, function(c) {
				tmp.push(new RegExp(c));
			});
			themes[theme]['staticCollections']['angular'].loadRegexp = tmp;
		}

		if(themes[theme]['staticCollections'] &&
		   themes[theme]['staticCollections']['css'] &&
		   _.size(themes[theme]['staticCollections']['css'].load) > 0) {
			tmp = [];
			_.each(themes[theme]['staticCollections']['css'].load, function(c) {
				tmp.push(new RegExp(c));
			});
			themes[theme]['staticCollections']['css'].loadRegexp = tmp;
		}

		if(themes[theme]['staticCollections'] &&
		   themes[theme]['staticCollections']['css'] &&
		   _.size(themes[theme]['staticCollections']['js'].load) > 0) {
			tmp = [];
			_.each(themes[theme]['staticCollections']['js'].load, function(j) {
				tmp.push(new RegExp(j));
			});
			themes[theme]['staticCollections']['js'].loadRegexp = tmp;
		}

		var staticCollectionAngular = self.getStaticCollection(theme, 'angular');
		var staticCollectionTwig = self.getStaticCollection(theme, 'twig');
		var staticCollectionCss = self.getStaticCollection(theme, 'css');
		var staticCollectionJs = self.getStaticCollection(theme, 'js');
		if(themes[theme]['staticCollections']['angular'] &&
		   themes[theme]['staticCollections']['angular'].length > 0 &&
		   !staticCollectionAngular) {
			logger.warn("TemplateManager - Angular templates set, but static collection 'angular' not found.");
		}
		if(themes[theme].clientAccess && !staticCollectionTwig) {
			logger.warn("TemplateManager - Client access set, but static collection 'twig' not found.");
		}
		if(themes[theme]['staticCollections']['css'] &&
		   themes[theme]['staticCollections']['css'].length > 0 &&
		   !staticCollectionCss) {
			logger.warn("TemplateManager - CSS files set, but static collection 'css' not found.");
		}
		if(themes[theme]['staticCollections']['js'] &&
		   themes[theme]['staticCollections']['js'].length > 0 &&
		   !staticCollectionJs) {
			logger.warn("TemplateManager - JS files set, but static collection 'js' not found.");
		}

		var files = yield readDirsThunk(themeLoc);
		
		for(var k in files) {
			var f = files[k];

			var file = f.replace(/^[^\/]*\/(.*)$/, '$1');
			var subPath = f.substring(0, f.length - file.length - 1);
			var p = themeLoc + '/' + subPath;
			
			if(_s.endsWith(f, '.twig')) {
				var tid = _s.strLeftBack(f, '.twig');
				self._removeTemplate(theme + '_' + tid);
				var tpl = twig.twig({
					id: theme + '_' + tid,
					path: p + '/' + file,
					async: false
				});
				
				if(themes[theme].clientAccess && staticCollectionTwig) {
					var add = true;
					if(themes[theme].clientDenyListRegexp) {
						add = !_.some(themes[theme].clientDenyListRegexp, function(cd) {
							if(f.search(cd) != -1) {
								return true;
							}
							return false;
						});
					}
					if(add) {
						staticCollectionTwig.addFile(this, p, file);
					}
				}
				continue;
			}
			if(staticCollectionAngular) {
				var add = _.some(themes[theme]['staticCollections']['angular'].loadRegexp, function(cr) {
					if(f.search(cr) != -1) {
						return true;
					}
					return false;
				});
				if(add) {
					staticCollectionAngular.addFile(this, p, file);
					continue;
				}
			}
			if(staticCollectionCss) {
				var add = _.some(themes[theme]['staticCollections']['css'].loadRegexp, function(cr) {
					if(f.search(cr) != -1) {
						return true;
					}
					return false;
				});
				if(add) {
					staticCollectionCss.addFile(this, p, file);
					continue;
				}
			}
			if(staticCollectionJs) {
				var add = _.some(themes[theme]['staticCollections']['js'].loadRegexp, function(jr) {
					if(f.search(jr) != -1) {
						return true;
					}
					return false;
				});
				if(add) {
					staticCollectionJs.addFile(this, p, file);
					continue;
				}
			}
		}
		return true;
	}
}

/**
 * CoontiStaticCollection keeps static files from various sources under a single virtual directory, readily available for all theme files.
 *
 * @class
 * @classdesc A collection of static files in a single virtual directory.
 * @param {CoontiTemplateManager} tm - The template manager owning the collections.
 * @param {String} nm - The name of the collection.
 * @param {Object} cf - The configuration for the collection.
 */
function CoontiStaticCollection(tm, nm, cf) {
	var templateManager = tm;
	var name = nm;
	var config = cf;
	var files = {};
	var filesOrder = [];

	/**
	 * Initialises the static collection.
	 */
	this.initialise = function() {
		var path = this._getMyPath();
		var self = this;
		if(config.directories) {
			_.each(config.directories, function(d) {
				self.addDirectory(d);
			});
		}

		var router = coonti.getManager('router');
		router.addRoute(1000, 'template_' + name, path + ':file(.*)', false, function*(next) {
			var file = this.params.file;
			if(files[file]) {
				this.type=(config.contentType);
				this.body = fs.createReadStream(files[file].path);
			}
			else {
				// ##TODO## get 404 from template/config/etc.
				this.status=(404);
				this.body=('Not found');
			}
			return;
		});
		return;
	}

	/**
	 * Removes the static collection.
	 */
	this.remove = function() {
		var router = coonti.getManager('router');
		router.removeRoute('template_' + name);
	}

	/**
	 * Adds a new directory by calling this.addFile for each file in the directory.
	 *
	 * @param {String} path - The path to the directory.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addDirectory = function(path) {
		var dirFiles = tools.readDirsSync(path);
		var self = this;
		_.each(dirFiles, function(f) {
			self.addFile(self, path, f);
		});
	}

	/**
	 * Adds a new file. The base filename is used as the key to fetch the file contents.
	 *
	 * @param {Object} owner - The owner of the file, such as module or theme.
	 * @param {String} path - The path to the file. The existence of the file is checked when the file is added, not later.
	 * @param {String} file - The filename. The filename may contain directories and they are saved for external references (for handling relative references in external libraries).
	 * @return {boolean} True on success, false on failure.
	 */
	this.addFile = function(owner, path, file) {
		if(!!path) {
			var test = fs.statSync(path + '/' + file);
			if(!test || !test.isFile()) {
				return false;
			}

			var nameArray = file.split('/');
			var name = nameArray[nameArray.length - 1];
			var sortName = name;

			var listable = true;
			var realFile = file;
			if(_s.startsWith(name, 'xx_')) {
				listable = false;
				name = name.substr(3);
				nameArray[nameArray.length - 1] = name;
				file = nameArray.join('/');
			}
			else if(/^[0-9][0-9]_/.test(name)) {
				name = name.substr(3);
				nameArray[nameArray.length - 1] = name;
				file = nameArray.join('/');
			}

			var f = {
				name: file,
				sortName: sortName,
				owner: owner,
				path: path + '/' + realFile,
				listable: listable
			};
			files[file] = f;
			filesOrder.push(f);
			filesOrder = _.sortBy(filesOrder, 'sortName');

			return true;
		}
		return false;
	}

	/**
	 * Lists files' paths in the collection.
	 *
	 * @return {Array} Files' paths in the collection.
	 */
	this.listFilePaths = function() {
		var path = this._getMyPath();

		var ret = [];
		_.each(filesOrder, function(f) {
			if(f.listable) {
				ret.push(path + f.name);
			}
		});
		return ret;
	}

	/**
	 * Checks whether a file is available.
	 *
	 * @param {String} name - The name of the file.
	 * @return {boolean} True when available, false when not.
	 */
	this.checkFile = function(name) {
		if(!!name) {
			if(files[name]) {
				return true;
			}
		}
		return false;
	}

	/**
	 * Fetches the HTML path for the given file.
	 *
	 * @param {String} name - The name of the file.
	 * @return {String} The path or false, if the file is not found.
	 */
	this.getFile = function(name) {
		if(!!name) {
			if(files[name]) {
				return this._getMyPath() + files[name].name;
			}
		}
		return false;
	}

	/**
	 * Fetches the contents of the given file.
	 *
	 * @param {String} name - The name of the file.
	 * @return {String} The contents of the file or false, if the file is not found.
	 */
	this.getFileContents = function*(name) {
		if(!!name) {
			if(files[name]) {
				return yield readFileThunk(this._getMyPath() + files[name].name);
			}
		}
		return false;
	}

	/**
	 * Returns configuration item from this collection.
	 *
	 * @param {String} name - The name of the config item.
	 * @return {String} The value of the config item or false, if no such item is found.
	 */
	this.getConfigItem = function(name) {
		if(!!name) {
			if(config[name]) {
				return config[name];
			}
		}
		return false;
	}

	/**
	 * Returns the lenght of the collection.
	 *
	 * @return {int} The number of files in the collection.
	 */
	this.getLength = function() {
		return filesOrder.length;
	}

	/**
	 * Calculates the path of this collection.
	 *
	 * @private
	 * @return {String} Path to this collection.
	 */
	this._getMyPath = function() {
		return coonti.getWebPath(config.webPath + '/');
	}
}

/**
 * CoontiDirectoryCollection keeps static files from various directories under a single virtual directory split into subdirectories, readily available for all theme files.
 *
 * @class
 * @classdesc A collection of directories and files under a single virtual directory.
 * @param {CoontiTemplateManager} tm - The template manager owning the collections.
 * @param {String} nm - The name of the collection.
 * @param {Object} cf - The configuration for the collection.
 */
function CoontiDirectoryCollection(tm, nm, cf) {
	var templateManager = tm;
	var name = nm;
	var config = cf;
	var files = {};
}

module.exports = CoontiTemplateManager;
