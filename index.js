const canvas = require('canvas-api-wrapper');
const fs = require('fs');
const d3 = require('d3-dsv');
const queue = require('promise-limit')(5);
const got = require('got');

async function exportCourse(courseId) {
    try {
        // start the course export in a ".imscc" format
        let contentExport = await canvas.post(`/api/v1/courses/${courseId}/content_exports`, {
            export_type: 'common_cartridge',
            skip_notifications: true
        });

        let progress = {};
        // check the progress of the export every half-second until it is complete
        do {
            await new Promise(res => setTimeout(res, 500));
            progress = await canvas(contentExport.progress_url);
        } while (progress.workflow_state !== 'completed');

        // download the exported course with the content export
        let downloadedCourse = await canvas(`/api/v1/courses/${courseId}/content_exports/${contentExport.id}`);
        let url = downloadedCourse.attachment.url;
        
        // now that you have the url, pipe the contents of the url to a file
        await new Promise((res,rej) => {
            got.stream(url).pipe(fs.createWriteStream(courseId + '.imscc'))
            .on('finish',res)
            .on('error',rej)
        });

        // log when it completes a course
        console.log('Course has been backed up successfully\n', downloadedCourse.attachment.url);
    } catch (err) {
        console.error(err);
    }
}

function getCourses(userInput) {
    // Pathway might not be a subdomain
    canvas.subdomain = userInput.domain;
    // read the file into a string to be parsed
    let file = fs.readFileSync(userInput.path, 'utf8');
    // format the csv into an array of the course id's
    let courses = d3.csvParse(file, row => row.id);
    // remove the column headings from the array
    delete courses.columns;
    return courses;
}

async function main(userInput) {
    try {
        // get an array of course id's that need to be backed-up
        let courses = getCourses(userInput);
        let promises = courses.map(courseId => queue(() => exportCourse(courseId)));
        let downloadedUrls = await Promise.all(promises);

        console.log('All courses have been backed up successfully\n', downloadedUrls);
    } catch (err) {
        console.error(err);
    }
}

module.exports = {
    main
}