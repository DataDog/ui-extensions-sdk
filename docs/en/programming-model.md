UI Extension Programming Model

![diagram](https://p-qkfgo2.t2.n0.cdn.getcloudapp.com/items/E0u4vmOj/f4dbe333-9203-4628-b3d0-0092af5f357e.png)
[Link to image](https://p-qkfgo2.t2.n0.cdn.getcloudapp.com/items/E0u4vmOj/f4dbe333-9203-4628-b3d0-0092af5f357e.png)

A Developer Platform App is defined by an **App Manifest** created and maintained on the Developer Platform. The App Manifest defines top-level metadata about an app like its name and logo. If the developer , the app manifest must define additional metadata such as the url of the **Main IFrame** controller and the set of enabled **UI Extensions**.

Each type of UI Extension requires a different set of metadata. In some cases this metadata may be sufficient for Datadog to implement the customization on behalf of the app: for example, we can add a cog menu item based on a list of items provided in the **App Manifest**. In other cases the extension may require additional implementation by the developer in an **IFrame**. For example: custom widgets are rendered by an IFrame implemented and hosted by the developer. Only some light top-level metadata such as the url of the custom widget IFrame are configured in the App Manifest.

Most nontrivial UI Extension usecases will involve at least one **IFrame** implementing custom logic and UI elements. Each Iframe must include a copy of the Official [JavaScript SDK](https://www.npmjs.com/package/@datadog/ui-extensions-sdk). The **SDK** is responsible for all communication with the Datadog UI, including retrieving context data, listening for and dispatching events, and accessing the Datadog public API within the app’s granted **Scopes**.

Many Apps will involve multiple **IFrames** mounted within the UI in different places. For example: Consider an app that implements a custom widget, with a custom context menu item that triggers a modal to open with arbitrary custom content. This app would involve three IFrames: A single Frame would render the custom widget content based on dashboard context provided through the **SDK**. A **Main IFrame** would be required to listen in the background for user events from the **Custom Context Menu** (for example, a click event with information about the clicked item). A third frame would render whatever content the developer chooses in the modal. The three iframes function together as a unified `app` mounted during the runtime of a user-session.

This unusual programming model requires inter-iframe communication as a first-class feature. This is handled entirely with through the **SDK**.

## App Manifest

The App Manifest is the JSON configuration of an app, created and edited in the [Developer Platform](https://app.datadoghq.com/apps).

- `tile`: Object containing app information displayed on its visual tile

  - `name` : The app’s display name
  - `description` : A description of what the app does
  - `logoMedia.light` : An icon to display in the app's tile, specified as a URL.

- `assets`: Object containing an app's UI extension, as well as other supported Datadog assets

  - `uiExtensions`: Object containing UI extension definitions
    - `main_url` : The URL of the extension’s Main Iframe. This Iframe will be mounted on init of the UI, and will persist for the lifetime of the app.
    - `debug_mode_url`: The URL of the app’s Main Iframe used when [debug mode](https://a.cl.ly/NQuJdXep) is enabled, defaults to localhost. Useful to quickly switch between development and production versions of the app.
    - `features` : A list of the app’s enabled features along with config. The config schema will be different for each feature. See below.

## Main Controller IFrame

All apps with UI Extensions must include a **Main Controller IFrame** that successfully interfaces with Datadog through the SDK. The Main Controller IFrame is mounted in the background on every page and is responsible for various administrative actions executed on behalf of the entire application, including storing secrets and managing Datadog authentication credentials. **If the main controller IFrame does not successfully handshake with Datadog, your app may not function properly**.

A minimal controller only need initialize the SDK as follows:

```javascript
// from npm
import { init } from '@datadog/ui-extensions-sdk';
// or from injected script:
const { init } = DD_SDK;

init();
```

Although there are no architectural requirements for how to structure your app, you may also wish to use the main controller IFrame to register global event handlers or otherwise coordinate activity amongst the various active features.

## Context Data

**Context** data provides information about the global and specific setting in which features mount in the Datadog UI. For example, in a custom widget the configured widget options will be present at `context.widget.options`, and on a dashboard (both for custom widgets and dashboard menu item features), the current template variables will be provided at `context.dashboard.templateVars`. 

### Getting initial context data

When an App IFrame mounts and successfully handshakes with the Datadog UI, it will receive the initial **context**. This data can be accessed with client.getContext() on the SDK client:

```js
client.getContext().then((context) => {
  console.log(context.dashboard.templateVars)
})
```

### Responding to changing context

In most cases apps will also need to listen for changing context. For example, the current dashboard timeframe may change as the user edits. Whenever any subset of an iFrame's context changes, the Frame will receive a `context_change` event containing updated information. This can be used to update local state, respond to changes in specific fields, and more. 

```
client.events.on('context_change', (newContext) => {
 setTemplateVars(newContext.dashboard.templateVars);

 if (!deepEquals(newContext.widget.options !== oldContext.widget.options)) {
   // handle options change
 }
});
```

As a convenience for React developers, we provide a lightweight [useContext](https://datadoghq.dev/apps/modules/_datadog_ui_extensions_react.html#useContext) hook which automatically provides live-updated context data for use in a React component. 

If there is interest in similar framework-specific wrappers please let us know. 

**Context structure attributes**

- `app`: Global data about the app and user context
    - `currentUser`
      - `timeZone`: The current user's time zone. The time zone can differ from the browser's time zone if the user has changed it in the settings.
      - `colorTheme`: The current user's color theme. It can be either `dark` or `light`.
    - `features`: A list of the installed app's enabled features.
- `dashboard`: Optional additional data returned when an IFrame or other feature occurs on a dashboard
  - `id`: The ID of the current dashboard
  - `shareURL`: Public dashboard URL, if any
  - `timeframe`:
    - `start`: Start time in seconds since unix epoch
    - `end`: End time in seconds since unix epoch
    - `isLive`: Whether the dashboard is ‘live’, specifying that widgets should auto-update
  - `templateVars`: Array of dashboard template variables. Items:
    - `name`: Variable name
    - `value`: Variable value
    - `prefix`: Variable prefix
    - `default`: Variable default value
- `widget`: Optional additional data when an IFrame or other feature occurs in a dashboard widget
  - `id`: Widget ID, if any
  - `definition`: Full widget definition. This includes many fields not fully documented here.
  - `options`: Key-value index of widget options, if any
  - `layout`: Widget layout information
- `menuItem`: Optional information about a menu item when relevant:
  - `key`: The user-provided key of the menu item

**Events**

Events allow the Datadog UI to communicate with App IFrames, and for App IFrames to communicate with each-other.

**Standard Events:**

Datadog will send App IFrames events at relevant times in the lifecycle of the application. For example, custom widget iframes will receive a `dashboard_cursor_change` event as the user moves the cursor on a dashboard. Other IFrames will receive events relevant to their use cases, in addition to any global events that may be relevant. These events can be subscribed to with `client.events.on()`:

```js
const unsubscribe = client.events.on(
  'dashboard_cursor_change',
  (newlocation) => {}
);
```

**Custom Events:**

Apps can listen for and broadcast custom events to each other. An event can be sent to all active app frames with `client.events.broadcast()`:

```js
client.events.broadcast('my_event', myData);
```

All other frames will receive this event and data and can subscribe with client.events.onCustom():

```js
const unsubscribe = client.events.onCustom('my_event', (myData) => {});
```

## OAuth API Access

Apps may request access to user data from the [Datadog public API](https://docs.datadoghq.com/api/) with OAuth2. To enable, go to the 'OAuth and Permissions' tab on the app edit page, then create an OAuth client and select the necessary scopes.

Upon first use users will be prompted to authorize your app with access to the requested set of scopes. **Please request access only to the scopes that your app absolutely needs to function**. If you change the configuration of your App's OAuth client, or if the user's requires refreshing for another reason such as consent expiration, they will be asked to re-consent.

When changing scopes, we recommend that you also revoke all active access tokens associated with your app. This will ensure that all active users of your app are forced to re-authorize under the revised scopes. 

### Accessing the API through the SDK

Once your app has been configured with appropriate oauth access, you may access any public API endpoint for which your app has been granted access with the handlers at `client.api`. For example, here's a sample `GET` call to the metrics query endpoint:


```js
client.api.get('/api/v1/query', {
  params: {
    from: ...,
    to: ...,
    query: '...'
  }
})
  .then(data => {})
  .catch(e => {})
```

### Links & Navigation

Standard anchor links rendered in IFrames will navigate only the iframe window itself, not the entire Datadog app. This may be desirable as a way to switch IFrame content (for example, to change the content of a frame from a list of items to an item detail, and back). However, we expect apps to also want to navigate the main browser window. This can be achieved with `client.location.goTo()`:

```js
client.location.goTo('/infrastructure/map');
```

In addition, apps may open new tabs with `target=”\_\_blank”` links.

### Notifications

The SDK provides a hook for sending user notifications. This is useful for general communication outside of specific UI Extension features. The notifications are transient and are not shared between user sessions:

```js
// Standard format:
client.notification.send({
  label: 'Please read this thing!'
})
```

Notifications may optionally include a 'level' indicating notification severity. Available levels are `success`, `warning`, and `danger`. This is particularly useful for reporting success and failure of asynchronous actions:

```js
try {
  await submitReport(report);

  client.notification.send({
    label: 'Report submitted',
    level: 'success'
  })
} catch (e) {
  client.notification.send({
    label: 'Failed to submit, please try again.',
    level: 'danger'
  })
}
```



## Org Configuration

If app behavior must be further tailored for specific orgs, custom org configurations can be enabled via the [Developer Platform][1]. To begin, navigate to the "Org Configuration" tab of your app:

<img style="max-width:80%" alt="App Edit Org Configuration" src="https://user-images.githubusercontent.com/17037651/163402644-8666caff-a987-4731-a2b2-d9b123baae39.png">

On this page, you can define up to **20** settings that orgs can configure to customize your app's behavior; these configuration values can ultimately be retrieved within your app by using the `client.config.getOrgConfig()` method in the SDK to implement the desired customization. Upon clicking the "Add New" drop-down button, you will be able to select from three options:

  1. Boolean: a `boolean` field that will be rendered as a toggle switch to users; useful for turning on/off specific behavior within your app
  2. Input Field: a free-form `string` field rendered as an input field; can be used, for example, to define a custom on-premises URL that your app will fetch org data from — see the note below on credentials / secrets for caveats
  3. Select Field: a `string` field, rendered as a drop down, that only accepts an option defined in the associated `enum` key; useful if orgs can only select a configuration from a number of pre-defined options

**Important**: Configuration values should **never contain sensitive information**. This feature is **only for configuration** and as such, does not provide sufficient security to support storage of secrets and other sensitive information.

All three options share the following keys:
  * `key`: the **unique** key your app will use to refer to a particular configuration value
  * `label`: the label text that users will see when configuring a particular setting
  * `description`: text describing the behavior that a specific setting will modify; displayed to users when configuring your app
  * `default`: the default configuration value for a setting if the user has **not** already input one
    * In the case of a select field, the `default` **must** be one of the options associated with the `enum` key
  * `required`: whether the field is required for the app to function; if set to `true`, orgs will **not** be able to use your app until they've configured the required setting
    * While a setting with both a non-empty `default` value and `required: true` is valid, requiring the setting is unnecessary since the `default` value satisfies the `required: true` constraint even when the org has never configured the setting

For a more concrete illustration, assuming that your app's org configuration is defined as follows:

```JSON
[
    {
        "key": "boolean_field",
        "label": "A Boolean Field",
        "description": "A boolean field that controls app behavior",
        "required": false,
        "type": "boolean"
    },
    {
        "key": "input_field",
        "label": "An Input Field",
        "description": "An input field that controls app behavior",
        "required": false,
        "type": "string"
    },
    {
        "key": "select_field",
        "label": "A Select Field",
        "description": "A select field that controls app behavior",
        "enum": [
            "choice_a",
            "choice_b"
        ],
        "required": false,
        "type": "string"
    }
]
```

An org using your app would see the following page to configure the settings you defined:

<img style="max-width:80%" alt="App Configure Org Settings" src="https://user-images.githubusercontent.com/17037651/163403066-531c1225-5310-438d-b75a-40682c4ee61b.png">

Back in your app, you could access configured values with the following:

```js
const customOrgConfig = await client.config.getOrgConfig()
/* customOrgConfig = {
  boolean_field: <boolean>,
  input_field: <string>,
  select_field: <string>
} */

switch (customOrgConfig.select_field) {
  case 'choice_a':
    // do something
    break;

  case 'choice_b':
    // do something else
    break;

  default:
    throw new Error(`Unrecognized value of 'select_field': ${customOrgConfig.select_field}`)
}
```

**Note**: In this particular example, each of these fields can be `undefined` since none of them have `required: true` nor a `default` value.

# UI Extensions

## Dashboard Custom Widget

![custom_widget](https://app.datadoghq.com/static/images/help/app_widgets.gif)

Allows applications to extend the dashboard UI with custom widget items.

#### Configuration:

Custom widgets can be specified as widgets in the feature options as shown in the examples below.

```js
features: [
    ...,
    {
        "name":"dashboard_custom_widget",
        "options":{
        "widgets":[
            {
                // the name of the widget, as it will appear on the tray
                "name":"Your first widget",

                // the key, used to tell apart 2 widgets from the same app
                // don't change this after you created the widget
                "custom_widget_key":"your_first_widget",

                // the code your widget will execute
                "source":"http://localhost:3000",>

                // the icon that will appear in the widget tray
                "icon":"<https://static.datadoghq.com/static/favicon.ico",>

                // configuration options that autogenerate editors
                "options":[
                    {
                        // "string" renders a text input. "boolean" renders a checkbox
                        "type":"string",
                        "name":"metric",
                        "label":"Your favorite metric",
                       // renders a dropdown list of options
                        "enum":[
                            "system.cpu.idle",
                            "system.load.1",
                            "system.load.5",
                            "system.load.15"
                        ],
                        "required": true
                    }
                ],

                // (optional) the initial size of the widget
                // valid options:
                // - "sm" (2 rows x 2 columns)
                // - "md" (2 rows x 4 columns) (default)
                // - "lg" (4 rows x 4 columns)
                "default_size": "md",

                // (optional) the smallest the widget can be resized to
                // valid options:
                // - "sm" (2 rows x 2 columns) (default)
                // - "md" (2 rows x 4 columns)
                // - "lg" (4 rows x 4 columns)
                "minimum_size": "md",

                // (optional) A list of settings menu items
                "settings_menu_items": [
                  {
                    "action_type": "link",
                    "href": "/logs",
                    "key": "internal-link",
                    "label": "Internal link item"
                  },
                  {
                    "action_type": "event",
                    "key": "link-item",
                    "label": "Broadcast an event"
                  }
                ]
            }
        ]
        }
    }
]
```

### Widget Settings Menu

A custom widget can be configured to have settings menu using the `settings_menu_items` configuration as shown in the manifest example above.


![image](https://user-images.githubusercontent.com/1262407/135469392-4ffd8a5b-89a1-4988-b1ae-eb44d15bb2ca.png)

### Updating Widget Options Dynamically:

Widget options can be updated at runtime. This is useful if you need to fill the option dropdown content dynamically based on an API call.

![options](https://user-images.githubusercontent.com/1262407/116876143-f91ba400-abe9-11eb-83d2-c804c3f9f218.gif)

Important: This code needs to run in the widget code and not in the main controller.

```js
client.dashboard.customWidget.updateOptions([
  {
    type: WidgetOptionItemType.STRING,
    name: 'favorite-cheese',
    label: 'Your favorite cheese',
    enum: ['Chevre', 'Gruyere', 'Mozzarella', 'default'],
    // enforce a specific order to display the field in the widget editor
    order: 1,
  },
]);
```


**User-friendly Dropdown List Labels:**
You can provider a user-friendly labels for the dropdown list of options using the following syntax:

```js
enum: [{ label: 'Fancy Cheese Label', value: 'just-plain-cheese' }];
```

**Display order:**

Since widget options can be defined statically in the manifest or dynamically in code, you can enforce a specific display order for your options on the widget editor by providing an optional `order` field with a numerical value.

**Events:**

All IFrames implementing the Custom widgets feature will receive a set of context data relating to the current dashboard and widget, see above for more information.

```js
const { app, dashboard, widget } = await client.getContext();
```

Additionally, Custom widget iframes can subscribe to the following events:

- `dashboard_custom_widget_options_change`: triggered when the widget is edited. Event handlers will receive an object with the updated configuration options of this widget.
- `dashboard_cursor_change`: triggered when users mouse over charts on the dashboard. Can be used to track active timestamp across charts.

```js
const unsubscribe = client.events.on(
  'dashboard_custom_widget_options_change',
  callback
);
```

## Side Panels

![sidepanel](https://app.datadoghq.com/static/images/help/app_sidepanels.gif)

Allows applications to open side panels with arbitrary content:

**Configuration:**

Side Panels are defined by a **Side Panel Definition** with the following properties:

- `key` (required) a unique identifier for this side panel
- `source` (required) The relative path to an IFrame to render as the primary side panel content.
- `title` (optional): The title of the side panel. Defaults to the app name.

Panels can be opened from any IFrame with `client.sidePanel.open()` . This method can be called either with a full definition, or with a string **key** referencing a side panel pre-defined in the app manifest

```js
client.sidePanel.open(
  {
    key: 'my-panel',
    source: 'panel.html',
  },
  {
    // optional arguments
    flavor: 'cherry',
    drink: 'coke',
  }
);
```

**Programmatically closing side panels:**

Side panels may be closed from the sdk with `client.sidePanel.close()`. If called with no argument, any currently active side panel associated with this app will close. If a key is provided as an argument, then only the side panel with the specified key will be closed.

**Events:**

- `side_panel_close`: Broadcasted to all active IFrames when a side panel is closed. Event handlers will receive the full side panel definition of the recently closed side panel.

## Modals

Allows applications to open modal dialogs with arbitrary content:

![modal](https://app.datadoghq.com/static/images/help/app_modals.gif)

**Configuration:**

Modals are defined by a **Modal Definition** with the following properties:

- `key` (required) a unique identifier for this modal
- `title` (optional) A title to render above modal content. Defaults to the app name.
- `message` (optional) A string message to render as main modal content. This is particularly useful for rendering quick confirmation or alert modals not needing custom content.
- `source` (optional) The relative path to an IFrame to render as the primary modal content.
- `size` (optional, `lg`, `md`, or `sm`): The width of the modal. The initial height of the modal is automatically adjusted to fit the content. The height will be a minimum of 500px and a maximum of 80% of the viewport height.
- `action_label` (optional) If provided, a main action button (e.g. “confirm” or “cancel”) will render under the main modal content.
- `action_level` (optional, `primary`, `success`, `danger`, or `warning`): The type of action button to render
- `cancel_label`: (optional) If provided, a cancel button will render below main modal content.

Modals can be opened from any IFrame with `client.modal.open()`.

```js
client.modal.open({
  action_label: 'Yes',
  cancel_label: 'Nevermind',
  title: 'Please Confirm!',
  key: 'confirmation-modal',
  action_level: 'danger',
  message:
    'This modal involves no iframe. It was defined in the manifest and referenced by key.',
  size: 'md',
}, { 
  // optional arguments
  flavor: "cherry",
  drink: "coke"
});
```

**Resizing modals:**

Modals can be resized from the sdk with `client.resize()`.
This can be useful if the content of the modal changes dynamically.

It is important to note that only the height can be changed with `client.resize()`.
If the height is explicitly set, the minimum height is 500px and the maximum height is 80% of the viewport height.
The width can be set with the `size` option in the **Modal Definition**.

See [Resizing IFrames](#resizing-iframes) for more information.

**Programmatically closing modals:**
Modals may be closed from the sdk with `client.modal.close()`. If called with no argument, any currently active modal associated with this app will close. If an argument is provided, it will close only a modal with the matching key:

```
client.modal.close('my-modal');
```

**Events:**

- `modal_close`: Broadcasted to all active IFrames when a modal is closed without executing the cancel or main action (e.g. if the user clicks outside or the modal is closed programmatically). Event handlers will receive the full modal definition of the recently closed modal.
- `modal_cancel`: Broadcasted to all active IFrames when the user clicks the **cancel** button. Event handlers will receive the full modal definition of the recently closed modal.
- `modal_action`: Broadcasted to all active IFrames when the user clicks the main action button (e.g. “confirm” or “cancel”). Event handlers will receive the full modal definition of the recently closed modal.

## Dashboard Cog Menu

![dash_ctx_menu](https://app.datadoghq.com/static/images/help/app_cog_menus.png)

Allows applications to extend the dashboard UI with custom cog menu items.

**Configuration:**

Cog menu items can be defined statically in the app manifest, or dynamically through the SDK at runtime.

**Static Items**

Cog menu items can be defined statically in the app manifest. Items defined here will appear in all dashboard cog menus, regardless of context:

```json
features: [
    ...,
    {
        "options": {
            "items": [
                {
                    "action_type": "link",
                    "key": "internal-link",
                    "title": "Internal link item",
                    "href": "/logs"
                },
                {
                    "action_type": "event",
                    "key": "link-item",
                    "title": "Broadcast an event"
                }
            ]
        }
    }
]
```

**Dynamic Items**

Cog menu items can also be provided dynamically at runtime by the Main Controller Iframe. When a cog menu renders on a dashboard, it will send a request to the main controller iframe asking for a set of menu items. Items can be provided by registering a handler with `client.dashboard.cogMenu.onRequest()`. The handler will be provided with a set of context data about the dashboard, so that items may be rendered (or excluded) based on that data:

```javascript

client.dashboard.cogMenu.onRequest(({ dashboard )) => {
  if (dashboard.shareURL) {
  	return {
      items: [{
        actionType: 'event',
        label: 'Share public dashboard',
        key: 'link-item',
        order: 1,

      }]
    }
  }

  return {
    items: []
  }
});
```

When a user clicks the item, an event of type `dashboard_cog_menu_context` will be broadcast to all active IFrames.

#### Display order:

Since items can be defined statically in the manifest or dynamically in code, you can enforce a specific display order for your items by providing an optional `order` field with a numerical value.

#### Events:

When cog menu items are clicked, a `dashboard_cog_menu_click` event is broadcast to all active Iframes:

```js
const unsubscribe = client.events.on('dashboard_cog_menu_click', handler);
```

Event handlers will receive a **context** object with information about the active dashboard, and the menu item that was just clicked.

## Widget Context Menu

![context-menu](https://user-images.githubusercontent.com/1262407/133463979-bbd2e3f4-8beb-4808-820f-e3f474c9aac2.png)


Allows applications to extend widget visualizations with custom context menu items. At present, custom context menu items are only supported on dashboards.

**Configuration:**

Context menu items should be provided dynamically by the main controller IFrame. When a context menu renders, it will send a request to the main controller iframe asking for a set of menu items. Items can be provided by registering a handler with `client.widgetContextMenu.onRequest()`. The handler will be provided with a set of context data about the widget, so that items may be rendered (or excluded) based on that data:

```javascript

client. widgetContextMenu.onRequest(({ widget )) => {
  if (widget.definition.type === 'timeseries') {
  	return {
      items: [{
        actionType: 'event',
        label: "My custom item",
        key: 'do-my-thing',
      }]
    }
  }

  return {
    items: []
  }
});
```

**PLEASE NOTE**: As a best practice, please be sparing in providing context menu items to reduce bloat across the app. Ideally, only provide them when needed

#### Display order:

Since items can be defined statically in the manifest or dynamically in code, you can enforce a specific display order for your items by providing an optional `order` field with a numerical value.

#### Events:

When cog menu items are clicked, a `widget_context_menu_click` event is broadcast to all active IFrames:

```js
const unsubscribe = client.events.on('widget_context_menu_click', handler);
```

Event handlers will receive a **context** object with information about the widget, and the menu item that was just clicked.

## Authentication

When this feature is enabled, users need be authenticated before using the app. This feature allows you to integrate your existing authentication mechanism like cookie based username/password login with the Developer Platform.

![auth](https://app.datadoghq.com/static/images/help/app-auth.gif)

#### How does it work?

[![auth-diagram](https://app.datadoghq.com/static/images/help/app-auth-diagram.jpg)](https://app.datadoghq.com/static/images/help/app-auth-diagram.jpg)

When this feature is enabled, developers need to provide an `authProvider` object programmatically when initializing the SDK client in the main controller. Example:

Example:

```js
import { init } from '@datadog/ui-extensions-sdk';

const client = init({
  authProvider: {
    url: 'https://domain.com/login',
    authStateCallback: async () => {
      try {
        const { username } = await api.getCurrentUser();
        return {
          isAuthenticated: true,
          args: { username },
        };
      } catch (e) {
        return {
          isAuthenticated: false,
        };
      }
    },
  },
});
```

On app load, the Developer Platform will detect the user's auth status based on the logic you define in `authStateCallback` and only render your app if users are authenticated. When users are not authenticated, they will be able to login by clicking the `Connect` button. Under the hood, the SDK will open a modal at the provided url.

By default, we will poll your `authStateCallback` until it either returns `true` or the process times out. This requires no additional effort on your part as a developer if you have an existing authentication flow, however it may result in a short delay between the time the user successfully logs in and when the tab closes.

If you wish to improve this process, you can manually resolve the authorization flow in one of two ways. In `close` resolution, you can resolve the authorization flow by manually closing the new tab window:

```js
// in your main controller frame
import { init } from '@datadog/ui-extensions-sdk';

const client = init({
  authProvider: {
    resolution: 'close',
    ...otherOptions,
  },
});
```

```js
// in your login logic, close the window
loginUser().then(() => {
  window.close();
});
```

Alternately, you can let us know the new authentication state with a helper method distributed in the SDK:

```js
// in your main controller frame
import { init } from '@datadog/ui-extensions-sdk';

const client = init({
  authProvider: {
    resolution: 'message',
    ...otherOptions,
  },
});
```

```js
import { resolveAuthFlow } from "@datadog/ui-extensions-sdk";

// in your login logic, call the resolve hook:
loginUser().then(() => {
  resolveAuthFlow({
    isAuthenticated: true,
  })'
});
```

Your auth state is now available globally available in your app frames. You can query the current auth state anytime from any frame using `client.auth.getAuthState()` which will return an object with the following format:

```
{
    isAuthenticated: true, // or false,
    args: { username: "matt" } // custom auth related args you want to add to the state. Important: don't store sensitive data here
}

```

**Configuration:**

The Auth Provider is defined with the following properties:

- `url`: (required) The url of your existing login page. This can be an absolute url like `https://domain.com/login` or a relative path to your app like `login`.
- `authStateCallback`: (required) a callback function indicating whether or not the user is authenticated. It can be synchronous (i.e. reading data from a cookie) or asynchronous (i.e. making API calls). For convenience, the return value can also be a simple boolean.
- `totalTimeout`: the total period in milliseconds to initiate authentication while the popup is open before it times out. Default is `120000` (2 minutes).
- `requestTimeout `: the time interval in milliseconds before the `authStateCallback()` times out. Default is `20000` (20 seconds).
- `retryInterval`: the time interval in milliseconds to retry initiating authentication while the popup is open. Default is `5000` (5 seconds).

# Shared Formats

## Menu Items

Custom menu items may be provided as part of the `dashboard_cog_menu` and `widget_context_menu` features. In both cases, menu items may be provided in two formats:

**Link items:**

Items of type link can be used to navigate the user within the Datadog UI, or to an external page. They must conform to the following format:

- `key`: A string unique to the item
- `label`: Visible item text
- `type`: "link"
- `href`: Link path. Can be relative to route within Datadog (e.g. /logs), or absolute to link externally (e.g. https://google.com)

**Event items:**

Event items can be used to perform arbitrary actions. When clicked an event will be broadcast to all active IFrames containing context data about the menu item and its environment:

```
client.events.on('<click event>', (context) => {
   ...do stuff
});
```

The exact event name will depend on the feature, please refer to individual documentation. Event items must conform to the following format:

- `key`: A string unique to the item
- `label`: Visible item text
- `type`: "event"

# Resizing IFrames

If your IFrame shows content dynamically, you can resize it with `client.resize()`.
This will cause the IFrame to attempt to resize to fit the content.
This is a suggestion, and may not be honored for all IFrames or sizes of content.
For example, if a modal has 1000px of content and the viewport is only 600px, the IFrame will be resized to dimensions within the viewport.

If you know the dimensions you'd like to resize to, they can be passed explicitly:

```
client.resize({
  // optional height in pixels
  height: 400,
  // optional width in pixels
  width: 600,
});
```

All fields are optional, and will be defaulted to the actual content dimensions.
For example, if a modal is 1000px wide, and you only pass the height, the width will be computed to be 1000px.

[1]: https://app.datadoghq.com/apps