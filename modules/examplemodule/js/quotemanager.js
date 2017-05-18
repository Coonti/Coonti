/* globals coonti,angular */
if(coonti && coonti['user']) {
	// Name all Angular assets with ModuleName + Object description, using CamelCase notation.

	// Angular REST factories can be used in a very straightforward manner in most cases
	angular.module('coontiAdmin').factory('ExampleModuleQuote', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/module/ExampleModule/quote/:key', { key: '@key' }, {

				// To support PUT method for adding items, add the following method to all REST objects
				create: { method: 'PUT' }
			});
		}
	]);

	// Angular controller that contains the UI logic for the module admin interface. The routes to launch the controller are set in the main module code
	angular.module('coontiAdmin').controller('ExampleModuleQuoteCtrl', ['$scope', '$location', '$routeParams', 'ExampleModuleQuote', 'ngDialog', 'notifications', function($scope, $location, $routeParams, Quote, ngDialog, notifications) {
		// Transform the returned object into a sorted array
		$scope.$watch('quotes.items', function(newVal, oldVal) {
			var ret = [];
			angular.forEach(newVal, function(value, key) {
				ret.push({ $key: key, $value: value });
			});

			ret.sort(function(a, b) {
				return a.$value.localeCompare(b.$value);
			});
			$scope.quotesArray = ret;
		});

		if($location.path() == '/module/quote/add') {
			$scope.add = true;
			$scope.quote = '';
		}
		else {
			$scope.quotes = Quote.get();
		}

		$scope.save = function() {
			var q = $scope.quote;
			// Use notifications module to provide guidance to the suer
			if(!q || q.trim() == '') {
				notifications.error('', 'Please provide quote text.');
				return;
			}

			var quote = new Quote();
			quote.quote = q;
			quote.$create({}, function() {
				notifications.success('', 'Quote added.');
				$location.path('/module/quote');
			}, function() {
				notifications.error('', 'Quote could not be added.');
			});
		};

		$scope.remove = function(key, item) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove quote '" + item + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var quote = new Quote({ key: key });
				quote.$delete(function() {
					notifications.success('', "Removed quote '" + item + "'.");
					$scope.quotes = Quote.get($routeParams);
				}, function() {
					notifications.error('', 'Could not remove quote.');
				});
			});
		};
	}]);
}
