This is the contribute.md of Coonti project. Contributions of all types and sizes are appreciated by the project. This file shows how to make the project better!

# Team members

Currently Coonti is developed further by:

* Janne Kalliola, the project owner and main developer - https://github.com/jannekalliola

# Learn & listen

To get started, join the discussion in Slack at https://coonti.slack.com/, join at https://coonti-slack.herokuapp.com/

Discussion about bugs and features happens in GitHub issue tracker https://github.com/Coonti/Coonti/issues

# Contribute

The project needs contributions of all sorts. Here are a few ways to make Coonti better.

## Bug triage

Software has bugs and Coonti is no exception. If you encounter a bug or want to help the project by doing systematic testing or bug hunting, these instructions help you along the way.

* Report all bugs to GitHub issue tracker https://github.com/Coonti/Coonti/issues, so we get a unique number to reference it later. Use label *bug* to distinguish bugs for from features, ideas, and so forth.
* Write a report that helps other people to reproduce a bug. Describe your environment, the actions you took, the outcome of the actions, and what you think should have been the right outcome.
* If you are able to try to reproduce the bug in other environments, please do so.
* If you have any ideas why this is happening, please write that, too.
* If there is an error or the log files - they can be found in `logs/` directory - contains something related, please add that to report. If you are unsure, add them just in case.
* Indicate whether the bug caused Coonti to halt or stop, mangle data, or became inconsistent.

After reporting the bug, you can join our Slack - see above - to discuss about the issue. Kindly remember that all project members are doing this on voluntarily basis. Please do not harass them about your bug.

## Adding new features

To improve the Coonti platform, you are encouraged to add new features. To make life easier for everyone involved, kindly follow these steps:

* Open an issue at https://github.com/Coonti/Coonti/issues and tag it with label *feature*. Describe the reasoning behind the new feature and state any questions you might have. Consider adding most of features as modules. If the feature is intended for a limited audience only, consider creating an own repository for it. You may ask adding new repositories under Coonti project or you can add it under your account.
* Create a new branch for your feature and keep all changes in that branch. Use `feature#` as the branch name, in which # denotes the issue number.
* Commit regularly, so other people can test your new feature and give feedback. Do not commit code that has syntax errors or other issues that cause Coonti to stop. If this happens, no worries as long as you fix it quickly.
* Remember that all functions need to be documented using JSDoc.
* Run `npm run lint` to check that your code does not add linting issues.
* If there is discussion in your issue, please participate in it and include the good ideas to your work.

Don’t get discouraged! We estimate that the response time from the
maintainers is around several days.

## Documentation

Coonti documentation is held in `readme.md` and `contribute.md` files for the time being. We will most probably expand to GitHub wiki for a bigger set of documentation.

If you are passionate about documentation, please join the project.

## Translations

Coonti has not yet translation support. It has a stub for it, so if you are interested in multilingual matters, open an issue and start working on it.

# Community

The project is as strong as its community, and we want to have a diverse community with number of different skills. Besides coding, the project appreciates:

* Documentation
* People helping others in the issue tracker and in Slack.
* Guiding new people to participate in the project.
* Spreading the word.

If you have further questions, meet us in Slack https://coonti.slack.com/, join at https://coonti-slack.herokuapp.com/

This `contribute.md` file is based on [https://github.com/contribute-md/contribute-md-template](https://github.com/contribute-md/contribute-md-template) project.
