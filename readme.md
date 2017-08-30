# Coonti

Coonti is a powerful, flexible and easy to use content management system for [Node.js](https://nodejs.org/en/), written on top of [Koa framework](http://koajs.com/).

**N.B.** Coonti is still in development and it is not recommended for production use.

Coonti has also a Slack team [Coonti.slack.com](https://coonti.slack.com). To join, go to [https://coonti-slack.herokuapp.com](https://coonti-slack.herokuapp.com) to request an invitation by email.

Presentations about Coonti are collected into [https://www.slideshare.net/coonticms](https://www.slideshare.net/coonticms).

## Demo Docker Container

The repository contains a "demo" dockerfile that can be used to build a toy Docker container containing MongoDB and Coonti.

To try out Coonti in the demo container, install Docker and run

```
docker build -t coonti-demo -f demo.dockerfile .
docker run -it -p 8080:8080 coonti-demo
```

Coonti should now be available at http://localhost:8080/ on your host machine.

## Installation

Coonti requires Node.js 7.6 or higher and MongoDB 2.6.5 or higher - actually Coonti might work with earlier versions, but it has not been tested with them. **MongoDB series 3 is currently not working, please use 2 instead.** Install Node and MongoDB first, and then start MongoDB - note down the port that MongoDB listens to. Then follow these instructions:

1. Either clone this repository, or download Coonti as an archive from GitHub (find green "Clone or download" button at the top of the page) and unpack it to the location of your choice.
2. In shell, run `npm install` to install required libraries.
3. Start Coonti in shell with `./coonti.sh`. If you are using systems that does not support shell scripts, check the file contents to start Coonti on command line.
4. Use your browser of choice and go to http://localhost:8080/ to finalise the installation. Follow the instructions provided by Coonti. It is strongly recommended to install the demo content for the first installation, as otherwise Coonti for regular visitors will be empty.

**N.B.** Coonti will wipe the MongoDB database you connect to. Please make backups if needed.

To enable image resizing, install `gm`. If `gm` is not available, all image related functionality will not work and there will be missing images in installation and admin interface.

### Reinstallation

To reinstall Coonti: stop Coonti, remove `config/coontiConfig.json` and then restart Coonti. It will automatically start in installation mode. Remember that all your data will be gone in the installation process.

## Features

Coonti allows you a full control over your content with a blazing fast delivery based on Node.js.

As Coonti is extensible and modular in nature, the exact set of features depends on the modules you install. The following list contains the core features that are available in the default Coonti installation.

### Content Management Features

* **Easy management of content.** Coonti has an intuitive content administration interface with visual editor.
* **Flexible content model.** You can define numerous different content types for different kinds of content.
* **Built-in media management.** Coonti provides media management tools to handle images, videos, and attachments of any kind to be included on your site.
* **Themes.** Coonti supports several themes at once, allowing you to create subsites inside your main site and have a precise control over your site layouts.
* **Menus.** Your site structure is defined with drag-and-drop menus. Of course, you can have several menus to offer different views to your content.
* **Widgets** Widgets are small snippets of content and functionality that can be added to various parts of your site and controlled independently of the content of the pages.
* **Users and access rights.** Coonti has a full-fledged user management with user groups and roles that can be used to allow and restrict access to certain parts of the system.

### Technical Features

* **Based on Koa and Node.js.** Coonti's foundation is the blazing fast Node.js platform.
* **Twig for templating.** Coonti uses Twig.js to render the pages and thus allows versatile and precise control of creating the pages for site visitors.
* **No cruft on templates.** The system does not impose any JavaScript libraries or other boilerplate, but you can write your templates using any front-end tools you like.
* **Easy front-end asset management.** You can drop JS and CSS files into directories and they are automatically included in the templates. Use numbers in front of the filename to control the order.
* **Extensible.** Coonti has a simple yet powerful module interface to expand Coonti's capabilities.
* **Events and hooks.** Coonti provides numerous events and hooks to listen to changes in the system and also to control the execution of requests.
* **Headless by nature.** The system provides - based on configuration - a ready-made headless interface to all content stored in Coonti.
* **Extensible logging.** Coonti's logging system is based on Winston and it allows you to define different logging levels to different parts of the system, down to module level.
* **Redirects.** Coonti supports both internal and external redirects with regular expression matching.

## Architecture

Coonti is based on modular architecture with the following key component categories:

* **Core** - The Coonti core system that loads system components and the configuration, and then starts the subsystems before listening to the HTTP port.
* **Managers** - Coonti managers perform commonly needed tasks, such as managing content, themes, and assets. Managers provide a set of features for the other managers and modules to use.
* **System Modules** - Coonti modules that are distributed inside Coonti core directory.
* **Modules** - Extension modules provided by Coonti Project and third parties to enhance functionality of Coonti.
* **Themes** - A collection of template and asset files that - typically - generate HTML code for the browsers. Both admin and user interfaces are built with themes.

Besides these components, Coonti includes utility libraries. A great number of Coonti features are implemented using readymade Node.js modules. The full list of these libraries can be found in package.json.

### Managers

Coonti ships with the following managers:

* **Config** - handles Coonti and module configuration. Supports several configuration files that typically reside in the database.
* **ContentManager** - manages content from and to storage.
* **DependencyManager** - handles module and theme dependencies, based on both name and version number. Supports also dependencies to certain Coonti core version. Dependencies are defined by the module or theme in question.
* **FormManager** - provides support for HTML form generation, submission, and validation.
* **LanguageManager** - manages language support in Coonti. Currently not finished and not in use.
* **LogManager** - handles Coonti logging using Winston logging library. Supports finegrained logging with different levels, down to a single component.
* **MediaManager** - provides support for asset files, such as images, videos, and attachments.
* **ModuleManager** - controls the Coonti extension modules.
* **Router** - routes incoming requests through Coonti and handles redirects.
* **StorageManager** - manages storages that store content items.
* **TemplateManager** - executes Twig.js templates that transform content typically to HTML pages. Contains extension mechanism to add new Twig.js commands.
* **UserManager** - handles user accounts, roles and groups, and provides access control features for the rest of the system.

Modules can add and remove their own manager classes using methods provided by the core. This allows modules to expose system level functionality. For practical example, see `coonti/modules/admin.js`.

### Events

Coonti core provides a simple event propagation mechanism. One can add and remove event listeners using `addEventListener()` and `removeEventListener()` methods.

Coonti events use the following notation `System-Subsystem-Event`, in other words the event has hierarchical system, names have first letters capitalised and they are separated by dashes. There is no limit in the number of words. Do not start event names with `Coonti-` outside of Coonti core code.

To fire an event, call `fireEvent()` or `fireEventCallback()` methods. You can provide parameters to the event, if so required. The format of parameters is event specific.

Event propagation cannot be stopped and no information can be provided back from the event handlers.

### Start-up Procedure

When Coonti is started, it reads in the configuration file `config/coontiConfig.json`. If this file does not exist, Coonti uses default configuration and sets itself into installation mode, see below.

The configuration file defines a MongoDB database. Coonti connects to the database and reads the rest of the configuration from the database, from collection `config`.

The system starts the managers. They typically set an event listener for configuration changes, as the rest of the configuration is not read in during their start. After configuration is done, the managers initialise rest of themselves based on the configuration.

Finally, Coonti opens sockets defined in the configuration and waits for incoming connections.

### Installation Procedure

If Coonti does not find configuration file, it assumes that it has not been installed properly. The default configuration, defined by the configuration manager, is used. It initialises and starts installation module and uses specific installation theme.

The installation has a few steps. Coonti asks for the MongoDB connection and **wipes** the database. It also asks for admin user credentials and then checks whether demo content and an example set of users, groups, and roles should be installed. The last part of the installation writes all the information to the database and a new configuration to `config/coontiConfig.js`. Then Coonti restarts itself by rereading the configuration file. This causes, for example, installation module and theme to deactivate and other modules and themes to activate.

## Configuration

After installation, Coonti has a minimal configuration in file `config/coontiConfig.json` and the rest of the configuration is stored into MongoDB collection `config`.

The configuration file is written by the installer and it should not be modified unless you know what you are doing. The file typically contains the following lines:

```javascript
{
  "coontiMode": "development",
  "databases": [
    {
      "name": "mongo",
      "type": "mongodb",
      "url": "mongodb://localhost:27017/coonti"
    }
  ]
}
```

The configuration in database is more complex and it contains at least the following directives:

* *coontiMode* - The Coonti mode, either `development` or `production`.
* *httpPort* - The HTTP port to listen to.
* *httpsPort* - The HTTPS port to listen to. Note that HTTPS is not yet tested and there might be issues using it.
* *pathPrefix* - The prefix to add for each path Coonti serves.
* *cookieKey* - The key that is used to sign Coonti's cookies with [KeyGrip](https://github.com/crypto-utils/keygrip), as part of normal Koa configuration.
* *databases* - List of databases available together with their parameters.
* *session* - Directives for Coonti session.
* *media* - Directives for asset file management. There can be several media directories under this directive.
* *forms* - Directives for forms, currently has two directives to set virtual paths to access forms.
* *modules* - Directives for Coonti extension modules. Each module has its own block that controls its start-up procedure during Coonti starting and contains module specific configurations.
* *themes* - Directives for the templating system. Each theme has its own set of parameters under `themes` directive for static files, JavaScript and CSS assets, etc.
* *executionPaths* - Defines the main routes for Coonti. Router uses these paths to pump the user requests through Coonti core.
* *userManager* - Directives for Coonti's user management, currently user database and collection.

The configuration database collection contains also a configuration object for thumbnails for asset files. The collection can be used to add new objects. All configuration objects should have a top level key `config` that defines the name of the object. Please do not use *coonti* as a prefix outside of Coonti core related configuration files.

## Handling of Requests

Coonti listens to the configured port, default 8080, and parses all incoming requests. The internal routing is done in `CoontiRouter` singleton that uses [`koa-router`](https://github.com/alexmingoia/koa-router) library version 7 for the actual routing.

Coonti modules and internal subsystems may add their own routes through `CoontiRouter` object methods. These routes are typically technical in nature, such as providing media assets, JavaScript files, etc.

The routing for content items and user interfaces in based on execution paths concept. Each execution path is a pipeline of state handlers that manage certain parts, for example, user authentication, of the request-response part. Each state handler is a function with the following interface:
```
handleCookies = function*(csm, config, next) {
```
* csm - The `CoontiStateMachine` instance that owns the state handler.
* config - The configuration of the state machine.
* next - The next Koa handler.

The actual request is provided in Koa fashion using `this` that contains `coonti` object (an instance of class `CoontiContext`) that is a request specific storage of Coonti specific items, such as session variables and forms.

The pipelines are defined in the Coonti configuration:
```
  "executionPaths": {
    "json": [
      {
        "name": "cookies",
        "priority": 800
      },
      {
        "name": "session",
        "priority": 700
      },
```

When the configuration is read in, the `CoontiRouter` forms the pipelines by fetching all state handler functions based on the `name` and they are executed in the order defined in priority - highest number first. It is not advisable to use a same number to two or more states inside a pipeline. If a state is not found, the pipeline is discarded.

To add new states, use `addStateHandler` method in your modules. To see practical examples, look at the admin module that defines new states and also a new pipeline for Coonti administration interface.

Typically, the pipelines end with `template` and `end` states that output the content using templates - see below - and clean up the request. It is also possible to produce other kind of output, and Coonti includes JSON version for outputing the content. See below about headless usage.

Some available state handlers, such as `route` and `access`, can be configured further by adding `config` object to the state handler definition object, as follows:

```
  { name: 'route',
    priority: 600,
    config: {
      inhibitRedirects: true
    }
  }
```

The snippet above instructs `route` handler not to use redirects. As redirects are shared with all pipelines, it might be wise to protect certain pipelines, such as administrative ones, from accidental bad redirect definitions. The following table defines the available configuration options for built-in handlers.

| Handler | Config | Type | Description
| --- | --- | --- | --- |
| Access | loginRoute | String | The path to the login page. |
| Access | logoutRoute | String | The path to the logout page. This URL is used to destroy session of the user. |
| Access | requireAccess | String | Contains the access right that needs to be set by the current user in order to continue with the pipeline. |
| Access | requireLogin | Boolean | If set, the pipeline can be accessed only by logged in users. |
| Route | inhibitRedirects | Boolean | If set, the routing does not use redirects at all. |

There is a specific error handler that is currently shared between all pipelines. Coonti calls this handler when it cannot fulfil the request with normal pipeline process, and the execution of the request stops there.

## Content

Coonti is able to store and read content from various locations. The default configuration uses exclusively MongoDB, while the installation configuration uses files.

`ContentManager` object handles functionality related to fetching and storing content. Actual content fetching and storing is done through `ContentHandler` objects that do the storage backend related operations through `StorageManager` object and `Connect` classes.

Coonti ships with handlers and connectors for content in MongoDB and files. These files are system modules and they can be found under `coonti/modules` directory.

Coonti reads the content in `content` state handler based on the route of the request.

Each content object has a content type that defines the available fields for the content. A content type ties the content also to a `ContentHandler` object, in other words different kinds of content types can be served from different storages.

Content types are stored in MongoDB in `contentType` collection. They can be managed using Coonti admin user interface.

The content type defines the user interface for the content editing. Currently the following fields are supported:

* text - one line input field.
* password - password field.
* integer - input field for an integer value.
* email - input field for an email address.
* textarea - Multiline text area.
* wysiwyg - Wysiwyg editor.
* image - Selection of an image.
* checkbox - Simple checkbox.

The available fields and their validators are defined in `FormManager`. They are referenced in the content type as follows:
```
  "fields": [
    {
      "id": "title",
      "name": "Title",
      "type": "text",
      "description": "The title of the site",
      "required": true,
      "json": true
    },
```

This creates a field with identified 'id' and name 'Title' - shown to the admin user - as a required text field. The content is available also through JSON - see headless below.

When adding new content, the Coonti administration interface asks first to select the content type and then creates an edit page with fields based on the selected type. Before saving the content, potential validators are executed with error messages shown to the user. If everything is fine, the content is saved to the database. Editing existing content is based on the same functionality, except that the content type is read from the content before showing the edit page.

## Templating

Coonti provides a versatile templating subsystem to create user interfaces from the Coonti content. The templating system is agnostic to the output, but has several features designed to help outputing HTML for browsers.

The templates are collected into a theme that can be installed and taken into use as a single entity. No templates can exist outside themes.

### Theme Structure

Each theme is stored inside a directory residing in `themes/` directory. Each theme contains `package.json` file that defines the theme configuration.

After basic installation, Coonti provides three themes:

* leaf - The example end-user facing theme.
* seed - Installation theme. This theme is deactivated after the installation procedure is over.
* stem - Coonti administration theme.

Themes can be tied to certain routes, so that the various parts of the site use different themes. This is done in Coonti configuration in MongoDB using the following JSON:
```
  "themes": [
    {
      "name": "Stem",
      "active": true,
      "routes": [
        "/admin"
      ],
```

The `routes` directive contains the routes in an array.

### Theme Configuration

The theme is configured in `package.json` file in the theme directory. The file defines the name, author, and version information of theme - used to separate themes from each others, and also to help Coonti to install new versions of the theme. Each theme has a URL that defines the theme homepage to give more information to the site administrator.

The themes have also icon and screen shot files that are currently not yet used by the Coonti admin, but in the future they will be used to distinguish themes visually from each other.

As Twig.js can be used in both server and browser, the raw template files may be set accessible from the browser with `clientAccess` directive. If certain files should not be allowed to be downloaded, they can be excluded using `clientDenyList` directive that takes an array of file names as a parameter. The names can be also regexps.

A theme can also depend on other modules or themes, this is indicated using `dependencies` directive, for example, as follows:

```
        "dependencies": [
                {
                        "collection": "module",
                        "name": "MenuManager",
                        "states": "started"
                }
        ]
```

The example states that a module `MenuManager` needs to be started before the theme can be taken into use. Coonti automatically starts modules and themes in the order dictated by the dependencies. Note that circular dependencies cause Coonti not to start any of the modules and themes inside the dependency.

### Template Files

Template files are written in [Twig.js](https://github.com/twigjs/twig.js) with number of Coonti specific tags, see below. Twig.js is a JavaScript port of [Twig template engine](http://twig.sensiolabs.org) developed by [SensioLabs](https://sensiolabs.com) for Symfony PHP application framework project.

### Coonti Data Objects

All data read from databases, user sessions, etc. are provided to templates in template variables.

* http - Contains the following request parameters: `host`, `method`, `query`, `querystring`, `protocol`, `secure`, and `ip`.
* routing - Coonti routing variables: `coontiPath` - Coonti's global prefix for paths, defined in the configuration; `prefix` - the path of the state machine, `route` - the route inside the state machine, and `fullRoute` - the full route.
* coonti - Coonti metadata, including Coonti version number, release information, and other relevant data about the Coonti system. Seldom needed in templates.
* content - Content items read from the database.
* forms - Contains the forms available for the given location. The forms are added in the code, typically by Coonti modules. For more information about forms, see below.
* theme - Information about theme: theme - the name of the theme, template - the name of the high-level template, themeSettings - any settings defined in theme `package.json`.

### JS and CSS Assets

Coonti automatically includes defined JS, CSS and other assets to generated HTML pages. Typically, theme directory contains `js` and `css` directories whose contents are included into templates using `js`and `css` Twig tags, respectively - see below for more information.

The automatic asset directories are configured in `package.json` file in the theme directory. The following snippet defines a JavaScript asset directory:

```
	"staticCollections": {
		"js": {
			"path": "js",
			"contentType": "text/javascript",
			"load": ["^js/.+.js$"],
			"directories": ["coonti/assets/js", "coonti/assets/admin_js"]
		}
	}	
```

The `path` directive defines a virtual directory available for HTTP clients, in other words, the browser finds these files under `/js/` path. The `directories` directive defines the directories to be included in the virtual directory. All files in these directories are made available through the virtual directory.

The `load` directive defines a set of regexps that are used as filters to load the matched files. The value of the directive is always an array.

As the asset files order might be important, the files in the asset directories can be named with syntax `NN_file.js`, where NN is a number between 00 and 99. The files are loaded in alphabetical order, in other words, the files with smaller numbers are loaded first. Coonti drops the numbers and the underscore in virtual directory. If a file should not be automatically loaded by the page, prefix it by `XX_`. Again, Coonti drops the prefix while serving the file.

### Images

Each theme may contain images and other files that needs to be directly accessible by the browser. The directory is defined using `imageDir` directive and the images are served using *`mediadir`* /_/ *`themename`* / *`directoryname`* / *`filename`*. The 'mediadir' refers to the media path defined in the Coonti configuration.

### Twig Extensions by Coonti

Coonti provides the following Twig commands to sweeten template development.

#### ContentType

Defines the content type the template is serving. Syntax `{{ contentType contentTypeName }}` defines this template as the template that renders content type `contentTypeName`.

#### Css

Prints out links to CSS files defined in a static collection. Syntax `{{ css }}` or `{{ css collectionName }}`, prints out either the static collection `css` or the named static collection `collectionName` as links for HTML head.

#### Debug

Prints out the Coonti data object. Syntax `{{ debug }}`

#### Form

Prints out a form. Syntax `{{ form formName }}` to print out form named `formName`.

#### FormElement

Prints out a form element. Syntax `{{ formElement formElementName }}` to print out a form element named `formElementName`.

#### GetContent

Fetches new content from database to a variable. Syntax `{{ getContent variableName from db:route }}` fetches content available using route `route` from database `db` - databases are defined in Coonti configuration file. If database is not defined, the default database is used. The content is stored into `variableName` variable. This tag does not output anything.

#### JS

Prints out links to JavaScript files defined in a static collection. Syntax `{{ js }}` or `{{ js collectionName }}`, prints out either the static collection `js` or the named static collection `collectionName` as script tags for HTML head.

#### Media

Creates an URL to an image or media file. Syntax `{{ media file }}` or `{{ media file resize WWxHH crop|pad top|middle|bottom left|center|right }}` prints out a media file path that can be used, for example, in <img> tag.

The tag supports also image resizing for gif, jpeg, and png files. Define the new size by defining width (WW), height (HH) or both. If only one is needed, replace the other one with a single dash, for example, `-x100` creates an image which height is 100 pixels and the width is dependant on the resize method.

Resizing can be done using cropping, content of the media file might be removed, or padding, content of media file is padded with extra pixels. The origo can be set using top, middle, and bottom, and left, center, and right.

#### Ng

Prints out Angular directive. Syntax `{{ ng string }}`, prints out `{{ string }}`.

#### StartNg & EndNg

Prints out Angular starting and ending tags. Syntax `{{ startng }} Angular content {{ endng }}`, prints out `{{ Angular content }}`.

#### Static

Fetches list of files in a static collection. Syntax `{{ static variableName = staticCollection }}`, reads in file list from static collection `staticCollection` and places it into variable `variableName`.

#### TemplateName

Prints out the current name of the template. Syntax `{{ templateName }}`, prints out the name of the current template.

#### WidgetArea

Adds the given widget area to the template. When the template is rendered, the widgets on the area are rendered with their content. Syntax `{{ widgetArea name }}`, where `name` is the widget area name, as defined in the admin area.

### Forms

Coonti contains a built-in form manager that generates and processes forms and user inputs. Forms are stored in form collections that create a simple hierarchy and help to avoid name collisions. Forms functionality is contained in FormManager.

To create a new form, you need first to create a collection using `formManager.addCollection`. A new form can then be created using `formManager.addForm`. The new form object is created empty, and you need to add input elements to the form by calling `form.addField`. The FormManager contains a number of basic form elements and your modules can add new elements using `formManager.addFormElement` method.

Each form element contains information about the actual element, such as element type, default value, and so forth, and also list of validators and sanitisers that are used to validate and sanitise the user input for the given element. Validators are based on [`validator NPM package`](https://github.com/chriso/validator.js) and are methods that get the user input as a parameter and return true or false, depending on the result of validation. Sanitisers work in similar fashion, but they return a sanitised version of the user input. FormManager provides again a basic set of validators and sanitisers, and you are free to add new ones with `formManager.addValidator` and `formManager.addSanitiser` methods.

Upon form submission, Coonti automatically creates a CoontiFormSubmission object that refers to the form and copies user input from HTTP request on router's `handleForm` phase. The submission is validated and sanitised and the results of this process can be queried using `formSubmission.isValidated` and `formSubmission.isOk` methods. If the submission is faulty, there are error messages on the specific form elements, added there by the validator functions. If you do additional checks by yourself, you can use `formSubmission.addError` to add errors or `formSubmission.addMessage` to add more information to the user. The form template tags discussed earlier show these messages automatically.

## Headless Usage

Coonti supports headless use out of the box. If configured so, Coonti can provide the content of each URL also in the internal JSON format. The default configuration defines a JSON pipeline that produces the content as a JSON object.

The content type of the content defines which fields are added in the JSON object. This allows hiding certain parts of the content that should not be distributed outside of the system:
```
  "fields": [
    {
      "id": "title",
      "name": "Title",
      "type": "text",
      "description": "The title of the site",
      "required": true,
      "json": true
    },
```

Set directive `json` to `true` to allow the content to be added to the JSON object.

The current implementation does not provide support for API keys and other ways to authenticate the current user without an account and password.

## Media Support

Coonti has a simple media management subsystem, implemented in `MediaManager` object. Besides storing and fetching images, documents, and other files, it also supports scaling of images, simple caching, and several locations for the files.

The system implementation is based on files and no database is needed for accessing the media.

### Image Resizing

If the system Coonti is running in has [GraphicsMagick](http://www.graphicsmagick.org) installed, Coonti can use it to 
resize images for both thumbnails in administration site and image scaling in templates. The image scaling information is provided as an extension of the image file name with the following pattern: `filename_` *w* `x` *h* *c* | *s* | *p* `.ext` - for example, `testimage_100x60s.png`, would create a new image from `testimage.png` with maximum dimensions of 100px width and 60px height, using scaling. Other options would be use `c` for cropping or `p` for padding (latter is not yet implemented), and then the resulting image would be exactly of the given size. If one of the width or height is replaced with `-`, only the axis with value is taken into account in resizing calculation.

## Modules

Coonti supports modular extension of the core system. There are two kinds of modules - system modules that are distributed with the system and user modules that are site specific. The default installation has several modules of both types to help understanding how modules should be written.

Modules are handled by `ModuleManager` object that configures, initialises, starts, stops, and removes modules. The module system writes the current state of modules into Coonti configuration, so modules initialised and started when Coonti is shutdown are initialised and started automatically when Coonti is restarted.

### Module Lifecycle

Module has three states: installed, initialised and started. A module needs to be first initialised before it can be started, and conversely it must be stopped - thus becoming only initialised - before it can be removed. Initialisation phase is intended to configure the module and set it into startable state. In started state, the module needs to be fully functional.

Modules can be initialised and started using the administration interface.

### Module Configuration

Module has `package.json` file that defines the basic configuration of the module. It defines the name, description, author, version, and the home page of the module. It also has a `config` directive for module specific configuration. The contents of the directive are provided to the module when it is initialised.

### Dependencies

Coonti has a simple dependency system that can be used to control the order of initialising and starting of modules and themes. In module's `package.json`, dependencies are marked as follows:
```
		"dependencies": [
			{
				"collection": "module",
				"name": "MongoConnect",
				"states": "started"
			},
```
This specific directive states that the module cannot be taken into use - initialised or started - without module MongoConnect being already started.

Coonti tries to satisfy the dependencies by initialising and starting the modules in a suitable order. If this fails, certain modules are left in installed or initialised state, and error is logged.

### Module to Module Communication

Modules can expose part of their functionality to other modules by registering new managers to the Coonti core. The manager can be the whole module itself, but it is advisable to create a subclass inside the module that is then exported as a manager using `coonti.addManager` method.

This new manager can be requested by its name with `coonti.getManager` method. It should be noted that the registered manager object may be in use by other modules even if the providing module has been stopped or removed. In such cases, the manager should provide either documented return values for these cases or errors to the callers.

### Example Modules

Coonti provides a simple example module in `modules/examplemodule`. It shows how to read and write module configuration, extend Twig with new directives, read and write to the database, add and remove new administration user interface functionality with menu items, routes, JavaScript code, and static asset files, add and remove REST interface to communicate between the module and the administration interface.

Also `modules/menumanager` is worth looking at, as an example of more complex module with deeper interaction between Coonti core, system modules, and themes.

## Users, Rights, Groups, and Roles

Coonti supports a versatile set of user and access management through concepts of users, rights, groups, and roles. The rights are managed by `UserManager` singleton object.

* User - An authenticable user. If the user does not have a password set, it cannot log in.
* Right - A right to perform a certain task. A right can be bound to a user, group, or role, and it can be either allowed or denied.
* Group - A group of users.
* Role - A role for a set of users.

When a user wants to perform a restricted task - typically in the administration user interface - Coonti checks the user's set of rights, then roles, and finally groups. The right can be either allowing or denying, and there are specific methods to check both of these scenarios in `UserManager`.

The right need to be predefined for being accessible in the administration user interface. The system creates a set of rights in the start and modules requiring rights should do the same in the initialisation phase. Go to *Rights* page in the administration user interface to see the currently available rights with their explanations. There is also specific right `*` that allows access to all functionality. This right should be restricted to only administrator users.

Users, roles, and groups are stored in the MongoDB database. `UserManager` caches the hundred most recent users, roles, and groups into memory for faster access.

## Administration User Interface

The Coonti administration user interface is produced by `CoontiAdmin` module. It defines its own administrative execution paths and uses a specific theme `stem` to produce the administration user interfaces using Angular version 1.

This document does not go through the functionality of the administration user interface, as it should be quite straightforward to use, as the concepts are very similar to other content management systems' administration tools.

The module exposes a set of REST endpoints that are used to request and modify items inside Coonti. Each REST endpoint has its own route that channels the request from the user interface code running in the browser. These endpoints need to check the validity of the request and the rights of the requestee before committing any actions. For example, study `CoontiAdmin` code.

### Extending Administration

Your own modules can add new functionality to the administration user interface by adding REST endpoints and corresponding JavaScript functionality on the client-side with needed Angular templates to show the results to the users. Your module can also add new menu items to the administration user interface. To add these, you need to use the API exposed by `CoontiAdmin` module. For examples, take a look at provided user modules.

There is a helper library `RestApiHelper` found in `coonti/libraries` that can be used to construct REST endpoints. The helper object is submitted with a function for each REST verb along with required right to use that function. If there is one or more rights specified, Coonti first checks that the caller has a valid session and then the user in the session has the required right.
```
			var rah = new RestApiHelper(coonti,
										{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.getMenu },
										{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.updateMenu },
										{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.addMenu },
										{ allow: 'admin.manageContent',
										  handler: menuManagerAdmin.removeMenu });
			admin.addAdminRoute('MenuManager', 'menu', 'menu(?:\/(.+))?', rah.serve);
```
This example creates a new helper with four methods for GET, POST, PUT, and DELETE requests, defined in `handler` attributes; all requiring `admin.manageContent` right. The `allow` parameter accepts also an array of rights, and in such case any of the rights is enough to allow using the function.

The helper provides a single method `serve` that can be then added as an admin route handler. `addAdminRoute` accepts also normal generator functions in which you can check the rights and also select which request types should be served.

In all these functions, set the return values using `this.coonti.setItem('response',` *`responseObject`* `)`. Coonti will convert that `responseObject` into JSON and deliver to the requester.

## Logging

Coonti has a logging subsystem based on [Winston logging library](https://github.com/winstonjs/winston). It supports different severities and also hierarchical logging

Coonti supports two transports: `console` for logging to the terminal and `file` for logging into a file.

To use logging in your own modules, fetch a `logger` instance using `LogManager.getLogger` and use its interface to write your log messages. Coonti configuration handles the severity levels for each logger. If no logging configuration is present, Coonti logs using the following configuration:
```
  logging: {
    coonti: {
        transports: {
          console: {
            level: "error",
            timestamp: true,
            colorize: true
          },
          file: {
            name: "coonti.log",
            level: "debug",
            filename: "logs/coonti.log"
          }
        }
      },
      "coonti-core-welcome": {
        transports: {
          console: {
            level: "info"
          }
        }
      }
    }
```
This defines the default logger - `coonti` to log everything on severity level `error` or higher to console and `debug`and higher to `logs/coonti.log`, and a specific logger for the Coonti core to show a welcome message on the console.

## Events

Coonti has an internal event system that can be used to facilitate communication between different subsystems without having direct access between the subsystems. The event support is implemented in `CoontiCore`.

To listen to events, use function `addEventListener` method that takes the name of the event and the function to be called as parameters. The function that is added needs to be a generator function. When the events are no longer followed, use `removeEventListener` method with the same parameters.

To fire an event, call `fireEvent` method supplied with the name of the event and an optional Object that contains the parameters to be provided to all listening functions.

The event names should be constructed in a hierarchical manner to reduce possibilities of naming conflicts. For example:
```
	Coonti-Logging-Logger-Added
	Coonti-Dependency-Component-Removed
```
Only Coonti core functionality can use `Coonti-` at the beginning of the event name. Modules should use `Module-` followed by the name of the module.

Coonti also may fire two events for the same situation, for example `Coonti-Module-Init` and `Coonti-Module-Init-` *`ModuleName`*. The first version has the name as a parameter for the functions. This approach allows listeners to bind themselves into very specific events - for example, to check whether a certain module has been started or not - instead of using the more generic version and then always comparing parameters to decide whether the event needs to be reacted or not.

## Redirects

Coonti supports both internal and external redirects that can contain regular expressions. A redirect consists of the path matching regular expression (old path), the new path with replacement markers $1-$n (new path), and weight of the redirect. The redirects are matched in order of weights, from highest to lowest, and only the first redirect is executed.

If the redirect is internal, Coonti does not change the user visible URL, but internally changes the path from old to new. External redirects cause HTTP redirect to be sent to the client.

Redirects are stored into a single MongoDB document in the `config` collection.

## Coonti API

Coonti code has been documented using JSDoc syntax and the documentation can be generated with `jsdoc-conf.json` configuration file in the root of the Coonti directory. To generate, issue the following command:
```
jsdoc -c jsdoc-conf.json
```

The documentation will be generated into `jsdoc` directory located in the root of the Coonti directory.

## Participate

Coonti Project is actively looking for developers, testers, document writers, and many other roles to make Coonti a great content management platform.

The system is currently missing tests, the documentation could be improved, numerous modules are waiting to be implemented, and the user interfaces would also need improvements. Get in touch through GitHub, either asking any and all questions you might have or submit pull requests.

## License

Coonti is licensed under [Apache 2.0 license](http://www.apache.org/licenses/LICENSE-2.0).

Coonti is a trademark of Janne Kalliola.

## Releases

* 0.1.0 Pine - The initial release.
* 0.1.1 Pine - Support for widgets.
* 0.1.2 Pine - Support for redirects and a redirect management UI in core.
