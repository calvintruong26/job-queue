var express = require("express");
var app = express();
var mongoose = require("mongoose");
var bodyParser = require('body-parser');
var request = require('request');
var validHttp = require('valid-url');
var utf8 = require('utf8');
var methodOverride = require('method-override');
var Job = require("./public/models/job");

// Connect to local mongodb
mongoose.connect("mongodb://localhost/job-queue");


app.use(bodyParser.urlencoded({extended: true}));
app.use(express.static("public"));
app.use(methodOverride("_method"));


// Time between completion of one job and execution of next job
var TIME_BETWEEN_JOBS = 5000;

// Time to wait until connection timeout
var TIME_UNTIL_TIMEDOUT = 15000;

// Condition variable to notify server that queue is no longer empty
var shouldStart = false;

// Queue (FIFO) of all jobs awaiting to be processed
var jobQueue = [];


// Helper function to clear database
function clearDB() {
    Job.remove({}, function(err) {
        if (err) {
            console.log(err);
        }
        else {
            console.log("Jobs cleared");
        }
    });
}


// Process next job
function processNextJob() {
    // If no jobs in queue, stop processing jobs
    if (jobQueue.length < 1) {                            
        console.log("Waiting for next job...");
    }
    // If there are 1 or more jobs in queue, process the one at beginning of queue
    else {
        // Get job in front of line
        var job = jobQueue[0];
        // Fetch the data from target URL
        request({uri: job.target, timeout: TIME_UNTIL_TIMEDOUT}, function (error, response, body) {
            var newStatus = job;
            // If there is an error, change status to FAILED and update message
            if (error) {
                newStatus.status = "FAILED";
                newStatus.message =  "Error: Could not fetch URL. Connection timed out or URL was invalid. Please try again.";
                newStatus.htmlContent= body;
            }
            // If you get a response, change status to COMPLETED and update message
            else if (response) {
                newStatus.status = "COMPLETED";
                newStatus.message =  "URL was successfully fetched!";
                newStatus.htmlContent= utf8.encode(body);
            }
            // Update status and message in database
            Job.findOneAndUpdate({jobID: job.jobID}, newStatus, {new: true}, function (err, updatedJob) {
                if (err) {
                    // Print out the database error
                    console.log(err);
                }
                else { 
                    // Print updated status
                    console.log("Job " + updatedJob.jobID + " is now: " + updatedJob.status);
                    // Shift queue and process next job if it exists
                    shiftQueue();
                }
            });
        });
    }
}

// Shifts queue and processes next job if it exists
function shiftQueue() {
    // Shift queue
    jobQueue.shift();
    // If there is 1 or more remaining jobs, change status of first in line
    if (jobQueue.length >= 1) {
        // Change first job in line status to IN PROGRESS
        jobQueue[0].status = "IN PROGRESS";
        // Update the status in database
        Job.findOneAndUpdate({jobID: jobQueue[0].jobID}, 
                            jobQueue[0], {new: true}, function (err, updatedJob) {
            if (err) {
                // Print database error
                console.log(err);
            }
            else {
                // Print updated status
                console.log("Job " + updatedJob.jobID + " is now: " + updatedJob.status);
                // Process the first job in line next
                setTimeout(processNextJob, TIME_BETWEEN_JOBS);
            }
        });     
    }
}


// API Endpoint specific job
app.get('/api/jobs/:id', function(req, res) {
    // Check format of requested ID
    if (!/^\d+$/.test(req.params.id)) {
        res.send("<h1>Invalid Link</h1> <a href='/jobs'>Click here</a> to go home");
    }
    else {
        // Find job by jobID
        Job.find({jobID: Number(req.params.id)}, function (err, foundJob) {
            if (err) {
                // Print database error
                console.log(err);
            }
            else if (!foundJob.length){
                // Respond with error message in JSON
                res.json({ERROR: "No such Job with this ID."});
            }
            else {
                // Response with requested job data
                res.json(foundJob);
            }
        });
    }
});

