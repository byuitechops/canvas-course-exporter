var prompt = require('prompt');
var courseBackup = require('./index.js');

function getInput() {
    return new Promise((resolve, reject) => {
        // prompt to receive the filepath to the list of courses to run the backup on
        var schema = {
            properties: {
                domain: {
                    type: 'string',
                    pattern: /pathway|byui|byui\.test/,
                    message: `<pathway/byui/byui.test>`,
                    required: true,
                    default: 'byui'
                },
                path: {
                    type: 'string',
                    message: `(i.e. './myfile.csv')`,
                    required: true,
                    default: './sandbox.csv'
                }
            }
        };

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
    courseBackup.main(userInput);
}

run();