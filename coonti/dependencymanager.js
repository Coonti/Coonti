/**
 * @module CoontiCore/DependencyManager
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

var coonti;

/**
 * CoontiDependencyManager is a storage for managing dependencies between SubModules of Coonti.
 *
 * @class
 * @classdesc Manages dependencies in Coonti.
 * @param {Coonti} cnti - The Coonti instance.
 * @return {CoontiDependencyManager} The new instance.
 */
function CoontiDependencyManager(cnti) {
	coonti = cnti;

	var self = this;
	var components = {};

	/**
	 * Initialises the dependency manager.
	 */
	this.initialise = function() {
	}

	/**
	 * Creates an empty component. These components are used to resolve dependencies, i.e. check whether a subsystem has all dependencies satisfied or not.
	 *
	 * @param {String} col - The component collection, such as 'Coonti', 'Module', 'Theme', etc.
	 * @param {String} name - The component name.
	 * @param {String} version - The component version, in form of 1.0.0 - always three numbers. Maximum version number for each subversion is 999.
	 * @param {String} state - The state of the component.
	 * @return {Component|boolean} The new component object that is added with dependencies or false, if the component cannot be added.
	 */
	this.createComponent = function(col, name, version, state) {
		if(!col || !name || !version || !state) {
			return false;
		}

		var versionNumber = _calculateVersionNumber(version);
		if(versionNumber === false) {
			return false;
		}

		if(!components[col]) {
			components[col] = {};
		}

		return new Component(self, col, name, version, versionNumber, state);
	}

	/**
	 * Adds a component and resolves dependencies. If there is already component with same collection and name, the old component is replaced with new one.
	 *
	 * @param {Component} comp - The component to be added.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Dependency-Component-Added with the added component as param.
	 */
	this.addComponent = function*(comp) {
		if(!comp) {
			return false;
		}

		var col = comp.getCollection();
		var name = comp.getName();

		if(!components[col]) {
			components[col] = {};
		}

		components[col][name] = comp;
		yield coonti.fireEvent('Coonti-Dependency-Component-Added', comp);
		yield this._resolveDependencies();
		return true;
	}
	
	/**
	 * Removes an available component and resolves dependencies.
	 *
	 * @param {Component} comp - The component to be removed.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Dependency-Component-Removed with the removed component as param.
	 */
	this.removeComponent = function*(comp) {
		if(!comp) {
			return false;
		}

		var col = comp.getCollection();
		var name = comp.getName();

		if(!components[col] && !components[col][name]) {
			return false;
		}

		comp = components[col][name];
		delete components[col][name];

		yield coonti.fireEvent('Coonti-Dependency-Component-Removed', comp);
		yield this._resolveDependencies();
		return true;
	}

	/**
	 * Updates an available component version and resolves dependencies.
	 *
	 * @param {Component} comp - The component to be updated.
	 * @param {String} state - The new state.
	 * @return {boolean} True on success, false on failure.
	 * @fires Coonti-Dependency-Component-Removed with the removed component as param.
	 */
	this.updateComponentState = function*(comp, state) {
		if(!comp) {
			return false;
		}

		var col = comp.getCollection();
		var name = comp.getName();

		if(!components[col] && !components[col][name]) {
			return false;
		}

		comp = components[col][name];
		comp._setState(state);

		yield coonti.fireEvent('Coonti-Dependency-Component-Updated', comp);
		yield this._resolveDependencies();
		return true;
	}

	/**
	 * Fetches a component.
	 *
	 * @param {String} col - The component collection, such as 'Coonti', 'Module', 'Theme', etc.
	 * @param {String} name - The component name.
	 * @return {Component|boolean} The component object or false, if there is no such component.
	 */
	this.getComponent = function(col, name) {
		if(!col || !name) {
			return false;
		}

		if(!components[col] || !components[col][name]) {
			return false;
		}

		return components[col][name];
	}
	
	/**
	 * Lists available components and their dependencies.
	 *
	 * @return {Object} - Hashmap of components, indexed with collections and then names.
	 */
	this.listComponents = function() {
		return components;
	}

	/**
	 * Resolves dependencies, called by all methods that changes components or dependencies.
	 *
	 * @private
	 * @fires Coonti-Dependency-Component-Resolved with the changed component as param.
	 * @fires Coonti-Dependency-Component-Nonresolved with the changed component as param.
	 */
	this._resolveDependencies = function*() {
		var changedDeps = [];
		for(var c in components) {
			for(var n in components[c]) {
				var oldResolved = components[c][n].isResolved();
				var resolved = components[c][n]._resolveDependencies();
				if(resolved != oldResolved) {
					if(resolved) {
						yield coonti.fireEvent('Coonti-Dependency-Component-Resolved', components[c][n]);
					}
					else {
						yield coonti.fireEvent('Coonti-Dependency-Component-Nonresolved', components[c][n]);
					}
				}
			}
		}
	}
}

