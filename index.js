const canvas = require('canvas-api-wrapper'); // CRUD operations for Canvas
const fs = require('fs'); // file manipulation
const path = require('path'); // file path handling
const d3 = require('d3-dsv'); // csv manipulation
const moment = require("moment") // helps format the dates and times
const del = require('del'); // deletes an entire directory
const queue = require('promise-limit')(5); // runs 5 course exports at a time
const got = require('got'); // helps with file streaming
const timer = require('repeat-timer'); // cli that repeats the function on a timely basis
const ProgressBar = require('progress'); // the progress bar in the console
const filenamify = require('filenamify'); // removes special characters from course names for file naming
const unusedFilename = require('unused-filename'); // adds (1), (2), etc for duplicate filenames

/**
 * Get the courses from the CSV file found with 
 * the path the user specified in the cli
 * @param {Object} userInput 
 */
async function getCourses(userInput) {
    // Pathway is not a subdomain
    canvas.subdomain = userInput.domain;

    // get all courses from the Master Courses subaccount (i.e. 42)
    let returnedCourses = await canvas.get(`/api/v1/accounts/42/courses`, {
        sort: 'course_name',
        'include[]': 'subaccount',
    });

    // although we got everything under account 42, not
    // everything belongs to it since there are subaccounts
    returnedCourses = returnedCourses.filter(course => course.account_id === 42);
    
    // create a csv of what we're running it all on
    let d3Courses = d3.csvFormat(returnedCourses,["id",'name','subaccount_name']);

    fs.writeFileSync('master_courses.csv', d3Courses);

    // read the file into a string to be parsed
    // let file = fs.readFileSync(userInput.courseListPath, 'utf8');
    let file = fs.readFileSync('master_courses.csv', 'utf8');
    // format the csv into an array of the course id's
    let courses = d3.csvParse(file, row => {
        return {
            courseId: row.id,
            courseName: row.name
        }
    });
    // remove the column headings from the array
    delete courses.columns;
    return courses;
}

/**
 * Export the course, update the progress bar when the course is updated,
 * and download the exported course into a time-stamped folder
 * @param {Object} course The course's name and id
 * @param {Object} bar The progress bar that is updated once the course is exported and downloaded
 * @param {String} folderDate The date string used to name the version folder and each course backup file
 * @param {String} newDirectoryPath The path to the directory where things will be saved to 
 */
async function exportCourse(course, bar, folderDate, newDirectoryPath) {
    try {
        // start the course export in a ".imscc" format
        let contentExport = await canvas.post(`/api/v1/courses/${course.courseId}/content_exports`, {
            export_type: 'common_cartridge',
            skip_notifications: true
        });

        // log when it starts a course
        bar.interrupt(`Downloading ${course.courseName}`);

        let progress = {};
        // check the progress of the export every half-second until it is complete
        do {
            await new Promise(res => setTimeout(res, 500));
            progress = await canvas(contentExport.progress_url);
        } while (progress.workflow_state !== 'completed' && progress.completion !== 100);

        // download the exported course with the content export
        let downloadedCourse = await canvas(`/api/v1/courses/${course.courseId}/content_exports/${contentExport.id}`);
        let url = downloadedCourse.attachment.url;

        // make a new directory to put the version directories in if one doesn't already exist with the given name
        if (!fs.existsSync(newDirectoryPath)) {
            fs.mkdirSync(newDirectoryPath);
        }

        // make a 'current date' directory if it doesn't already exist for this set of backup courses
        if (!fs.existsSync(path.join(newDirectoryPath, folderDate))) {
            fs.mkdirSync(path.join(newDirectoryPath, folderDate));
        }

        // now that you have the url, pipe the contents of the url to a file
        await new Promise((res, rej) => {
            let filename = `${course.courseName}_ID${course.courseId}_${folderDate}.imscc`;

            // if the filename is over 100 characters, then remove characters from the course name
            let charsToRemove = filename.length - 100;
            filename = filename.length <= 100 ? filename : `${course.courseName.slice(0, course.courseName.length - charsToRemove)}_ID${course.courseId}_${folderDate}.imscc`;
            
            // replace all special characters, check to make sure the filename isn't already used, then create the path to write the file to
            let writePath = unusedFilename.sync(path.join(newDirectoryPath, folderDate, filenamify(filename, {replacement: ' '})));
            
            // write the file
            got.stream(url).pipe(fs.createWriteStream(writePath))
                .on('finish', res)
                .on('error', rej)
        });

        // increment the progress bar
        bar.tick(1);
    } catch (err) {
        console.error(err);
    }
}

/**
 * After backing up all the courses, check if there are too many versions saved,
 * based on the input from the user, and delete all of the older versions
 * @param {Object} userInput The user's input from the cli
 * @param {String} newDirectoryPath The path to the directory where things will be saved to
 */
async function checkVersions(userInput, newDirectoryPath) {
    // fs.readdirSync returns a list of all files and directories in a directory,
    // but there should only be directories inside of this new directory
    let folderNames = fs.readdirSync(newDirectoryPath);
    // check if any existing versions need to be deleted
    if (folderNames.length > userInput.versions) {
        let versions = folderNames.map(file => {
            let stats = fs.statSync(path.join(newDirectoryPath, file));
            return {
                birthtime: stats.birthtime,
                name: file
            }
        });

        // sort the versions from oldest to newest
        versions.sort((a, b) => {
            if (a.birthtime > b.birthtime) return 1;
            else if (a.birthtime === b.birthtime) return 0;
            else return -1;
        });

        // delete the oldest version
        let deletedVersion = del.sync([path.join(newDirectoryPath, versions[0].name)]);
        console.log(`Deleted version directory ${deletedVersion[0]}`);

        // run the function recursively as long as there are more version directories than the user specified amount
        checkVersions(userInput, newDirectoryPath);
    }
    return;
}

/**
 * The function that runs most of the code on a consistent time basis
 * @param {Object} userInput The user's input from the cli
 */
async function main(userInput) {
    try {
        // the path to the new directory
        let newDirectoryPath = path.resolve(path.join(userInput.saveDirectoryPath, userInput.saveDirectory));

        // get an array of courses that need to be backed-up
        let courses = await getCourses(userInput);
        let bar = new ProgressBar(' Backing up courses [:bar] :percent', {
            total: courses.length,
            complete: '=',
            incomplete: ' ',
            width: 20
        });

        // format the current date
        let folderDate = moment().format("YYYY[Y]-MM[M]-DD[D]_kk[h]mm[m]");
        console.log(`Starting course backups on ${folderDate}`);

        // setup the queue to run exportCourse in parallel (i.e. run it for a specified number of courses at a time)
        let promises = courses.map(course => queue(() => exportCourse(course, bar, folderDate, newDirectoryPath)));
        await Promise.all(promises);

        // delete the oldest versions if there are more than the specified number of versions to be kept
        await checkVersions(userInput, newDirectoryPath);
        console.log('All courses have been backed up successfully', '\n');
    } catch (err) {
        console.error(err);
    }
}

/**
 * The function that runs the timer. It will run main 
 * consistently according to the time input from the user 
 * @param {Object} userInput The user's input from the cli
 */
function runTimer(userInput) {
    // start the timer to run main in a timed interval defined by the user in the cli
    timer(async () => {
        await main(userInput);
    });
}

module.exports = {
    runTimer,
}
