/* ***** BEGIN LICENSE BLOCK *****
 *
 * This Source Code Form is subject to the terms of the Mozilla Public License, v. 2.0.
 * If a copy of the MPL was not distributed with this file, You can obtain one at https://mozilla.org/MPL/2.0/.
 *
 * ***** END LICENSE BLOCK ***** */

"use strict";

// SDK
var preferencesService = require("sdk/preferences/service");
var windows = require("sdk/windows");
var windowUtils = require("sdk/window/utils");
var hotkey = require("sdk/hotkeys").Hotkey;
var { viewFor } = require("sdk/view/core");

//var contentMod = require("sdk/content/mod");
//var Style = require("sdk/stylesheet/style").Style;


// WebExtension
const webExtension = require("sdk/webextension");
var webextPort;
var webextPreferences = {};
var tabsAnimatePrefBackup = false;

// Modules
var { unload } = require("./lib/unload.js");
var { VerticalTabsReloaded } = require("./lib/verticaltabs.js");


// Toggle function of browser.tabs.drawInTitlebar for preference page
function toggleDrawInTitlebar() {
	if(preferencesService.get("browser.tabs.drawInTitlebar", true))
	{
		preferencesService.set("browser.tabs.drawInTitlebar", false);
	}
	else
	{
		preferencesService.set("browser.tabs.drawInTitlebar", true);
	}
}

// Hotkeys
var GLOBAL_SCOPE = this;

function hotkeyPress()
{
    let windowID = windowUtils.getOuterId(windowUtils.getToplevelWindow(windowUtils.getFocusedWindow()));
	GLOBAL_SCOPE["vt"+windowID].toggleDisplayState();
}

function initHotkeys() {
	let toggleKey = webextPreferences["toggleDisplayHotkey"];
	GLOBAL_SCOPE.vtToggleDisplayHotkey = hotkey({
		combo: toggleKey,
		onPress: hotkeyPress
	});
}

function destroyHotkey() {
	GLOBAL_SCOPE.vtToggleDisplayHotkey.destroy();
}

function changeHotkey() {
    debugOutput("change Hotkey event!");
	destroyHotkey();
	initHotkeys();
}

//
// WebExtenions Communication
//

// Send message to WebExtension
function webext_sendMsg(message)
{
    webextPort.postMessage(message);
}


var sdk_inited = false;
// Handle messages from WebExtension
function webext_replyHandler(message)
{
    if(message.type == "settings.migrate")
    {
        if(preferencesService.get("extensions.@verticaltabsreloaded.animate") != undefined)
        {
           webext_sendChangedSetting("compact");
           webext_sendChangedSetting("debug");
           webext_sendChangedSetting("hideInFullscreen");
           webext_sendChangedSetting("right");
           webext_sendChangedSetting("tabtoolbarPosition");
           webext_sendChangedSetting("theme");
           webext_sendChangedSetting("toggleDisplayHotkey");
           webext_sendChangedSetting("width");
           preferencesService.reset("extensions.@verticaltabsreloaded.animate");
        }
        else
        {
            // Delete all settings
            var prefKeys = preferencesService.keys("extensions.@verticaltabsreloaded.");
            for (var i = 0; i < prefKeys.length; i++)
            {
                preferencesService.reset(prefKeys[i]);
            }
        }
    }

    if(message.type == "settings.post")
    {
        // Get settings from WebExt
        debugOutput(message.name + " new value SDK: " + message.value);
        observPrefs(message.name);
    }

    if(message.type == "settings.post-all")
    {
        // Get all settings from WebExt
        webextPreferences = message.value;
        if(sdk_inited == "prepared")
        {
            sdk_inited = true;
            sdk_init();
        }
        else if(sdk_inited == false)
        {
            sdk_inited = "prepared";
        }

        observPrefs("");
    }

    if(message.type == "settings.toggleDrawInTitlebar")
    {
        toggleDrawInTitlebar();
    }

    if(message.type == "settings.toggleDisplayHotkey")
    {
        changeHotkey();
    }

    /*if(message.type == "css.post")
    {
        if(webextPreferences.hasOwnProperty("css") == false)
        {
            webextPreferences["css"] = {};
        }

        webextPreferences["css"][message.name] = message.value;
        //debugOutput(message.value);
        observPrefs("css");
    }*/
}

