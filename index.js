const canvas = require('canvas-api-wrapper');
const fs = require('fs');
const d3 = require('d3-dsv');
const del = require('del');
var moment = require("moment")
const queue = require('promise-limit')(5);
const got = require('got');
const timer = require('repeat-timer');
const ProgressBar = require('progress');

// The user input from the cli
let input;

function getCourses(userInput) {
    // Pathway might not be a subdomain
    canvas.subdomain = userInput.domain;
    // read the file into a string to be parsed
    let file = fs.readFileSync(userInput['Course List Path'], 'utf8');
    // format the csv into an array of the course id's
    let courses = d3.csvParse(file, row => {
        return {
            courseId: row.id,
            courseName: row.course_name
        }
    });
    // remove the column headings from the array
    delete courses.columns;
    return courses;
}

async function exportCourse(course, bar, folderDate) {
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

        // make a 'courseBackups' directory if it doesn't already exist
        if (!fs.existsSync('courseBackups')) {
            fs.mkdirSync('courseBackups');
        }    

        // make a 'current date' directory if it doesn't already exist for this set of backup courses
        if (!fs.existsSync(`courseBackups/${folderDate}`)) {
            fs.mkdirSync(`courseBackups/${folderDate}`);
        }    

        // now that you have the url, pipe the contents of the url to a file
        await new Promise((res, rej) => {
            got.stream(url).pipe(fs.createWriteStream(`courseBackups/${folderDate}/${course.courseName}-ID${course.courseId}-${folderDate}.imscc`))
                .on('finish', res)
                .on('error', rej)
        });        

        // increment the progress bar
        bar.tick(1);
    } catch (err) {
        console.error(err);
    }    
}    

async function checkVersions() {
    let fileNames = fs.readdirSync('courseBackups');
    // check if any existing versions need to be deleted
    if (fileNames.length > input['Number of Versions to Keep']) {
        let versions = fileNames.map(file => {
            let stats = fs.statSync(`courseBackups/${file}`);
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
        let deletedVersion = del.sync([`courseBackups/${versions[0].name}`]);
        console.log(`Deleted version directory ${deletedVersion[0]}`);

        // run the function recursively as long as there are more version directories than the user specified amount
        checkVersions();
    }
    return;
}

async function main() {
    try {
        // get an array of courses that need to be backed-up
        let courses = getCourses(input);
        let bar = new ProgressBar(' Backing up courses [:bar] :percent', {
            total: courses.length,
            complete: '=',
            incomplete: ' ',
            width: 20
        });
        
        // format the current date
        let folderDate = moment().format("YYYY[Y]-MM[M]-DD[D] kk[h]mm[m]");
        console.log(`Starting course backups on ${folderDate}`);

        // setup the queue to run exportCourse in parallel (i.e. run it for a specified number of courses at a time)
        let promises = courses.map(course => queue(() => exportCourse(course, bar, folderDate)));
        await Promise.all(promises);

        // delete the oldest versions if there are more than the specified number of versions to be kept
        await checkVersions();
        console.log('All courses have been backed up successfully', '\n');
    } catch (err) {
        console.error(err);
    }
}

function runTimer(userInput) {
    input = userInput;
    timer(main);
}

module.exports = {
    runTimer,
    input
}