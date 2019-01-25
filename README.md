# Canvas Course Exporter
### *Package Name*: canvas-course-exporter

This module is built to be used by Brigham Young University - Idaho and utilizes the standard `module.exports => (course, stepCallback)` signature.

## Purpose

Ofttimes major work is done to courses, only to have the need to revert back to older versions of the course before changes were made. Courses often have unfortunate problems that are introduced over time, and older versions of the course are needed.

This tool aims to fix that by downloading all courses in the Master Courses Canvas Account each week (or whatever time period is specified in the prompt), keeping however many versions of the Account the user specifies.

## How to Install

```
npm install git+https://github.com/byuitechops/canvas-course-exporter.git
```

## Options
Options included in cli.js:
```bash
Domain: <byui|byui.test>
saveDirectory: <new directory name>
saveDirectoryPath: <filepath for new directory>
versions: <number of versions to keep>
```

Extended prompt included in the [repeat-timer](https://github.com/byuitechops/repeat-timer) package used:
```
What time of day would you like the program to run? (ex: hh:mm AM/PM) How frequently you like the program to run?
prompt: time:  (Now)
prompt: days:  (0)
prompt: hours:  (0)
prompt: minutes:  (0)
prompt: seconds:  (0)
First run will occur in 0 milliseconds
Repeat set to 0 milliseconds
```

## Outputs

For each course in the Master Courses Account, it will download an `.imscc` file (a .zip file with a different extension) that contains all of the course information. This file can then be uploaded to Canvas in their course upload page as a `Canvas Course Export Package`.

## Process

The tool will get a list of courses to run on using the Canvas API to get all courses in the Master Course Account in the BYUI Canvas instance. It will then run the course export API for each of those courses and log the overall status of the downloads as a whole to the console.