// Send setting to WebExtension
function webext_sendSetting(settingName, value)
{
    webext_sendMsg({
        type: "settings.post",
        name: settingName,
        value: value
    });
}
// Changed addon preferences, send to WebExtension
function webext_sendChangedSetting(settingName)
{
    webext_sendSetting(settingName, preferencesService.get("extensions.@verticaltabsreloaded." + settingName));
}

function observPrefs(settingName)
{
    for (let window of windows.browserWindows)
    {
        let lowLevelWindow = viewFor(window);
        let windowID = windowUtils.getOuterId(lowLevelWindow);
        debugOutput("observPrefs: " + settingName);
        GLOBAL_SCOPE["vt"+windowID].onPreferenceChange(settingName, webextPreferences);
    }

    /*if(settingName == "css")
    {
        let newStyle;
        debugOutput("dummy");
        Object.keys(webextPreferences["css"]).forEach(k =>
        {
            debugOutput(k);
            newStyle = newStyle + webextPreferences["css"][k];
            debugOutput(webextPreferences["css"][k]);
        });
        debugOutput("dummy2");
        var style = Style({ source: newStyle });
        debugOutput("css changed!");
        debugOutput(style);
        debugOutput("dummy3");
        for (let window of windows.browserWindows)
        {
            let lowLevelWindow = viewFor(window);
            let windowID = windowUtils.getOuterId(lowLevelWindow);
            contentMod.attachTo(style, lowLevelWindow);
        }
    }*/


}

//
// End of WebExtenions Communication
//

function initialize_window(window)
{
    let lowLevelWindow = viewFor(window);
    let windowID = windowUtils.getOuterId(lowLevelWindow);

    GLOBAL_SCOPE["vt"+windowID] = new VerticalTabsReloaded(lowLevelWindow, webextPort, webextPreferences);
    unload(GLOBAL_SCOPE["vt" + windowID].unload.bind(GLOBAL_SCOPE["vt"+windowID]), lowLevelWindow);
}

function sdk_init()
{
    // Initialize VerticalTabsReloaded object for each window.

    for (let window of windows.browserWindows)
    {
        initialize_window(window);
    }

    windows.browserWindows.on('open', function(window) {
        initialize_window(window);
    });

    windows.browserWindows.on('close', function(window) {
        let lowLevelWindow = viewFor(window);
        let windowID = windowUtils.getOuterId(lowLevelWindow);
        GLOBAL_SCOPE["vt"+windowID].unload();
        delete GLOBAL_SCOPE["vt"+windowID];
    });

    initHotkeys();

    unload(function() {
        destroyHotkey();
    });
}

// Entry point of the add-on
exports.main = function (options, callbacks) {
    // WebExtension startup + communication
    webExtension.startup().then(api =>
    {
        const {browser} = api;

        browser.runtime.onMessage.addListener((msg, sender, sendResponse) =>
        {
            webext_replyHandler(msg);
        });

        browser.runtime.onConnect.addListener((port) =>
        {
            webextPort = port; // make it global

           	//debugOutput(options.loadReason);
            if (options.loadReason == "install") {
                preferencesService.set("browser.tabs.drawInTitlebar", false);
            }

            // Back up 'browser.tabs.animate' pref before overwriting it
            tabsAnimatePrefBackup = preferencesService.get("browser.tabs.animate");

            preferencesService.set("browser.tabs.animate", false);

            unload(function () {
                preferencesService.set("browser.tabs.animate", tabsAnimatePrefBackup);
            });

            if(sdk_inited == "prepared")
            {
                sdk_inited = true;
                sdk_init();
            }
            else if(sdk_inited == false)
            {
                sdk_inited = "prepared";
            }
        });
    });
}

exports.onUnload = function (reason) {
	//debugOutput("onUnload:" + reason);

    if (reason == "uninstall")
    {
		console.log("VTR uninstalled");
    }

    unload();
}

function debugOutput(output)
{
    webext_sendMsg({
        type: "debug.log",
        value: output
    });
}
