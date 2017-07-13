/**
 * @module CoontiCore/FormManager
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
var validator = require('validator');
var SortedArray = require('./libraries/sortedarray');

var coonti;
var formElements = {};
var formManager;

/**
 * Creates a new instance of the form manager that handles form submissions and verifications.
 *
 * @class
 * @classdesc Form Manager hosts collections of forms and their validation rules.
 * @param {Coonti} cnti - The Coonti instance owning the manager.
 * @return {CoontiFormManager} The new instance.
 */
function CoontiFormManager(cnti) {
	coonti = cnti;
	formManager = this;

	var formCollections = {};
	var validators = {};
	var sanitisers = {};
	var self = this;

	/**
	 * Initialises the manager.
	 */
	this.initialise = function() {
		addBasicValidators();
		addBasicSanitisers();
		addBasicElements();

		coonti.addEventListener('Coonti-Config-Init', configInitialised);
	};

	/**
	 * Finalises the manager initialisation.
	 */
	var configInitialised = function*() { // eslint-disable-line require-yield
		var formConfig = coonti.getConfigParam('forms');
		if(!formConfig) {
			return;
		}

		var path = formConfig['path'];
		var tmplPath = formConfig['jsTemplates'];

		var router = coonti.getManager('router');
		// ##TODO## Support CoontiPath config
		if(!!path) {
			router.addRoute(2000, 'formManagerForms', '/' + path + '/:col/:form', false, function*(next) { // eslint-disable-line require-yield
				var col = this.params.col;
				var fm = this.params.form;
				if(!!col && !!fm) {
					var form = self.getForm(col, fm);
					if(form) {
						var fields = form.getFields();
						var ret = {
							name: col + '/' + fm,
							fields: fields
						};

						// ##TODO## check whether form can be sent over JSON and whether some information should be stripped.
						this.body = ret;
						this.type=('application/json'); // eslint-disable-line space-infix-ops
						return;
					}
				}
				this.status=(404); // eslint-disable-line space-infix-ops
				this.body=('Not found'); // eslint-disable-line space-infix-ops
			});
		}

		if(!!tmplPath) {
			router.addRoute(2000, 'formManagerTemplates', '/' + tmplPath + '/:lang/:tmpl', false, function*(next) { // eslint-disable-line require-yield
				var lang = this.params.lang;
				var tmpl = this.params.tmpl;
				if(!!lang && !!tmpl) {
					var ret = self.getTemplate(lang, tmpl);
					if(ret) {
						this.body = ret;
						this.type=('text/html'); // eslint-disable-line space-infix-ops
						return;
					}
				}
				this.status=(404); // eslint-disable-line space-infix-ops
				this.body=('Not found'); // eslint-disable-line space-infix-ops
			});
		}
	};

	/**
	 * Creates a new form collection.
	 *
	 * @param {String} name - The name of the new collection, needs to be unique.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addCollection = function(name) {
		if(!name) {
			return false;
		}

		if(formCollections[name]) {
			return false;
		}

		formCollections[name] = {};
		return true;
	};

	/**
	 * Removes a form collection.
	 *
	 * @param {String} name - The name of the collection to be removed.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeCollection = function(name) {
		if(!name || !formCollections[name]) {
			return false;
		}

		delete formCollections[name];
		return true;
	};

	/**
	 * List form collections.
	 *
	 * @return {Array} of form collection names.
	 */
	this.listCollections = function() {
		return _.keys(formCollections);
	};

	/**
	 * Checks whether the given form collection exists.
	 *
	 * @param {String} name - The name of the of collection.
	 * @return {Boolean} True, if collection exists, false otherwise.
	 */
	this.checkCollection = function(name) {
		if(!!name) {
			if(formCollections[name]) {
				return true;
			}
		}
		return false;
	};

	/**
	 * Creates a new form.
	 *
	 * @param {String} col - The name of the collection.
	 * @param {String} nm - The name of the form.
	 * @param {String} hd - The route to the handler of the form, i.e. the submission URL. Optional, defaults to the page that contains the form.
	 * @return {Object} The newly created form or false, if creation failed.
	 */
	this.addForm = function(col, nm, hd) {
		if(!col || !formCollections[col] || !nm) {
			return false;
		}

		if(formCollections[col][nm]) {
			return false;
		}

		if(!hd) {
			hd = '';
		}

		var form = new CoontiForm(col, nm, hd);
		formCollections[col][nm] = form;
		return form;
	};

	/**
	 * Removes a form.
	 *
	 * @param {String} col - The name of the collection.
	 * @param {String} nm - The name of the form.
	 * @return {Boolean} true on success, false on failure.
	 */
	this.removeForm = function(col, nm) {
		if(!col || !formCollections[col] || !nm) {
			return false;
		}

		if(!formCollections[col][nm]) {
			return false;
		}
		var col = formCollections[col];
		delete col[nm];
		return true;
	};

	/**
	 * Fetches all form names in the given collection.
	 *
	 * @param {String} col - The name of the collection.
	 * @return {Array} The forms or false, if the form is not found.
	 */
	this.listForms = function(col) {
		// ##TODO## Check access rights for limited collections

		if(!col || !formCollections[col]) {
			return false;
		}
		return Object.keys(formCollections[col]);
	};

	/**
	 * Fetches a form.
	 *
	 * @param {String} col - The name of the collection.
	 * @param {String} nm - The name of the form.
	 * @return {CoontiForm} The form or false, if the form is not found.
	 */
	this.getForm = function(col, nm) {
		// ##TODO## Check access rights for limited collections

		if(!col || !formCollections[col] || !nm || !formCollections[col][nm]) {
			return false;
		}

		return formCollections[col][nm];
	};

	/**
	 * Adds a new form element.
	 *
	 * @param {String} name - The name of the element.
	 * @param {Object} attr - Form element attributes, including default value, validators, default rendering template, etc.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addFormElement = function(name, attr) {
		if(!name || !attr || formElements[name]) {
			return false;
		}

		if(attr.validators) {
			var so = new SortedArray();
			_.each(attr.validators, function(v) {
				if(v.priority && v.validator) {
					so.insert(v.validator, -v.priority);
				}
			});
			attr.validators = so;
		}

		attr.name = name;
		formElements[name] = attr;
		return true;
	};

	/**
	 * Removes a form element.
	 *
	 * @param {String} name - The name of the element.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeFormElement = function(name) {
		if(!name || !formElements[name]) {
			return false;
		}

		delete formElements[name];
		return true;
	};

	/**
	 * Lists form elements.
	 *
	 * @return {Array} The available form elements.
	 */
	this.getFormElements = function() {
		return _.values(formElements);
	};

	/**
	 * Handles form submission by finding suitable form based on the input data and creating a form submission object to encapsulate the data.
	 *
	 * @param {Object} fields - The form submission data.
	 * @return {CoontiFormSubmission} The submitted form, ready for validation etc, or false, if no suitable form was found.
	 */
	this.createFormSubmission = function(fields) {
		if(_.size(fields) == 0 || !fields['coontiFormId']) {
			return false;
		}

		var formId = fields['coontiFormId'].split('-_-');
		if(formId.length == 2) {
			var form = this.getForm(formId[0], formId[1]);
			if(form) {
				var submission = form.createSubmission(fields, true);
				return submission;
			}
		}
		return false;
	};

	/**
	 * Creates an empty form submission for forms that are not yet submitted.
	 *
	 * @param {CoontiForm} form - The form instance.
	 * @return {CoontiFormSubmission} The empty form submission or false, if the form is not found.
	 */
	this.createEmptyFormSubmission = function(form) {
		if(form) {
			var submission = form.createSubmission({}, false);
			return submission;
		}
		return false;
	};

	/**
	 * Adds a new validator for form elements to use.
	 *
	 * @param {String} name - The name of the validator.
	 * @param {Object} validator - The validator object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addValidator = function(name, validator) {
		if(!!name && validator && !validators[name]) {
			validators[name] = validator;
			return true;
		}
		return false;
	};

	/**
	 * Fetches list of available validators.
	 *
	 * @return {Array} The names of available validators.
	 */
	this.getValidators = function() {
		return _.keys(validators);
	};

	/**
	 * Fetches a single validator.
	 *
	 * @param {String} name - The name of the validator.
	 * @return {Object} The requested validator or false, if there is no such validator.
	 */
	this.getValidator = function(name) {
		if(!!name && validators[name]) {
			return validators[name];
		}
		return false;
	};

	/**
	 * Adds a new sanitiser for form elements to use.
	 *
	 * @param {String} name - The name of the sanitiser.
	 * @param {Object} sanitiser - The sanitiser object.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addSanitiser = function(name, sanitiser) {
		if(!!name && sanitiser && !sanitisers[name]) {
			sanitisers[name] = sanitiser;
			return true;
		}
		return false;
	};

	/**
	 * Fetches list of available sanitisers.
	 *
	 * @return {Array} The names of available sanitisers.
	 */
	this.getSanitisers = function() {
		return _.keys(sanitisers);
	};

	/**
	 * Fetches a single sanitiser.
	 *
	 * @param {String} name - The name of the sanitiser.
	 * @return {Object} The requested sanitiser or false, if there is no such sanitiser.
	 */
	this.getSanitiser = function(name) {
		if(!!name && sanitisers[name]) {
			return sanitisers[name];
		}
		return false;
	};

	/**
	 * Fetches a template for rendering a form in a JS templating language in the client.
	 *
	 * @param {String} lang - The name of the JS templating language. Currently supports only 'angular'.
	 * @param {String} name - The name of the template.
	 * @return {String} The requested template or false, if there is no such template.
	 */
	this.getTemplate = function(lang, name) {
		if(lang == 'angular' && !!name) {
			// ##TODO## This needs to be refactored later, as it should be read from a file or so.
			if(name == 'form') {
				var tmpl = '<div id="{{ form.name }}-wrapper">\n<form id="{{ form.name }}">\n';
				tmpl += "<div class=\"coontiNgFormElement\" ng-repeat=\"field in form.fields |filter:{skip:'!yes'}\">\n";

				_.each(formElements, function(el, nm) {
					tmpl += "<div ng-if=\"field.formElement.type=='" + nm + "'\">\n";
					tmpl += el.templates.angular;
					tmpl += '\n</div>\n';
				});
				tmpl += '\n</div>\n</form>\n</div>\n';
				return tmpl;
			}
		}
		return false;
	};

	/**
	 * Adds basic form elements that are provided by Coonti.
	 */
	var addBasicElements = function() {
		// ##TODO## Should these be in a configuration file?

		self.addFormElement('text',
			{
				type: 'text',
				defaultValue: '',
				templates: {
					twig: '<input name="{{ field.name }}" type="text" value="{{ field.value }}"/>',
					angular: '<label for="{{ form.id }}{{ field.id }}">{{ field.localDef.name }}</label><input id="{{ form.id }}{{ field.id }}" name="{{ field.name }}" type="text" ng-model="field.value"/>'
				}
			});
		self.addFormElement('password',
			{
				type: 'password',
				defaultValue: '',
				templates: {
					twig: '<input name="{{ field.name }}" type="password" value="{{ field.value }}"/>',
					angular: '<input name="{{ field.name }}" type="password" ng-model="field.value""/>'
				}
			});
		self.addFormElement('display',
			{
				type: 'display',
				defaultValue: '',
				templates: {
					twig: '<div>{{ field.value }}</div>',
					angular: '<div>{{ field.value }}</div>'
				}
			});

		self.addFormElement('integer',
			{
				type: 'integer',
				defaultValue: '',
				validators: [
					{
						priority: 1000,
						validator: 'isInteger'
					}
				],
				sanitiser: 'toInteger',
				templates: {
					twig: '<input name="{{ field.name }}" type="text" value="{{ field.value }}"/>',
					angular: '<input name="{{ field.name }}" type="text" ng-model="field.value"/>'
				}
			});

		self.addFormElement('email',
			{
				type: 'email',
				defaultValue: '',
				validators: [
					{
						priority: 1000,
						validator: 'isEmail'
					}
				],
				templates: {
					twig: '<input name="{{ field.name }}" type="text" value="{{ field.value }}"/>',
					angular: '<input name="{{ field.name }}" type="text"  ng-model="field.value"/>'
				}
			});

		self.addFormElement('textarea',
			{
				type: 'textarea',
				defaultValue: '',
				templates: {
					twig: '<textarea name="{{ field.name }}">{{ field.value }}</textarea>',
					angular: '<label for="{{ form.id }}{{ field.id }}">{{ field.localDef.name }}</label><textarea id="{{ form.id }}{{ field.id }}" name="{{ field.name }}" ng-model="field.value"></textarea>'
				}
			});

		self.addFormElement('wysiwyg', // ##TODO## Fix twig to support actual wysiwyg
			{
				type: 'wysiwyg',
				defaultValue: '',
				templates: {
					twig: '<textarea name="{{ field.name }}">{{ field.value }}</textarea>',
					angular: '<label for="{{ form.id }}{{ field.id }}">{{ field.localDef.name }}</label><div text-angular ng-model="field.value"></div>'
				}
			});

		self.addFormElement('image', // ##TODO## Fix to use some decent image uploading / gallery system
			{
				type: 'image',
				defaultValue: '',
				templates: {
					twig: '<input name="{{ field.name }}" type="text" value="{{ field.value }}"/>',
					angular: '<label for="{{ form.id }}{{ field.id }}">{{ field.localDef.name }}</label><input id="{{ form.id }}{{ field.id }}" name="{{ field.name }}" type="text" ng-model="field.value"/>'
				}
			});

		self.addFormElement('checkbox',
			{
				type: 'checkbox',
				defaultValue: false,
				sanitiser: 'handleCheckboxValue',
				templates: { // ##TODO## Fix value
					twig: '<input name="{{ field.name }}" type="checkbox"/>',
					angular: '<input name="{{ field.name }}" type="checbox"/>'
				}
			});

		self.addFormElement('select',
			{
				type: 'select',
				templates: {
					twig: '##TODO##',
					angular: '##TODO##'
				}
			});

		self.addFormElement('submit',
			{
				type: 'submit',
				defaultValue: 'Submit',
				templates: {
					twig: '<input name="{{ field.name }}" type="submit" value="{{ field.value }}"/>',
					angular: '<input name="{{ field.name }}" type="submit" value="{{ field.value }}"/>'
				}
			});
	};

	var addBasicValidators = function() {
		self.addValidator('isEmail',
						  {
							  validate: function(str) {
								  return validator.isEmail(str);
							  },
							  message: 'Please input a valid email address.'
						  });

		self.addValidator('isInteger',
						  {
							  validate: function(str) {
								  return validator.isInt(str);
							  },
							  message: 'Please input a whole number.'
						  });
		self.addValidator('inIntegerRange',
						  {
							  validate: function(str, params) {
								  var v = validator.toInt(str);
								  if(isNaN(v)) {
									  return false;
								  }
								  if(v < params['minValue'] || v > params['maxValue']) {
									  return false;
								  }
								  return true;
							  },
							  message: 'Please input a whole number.'
						  });
	};

	/**
	 * Adds the default sanitiser functions.
	 */
	var addBasicSanitisers = function() {
		self.addSanitiser('toInteger',
						  {
							  sanitise: function(str) {
								  return validator.toInt(str);
							  }
						  });
		self.addSanitiser('handleCheckboxValue',
						  {
							  sanitise: function(str) {
								  if(str == 'on') {
									  return true;
								  }
								  return false;
							  }
						  });
	};
}

