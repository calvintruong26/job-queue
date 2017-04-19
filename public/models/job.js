var mongoose = require("mongoose");

//Create new Job schema
var jobSchema = new mongoose.Schema({
    jobID: Number,
    target: String,
    status: String,
    message: String,
    htmlContent: String
});

var Job = mongoose.model("Job", jobSchema);

module.exports = Job;