/**
 * A component with dependencies.
 *
 * @class
 * @classdesc Class that represents a component that has dependencies.
 * @param {DependencyManager} dm - The dependency manager managing the new object.
 * @param {String} col - The component collection, such as 'Coonti', 'Module', 'Theme', etc.
 * @param {String} nm - The component name.
 * @param {String} verString - The component version as a String, in form of 1.0.0 - always three numbers. Maximum version number for each subversion is 999.
 * @param {integer} verNumber - The component version as an integer.
 * @param {String} st - The state of the component.
 */
function Component(dm, col, nm, verString, verNumber, st) {
	
	var dependencyManager = dm;
	var collection = col;
	var name = nm;
	var versionString = verString;
	var versionNumber = verNumber;
	var state = st;

	var dependencies = [];
	var resolved = false;	

	/**
	 * Fetches the collection of the component.
	 *
	 * @return {String} The collection name.
	 */
	this.getCollection = function() {
		return collection;
	}
	
	/**
	 * Fetches the name of the component.
	 *
	 * @return {String} The component name.
	 */
	this.getName = function() {
		return name;
	}
	
	/**
	 * Fetches the version of the component.
	 *
	 * @return {integer} The version as a number.
	 */
	this.getVersionNumber = function() {
		return versionNumber;
	}
	
	/**
	 * Fetches the state of the component.
	 *
	 * @return {String} The state.
	 */
	this.getState = function() {
		return state;
	}

	/**
	 * Sets the state of the component. This method is not to be called outside DependencyManager.
	 *
	 * @param {String} newState - The new state.
	 */
	this._setState = function(newState) {
		state = newState;
	}
	
	/**
	 * Adds a dependency as an Object.
	 *
	 * @param {String} dep - The dependency object with the following keys: collection, name, minVersion, maxVersion, states. Collection and name are mandatory.
	 * @return {boolean} True on success, false on failure (of adding, not resolving the dependency).
	 */
	this.addDependencyObject = function(dep) {
		if(!dep || !dep['collection'] || !dep['name']) {
			return false;
		}

		if(!dep['minVersion']) {
			dep.minVersion = false;
		}
		if(!dep['maxVersion']) {
			dep.maxVersion = false;
		}
		if(!dep['states']) {
			dep.states = false;
		}
		this.addDependency(dep.collection, dep.name, dep.minVersion, dep.maxVersion, dep.states);
	}

	/**
	 * Adds a dependency.
	 *
	 * @param {String} col - The component collection of the dependency.
	 * @param {String} name - The component name of the dependency. The dependency does not need to exist.
	 * @param {String|boolean} minVersion - The minimum version of the dependency. Use false, if it does not matter.
	 * @param {String|boolean} maxVersion - The maximum version of the dependency. Use false, if it does not matter.
	 * @param {String|Array} states - The acceptable states, either as String with | as separator or an Array. Use false, if it does not matter.
	 * @return {boolean} True on success, false on failure (of adding, not resolving the dependency).
	 */
	this.addDependency = function(col, name, minVersion, maxVersion, states) {
		if(!col || !name) {
			return false;
		}

		var minVersionNumber = -1;
		var maxVersionNumber = -1;
		if(!!minVersion) {
			minVersionNumber = _calculateVersionNumber(minVersion);
			if(minVersionNumber === false) {
				return false;
			}
		}
		else {
			minVersion = false;
		}
		if(!!maxVersion) {
			maxVersionNumber = _calculateVersionNumber(maxVersion);
			if(maxVersionNumber === false) {
				return false;
			}
		}
		else {
			maxVersion = false;
		}

		if(states) {
			if(!Object.prototype.toString.call(states) === '[object Array]') {
				states = states.split('|');
			}
		}
		else {
			states = [];
		}

		var dependency = {
			collection: col,
			name: name,
			minVersion: minVersion,
			minVersionNumber: minVersionNumber,
			maxVersion: maxVersion,
			maxVersionNumber: maxVersionNumber,
			states: states,
			satisfied: false
		}
		dependencies.push(dependency);
		
		return true;
	}

	/**
	 * Removes a dependency.
	 *
	 * @param {String} col - The component collection of the dependency.
	 * @param {String} name - The component name of the dependency. The dependency does not need to exist.
	 * @return {boolean} True on success, false on failure.
	 */
	this.removeDependency = function(col, name) {
		if(!col || !name) {
			return false;
		}

		for(var i = 0; i < dependencies.length; i++) {
			if(dependencies[i].collection = col && dependencies[i].name == name) {
				dependencies.splice(i, 1);
				break;
			}
		}
		
		return true;
	}

	/**
	 * Checks whether the component has its dependencies resolved.
	 *
	 * @return {boolean} True - resolved, false - not resolved.
	 */
	this.isResolved = function() {
		return resolved;
	}
	
	/**
	 * Tries to resolve component dependencies and sets resolved flag accordingly.
	 *
	 * @private
	 * @return {boolean} True, if all dependencies could be resolved, false if not.
	 */
	this._resolveDependencies = function() {
		resolved = true;
		if(dependencies.length > 0) {
			for(var i = 0; i < dependencies.length; i++) {
				var depResolved = true;
				var dep = dependencies[i];
				var dComp = dependencyManager.getComponent(dep.collection, dep.name);
				if(dComp) {
					if(dep.minVersionNumber != -1 && dep.minVersionNumber > dComp.getVersionNumber()) {
						depResolved = false;
					}
					if(dep.maxVersionNumber != -1 && dep.maxVersionNumber < dComp.getVersionNumber()) {
						depResolved = false;
					}
					if(dep.states.length > 0) {
						if(dep.states.indexOf(dComp.getState()) == -1) {
							depResolved = false;
						}
					}
				}
				else {
					depResolved = false;
				}
				if(!depResolved) {
					resolved = false;
				}
				dep.satisfied = depResolved;
			}
		}
		return resolved;
	}
	
	/**
	 * Fetches the component dependencies.
	 *
	 * @return {Array} Array of dependency objects.
	 */
	this.getDependencies = function() {
		return dependencies;
	}

	/**
	 * Creates JSON representation of the component.
	 *
	 * @return {Object} An object that can be serialised.
	 */
	this.toJSON = function() {
		return {
			collection: collection,
			name: name,
			version: versionString,
			versionNumber: versionNumber,
			state: state,
			resolved: resolved,
			dependencies: dependencies
		};
	}
}

/**
 * Calculates version number from a String version.
 *
 * @private
 * @param {String} version - The version number as a String, in form of 1.0.0 - always three numbers. Maximum version number for each subversion is 999.
 * @return {integer} The version number as an integer.
 */
var _calculateVersionNumber = function(version) {
	var tmp = version.split('.');
	if(tmp.length == 1) {
		tmp[1] = 0;
		tmp[2] = 0;
	}
	else if(tmp.length == 2) {
		tmp[2] = 0;
	}
	
	var versionNumber = parseInt(tmp[0], 10) * 1000000 + parseInt(tmp[1], 10) * 1000 + parseInt(tmp[2], 10);
	if(isNaN(versionNumber)) {
		return false;
	}
	return versionNumber;
}

module.exports = CoontiDependencyManager;
