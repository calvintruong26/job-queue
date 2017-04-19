var jobQueueApp = angular.module('jobQueueApp', []);

jobQueueApp.controller('jobsController', ['$scope', '$log', '$http', '$sce', '$window', function($scope, $log, $http, $sce, $window) {
    
    // List of jobs
    $scope.jobs = [];
    
    // Redirect to get info for specific job
    $scope.submit = function() {
        if ($scope.input.length > 0) {
            $window.location.href = "/jobs/" + $scope.input;
        }
        else {
            $window.location.href = "/jobs"
        }
    }
    
    // Make request to API endpoint to get list of jobs
    $http({ 
        method: 'GET',
        url: '/api/jobs'
    })
    .then(function successCallback(response) {
            $scope.jobs = response.data;
            $scope.jobs = $scope.jobs.reverse();
        }, function errorCallback(response) {
            $log.info(response.statusText);
    });
}]);


jobQueueApp.controller('showController', ['$scope', '$log', '$http', '$sce', '$window', '$location', function($scope, $log, $http, $sce, $window, $location) {
        
    // Job to display
    $scope.job = {};
    
    // Get the ID
    var id = $location.absUrl();
    id = id.substring(id.lastIndexOf("/")+1);
    console.log(id);
    
    // Make request to API endpoint to get specific job
    $http({
        method: 'GET',
        url: '/api/jobs/' + Number(id)
    })
    .then(function successCallback(response) {
            $scope.job = response.data[0];
            console.log(response.data);
        }, function errorCallback(response) {
            $log.info(response.statusText);
        });
    
    // Run when delete button is pressed
    $scope.submit = function() {
        $http({ 
        method: 'POST',
        url: '/jobs/' + id + '?_method=DELETE'
    })
    .then(function successCallback(response) {
            $window.location.href = "/jobs";
        }, function errorCallback(response) {
            $log.info(response.statusText);
            $window.location.href = "/jobs";
    });
    }
    
    
}]);