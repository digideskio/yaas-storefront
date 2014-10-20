'use strict';

/**  Initializes and configures the application. */
window.app = angular.module('ds.router', [
    'restangular',
    'ui.router',
    'ds.shared',
    'ds.i18n',
    'ds.products',
    'ds.cart',
    'ds.checkout',
    'ds.confirmation',
    'ds.account',
    'ds.auth',
    'ds.orders',
    'ds.queue',
    'config',
    'xeditable'
])
    .constant('_', window._)

      /** Defines the HTTP interceptors. */
    .factory('interceptor', ['$q', '$injector', 'settings','TokenSvc', 'httpQueue', 'GlobalData',
        function ($q, $injector, settings,  TokenSvc, httpQueue, GlobalData) {

            return {
                request: function (config) {
                    document.body.style.cursor = 'wait';
                    // skip html requests as well as anonymous login URL
                    if (config.url.indexOf('templates') < 0 && config.url.indexOf(settings.apis.account.baseUrl) < 0) {

                        var token = TokenSvc.getToken().getAccessToken();
                        if (token) {
                            config.headers[settings.apis.headers.hybrisAuthorization] = 'Bearer ' + token;
                        } else {
                            // no local token - issue request to get token (async) and "save" http request for re-try
                            $injector.get('AnonAuthSvc').getToken();
                            var deferred = $q.defer();
                            httpQueue.appendBlocked(config, deferred);
                            return deferred.promise;
                        }
                        if (config.url.indexOf('product-details') > -1) {
                            config.headers[settings.apis.headers.hybrisCurrency] = GlobalData.getCurrencyId();
                        }
                    }
                    return config || $q.when(config);
                },
                requestError: function(request){
                    document.body.style.cursor = 'auto';
                    return $q.reject(request);
                },
                response: function (response) {
                    document.body.style.cursor = 'auto';
                    return response || $q.when(response);
                },
                responseError: function (response) {
                    document.body.style.cursor = 'auto';

                    if (response.status === 401) {
                        // 401 on login means wrong password - requires user action
                        if(response.config.url.indexOf('login')<0 && response.config.url.indexOf('password/change')<0) {
                            // remove any existing token, as it appears to be invalid
                            TokenSvc.unsetToken();
                            var $state = $injector.get('$state');
                            // if current state requires authentication, prompt user to sign in and reload state
                            if ($state.current.data && $state.current.data.auth && $state.current.data.auth === 'authenticated') {
                                $injector.get('AuthDialogManager').open({}, {}, {});
                            } else {
                                // else, retry http request - new anonymous token will be triggered automatically
                                // issue request to get token (async) and "save" http request
                                $injector.get('AnonAuthSvc').getToken();
                                var deferred = $q.defer();
                                httpQueue.appendRejected(response.config, deferred);
                                return deferred.promise;
                            }
                        }
                    } else if(response.status === 403){
                        // if 403 during login, should already be handled by auth dialog controller
                        if(response.config.url.indexOf('login')<0) {
                            // using injector lookup to prevent circular dependency
                            var AuthSvc = $injector.get('AuthSvc');
                            if (AuthSvc.isAuthenticated()) {
                                // User is authenticated but is not allowed to access resource
                                // this scenario shouldn't happen, but if it does, don't fail silently
                                window.alert('You are not authorized to access this resource!');
                            } else {
                                // User is not authenticated - make them log in and reload the current state
                                $injector.get('AuthDialogManager').open({}, {}, {}).then(
                                    // success scenario handled as part of "logged in" workflow
                                    function(){},
                                function(){ // on dismiss, re-route to home page
                                    $injector.get('$state').go(settings.homeState);
                                });
                            }
                        }
                    }
                    return $q.reject(response);
                }
            };
        }])

    // Configure HTTP and Restangular Providers - default headers, CORS
    .config(['$httpProvider', 'RestangularProvider', 'settings', 'storeConfig', function ($httpProvider, RestangularProvider, settings, storeConfig) {
        $httpProvider.interceptors.push('interceptor');

        // enable CORS
        $httpProvider.defaults.useXDomain = true;
        RestangularProvider.addFullRequestInterceptor( function(element, operation, route, url, headers, params, httpConfig) {

            var oldHeaders = {};
            if(url.indexOf('yaas')<0) {
                delete $httpProvider.defaults.headers.common[settings.apis.headers.hybrisAuthorization];
                //work around if not going through Apigee proxy for a particular URL, such as while testing new services
                oldHeaders [settings.apis.headers.hybrisTenant] = storeConfig.storeTenant;
                oldHeaders [settings.apis.headers.hybrisRoles] = settings.roleSeller;
                oldHeaders [settings.apis.headers.hybrisUser] = settings.hybrisUser;
                oldHeaders [settings.apis.headers.hybrisApp] = settings.hybrisApp;
            }
            return {
                element: element,
                params: params,
                headers: _.extend(headers, oldHeaders),
                httpConfig: httpConfig
            };
        });
    }])
    .run(['$rootScope', '$injector','storeConfig', 'ConfigSvc', 'AuthDialogManager', '$location', 'settings', 'TokenSvc',
       'AuthSvc', 'GlobalData', '$state', 'httpQueue', 'editableOptions', 'editableThemes', 'CartSvc',
        function ($rootScope, $injector, storeConfig, ConfigSvc, AuthDialogManager, $location, settings, TokenSvc,
                 AuthSvc, GlobalData, $state, httpQueue, editableOptions, editableThemes, CartSvc) {


            if(storeConfig.token) { // if passed up from server in multi-tenant mode
                TokenSvc.setAnonymousToken(storeConfig.token, storeConfig.expiresIn);
            }

            editableOptions.theme = 'bs3';
            editableThemes.bs3.submitTpl = '<button type="submit" class="btn btn-primary">{{\'SAVE\' | translate}}</button>';


            $rootScope.$on('authtoken:obtained', function(event, token){
                httpQueue.retryAll(token);
            });

            $rootScope.$on('$stateChangeStart', function(event, toState, toParams){
                AuthDialogManager.close();

                // handle attempt to access protected resource - show login dialog if user is not authenticated
                if ( toState.data && toState.data.auth && toState.data.auth === 'authenticated' && !AuthSvc.isAuthenticated() ) {

                    // block immediate state transition
                    event.preventDefault();

                    var dlg = $injector.get('AuthDialogManager').open({}, {}, {targetState: toState, targetStateParams: toParams });
                    dlg.then(function(){}, function(){
                        $state.go(settings.homeState);
                    });

                }
            });

            $rootScope.$watch(function() { return AuthSvc.isAuthenticated(); }, function(isAuthenticated) {
                $rootScope.$broadcast(isAuthenticated ? 'user:signedin' : 'user:signedout');
                GlobalData.user.isAuthenticated = isAuthenticated;
                GlobalData.user.username = TokenSvc.getToken().getUsername();
            });

            $rootScope.$on('currency:updated', function (event, newCurr) {
                CartSvc.switchCurrency(newCurr);
            });

            // setting root scope variables that drive class attributes in the BODY tag
            $rootScope.showCart =false;
            $rootScope.showMobileNav=false;
        }
    ])

    /** Sets up the routes for UI Router. */
    .config(['$stateProvider', '$urlRouterProvider', '$locationProvider', 'TranslationProvider', 'storeConfig',
        function($stateProvider, $urlRouterProvider, $locationProvider, TranslationProvider, storeConfig) {

            TranslationProvider.setPreferredLanguage(storeConfig.defaultLanguage);

            // States definition
            $stateProvider
                .state('base', {
                    abstract: true,
                    views: {

                        'sidebarNavigation@': {
                            templateUrl: 'js/app/shared/templates/sidebar-navigation.html',
                            controller: 'SidebarNavigationCtrl'
                        },
                        'topNavigation@': {
                            templateUrl: 'js/app/shared/templates/top-navigation.html',
                            controller: 'TopNavigationCtrl'
                        },
                        'cart@': {
                            templateUrl: 'js/app/cart/templates/cart.html',
                            controller: 'CartCtrl'
                        }
                    },
                    resolve:{
                        // this will block controller loading until the application has been initialized with
                        //  all required configuration (language, currency)
                        initialized: function(ConfigSvc) {
                            return ConfigSvc.initializeApp();
                        }
                    }
                })
                .state('base.product', {
                    url: '/products/',
                    abstract: true
                })
                .state('base.category', {
                    url: '/ct/:catName',
                    views: {
                        'main@': {
                            templateUrl: 'js/app/products/templates/product-list.html',
                            controller: 'BrowseProductsCtrl'
                        }
                    },
                    resolve: {

                        category: function ($stateParams, CategorySvc) {
                            return CategorySvc.getCategoryWithProducts($stateParams.catName);
                        }
                    }
                })
                .state('base.product.detail', {
                    url: ':productId/',
                    views: {
                        'main@': {
                            templateUrl: 'js/app/products/templates/product-detail.html',
                            controller: 'ProductDetailCtrl'
                        }
                    },
                    resolve: {
                        product: function ($stateParams, PriceProductREST) {
                            return PriceProductREST.ProductDetails.one('productdetails', $stateParams.productId).get()
                                .then(function (result) {
                                    return result;
                                });
                        }
                    }
                })
                .state('base.checkout', {
                    abstract: true,
                    views: {
                        'main@': {
                            templateUrl: 'js/app/checkout/templates/checkout-frame.html'
                        }
                    },
                    resolve: {
                        cart: function (CartSvc) {
                            return CartSvc.getCart();
                        },
                        order: function (CheckoutSvc) {
                            return CheckoutSvc.getDefaultOrder();
                        },
                        shippingCost: function (CheckoutSvc) {
                            return CheckoutSvc.getShippingCost();
                        }
                    }
                })

                .state('base.checkout.details', {
                    url: '/checkout/',
                    views: {
                        'orderdetails': {
                            templateUrl: 'js/app/checkout/templates/order-details.html',
                            controller: 'OrderDetailCtrl'
                        },
                        'checkoutform': {
                            templateUrl: 'js/app/checkout/templates/checkout-form.html',
                            controller: 'CheckoutCtrl'
                        }
                    }
                })
                .state('base.confirmation', {
                    url: '/confirmation/:orderId/',
                    views: {
                        'main@': {
                            templateUrl: 'js/app/confirmation/templates/confirmation.html',
                            controller: 'ConfirmationCtrl'
                        }
                    },
                    resolve: {
                        isAuthenticated: function(AuthSvc){
                            return AuthSvc.isAuthenticated();
                        }
                    }
                })
                .state('base.account', {
                    url: '/account/',
                    views: {
                        'main@': {
                            templateUrl: 'js/app/account/templates/account.html',
                            controller: 'AccountCtrl'
                        }
                    },
                    resolve: {
                        account: function(AccountSvc) {
                            return AccountSvc.account();
                        },
                        addresses: function(AccountSvc, settings) {
                            var query = {
                                pageNumber: 1,
                                pageSize: settings.apis.account.addresses.initialPageSize
                            };
                            return AccountSvc.getAddresses(query);
                        },
                        orders: function(OrderListSvc) {
                            var parms = {
                                pageSize: 10
                            };
                            return OrderListSvc.query(parms);
                        }
                    },
                    data: {
                        auth: 'authenticated'
                    }
                })
                .state('base.changePassword', {
                    url: '/changePassword?token',
                    views: {
                        'main@': {
                            templateUrl: 'js/app/auth/templates/password-reset.html',
                            controller: 'ResetPasswordUpdateCtrl'
                        }
                    }
                })
                .state('base.orderDetail', {
                    url: '/orderDetail/:orderId',
                    views: {
                        'main@': {
                            templateUrl: 'js/app/account/templates/order-detail.html',
                            controller: 'AccountOrderDetailCtrl'
                        }
                    },
                    resolve: {
                        order: function ($stateParams, OrdersREST) {
                            return OrdersREST.Orders.one('orders', $stateParams.orderId).get()
                                .then(function (result) {
                                    window.scrollTo(0, 0);
                                    result.id = $stateParams.id;
                                    return result;
                                });
                        }
                    },
                    data: {
                        auth: 'authenticated'
                    }
                });


            $urlRouterProvider.otherwise('/ct/');

            /* Code from angular ui-router to make trailing slash conditional */
            $urlRouterProvider.rule(function($injector, $location) {
                var path = $location.path()
                // Note: misnomer. This returns a query object, not a search string
                    , search = $location.search()
                    , params
                    ;

                // check to see if the path already ends in '/'
                if (path[path.length - 1] === '/') {
                    return;
                }

                // If there was no search string / query params, return with a `/`
                if (Object.keys(search).length === 0) {
                    return path + '/';
                }

                // Otherwise build the search string and return a `/?` prefix
                params = [];
                angular.forEach(search, function(v, k){
                    params.push(k + '=' + v);
                });
                return path + '/?' + params.join('&');
            });
            $locationProvider.hashPrefix('!');
        }
    ]);