/**
 * CoontiForm contains form elements, including validators. An individual form submission is stored into a CoontiFormSubmission object.
 *
 * @class
 * @classdesc CoontiForm is a collection of form elements with their validators
 * @param {String} col - The form collection.
 * @param {String} nm - The name/id of the form.
 * @param {String} hd - The route to the handler of the form.
 * @return {CoontiForm} The new instance.
 */
function CoontiForm(col, nm, hd) {
	var formCollection = col;
	var formName = nm;
	var formHandler = hd;
	var fields = [];
	var fieldsByName = {};

	/**
	 * Adds a new field element to the form.
	 *
	 * @param {String} name - The name of the new field.
	 * @param {String} field - The form element that is used.
	 * @param {Object} localDef - Local form element definitions that override the form element definitions. Optional.
	 * @param {integer} - pos The position for the new field. Optional, defaults to the last position.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addField = function(name, field, localDef, pos) {
		if(!name || !field || !formElements[field] || fieldsByName[name]) {
			return false;
		}

		if(!localDef) {
			localDef = false;
		}

		if(localDef['validators']) {
			var so = new SortedArray();
			_.each(localDef.validators, function(v) {
				if(v.priority && v.validator) {
					so.insert(v, -v.priority);
				}
			});
			localDef.validators = so;
		}

		var formField = {
			id: formName + '-_-' + name,
			name: name,
			formName: formName,
			formCollection: formCollection,
			formElement: formElements[field],
			localDef: localDef
		};

		pos = parseInt(pos, 10);
		if(isNaN(pos)) {
			fields.push(formField);
		}
		else {
			fields.splice(pos, 0, formField);
		}
		fieldsByName[name] = formField;
		return true;
	};

	// ##TODO## Add field removal functions (by pos + by name)

	/**
	 * Gets the number of fields.
	 *
	 * @return {int} The lenght of the form.
	 */
	this.getNumberOfFields = function() {
		return fields.length;
	};

	/**
	 * Gets fields of the form.
	 *
	 * @return {Array} The fields.
	 */
	this.getFields = function() {
		return fields;
	};

	/**
	 * Gets field at given position.
	 *
	 * @param {integer} pos - The position.
	 * @return {Object} The form field at the given position, or false if no such field is found.
	 */
	this.getFieldAt = function(pos) {
		pos = parseInt(pos, 0);
		if(isNaN(pos)) {
			return false;
		}

		if(pos < 0 || pos >= fields.length) {
			return false;
		}

		return fields[pos];
	};

	/**
	 * Gets field by name.
	 *
	 * @param {String} nm - The name of the field.
	 * @return {Object} The form field with the given name, or false if no such field is found.
	 */
	this.getFieldByName = function(nm) {
		if(!!nm && fieldsByName[nm]) {
			return fieldsByName[nm];
		}
		return false;
	};

	/**
	 * Returns the id of the form, used in hidden input fields to find the relevant form for validation etc.
	 *
	 * @return {String} The id.
	 */
	this.getId = function() {
		return formCollection + '-_-' + formName;
	};

	/**
	 * Returns the collection of the form.
	 *
	 * @return {String} The collection.
	 */
	this.getCollection = function() {
		return formCollection;
	};

	/**
	 * Returns the name of the form.
	 *
	 * @return {String} The name.
	 */
	this.getName = function() {
		return formName;
	};

	/**
	 * Returns the handler of the form.
	 *
	 * @return {String} The handler.
	 */
	this.getHandler = function() {
		return formHandler;
	};

	/**
	 * Creates a CoontiFormSubmission object from the given data.
	 *
	 * @param {Object} data - The form submission key value pairs.
	 * @param {boolean} submitted - Whether the form was submitted (true) or not (false).
	 * @return {CoontiFormSubmission} New submission object.
	 */
	this.createSubmission = function(data, submitted) {
		var sub = new CoontiFormSubmission(this, submitted);
		if(_.size(data) == 0) {
			return sub;
		}

		_.each(data, function(d, i) {
			sub.addValue(i, d);
		});
		return sub;
	};
}

