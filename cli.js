var prompt = require('prompt');
var courseBackup = require('./index.js');

/**
 * The function with all the prompt inputs and validation
 */
function getInput() {
    return new Promise((resolve, reject) => {
        // prompt to receive the filepath to the list of courses to run the backup on
        var schema = {
            properties: {
                domain: {
                    type: 'string',
                    description: 'Canvas Domain',
                    pattern: /byui|byui\.test/,
                    message: `<byui|byui.test>`,
                    required: true,
                    default: 'byui'
                },
                courseListPath: {
                    type: 'string',
                    description: 'Course List Path',
                    required: true,
                    default: './sandbox.csv' // REMOVE
                },
                saveDirectory: {
                    type: 'string',
                    description: `New Directory Name`,
                    required: true, 
                    default: 'courseBackups'
                },
                saveDirectoryPath: {
                    type: 'string',
                    description: `New Directory Path`,
                    required: true,
                    default: '.'
                },
                versions: {
                    type: 'string',
                    description: 'Number of Versions to Keep',
                    require: true,
                    default: 5
                }
            }
        };

        prompt.message = '';

        prompt.start();

        prompt.get(schema, (err, userInput) => {
            if (err) {
                console.error(err);
                return reject(err);
            }
            resolve(userInput);
        });
    });
}

async function run() {
    var userInput = await getInput()
    courseBackup.runTimer(userInput);
}

run();