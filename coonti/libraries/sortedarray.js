/**
 * @module CoontiLibraries/SortedArray
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
 * Creates a new SortedArray instance.
 *
 * @class
 * @classdesc An array that is sorted by weights.
 * @return An empty SortedArray.
 */
function SortedArray() {
    this.array = [];
	this.weights = [];
}

/**
 * Inserts a new value with given weight to the array.
 *
 * @param {Object} el - The item to be inserted.
 * @param {integer} w - The weight.
 */
SortedArray.prototype.insert = function(el, w) {
	w = parseInt(w);
	if(isNaN(w)) {
		w = 0;
	}
	var s = _.sortedIndex(this.weights, w);
	this.array.splice(s, 0, el);
	this.weights.splice(s, 0, w);
}

/**
 * Removes all references to the given item.
 *
 * @param {Object} el - The item to be removed.
 */
SortedArray.prototype.remove = function(el) {
	var self = this;
	_.each(this.array, function(e, i) {
		if(self.array[i] === el) {
			self.weights[i] = '';
		}
	});
	this.array = _.without(this.array, el);
	this.weights = _.without(this.weights, '');
}

/**
 * Fetches the value at the given position.
 *
 * @param {integer} pos - The position in the array.
 * @return {Object} The item on that position.
 */
SortedArray.prototype.valueAt = function(pos) {
	pos = parseInt(pos);
	if(isNaN(pos)) {
		return undefined;
	}
	if(pos < 0 || pos >= this.array.length) {
		return undefined;
	}
	return this.array[pos];
}

/**
 * Fetches the weight at the given position.
 *
 * @param {integer} pos - The position in the array.
 * @return {integer} The weight on that position.
 */
SortedArray.prototype.weightAt = function(pos) {
	pos = parseInt(pos);
	if(isNaN(pos)) {
		return undefined;
	}
	if(pos < 0 || pos >= this.weights.length) {
		return undefined;
	}
	return this.weights[pos];
}

/**
 * Provides the values in the SortedArray as a normal JavaScript array, in order of weights.
 *
 * @return {Array} The items.
 */
SortedArray.prototype.toArray = function() {
	return _.toArray(this.array);
}

/**
 * Calculates the size of the SortedArray.
 *
 * @return {integer} The length of the array.
 */
SortedArray.prototype.size = function() {
	return this.array.length;
}

/**
 * Creates a generator for iterating one or more SortedArrays in weight order. To iterate several SortedArrays, add them as parameters to this function.
 *
 * @return {Generator} A generator that iterates one or several SortedArrays.
 * @throw {StopIteration} When there is nothing left to iterate.
 */
SortedArray.prototype.iterator = function*() {
	var arrays = [this];
	var positions = [0];

	for(var i = 0; i < arguments.length; i++) {
		arrays.push(arguments[i]);
		positions.push(0);
	}

	for(;;) {
		if(arrays.length == 0) {
			return;
		}
		
		if(arrays.length == 1) {
			if(positions[0] == arrays[0].size()) {
				return;
			}
			yield arrays[0].valueAt(positions[0]++);
			continue;
		}

		var minWeight = arrays[0].weightAt(positions[0]);
		var minPos = 0;
		for(var i = 1; i < positions.length; i++) {
			var w = arrays[i].weightAt(positions[i]);
			if(w < minWeight) {
				minWeight = w;
				minPos = i;
			}
		}
		var ret = arrays[minPos].valueAt(positions[minPos]++);
		if(positions[minPos] == arrays[minPos].size()) {
			arrays.splice(minPos, 1);
			positions.splice(minPos, 1);
		}
		yield ret;
	}
}

module.exports = SortedArray;
