/* globals coonti,angular */
if(coonti && coonti['user']) {
	angular.module('coontiAdmin').factory('MenuManagerMenu', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/module/MenuManager/menu/:name', { name: '@name' }, {
				create: { method: 'PUT' }
			});
		}
	]);

	angular.module('coontiAdmin').controller('MenuManagerMenuCtrl', ['$scope', '$location', '$routeParams', 'MenuManagerMenu', 'Content', 'ngDialog', 'notifications', function($scope, $location, $routeParams, Menu, Content, ngDialog, notifications) {
		$scope.add = false;
		$scope.coonti = coonti;
		$scope.contentAction = 'Add';
		$scope.onContentAction = function(item) {
			if(!$scope['menu'] || !$scope['menuItems']) {
				return;
			}
			$scope.menuItems.push({
				id: item._id,
				title: item.content.title,
				url: item.path,
				external: false,
				menuItems: []
			});
		};

		if($location.path() == '/module/menu/add') {
			$scope.add = true;
			$scope.menu = new Menu();
			$scope.menu.name = '';
		}
		else {
			$scope.menu = Menu.get($routeParams);
			$scope.menuItems = [
			];
			$scope.menu.$promise.then(function() {
				if($scope.menu.menuItems) {
					$scope.menuItems = $scope.menu.menuItems;
				}
				$scope.menu.originalName = $scope.menu.name;
			});
		}

		$scope.addURL = function() {
			if(!$scope.menuNewItemTitle || $scope.menuNewItemTitle.trim() == '') {
				notifications.error('', 'Please provide title for the new menu item.');
				return;
			}
			if(!$scope.menuNewItemURL || $scope.menuNewItemURL.trim() == '') {
				notifications.error('', 'Please provide URL for the new menu item.');
				return;
			}

			$scope.menuItems.push({
				id: 0,
				title: $scope.menuNewItemTitle,
				url: $scope.menuNewItemURL,
				external: true,
				menuItems: []
			});
			$scope.menuNewItemTitle = '';
			$scope.menuNewItemURL = '';
		};

		$scope.save = function(menu) {
			if($scope.add) {
				menu.$create({}, function() {
					$location.path('/module/menu');
					notifications.success('', 'Menu added.');
				}, function() {
					notifications.error('', 'Menu could not be added. Please verify that the name is not already in use.');
				});
			}
			else {
				menu.menuItems = $scope.menuItems;
				menu.$save({}, function() {
					$location.path('/module/menu');
					notifications.success('', 'Menu saved.');
				}, function() {
					notifications.error('', 'Menu could not be saved. Please verify that the name is not already in use.');
				});
			}
		};

		$scope.remove = function(item) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove menu '" + item.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var m = new Menu({ name: item.name });
				m.$delete(function() {
					notifications.success('', "Removed menu '" + item.name + "'.");
					$scope.menu = Menu.get($routeParams);
				}, function() {
					notifications.error('', 'Could not remove menu.');
				});
			});
		};
	}]);
}
