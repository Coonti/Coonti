/**
 * @module CoontiCore/CoontiException
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
 * CoontiException is used to convey issues encountered deeper inside Coonti.
 *
 * @class
 * @classdesc The CoontiException encapsulates issues.
 * @param {String} severity - The severity of the issue.
 * @param {integer} code - The numeric code of the issue.
 * @param {String} mgs - The message to be shown to the user.
 * @return {CoontiException} A new exception object.
 */
function CoontiException(severity, cd, msg) {
	this.severity = severity;
	this.code = cd;
	this.message = msg;

	this.toString = function() {
		return 'CoontiException (' + this.severity + ') ' + this.code + ': ' + this.message;
	}
}

/** Fatal error, execution should stop. */
CoontiException.FATAL = 'Fatal';

/** Severe error, execution may be stopped. */
CoontiException.ERROR = 'Error';

/** Error worth a warning, execution should continue. */
CoontiException.WARNING = 'Warning';

module.exports = CoontiException;