/**
 * CoontiFormSubmission contains a single submission to a CoontiForm object.
 *
 * @class
 * @classdesc A submitted data of a CoontiForm.
 * @param {CoontiForm} frm - The form object.
 * @param {boolean} sbm - Whether the form submission was created by actual submission (true) or not (false).
 * @return {CoontiFormSubmission} The new instnace.
 */
function CoontiFormSubmission(frm, sbm) {
	var form = frm;
	var fields = [];
	var fieldsByName = {};
	var errors = false;

	var message = false;

	_.each(form.getFields(), function(f, i) {
		var fsf = {
			field: f,
			value: undefined,
			errors: [],
			get: function(ref) {
				var tmp = this._get(ref);
				if(tmp === false) {
					return '';
				}
				return tmp;
			},
			has: function(ref) {
				var tmp = this._get(ref);
				if(tmp === false) {
					return false;
				}
				if(tmp instanceof Array && _.size(tmp) == 0) {
					return false;
				}
				return true;
			},
			_get: function(ref) {
				var getter = false;
				if(this.hasOwnProperty(ref) && typeof (this[ref]) != 'undefined') { // eslint-disable-line no-prototype-builtins
					getter = this[ref];
				}
				else if(this.field[ref]) {
					getter = this.field[ref];
				}
				else if(this.field.localDef[ref]) {
					getter = this.field.localDef[ref];
				}
				else if(this.field.formElement[ref]) {
					getter = this.field.formElement[ref];
				}
				if(getter === false) {
					return false;
				}
				if(_.isFunction(getter)) {
					return getter();
				}
				return getter;
			},
			addError: function(errorMessage) {
				if(!!errorMessage) {
					this.errors.push(errorMessage);
				}
			}
		};
		fields[i] = fsf;
		fieldsByName[fsf.field.name] = fsf;
	});

	var submitted = sbm;
	var validated = false;

	var self = this;

	/**
	 * Fetches the CoontiForm object for the submission.
	 *
	 * @return {CoontiForm} The CoontiForm object.
	 */
	this.getForm = function() {
		return form;
	};

	/**
	 * Checks whether the submission is due to actual form submission.
	 *
	 * @return {boolean} True if the form was submitted and false for empty placeholder form submissions.
	 */
	this.isSubmitted = function() {
		return submitted;
	};

	/**
	 * Adds a new value to the submission.
	 *
	 * @param {String} key - The key for the value.
	 * @param {String} val - The value.
	 */
	this.addValue = function(key, val) {
		if(!!key && fieldsByName[key]) {
			fieldsByName[key].value = val;
		}
	};

	/**
	 * Gets a value from the submission.
	 *
	 * @param {String} key - The key for the value.
	 * @return {String} The value or false, if no such value is available.
	 */
	this.getValue = function(key) {
		if(!!key && fieldsByName[key]) {
			return fieldsByName[key].value;
		}
		return false;
	};

	/**
	 * Gets all values from the submission.
	 *
	 * @return {Object} The values indexed with their keys.
	 */
	this.getValues = function() {
		var values = {};
		_.each(fieldsByName, function(v, i) {
			values[i] = v;
		});
		return values;
	};

	/**
	 * Validates the form submission. Errors are injected into form submission fields.
	 *
	 * @return {boolean} True when form submission was ok, false otherwise.
	 */
	this.validate = function() {
		errors = false;
		_.each(fieldsByName, function(f, n) {
			if(f.has('required')) {
				if(f.get('value') == '') {
					f.addError('The field is required. Please provide a value.');
					errors = true;
					return;
				}
			}

			var validators = [];
			if(f.field.localDef['validators'] && f.field.localDef['validators'].size() > 0) {
				validators[0] = f.field.localDef['validators'];
			}
			if(f.field.formElement['validators'] && f.field.formElement['validators'].size() > 0) {
				validators.push(f.field.formElement['validators']);
			}

			if(validators.length > 0) {
				var iter;
				if(validators.length == 1) {
					iter = validators[0].iterator();
				}
				else {
					iter = validators[0].iterator(validators[1]);
				}
				var val = f.get('value');
				for(var i = 0; i < iter.length; i++) {
					var v = iter[i];
					var validator = false;
					var params = false;
					var message = false;
					if(typeof v == 'function') {
						validator = v;
					}
					else if(typeof v == 'string' || v instanceof String) {
						validator = formManager.getValidator(v);
					}
					else if(typeof v == 'object' && v['validator']) {
						if(typeof v['validator'] == 'function') {
							validator = v['validator'];
						}
						else {
							validator = formManager.getValidator(v['validator']);
						}
						if(v['params']) {
							params = v['params'];
						}
						if(v['message']) {
							message = v['message'];
						}
					}
					if(validator == false) {
						f.errors.push('Defined validator was not found. Please inform site administration.');
						errors = true;
						return;
					}
					if(!validator.validate(val, params)) {
						f.errors.push(message || validator.message);
						errors = true;
						if(validator['stop']) {
							return;
						}
					}
				}
			}

			var sn = f.get('sanitiser');
			if(sn) {
				var sanitiser = formManager.getSanitiser(sn);
				if(sanitiser == false) {
					f.errors.push('Defined sanitiser was not found. Please inform site administration.');
					errors = true;
				}
				else {
					f.value = sanitiser.sanitise(f.get('value'));
				}
			}
		});

		validated = true;
		return !errors;
	};

	/**
	 * Checks whether the submission has been validated.
	 *
	 * @return {boolean} True for validated forms, false for non-validated ones.
	 */
	this.isValidated = function() {
		return validated;
	};

	/**
	 * Checks whether the submission is ok (validated and has no errors).
	 *
	 * @return {boolean} True for ok forms, false for non-validated or erroneous ones.
	 */
	this.isOk = function() {
		return validated && !errors;
	};

	/**
	 * Gets fields of the form submission.
	 *
	 * @return {Array} The fields.
	 */
	this.getFields = function() {
		return fields;
	};

	/**
	 * Gets form field at the given position, calls the same function in the CoontiForm object.
	 *
	 * @param {integer} - The position.
	 * @return {Object} The form field at the given position, or false if no such field is found.
	 */
	this.getFieldAt = function(pos) {
		pos = parseInt(pos, 0);
		if(isNaN(pos)) {
			return false;
		}

		if(pos < 0 || pos >= fields.length) {
			return false;
		}

		return fields[pos];
	};

	/**
	 * Gets field by name, calls the same function in the CoontiForm object.
	 *
	 * @param {String} nm - The name of the field.
	 * @return {Object} The form field with the given name, or false if no such field is found.
	 */
	this.getFieldByName = function(nm) {
		if(!nm || !fieldsByName[nm]) {
			return false;
		}
		return fieldsByName[nm];
	};

	/**
	 * Adds an error to a form field.
	 *
	 * @param {String} nm - The name of the field.
	 * @param {String} error - The error.
	 * @return {boolean} True on success, false on failure.
	 */
	this.addError = function(nm, error) {
		if(!nm || !error || !fieldsByName[nm]) {
			return false;
		}
		fieldsByName[nm].errors.push(error);
		errors = true;
		return true;
	};

	/**
	 * Adds a generic message to the form.
	 *
	 * @param {String} msg - The message to be added.
	 */
	this.addMessage = function(msg) {
		message = msg;
	};

	/**
	 * Removes a message from the form.
	 */
	this.removeMessage = function() {
		message = false;
	};

	/**
	 * Fetches the generic message (if set) from the form.
	 *
	 * @return {String} The message or false, if there is no message.
	 */
	this.getMessage = function() {
		return message;
	};

	/**
	 * Returns the id of the form, used in hidden input fields to find the relevant form for validation etc.
	 *
	 * @return {String} The id.
	 */
	this.getId = function() {
		return form.getId();
	};

	/**
	 * Returns the collection of the form.
	 *
	 * @return {String} The collection.
	 */
	this.getCollection = function() {
		return form.getCollection();
	};

	/**
	 * Returns the name of the form.
	 *
	 * @return {String} The name.
	 */
	this.getName = function() {
		return form.getName();
	};

	/**
	 * Returns the handler of the form.
	 *
	 * @return {String} The handler.
	 */
	this.getHandler = function() {
		return form.getHandler();
	};

	/**
	 * Serialises the form submission along form data for templating and other purposes.
	 *
	 * @return {Object} The form serialisation.
	 */
	this.simpleSerialise = function() {
		var ret = {};
		ret.fields = {};

		ret.collection = form.formCollection;
		ret.name = form.formName;
		ret.handler = form.formHandler;
		ret.submitted = submitted;
		ret.validated = validated;
		ret.isOk = self.isValidated();
		ret.submission = this;

		_.each(fields, function(f) {
			var r = {};
			r.name = f.field.name;
			r.type = f.field.formElement.type;
			r.required = f.field.localDef.required || false;
			r.value = f.value;
			r.errors = f.errors;

			var copied = ['defaultValue', 'label', 'values'];
			_.each(copied, function(c) {
				if(f.field.localDef[c]) {
					r[c] = f.field.localDef[c];
				}
				else if(f.field.formElement[c]) {
					r[c] = f.field.formElement[c];
				}
			});

			if((f.field.localDef.validators && _.size(f.field.localDef.validators) > 0) ||
			   (f.field.formElement.validators && _.size(f.field.formElement.validators) > 0)) {
				r.validators = true;
			}
			else {
				r.validators = false;
			}
			ret['fields'][r.name] = r;
		});
		return ret;
	};
}

module.exports = CoontiFormManager;
