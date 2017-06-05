angular.module('coontiAdmin', ['ngResource', 'ngRoute', 'ngDialog', 'ngFileUpload', 'angular-extended-notifications', 'oc.lazyLoad', 'xeditable', 'jcs-autoValidate', 'ui.bootstrap', 'ui.tree', 'textAngular', 'dndLists']);
	
if(coonti && coonti['user']) {
	angular.module('coontiAdmin').config(
		function($provide, $routeProvider) {
			$provide.factory('$routeProvider', function () {
				return $routeProvider;
			});
		}
	);
	
	angular.module('coontiAdmin').config(['notificationsProvider', function(notificationsProvider) {
	    notificationsProvider.setDefaults({
			faIcons: true,
			closeOnRouteChange: 'route',
			duration: 10000,
			templatesDir: '/angular/stem/',
			templateFile: 'notification.html'
	    });
	}]);
	
	angular.module('coontiAdmin').config(['ngDialogProvider', function(ngDialogProvider) {
	    ngDialogProvider.setDefaults({
	        className: 'ngdialog-theme-plain',
	        showClose: false,
			template: '/angular/stem/confirm-dialog.html'
	    });
	}]);
	
	angular.module('coontiAdmin').config(function($provide) {
		$provide.decorator('taOptions', ['taRegisterTool', '$delegate', '$modal', function(taRegisterTool, taOptions, $modal) {
			taRegisterTool('coontiImage', {
				iconclass: 'fa fa-picture-o',
				tooltiptext: 'Insert image',
				action: function(deferred, restoreSelection) {
					var self = this;
                    $modal.open({
                        controller: 'WysiwygInsertImageCtrl',
                        templateUrl: coonti.routing.coontiPath + '/angular/' + coonti.theme.theme + '/wysiwyg-insert-image.html'
                    }).result.then(
                        function(result) {
							if(result) {
								restoreSelection();
								self.$editor().wrapSelection('insertHtml', result);
							}
                            deferred.resolve();
                        },
                        function() {
                            deferred.resolve();
                        }
                    );
                    return false;
                }
            });
			taRegisterTool('coontiLink', {
				iconclass: 'fa fa-link',
				tooltiptext: 'Insert link',
				action: function(deferred, restoreSelection) {
					var self = this;
                    $modal.open({
                        controller: 'WysiwygInsertLinkCtrl',
                        templateUrl: coonti.routing.coontiPath + '/angular/' + coonti.theme.theme + '/wysiwyg-insert-link.html'
                    }).result.then(
                        function(result) {
							if(result) {
								restoreSelection();
								self.$editor().wrapSelection('unlink');
								var sel = rangy.getSelection().toHtml();
								sel = result + sel + '</a>';
								self.$editor().wrapSelection('insertHtml', sel);
							}
							deferred.resolve();
                        },
                        function() {
                            deferred.resolve();
                        }
                    );
                    return false;
                }
            });
			taRegisterTool('coontiUnlink', {
				iconclass: 'fa fa-unlink',
				tooltiptext: 'Remove link',
				action: function(deferred, restoreSelection) {
					this.$editor().wrapSelection('unlink');
                    deferred.resolve();
                    return false;
                }
            });
			taOptions.toolbar = [
				['h1', 'h2', 'h3', 'h4', 'p', 'pre', 'quote'],
				['bold', 'italics', 'underline', 'strikeThrough'], ['redo', 'undo', 'clear', 'html'],
				['ul', 'ol', 'indent', 'outdent'], ['justifyLeft', 'justifyCenter', 'justifyRight'], 
				['coontiImage', 'coontiLink', 'coontiUnlink', 'insertVideo']
			];
			return taOptions;
		}]);
	});

	// HTTP interceptor to see whether JSON API produces errors or requires re-authentication
	angular.module('coontiAdmin').factory('coontiJSONInterceptor', ['$q', '$location', '$window', function($q, $location, $window) {
		return {
			response: function(responseData) {
				return responseData;
			},
			responseError: function error(response) {
				switch (response.status) {
				case 400:
					$location.path('/error/400');
					break;
				case 401:
					$window.location.href = coonti.routing.coontiPath + '/admin/login';
					break;
				case 404:
					$location.path('/error/404');
					break;
				case 500:
					$location.path('/error/500');
					break;
				default:
					$location.path('/error');
				}
				
				return $q.reject(response);
			}
		};
	}]);

	//Http Intercpetor to check auth failures for xhr requests
	angular.module('coontiAdmin').config(['$httpProvider', function($httpProvider) {
		$httpProvider.interceptors.push('coontiJSONInterceptor');
	}]);
	
	angular.module('coontiAdmin').run(['$routeProvider', '$http', '$route', '$rootScope', '$ocLazyLoad', 'editableOptions',
		function($routeProvider, $http, $route, $rootScope, $ocLazyLoad, editableOptions) {
			var loadedRoutes = {};
			var loadedAssets = {};
			
			var loadRoutes = function() {
				$http.get(coonti.routing.prefix + '/api/routes').success(function(routes) {
					_.each(routes, function(r) {
						if(!loadedRoutes[r.route]) {
							if(!!r.redirectTo) {
								$routeProvider.when(r.route, {
									redirectTo: r.redirectTo
								});
								loadedRoutes[r.route] = {
									route: r.route,
									redirectTo: r.redirectTo
								};
								return;
							}
							
							$routeProvider.when(r.route, {
								templateUrl: r.template,
								controller: r.controller
							});
							loadedRoutes[r.route] = {
								route: r.route,
								templateUrl: r.template,
								controller: r.controller
							};
						}
					});
					$route.reload();
				});
			}
	
			var loadAssets = function() {
				$http.get(coonti.routing.prefix + '/api/assets').success(function(assets) {
					_.each(assets, function(a) {
						if(!loadedAssets[a]) {
							$ocLazyLoad.load(a);
							loadedAssets[a] = a;
						}
					});
				});
			}
			
			editableOptions.theme = 'bs3';
			loadAssets();
			loadRoutes();
			$rootScope.$on('route.update', loadRoutes);	
			$rootScope.$on('asset.update', loadAssets);
		}]
	);
	
	angular.module('coontiAdmin').controller('ErrorCtrl', ['$scope', function ($scope) {
	}]);
	
	angular.module('coontiAdmin').factory('AdminMenu', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/menu', {}, {
				fetch: { method: 'GET', params: {}, isArray: true}
			});
		}
    ]);
	
	angular.module('coontiAdmin').controller('AdminMenuCtrl', ['$scope', '$rootScope', 'AdminMenu', function ($scope, $rootScope, adminMenu) {
		$scope.menu = adminMenu.fetch();
		var unbind = $rootScope.$on('menu.update', function() {
			$scope.menu = adminMenu.fetch();
		});
		$scope.$on('$destroy', unbind);
	}]);
	
	angular.module('coontiAdmin').factory('Content', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/content/:_id', { _id: "@_id" }, {
				'create': { method: 'PUT' }
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('ContentCtrl', ['$scope', '$routeParams', '$location', 'Content', 'ContentType', 'ngDialog', 'notifications', function($scope, $routeParams, $location, Content, ContentType, ngDialog, notifications) {
		$routeParams.start = $routeParams['start'] || 0;
		$routeParams.len = $routeParams['len'] || 20;
		$routeParams.sort = $routeParams['sort'] || 'content.title';
		$scope.content = Content.get($routeParams);

		$scope.add = false;
		$scope.edit = false;
		
		if($location.path().startsWith('/content/add') ||
		   $location.path().startsWith('/content/duplicate')) {
			$scope.add = true;
			if($routeParams['contentType']) {
				$scope.content = new Content();
				$scope.content['content'] = {};
				$scope.content['contentType'] = $routeParams['contentType'];
				$scope.contentType = ContentType.get({ name: $routeParams['contentType'] });
			}
			else if($routeParams['_id']) {
				$scope.duplicate = true;
				$scope.content = Content.get($routeParams, function() {
					delete $scope.content._id;
					delete $scope.content.path;
					$scope.contentType = ContentType.get({ name: $scope.content.contentType });
				});
			}
			else {
				$scope.data = ContentType.get();
			}
		}
		else if($location.path().startsWith('/content/edit')) {
			$scope.content = Content.get($routeParams, function() {
				$scope.contentType = ContentType.get({ name: $scope.content.contentType },
													 function() {
													 });
			});
			$scope.edit = true;
		}

		var watcher = function() {
			if($scope.contentType && $scope.contentType.$resolved && $scope.contentType.contentType &&
			   $scope.contentType.contentType.config && $scope.contentType.contentType.config.path &&
			   !!$scope.contentType.contentType.config.path.from && $scope.form && $scope.form.fields) {
				var from = $scope.contentType.contentType.config.path.from;
				for(var i = 0; i < $scope.form.fields.length; i++) {
					if($scope.form.fields[i].name == from) {
						$scope.pathWatchedField = i;
						$scope.$watch('form.fields[' + i + '].value', function(nf, of) {
							if(!$scope.content.pathEdited) {
								$scope.slugify();
							}
						}, true);
					}
				}
			}
		}
		
		if($scope.add || $scope.edit) {
			$scope.$watch('form', function(nf, of) {
				watcher();
			});
			$scope.$watch('contentType', function(nCt, oCt) {
				watcher();
			}, true);

			$scope.slugify = function() {
				$scope.content.path = window.slug($scope.form.fields[$scope.pathWatchedField].value, {lower: true});
			}

			$scope.pathModified = function() {
				$scope.content.pathEdited = true;
				$scope.content.path = s.trim($scope.content.path, '/');
			}
			
			$scope.resetPath = function() {
				$scope.content.pathEdited = false;
				$scope.slugify();
			}
		}

		$scope.submit = function() {
			$scope.form.submit($scope.content.content);
			if($scope.add) {
				$scope.content.$create({}, function() {
					notifications.success('', "Content added.");
					$location.path('/content');
				}, function() {
					if($scope.duplicate) {
						notifications.error('', "Content could not be duplicated.");
					}
					else {
						notifications.error('', "Content could not be added.");
					}
				});
			}
			else {
				$scope.content.$save({}, function() {
					notifications.success('', "Content modified.");
				}, function() {
					notifications.error('', "Content could not be modified.");
				});
			}
		}
		
		$scope.remove = function(item) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove content '" + item.content.title + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var content = new Content({ _id: item._id });
				content.$delete(function() {
					notifications.success('', "Removed content.");
					$scope.content = Content.get($routeParams);
				}, function() {
					notifications.error('', "Could not remove content.");
				});
			});
		};
	}]);
	
	angular.module('coontiAdmin').factory('ContentType', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/contentType/:name', { name: "@name" }, {
				'create': { method: 'PUT' }
			});
		}
	]);
	
	angular.module('coontiAdmin').factory('FormElements', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/formelements', {}, {
				fetch: { method: 'GET', params: {}, isArray: true}
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('ContentTypeCtrl', ['$scope', '$routeParams', '$location', 'ngDialog', 'ContentType', 'FormElements', 'notifications', function($scope, $routeParams, $location, ngDialog, ContentType, formElements, notifications) {
		$scope.add = false;
		if($location.path().startsWith('/contentType/edit')) {
			$scope.formElements = formElements.fetch();
		}
		if($location.path() == '/contentType/add') {
			$scope.formElements = formElements.fetch();
			$scope.add = true;
		}
			
		if(!$scope.add) {
			$scope.data = ContentType.get($routeParams);
		}
		else {
			$scope.data = new ContentType();
			$scope.data.contentType = {};
			$scope.data.contentType.fields = [];
		}

		$scope.save = function(item) {
			if(($scope.add && !item.name) ||
			   !item.displayName) {
				notifications.error('', 'Please input name.');
				return;
			}

			errors = false;
			var duplicateError = false;
			if(item.fields.length > 0) {
				for(var i = 0; i < item.fields.length; i++) {
					delete item.fields[i]['error'];
					if(!item.fields[i].id || !item.fields[i].name) {
						item.fields[i].error = true;
						errors = true;
					}
					if(item.fields[i].id) {
						for(var j = 0; j < i; j++) {
							if(item.fields[j].id == item.fields[i].id) {
								item.fields[i].error = true;
								errors = true;
								duplicateError = true;
							}
						}
					}
				}
			}

			if(errors) {
				notifications.error('', 'Please check fields for missing items' + (duplicateError ? ' and duplicate id fields' : '') + '.');
				return;
			}

			if($scope.add) {
				$scope.data.$create({}, function() {
					notifications.success('', "Content Type added.");
					$location.path('/contentType');
				}, function() {
					notifications.error('', "Content Type could not be added.");
				});
			}
			else {
				$scope.data.$save({}, function() {
					notifications.success('', "Content Type saved.");
					$location.path('/contentType');
				}, function() {
					notifications.error('', "Content Type could not be saved.");
				});
			}
		}
		
		$scope.remove = function(item) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove content type '" + item.displayName + "'? Note that you cannot edit content of this type after removal.",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var ct = new ContentType({ name: item.name });
				var nm = item.displayName;
				ct.$delete(function() {
					notifications.success('', "Removed content type '" + nm + "'.");
					$scope.data = ContentType.get();
				}, function() {
					notifications.error('', "Could not remove content type.");
				});
			});
		};

		$scope.addField = function(item) {
			var newItem = {
				id: '',
				name: '',
				type: 'text',
				description: '',
				required: false,
				json: true
			};
			item.fields.push(newItem);
		};

		$scope.removeField = function(index) {
			$scope.data.contentType.fields.splice(index, 1);
		}
	}]);
	
	angular.module('coontiAdmin').factory('Media', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/media/:dir/:name', { dir: "@dir", name: "@name" }, {
				'create': { method: 'PUT' }
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('MediaCtrl', ['$scope', '$routeParams', '$location', 'Media', 'ngDialog', 'notifications', 'Upload', function($scope, $routeParams, $location, Media, ngDialog, notifications, Upload) {
		$routeParams.start = $routeParams['start'] || 0;
		$routeParams.len = $routeParams['len'] || 20;
		$routeParams.sort = $routeParams['sort'] || 'name';
		$scope.media = Media.get($routeParams);
		
		$scope.$watch('media.dir', function(newDir, oldDir) {
			if(oldDir && newDir) {
				$location.path('/media/' + newDir).search({ start: 0, len: 20, sort: 'name' });
			}
		});
		
		$scope.move = function(dir, file) {
			$scope.newName = file.name;
			$scope.newDir = dir;
			ngDialog.open({
				template: "<p class='inlineFormContainer'>Please provide the new name for the file '" + file.name + "'.<br><select id='newDir' ng-model='$parent.newDir' ng-options='k as k for (k, v) in media.directories'></select><input ng-model='$parent.newName' type='text' size='40'/><br/><button ng-click='closeThisDialog(true)'>Ok</button> <button ng-click='closeThisDialog(false)'>Cancel</button>",
				plain: true,
				scope: $scope,
				preCloseCallback: function(val) {
					if(val === false) {
						return true;
					}
					if($scope.newName == file.name && $scope.newDir == dir) {
						return true;
					}
					if(!$scope.newName) {
						return false;
					}
					var m = new Media({ dir: dir, file: file.name, newDir: $scope.newDir, newFile: $scope.newName });
					m.$save({},
							function(val, hdr) {
								notifications.success('', 'File "' + file.name + '" moved to "' + val.dir + ' / ' + val.file + '".');
								$routeParams.dir = val.dir;
								$routeParams.search = val.file;
								$scope.media = Media.get($routeParams);
								delete($routeParams.search);
							},
							function(val, hdr) {
								notifications.error('', "Could not move media.");
							});
					return true;
				}
			});
		}
	
		$scope.remove = function(dir, file) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove file '" + file.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var m = new Media({ dir: dir, name: file.name });
				m.$delete(function() {
					notifications.success('', "Removed media '" + file.name + "'.");
					$scope.media = Media.get($routeParams);
				}, function() {
					notifications.error('', "Could not remove media.");
				});
			});
		};
	
		$scope.$watch('files', function () {
	        $scope.upload($scope.files);
	    });
	
	    $scope.upload = function (files) {
	        if(files && files.length) {
				var firstFile = files[0];
	            for(var i = 0; i < files.length; i++) {
	                var file = files[i];
	                Upload.upload({
	                    url: coonti.routing.prefix + '/api/media/' + ($scope.dir ? $scope.dir : ''),
						method: 'PUT', 
	                    file: file
	                }).progress(function(evt) {
	                    var progressPercentage = parseInt(100.0 * evt.loaded / evt.total);
	                }).success(function(data, status, headers, config) {
						$scope.uploadShowing = false;
						if(data.dir && data.file) {
							notifications.success('', 'File "' + data.file + '" uploaded to directory "' + data.dir + '".');
							if(config.file == firstFile) {
								$routeParams.search = data.file;
								$scope.media = Media.get($routeParams);
								delete($routeParams.search);
							}
						}
						else {
							notifications.error('', 'File ' + config.file.name + ' upload failed.');
						}
	                });
	            }
	        }
	    };
	}]);
	
	angular.module('coontiAdmin').factory('Theme', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/themes/:name', { name: '@name' }, {
				activate: { method: 'POST', params: { activate: true }},
				deactivate: { method: 'POST', params: { deactivate: true }}
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('ThemesCtrl', ['$scope', '$rootScope', '$routeParams', '$location', 'Theme', 'ngDialog', 'notifications', function($scope, $rootScope, $routeParams, $location, Theme, ngDialog, notifications) {
		$scope.theme = Theme.get($routeParams);
		$scope.themeChanged = false;
		
		$scope.activate = function(th) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to activate theme '" + th.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var t = new Theme({ name: th.name });
				t.$activate({}, function() {
					notifications.success('', "Theme '" + th.name + "' activated.");
				}, function() {
					notifications.error('', "Theme '" + th.name + "' could not be activated.");
				});
				$scope.themes = Theme.get();
			});
		}

		$scope.deactivate = function(th) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to deactivate theme '" + th.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var t = new Theme({ name: th.name });
				t.$deactivate({}, function() {
					notifications.success('', "Theme '" + th.name + "' deactivated.");
				}, function() {
					notifications.error('', "Theme '" + th.name + "' could not be deactivated.");
				});
				$scope.themes = Theme.get();
			});
		}

		$scope.addRoute = function(th) {
			if(!th.routes) {
				th.routes = [];
			}
			th.routes.push('');
			$scope.themeChanged = true;
		}

		$scope.removeRoute = function(th, i) {
			th.routes.splice(i, 1);
			$scope.themeChanged = true;
		}

		$scope.save = function(th) {
		}

		$scope.cancel = function(th) {
			if($scope.themeChanged) {
				ngDialog.openConfirm({
					data: {
						message: "Are you sure to discard changes in theme '" + th.name + "'?",
						close: 'No',
						confirm: 'Yes'
					}
				}).then(function(value) {
					$location.path('/themes');
				});
			}
			else {
				$location.path('/themes');
			}
		}
	}]);

	angular.module('coontiAdmin').factory('User', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/users/user/:_id', { _id: "@_id" }, {
				'create': { method: 'PUT' }
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('UsersCtrl', ['$scope', '$routeParams', '$location', 'User', 'UsersRole', 'UsersGroup', 'UsersRight', 'ngDialog', 'notifications', function($scope, $routeParams, $location, User, UsersRole, UsersGroup, UsersRight, ngDialog, notifications) {
		var self = this;
		
		$scope.add = false;
		$scope.availableRights = [];
		$scope.availableRoles = [];
		$scope.availableGroups = [];
	
		$scope.currentUser = coonti.user.account;
	
		if($location.path() == '/users/user/add') {
			$scope.add = true;
			$scope.user = new User();
			$scope.user.account = '';
			$scope.user.allowed = [];
			$scope.user.denied = [];
			$scope.user.groups = [];
			$scope.user.roles = [];
			$scope.user.userData = [];
		}
		else {	
			if($location.path() != '/profile') {
				$scope.user = User.get($routeParams, function() {
					self.setAvailableData();
				});
			}
			else {
				$scope.profilePage = true;
				$scope.user = User.get({ _id: '0' }, function() {
					self.setAvailableData();
				});
			}
		}
		if($routeParams['_id'] || $scope.add || $location.path() == '/profile') {
			$scope.rights = UsersRight.get({}, function() {
				self.setAvailableData();
			});
			var rawGroups = UsersGroup.get({}, function() {
				$scope.groups = {}
				if(rawGroups['groups']) {
					for(var i in rawGroups['groups']) {
						$scope.groups[rawGroups['groups'][i]['_id']] = rawGroups['groups'][i];
					}
					self.setAvailableData();
				}
			});
			var rawRoles = UsersRole.get({}, function() {
				$scope.roles = {}
				if(rawRoles['roles']) {
					for(var i in rawRoles['roles']) {
						$scope.roles[rawRoles['roles'][i]['_id']] = rawRoles['roles'][i];
					}
					self.setAvailableData();
				}
			});
		}
	
		this.setAvailableData = function() {
			if($scope['rights'] && $scope.rights.$resolved && ($scope.user.$resolved || $scope.add)) {
				var tmp = [];
				_.each($scope.rights, function(r, i) {
					if(i.startsWith('$')) {
						return;
					}
					if($scope.user.allowed.indexOf(r.name) != -1) {
						return;
					}
					if($scope.user.denied.indexOf(r.name) != -1) {
						return;
					}
					tmp.push(r);
				});
				if(tmp.length > 0) {
					$scope.selectedAllowedRight = tmp[0].name;
					$scope.selectedDeniedRight = tmp[0].name;
				}
				else {
					$scope.selectedAllowedRight = false;
					$scope.selectedDeniedRight = false;
				}
				$scope.availableRights = tmp;
			}
	
			if($scope['groups'] && ($scope.user.$resolved || $scope.add)) {
				var tmp = [];
				_.each($scope.groups, function(g, i) {
					if(i.startsWith('$')) {
						return;
					}
					if($scope.user.groups.indexOf(g._id) != -1) {
						return;
					}
					tmp.push(g);
				});
				if(tmp.length > 0) {
					$scope.selectedGroup = tmp[0]._id;
				}
				else {
					$scope.selectedGroup = false;
				}
				$scope.availableGroups = tmp;
			}
	
			if($scope['roles'] && ($scope.user.$resolved || $scope.add)) {
				var tmp = [];
				_.each($scope.roles, function(r, i) {
					if(i.startsWith('$')) {
						return;
					}
					if($scope.user.roles.indexOf(r._id) != -1) {
						return;
					}
					tmp.push(r);
				});
				if(tmp.length > 0) {
					$scope.selectedRole = tmp[0]._id;
				}
				else {
					$scope.selectedRole = false;
				}
				$scope.availableRoles = tmp;
			}
		}
	
		$scope.remove = function(user) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove user '" + user.account + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var r = new User({ _id: user._id });
				r.$delete(function() {
					notifications.success('', "Removed account '" + user.account + "'.");
					$scope.user = User.get($routeParams);
				}, function() {
					notifications.error('', "Could not remove account.");
				});
			});
		};
	
		$scope.create = function(user) {
			user.$create({}, function() {
				$location.path('/users/user');
				notifications.success('', 'Added account.');
			}, function() {
				notifications.error('', "Account could not be added.");
			});
		}
		
		$scope.save = function(user) {
			var ac = user.account;
			user.$save(function() {
				$location.path('users/user');
				notifications.success('', "Saved account '" + ac + "'.");
			}, function() {
				notifications.error('', "Could not save user.");
			});
		}
		
		$scope.removeAllowedRight = function(user, right) {
			var i = user.allowed.indexOf(right);
			if(i != -1) {
				user.allowed.splice(i, 1);
				self.setAvailableData();
			}
		}
		
		$scope.removeDeniedRight = function(user, right) {
			var i = user.denied.indexOf(right);
			if(i != -1) {
				user.denied.splice(i, 1);
				self.setAvailableData();
			}
		}
	
		$scope.addAllowedRight = function(user) {
			user.allowed.push($scope.selectedAllowedRight);
			self.setAvailableData();
		}
	
		$scope.addDeniedRight = function(user) {
			user.denied.push($scope.selectedDeniedRight);
			self.setAvailableData();
		}
	
		$scope.removeGroup = function(user, gid) {
			var i = user.groups.indexOf(gid);
			if(i != -1) {
				user.groups.splice(i, 1);
				self.setAvailableData();
			}
		}
	
		$scope.addGroup = function(user) {
			user.groups.push($scope.selectedGroup);
			self.setAvailableData();
		}
	
		$scope.removeRole = function(user, rid) {
			var i = user.roles.indexOf(rid);
			if(i != -1) {
				user.roles.splice(i, 1);
				self.setAvailableData();
			}
		}
	
		$scope.addRole = function(user) {
			user.roles.push($scope.selectedRole);
			self.setAvailableData();
		}
	}]);
	
	angular.module('coontiAdmin').factory('UsersGroup', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/users/group/:_id', { _id: "@_id" }, {
				'create': { method: 'PUT' }
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('UsersGroupsCtrl', ['$scope', '$routeParams', '$location', 'UsersGroup', 'UsersRight', 'ngDialog', 'notifications', function($scope, $routeParams, $location, UsersGroup, UsersRight, ngDialog, notifications) {
		var self = this;
	
		$scope.add = false;
		$scope.availableRights = [];
	
		if($location.path() == '/users/group/add') {
			$scope.add = true;
			$scope.group = new UsersGroup();
			$scope.group.name = '';
			$scope.group.description = '';
			$scope.group.allowed = [];
			$scope.group.denied = [];
		}
		else {
			$scope.group = UsersGroup.get($routeParams, function() {
				self.setAvailableRights();
			});
		}
		if($routeParams['_id'] || $scope.add) {
			$scope.rights = UsersRight.get({}, function() {
				self.setAvailableRights();
			});
		}
	
		this.setAvailableRights = function() {
			if($scope['rights'] && $scope.rights.$resolved && ($scope.group.$resolved || $scope.add)) {
				var tmp = [];
				_.each($scope.rights, function(r, i) {
					if(i.startsWith('$')) {
						return;
					}
					if($scope.group.allowed.indexOf(r.name) != -1) {
						return;
					}
					if($scope.group.denied.indexOf(r.name) != -1) {
						return;
					}
					tmp.push(r);
				});
				if(tmp.length > 0) {
					$scope.selectedAllowedRight = tmp[0].name;
					$scope.selectedDeniedRight = tmp[0].name;
				}
				else {
					$scope.selectedAllowedRight = false;
					$scope.selectedDeniedRight = false;
				}
				$scope.availableRights = tmp;
			}
		}
		
		$scope.remove = function(group) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove group '" + group.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var r = new UsersGroup({ _id: group._id });
				r.$delete(function() {
					notifications.success('', "Removed group '" + group.name + "'.");
					$scope.group = UsersGroup.get($routeParams);
				}, function() {
					notifications.error('', "Could not remove group.");
				});
			});
		};
	
		$scope.create = function(group) {
			group.$create({}, function() {
				$location.path('/users/group');
				notifications.success('', 'Added group.');
			}, function() {
				notifications.error('', "Group could not be added.");
			});
		}
		
		$scope.save = function(group) {
			var nm = group.name;
			group.$save(function() {
				$location.path('users/group');
				notifications.success('', "Saved group '" + nm + "'.");
			}, function() {
				notifications.error('', "Could not save group.");
			});
		}
		
		$scope.removeAllowedRight = function(group, right) {
			var i = group.allowed.indexOf(right);
			if(i != -1) {
				group.allowed.splice(i, 1);
				self.setAvailableRights();
			}
		}
		
		$scope.removeDeniedRight = function(group, right) {
			var i = group.denied.indexOf(right);
			if(i != -1) {
				group.denied.splice(i, 1);
				self.setAvailableRights();
			}
		}
	
		$scope.addAllowedRight = function(group) {
			group.allowed.push($scope.selectedAllowedRight);
			self.setAvailableRights();
		}
	
		$scope.addDeniedRight = function(group) {
			group.denied.push($scope.selectedDeniedRight);
			self.setAvailableRights();
		}
	}]);
	
	angular.module('coontiAdmin').controller('UsersPasswordCtrl', ['$scope', '$routeParams', '$location', '$http', '$window', 'User', 'ngDialog', 'notifications', function($scope, $routeParams, $location, $http, $window, User, ngDialog, notifications) {
		$scope.user = User.get($routeParams, function() {
			if($scope.user.account == coonti.user.account) {
				$scope.currentUser = true;
			}
		});

		$scope.currentUser = false;
		$scope.currentPassword = '';
		$scope.password = '';
		$scope.password2 = '';
	
		$scope.change = function() {
			if($scope.currentUser && $scope.currentPassword == '') {
				notifications.error('', "Please provide current password.");
				return;
			}
			
			if($scope.password == '') {
				notifications.error('', "Please input password.");
				return;
			}
	
			if($scope.password != $scope.password2) {
				notifications.error('', "Passwords do not match.");
				return;
			}
	
			$http.post(coonti.routing.prefix + '/api/users/user/password/' + $scope.user._id, { password: $scope.password, currentPassword: $scope.currentPassword }).
				success(function(data, status) {
					notifications.success('', "Password for '" + $scope.user.account + "' changed.");
					$window.history.back();
				}).error(function(data, status) {
					notifications.error('', "Password for '" + $scope.user.account + "' could not be changed.");
				});
		}
	
		$scope.remove = function() {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove password from account '" + $scope.user.account + "'? The user is not able to log in after the password has been removed.",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				$http.post(coonti.routing.prefix + '/api/users/user/password/' + $scope.user._id, { password: '' }).
					success(function(data, status) {
						notifications.success('', "Password for '" + $scope.user.account + "' removed.");
						$window.history.back();
					}).error(function(data, status) {
						notifications.error('', "Password for '" + $scope.user.account + "' could not be removed.");
					});
			});
		}
	}]);
		
	
	angular.module('coontiAdmin').factory('UsersRole', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/users/role/:_id', { _id: "@_id" }, {
				'create': { method: 'PUT' }
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('UsersRolesCtrl', ['$scope', '$routeParams', '$location', 'UsersRole', 'UsersRight', 'ngDialog', 'notifications', function($scope, $routeParams, $location, UsersRole, UsersRight, ngDialog, notifications) {
		var self = this;
	
		$scope.add = false;
		$scope.availableRights = [];
	
		if($location.path() == '/users/role/add') {
			$scope.add = true;
			$scope.role = new UsersRole();
			$scope.role.name = '';
			$scope.role.description = '';
			$scope.role.allowed = [];
			$scope.role.denied = [];
		}
		else {
			$scope.role = UsersRole.get($routeParams, function() {
				self.setAvailableRights();
			});
		}
		if($routeParams['_id'] || $scope.add) {
			$scope.rights = UsersRight.get({}, function() {
				self.setAvailableRights();
			});
		}
	
		this.setAvailableRights = function() {
			if($scope['rights'] && $scope.rights.$resolved && ($scope.role.$resolved || $scope.add)) {
				var tmp = [];
				_.each($scope.rights, function(r, i) {
					if(i.startsWith('$')) {
						return;
					}
					if($scope.role.allowed.indexOf(r.name) != -1) {
						return;
					}
					if($scope.role.denied.indexOf(r.name) != -1) {
						return;
					}
					tmp.push(r);
				});
				if(tmp.length > 0) {
					$scope.selectedAllowedRight = tmp[0].name;
					$scope.selectedDeniedRight = tmp[0].name;
				}
				else {
					$scope.selectedAllowedRight = false;
					$scope.selectedDeniedRight = false;
				}
				$scope.availableRights = tmp;
			}
		}
		
		$scope.remove = function(role) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to remove role '" + role.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var r = new UsersRole({ _id: role._id });
				r.$delete(function() {
					notifications.success('', "Removed role '" + role.name + "'.");
					$scope.role = UsersRole.get($routeParams);
				}, function() {
					notifications.error('', "Could not remove role.");
				});
			});
		};
	
		$scope.create = function(role) {
			role.$create({}, function() {
				$location.path('/users/role');
				notifications.success('', 'Added role.');
			}, function() {
				notifications.error('', "Role could not be added.");
			});
		}
		
		$scope.save = function(role) {
			var nm = role.name;
			role.$save(function() {
				$location.path('users/role');
				notifications.success('', "Saved role '" + nm + "'.");
			}, function() {
				notifications.error('', "Could not save role.");
			});
		}
		
		$scope.removeAllowedRight = function(role, right) {
			var i = role.allowed.indexOf(right);
			if(i != -1) {
				role.allowed.splice(i, 1);
				self.setAvailableRights();
			}
		}
		
		$scope.removeDeniedRight = function(role, right) {
			var i = role.denied.indexOf(right);
			if(i != -1) {
				role.denied.splice(i, 1);
				self.setAvailableRights();
			}
		}
	
		$scope.addAllowedRight = function(role) {
			role.allowed.push($scope.selectedAllowedRight);
			self.setAvailableRights();
		}
	
		$scope.addDeniedRight = function(role) {
			role.denied.push($scope.selectedDeniedRight);
			self.setAvailableRights();
		}
	}]);
	
	angular.module('coontiAdmin').factory('UsersRight', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/users/right', {}, {
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('UsersRightsListCtrl', ['$scope', 'UsersRight', function ($scope, Right) {
		$scope.rights = Right.get();
	}]);
	
	angular.module('coontiAdmin').factory('Module', ['$resource',
		function($resource) {
			return $resource(coonti.routing.prefix + '/api/modules/:name', { name: '@name' }, {
				init: { method: 'POST', params: { init: true }},
				start: { method: 'POST', params: { start: true }},
				stop: { method: 'POST', params: { stop: true }}
			});
		}
	]);
	
	angular.module('coontiAdmin').controller('ModulesCtrl', ['$scope', '$rootScope', 'Module', 'ngDialog', 'notifications', function($scope, $rootScope, Module, ngDialog, notifications) {
		$scope.modules = Module.get();
		$scope.init = function(md) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to initialise module '" + md.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var m = new Module({ name: md.name });
				m.$init({}, function() {
					notifications.success('', "Module '" + md.name + "' initialised.");
				}, function() {
					notifications.error('', "Module '" + md.name + "' could not be initialised.");
				});
				$scope.modules = Module.get();
			});
		}
	
		$scope.start = function(md) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to start module '" + md.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var m = new Module({ name: md.name });
				m.$start({}, function() {
					$rootScope.$emit('asset.update');
					$rootScope.$emit('route.update');
					$rootScope.$emit('menu.update');
					notifications.success('', "Module '" + md.name + "' started.");
				}, function() {
					notifications.error('', "Module '" + md.name + "' could not be started.");
				});
				$scope.modules = Module.get();
			});
		}
	
		$scope.stop = function(md) {
			ngDialog.openConfirm({
				data: {
					message: "Are you sure to stop module '" + md.name + "'?",
					close: 'No',
					confirm: 'Yes'
				}
			}).then(function(value) {
				var m = new Module({ name: md.name });
				m.$stop({}, function() {
					$rootScope.$emit('menu.update');
					notifications.success('', "Module '" + md.name + "' stopped.");
				}, function() {
					notifications.error('', "Module '" + md.name + "' could not be stopped.");
				});
				$scope.modules = Module.get();
			});
		}
	}]);
	
	angular.module('coontiAdmin').controller('WysiwygInsertImageCtrl', ['$scope', function($scope) {
		$scope.media = {};
		$scope.coonti = coonti;

		$scope.mediaAction = 'Insert';
		$scope.onMediaAction = function(path, dir, item) {
			insertMedia(path + dir + '/' + item.name, $scope.media.alt);
		}

		insertMedia = function(url, alt) { // ##TODO## Sizing?
			if(!alt) {
				alt = '';
			}
			var md = '<img src="' + url + (!!alt ? '" alt="' + alt : '') + '"/>';
			$scope.$close(md);
		}

	}]);
	
	angular.module('coontiAdmin').controller('SelectImageCtrl', ['$scope', function($scope) {
		$scope.media = {};
		$scope.coonti = coonti;

		$scope.mediaAction = 'Select';
		$scope.onMediaAction = function(path, dir, item) {
			$scope.$close(path + dir + '/' + item.name);
		}
	}]);
	
	angular.module('coontiAdmin').controller('WysiwygInsertLinkCtrl', ['$scope', function($scope) {
		$scope.link = {};
		$scope.coonti = coonti;

		$scope.contentAction = 'Insert';
		$scope.onContentAction = function(item) {
			if(!$scope.link.title) {
				$scope.link.title = item.content.title;
			}
			insertLink('/' + item.path, item._id, $scope.link.title, $scope.link.anchor);
		}

		$scope.mediaAction = 'Insert';
		$scope.onMediaAction = function(path, dir, item) {
			insertLink(path + dir + '/' + item.name, '', $scope.link.title, $scope.link.anchor);
		}

		$scope.insertExternalUrl = function() {
			insertLink($scope.link.url, false, $scope.link.title, $scope.link.anchor);
		}

		insertLink = function(url, id, title, anchor) {
			var link = '<a href="' + url + (!!anchor ? '#' + anchor : '') + (!!title ? '" title="' + title : '') + (!!id ? '" id="' + id : '') + '">';
			$scope.$close(link);
		}
	}]);
	
	angular.module('coontiAdmin').directive('modalclose', [function() {
	    return {
	        restrict: 'A',
	        link: function(scope, elem, attrs) {
	            elem.bind('click', function () {
					scope.$close();
	            });
	        }
	    };
	}]);
	
	angular.module('coontiAdmin').directive('back', ['$window', function($window) {
	    return {
	        restrict: 'A',
	        link: function(scope, elem, attrs) {
	            elem.bind('click', function () {
	                $window.history.back();
	            });
	        }
	    };
	}]);
	
	angular.module('coontiAdmin').directive('goto', ['$location', function($location) {
		return {
			restrict: 'A',
			link: function(scope, elem, attrs) {
				var path;
	
				attrs.$observe('goto', function(val) {
					path = val;
				});
	
				elem.bind('click', function () {
					scope.$apply(function () {
						$location.path(path);
					});
				});
			}
		}
	}]);

	angular.module('coontiAdmin').directive('coontiContent', ['Content', function(Content) {
		return {
			restrict: 'E',
			templateUrl: coonti.routing.coontiPath + '/angular/' + coonti.theme.theme + '/content-list-embed.html',
			link: function(scope, element, attrs, contentCtrl) {
				var pagination = {};
				if(scope.content && scope.content.pagination) {
					pagination = scope.content.pagination;
				}
				scope.content = Content.get(pagination);
				scope.sortChanged = function() {
					scope.content = Content.get(scope.content.pagination);
				}
			}
		}
	}]);
		
	angular.module('coontiAdmin').directive('coontiMedia', ['Media', function(Media) {
		return {
			restrict: 'E',
			templateUrl: coonti.routing.coontiPath + '/angular/' + coonti.theme.theme + '/media-list-embed.html',
			link: function(scope, element, attrs, mediaCtrl) {
				var pagination = {};
				if(scope.media && scope.media.pagination) {
					pagination = scope.media.pagination;
				}
				if(!!attrs.filter) {
					pagination.filter = attrs.filter;
				}
				scope.media = Media.get(pagination);
				scope.sortChanged = function() {
					scope.media = Media.get(scope.media.pagination);
				}
			}
		}
	}]);

	angular.module('coontiAdmin').directive('coontiSelectImage', ['$modal', function($modal) {
	    return {
	        restrict: 'E',
			template: '<button ng-click="selectImage()">Select Image</button>',
	        link: function(scope, elem, attrs) {
				scope.selectImage = function() {
					var self = this;
                    $modal.open({
                        controller: 'SelectImageCtrl',
                        templateUrl: coonti.routing.coontiPath + '/angular/' + coonti.theme.theme + '/wysiwyg-insert-image.html'
                    }).result.then(
                        function(result) {
							if(result) {
								scope.field.value = result;
								var split = result.match(/^(.+)\.(\w+)$/);
								if(split) {
									scope.field.value_thumbnail = split[1] + '_128x128scm.' + split[2];
								}
							}
                        },
                        function() {
                        }
                    );
				}
	        }
	    };
	}]);
	
	angular.module('coontiAdmin').directive('coontiForm', ['$http', '$compile', function($http, $compile) {
		var formCount = 0;
		var tmplUrl = coonti.routing.coontiPath + '/_/formtemplates/angular/form';
		if(!!coonti.theme.themeSettings['angularFormTemplate']) {
			tmplUrl = coonti.routing.coontiPath + '/' + coonti.theme.themeSettings['angularFormTemplate'];
		}
		return {
			restrict: 'E',
			templateUrl: tmplUrl,
			replace: true,
			scope: {
				formName: '@',
				formData: '@',
				formOptions: '@',
				form: '@',
			},
			link: function(scope, element, attrs, formCtrl) {
				var options = {};
				attrs.$observe('formName', function(value) {
					if(!!scope['formOptions']) {
						options = scope.$eval(scope.formOptions);
					}
					var formId = scope['formName'];
					if(!!formId) {
						var parts = formId.split('/');
						if(parts.length == 2 && parts[0].length > 0 && parts[1].length > 0) {
							$http.get(coonti.routing.coontiPath + '/_/form/' + formId).success(function(dt) {
								scope.form = dt;
								if(!!options.formKey) {
									scope.form.name = options.formKey;
								}
								scope.form.id = 'coonti-form-' + (++formCount) + '-';
								if(!!scope.formData) {
									var dt = false;
									
									if(scope.formData.indexOf('.') == -1) {
										if(scope.$parent[scope.formData]) {
											dt = scope.$parent[scope.formData];
										}
									}
									else {
										var tmp = scope.formData.split('.');
										var tmpScope = scope.$parent;
										for(var i in tmp) {
											if(tmpScope[tmp[i]]) {
												tmpScope = tmpScope[tmp[i]];
											}
											else {
												tmpScope = false;
												break;
											}
										}
										if(tmpScope) {
											dt = tmpScope;
										}
									}
									scope.data = dt;
								}
								else {
									scope.data = {};
								}
								for(var i in scope.form.fields) {
									if(options['skipTypes'] && options.skipTypes.indexOf(scope.form.fields[i]['formElement']['type']) != -1) {
										scope.form.fields[i]['skip'] = 'yes';
									}
									if(typeof(scope.data[scope.form.fields[i]['name']]) !== 'undefined') {
										scope.form.fields[i]['value'] = scope.data[scope.form.fields[i]['name']];
									}
									else if(typeof(scope.form.fields[i]['localDef']['defaultValue']) !== 'undefined') {
										scope.form.fields[i]['value'] = scope.form.fields[i]['localDef']['defaultValue'];
									}
									else if(typeof(scope.form.fields[i]['formElement']['defaultValue']) !== 'undefined') {
										scope.form.fields[i]['value'] = scope.form.fields[i]['formElement']['defaultValue'];
									}
									if(scope.form.fields[i]['formElement']['type'] == 'image' &&
									   scope.form.fields[i]['value']) {
										var split = scope.form.fields[i]['value'].match(/^(.+)\.(\w+)$/);
										if(split) {
											scope.form.fields[i]['value_thumbnail'] = split[1] + '_128x128scm.' + split[2];
										}
									}
								}
								
								scope.form.submit = function(submission) {
									// ##TODO## Run form field checks and return false if they fail
									
									for(var i in scope.form.fields) {
										var f = scope.form.fields[i];
										if(options['skipTypes'] && options.skipTypes.indexOf(f['formElement']['type']) != -1) {
											continue;
										}
										submission[f.name] = f.value;
									}
									return true;
								}
	
								// Find the controller scope that has submit() function and attach form to it.
								var parentScope = scope.$parent;
								for(;;) {
									if(!parentScope.$parent) {
										break;
									}
									if(!parentScope.$parent['submit']) {
										break;
									}
									parentScope = parentScope.$parent;
								}
								if(!!options.formKey) {
									parentScope[options.formKey] = scope.form;
								}
								else {
									parentScope.form = scope.form;
								}
							});
						}
					}
				});
			}
		}
	}]);
	
	angular.module('coontiAdmin').directive('coontiSortLink', [function() {
		return {
			restrict: 'E',
			template: "<a ng-if=\"sortData.sort != key && sortData.sort != '-' + key\" class='coontiSort_{{ key }}' href='{{ href }}?start=0&len={{ sortData.len }}&sort={{ key }}'>{{ title }}</a><a ng-if='sortData.sort == key' class='coontiSort_{{ key }}' href='{{ href }}?start=0&len={{ sortData.len }}&sort=-{{ key }}'>{{ title }}</a><a ng-if=\"sortData.sort == '-' + key\" class='coontiSort_{{ key }}' href='{{ href }}?start=0&len={{ sortData.len }}&sort={{ key }}'>{{ title }}</a>",
			scope: {
				key: '@',
				href: '@',
				title: '@',
				sortData: '='
			}
		};
	}]);
	
	angular.module('coontiAdmin').directive('coontiSortLinkEmbed', [function() {
		return {
			restrict: 'E',
			template: "<a ng-if=\"sortData.sort != key && sortData.sort != '-' + key\" class='coontiSort_{{ key }}' ng-click='sorter(key)'>{{ title }}</a><a ng-if='sortData.sort == key' class='coontiSort_{{ key }}' ng-click='sorter(\"-\" + key)'>{{ title }}</a><a ng-if=\"sortData.sort == '-' + key\" class='coontiSort_{{ key }}' ng-click='sorter(key)'>{{ title }}</a>",
			link: function(scope, el, attr) {
				scope.sorter = function(key) {
					scope.sortData.start = 0;
					scope.sortData.sort = key;
					scope.$parent.sortChanged();
				}
			},
			scope: {
				key: '@',
				href: '@',
				title: '@',
				sortData: '='
			}
		};
	}]);
	
	angular.module('coontiAdmin').directive('coontiPagination', [function() {
		return {
			restrict: 'E',
			template: function(te, ta) {
				if(ta.embed && ta.embed == 'true') {
					return '<ul ng-if="page.links" class="pagination"><li ng-repeat="link in page.links"><a ng-if="link.href" ng-click="paginate(link.start)">{{ link.title }}</a><span ng-if="!link.href" class="coontiPagerCurrent">{{ link.title }}</span></li></ul>';
				}
				return '<ul ng-if="page.links" class="pagination"><li ng-repeat="link in page.links"><a ng-if="link.href" href="{{ href }}?{{ link.href }}">{{ link.title }}</a><span ng-if="!link.href" class="coontiPagerCurrent">{{ link.title }}</span></li></ul>';
			},
			scope: {
				href: '@',
				page: '=',
				sortData: '='
			},
			link: function(scope, el, attr) {
				scope.paginate = function(start) {
					scope.sortData.start = start;
					scope.$parent.sortChanged();
				}
				scope.$watch('page.$resolved', function(ov, nv) {
					if(scope.page.$resolved) {
						var start = 0;
						var len = 20;
						var mx = 0;
						var sort = '';
						var itemsLen = 0;
						scope.page['links'] = [];
						if(scope.page.pagination['start']) {
							start = scope.page.pagination['start'];
							if(start < 0) {
								start = 0;
							}
						}
						if(scope.page.pagination['len']) {
							len = scope.page.pagination['len'];
							if(len < 1) {
								len = 20;
							}
						}
						if(scope.page.pagination['total']) {
							mx = scope.page.pagination['total'];
							if(mx < 0) {
								mx = 0;
							}
						}
						if(scope.page.pagination['sort']) {
							sort = scope.page.pagination['sort'];
						}
						if(scope.page['items']) {
							itemsLen = scope.page['items'].length;
						}
						else {
							itemsLen = len;
						}
	
						if(start == 0 && itemsLen < len) {
							return;
						}
						var postfix = '&len=' + len + '&sort=' + sort;
						var links;
	
						if(start > len) {
							links = {
								title: '<< Start',
								href: 'start=0' + postfix,
								start: 0
							}
							scope.page.links.push(links);
						}
						if(start > 0) {
							links = {
								title: '< Previous',
								href: 'start=' + Math.max(start - len, 0) + postfix,
								start: Math.max(start - len, 0)
							}
							scope.page.links.push(links);
						}
	
						var steps = Math.ceil(Math.max(start, mx) / len);
						if(mx == 0) {
							steps++;
						}
						for(var i = 0; i < steps; i++) {
							if(i * len == start) {
								links = {
									title: (i + 1),
									href: false
								}
							}
							else if(i * len == mx && mx != 0) {
								break;
							}
							else {
								links = {
									title: (i + 1),
									href: 'start=' + (i * len) + postfix,
									start: i * len
								}
							}
							scope.page.links.push(links);
						}
						if(mx > start + len || (mx == 0 && itemsLen >= len)) {
							links = {
								title: 'Next >',
								href: 'start=' + (start + len) + postfix,
								start: start + len
							}
							scope.page.links.push(links);
						}
	
						if(mx > start + len + len) {
							if(mx % len == 0) {
								links = {
									title: 'End >>',
									href: 'start=' + (mx - len) + postfix,
									start: mx - len
								}
							}
							else {
								links = {
									title: 'End >',
									href: 'start=' + (mx - (mx % len)) + postfix,
									start: mx - (mx % len)
								}
							}
							scope.page.links.push(links);
						}
					}
				});
			}
		};
	}]);
	
	angular.module('coontiAdmin').filter('orderObjectBy', function() {
		return function(items, field, reverse) {
			var filtered = [];
			angular.forEach(items, function(item) {
				if(item[field]) {
					filtered.push(item);
				}
			});
			filtered.sort(function(a, b) {
				return(a[field] > b[field] ? 1 : -1);
			});
			if(reverse) {
				filtered.reverse();
			}
			return filtered;
		};
	});
	
	angular.module('coontiAdmin').filter('isOfSize', function() {
		return function(obj, size) {
			if(!obj && size == 0) {
				return true;
			}
			if(obj && obj.length && obj.length == size) {
				return true;
			}
			if(obj && Object.keys(obj).length == size) {
				return true;
			}
			return false;
		}
	});
	
	angular.module('coontiAdmin').filter('capitalise', function() {
		return function(input) {
			return (!!input) ? input.charAt(0).toUpperCase() + input.substr(1).toLowerCase() : '';
		}
	});
	
	angular.module('coontiAdmin').filter('isSet', function() {
		return function(items, name) {
			var filtered = [];
			angular.forEach(items, function(item) {
				if(name == undefined || name == ''){
					filtered.push(item);
				}
				else if(item[name]) {
					filtered.push(item);
				}
			});
			return filtered;
		}
	});
	
	angular.module('coontiAdmin').filter('isNotSet', function() {
		return function(items, name) {
			var filtered = [];
			angular.forEach(items, function(item) {
				if(name == undefined || name == ''){
					filtered.push(item);
				}
				else if(!item[name]) {
					filtered.push(item);
				}
			});
			return filtered;
		}
	});
	
	angular.module('coontiAdmin').directive('stopEvent', function () {
	    return {
	        restrict: 'A',
	        link: function(scope, element, attr) {
	            if(attr && attr.stopEvent)
	                element.bind(attr.stopEvent, function(e) {
	                    e.stopPropagation();
	                });
	        }
	    };
	});

	angular.module('coontiAdmin').service('coontiCounter', function() {
		var count = 0;
		return {
			increase: function() {
				count++;
			},
			value: function() {
				return count;
			}
		}
	});
}
