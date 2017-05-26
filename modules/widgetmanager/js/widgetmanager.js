
function resourceErrorHandler(response) {
}

/* globals coonti,angular */
if(coonti && coonti['user']) {
	angular.module('coontiAdmin').factory('WidgetArea', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/module/WidgetManager/widgetarea/:name', { name: '@name' }, {
				create: { method: 'PUT',
						  interceptor: { responseError: resourceErrorHandler } }
			});
		}
	]);

	angular.module('coontiAdmin').factory('Widget', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/module/WidgetManager/widget/:name', { name: '@name' }, {});
		}
	]);

	angular.module('coontiAdmin').controller('WidgetManagerAreaCtrl', ['$scope', '$location', '$routeParams', 'WidgetArea', 'Widget', 'Content', 'ngDialog', 'notifications', function($scope, $location, $routeParams, WidgetArea, Widget, Content, ngDialog, notifications) {
		$scope.add = false;
		$scope.coonti = coonti;
		$scope.contentAction = 'Add';
		$scope.onContentAction = function(item) {
			console.log(item);
			if(!$scope['widgetarea']) {
				return;
			}
			$scope.widgetarea.widgets.push({
				name: item.name,
				title: item.title,
				description: item.description,
				config: {}
			});
		};

		if($location.path() != '/module/widget') {
			$scope.widgets = Widget.get();
		}

		if($location.path() == '/module/widget/add') {
			$scope.add = true;
			$scope.widgetarea = new WidgetArea();
			$scope.widgetarea.name = '';
			$scope.widgetarea.widgets = [];
		}
		else {
			$scope.widgetarea = WidgetArea.get($routeParams);
			$scope.widgetarea.$promise.then(function() {
				$scope.widgetarea.originalName = $scope.widgetarea.name;
			});
		}

		$scope.save = function(widgetArea) {
			if(!widgetArea.name) {
				notifications.error('', 'Widget area needs a name. Please provide it and try again.');
				return;
			}
			widgetArea.widgets = $scope.widgetarea.widgets;

			if($scope.add) {
				widgetArea.$create({}, function() {
					$location.path('/module/widget');
					notifications.success('', 'Widget area added.');
				}, function() {
					notifications.error('', 'Widget area could not be added. Please verify that the name is not already in use.');
				});
			}
			else {
				widgetArea.$save({}, function() {
					$location.path('/module/widget');
					notifications.success('', 'Widget area saved.');
				}, function() {
					notifications.error('', 'Widget area could not be saved. Please verify that the name is not already in use.');
				});
			}
		};

		$scope.remove = function(item) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove widget area '" + item.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var w = new WidgetArea({ name: item.name });
				w.$delete(function() {
					notifications.success('', "Removed widget area '" + item.name + "'.");
					$scope.widgetarea = WidgetArea.get($routeParams);
				}, function() {
					notifications.error('', 'Could not remove widget area.');
				});
			});
		};

		$scope.removeItem = function(dragItem) {
			console.log(dragItem);
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove widget '" + dragItem.item.name + "'? All configurations will be lost.",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				$scope.widgetarea.widgets.splice(dragItem.$index, 1);
			});
		};
	}]);
}