// API Endpoint for all jobs
app.get('/api/jobs', function (req, res){
    // Find all jobs in database
    Job.find({}, null, {sort: {jobID: 'asc'}}, function(err, allJobs) {
        if (err) {
            // Print database error
            console.log(err);
        } 
        else {
            // Respond with all jobs
            res.json(allJobs);
        }
    });
});

//Home route
app.get("/", function(req, res) {
   res.sendFile(__dirname +"/public/views/pages/index.html"); 
});

//Index route
app.get("/jobs", function (req, res) {
   res.sendFile(__dirname +"/public/views/pages/jobs.html"); 
});

//New route
app.get("/jobs/new", function (req, res) {
    res.sendFile(__dirname + "/public/views/pages/new.html");
});

//Show route
app.get("/jobs/:id", function (req, res) {
    // Check if input is all numbers
    
    if (!/^\d+$/.test(req.params.id)) {
        res.send("<h1>Invalid Link</h1> <a href='/jobs'>Click here</a> to go home");
    }
    else {
        // Find job in database and return it
        Job.find({jobID: req.params.id}, function (err, foundJob) {
            if (err) {
                // Print database error
                console.log(err);
            }
            // Check if job doesn't exist
            else if (!foundJob.length){
                res.send("<h1>Job does not exist</h1> <a href='/jobs'>Click here</a> to go home");
            }
            else {
                res.sendFile(__dirname + "/public/views/pages/show.html");
            }
        });
    }
});

//Create new job
app.post("/jobs", function(req, res) {
    var fetchURL = req.body.fetchURL;
    var job = {};
    // Make sure URL input not empty
    if (fetchURL) {
        // If http:// or https:// at beginning of URL, create new job with it
        if (validHttp.isWebUri(fetchURL)){
            job = {
                jobID: new Date().valueOf(),
                target: fetchURL,
                status: "IN QUEUE",
                message: "Refresh the page or check back again later to see the updated status!"
            };
        }
        // If no http:// or https:// at beginning of URL, insert it and create new job with it
        else {
            job = {
                jobID: new Date().valueOf(),
                target: "http://" + fetchURL,
                status: "IN QUEUE",
                message: "Refresh the page or check back again later to see the updated status!"
            };
        }
        // If first job in queue, start working on jobs
        if (jobQueue.length < 1) {
            job.status = "IN PROGRESS";
            // Notify server that queue is no longer empty
            shouldStart = true;
        }
        // Add new job to queue
        jobQueue.push(job);
        // Add the job to database
        Job.create(job, function (err, newJob) {
            if (err) {
                // Print database error
                console.log(err);
            }
            else {
                // Print status of new job
                console.log("Job " + newJob.jobID + " is now: " + newJob.status);
                if (shouldStart) {
                    shouldStart = false;
                    // Process next job
                    setTimeout(processNextJob, TIME_BETWEEN_JOBS);
                }
            }
        });
    }
    res.redirect("/jobs");
});

//Destroy route
app.delete("/jobs/:id", function(req, res){
    // Find the job and delete it from database
    Job.findOneAndRemove({jobID: Number(req.params.id)}, function(err){
        if (err){
            // Print database error and redirect
            console.log(err);
            res.redirect("/jobs");
        }
        else {
            res.redirect("/jobs");   
        }
    });
});

//Page not found
app.get("*", function (req, res) {
   res.send("<h1>Invalid Link</h1> <a href='/jobs'>Click here</a> to go home"); 
});

// Handle error when special characters put into URL
app.use(function(err, req, res, next) {
    if (err instanceof URIError) {
        res.send("<h1>Invalid Link</h1> <a href='/jobs'>Click here</a> to go home");
    }
    else {
        res.redirect("/jobs");
    }
});



app.listen(3000, "127.0.0.1", function(){
    console.log("Server has started!");
    // Clear the DB
    //clearDB();
   
    // Find the jobs that were terminated early on server shutdown
    Job.find({ $or: [{status: "IN QUEUE"}, {status: "IN PROGRESS"}]}, null, {sort: {jobID: 'asc'}}, function (err, pendingJobs) {
        if (err) {
           // Print database error
            console.log(err);
        } 
        else {
            // Put the pending jobs back into the queue and start processing queue again
            jobQueue = pendingJobs;
            processNextJob();

        }
    });
});