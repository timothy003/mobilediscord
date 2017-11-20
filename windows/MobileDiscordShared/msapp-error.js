(function () {
    "use strict";
    const applicationView = Windows.UI.ViewManagement.ApplicationView.getForCurrentView();
    const backgroundColor = { a: 255, r: 32, g: 34, b: 37 };
    const foregroundColor = Windows.UI.Colors.white;
    const titleBar = applicationView.titleBar;
    titleBar.backgroundColor = backgroundColor;
    titleBar.foregroundColor = foregroundColor;
    titleBar.buttonBackgroundColor = backgroundColor;
    titleBar.buttonForegroundColor = foregroundColor;
    titleBar.buttonHoverBackgroundColor = { a: 255, r: 53, g: 55, b: 58 };
    titleBar.buttonHoverForegroundColor = foregroundColor;
    titleBar.buttonPressedBackgroundColor = { a: 255, r: 76, g: 78, b: 80 };
    titleBar.buttonPressedForegroundColor = foregroundColor;
    titleBar.inactiveBackgroundColor = backgroundColor;
    titleBar.inactiveForegroundColor = { a: 255, r: 121, g: 122, b: 124 };
    titleBar.buttonInactiveBackgroundColor = backgroundColor;
    titleBar.buttonInactiveForegroundColor = { a: 255, r: 121, g: 122, b: 124 };
    // phone status bar
    if ("StatusBar" in Windows.UI.ViewManagement) {
        const statusBar = Windows.UI.ViewManagement.StatusBar.getForCurrentView();
        const progressIndicator = statusBar.progressIndicator;
        statusBar.backgroundColor = backgroundColor;
        statusBar.backgroundOpacity = 1;
        statusBar.foregroundColor = { a: 255, r: 199, g: 200, b: 200 };
        progressIndicator.hideAsync();
        statusBar.showAsync();
    }

    function parseQueryParameters() {
        var query = location.search.slice(1);
        return query.split("&").reduce(function (queryParameters, rawPair) {
            var pair = rawPair.split("=").map(decodeURIComponent);
            queryParameters[pair[0]] = pair[1];
            return queryParameters;
        }, {});
    }

    const uiError = document.getElementById("ui-error");
    function clickRefresh() {
        location.replace(queryParameters.failureUrl);
        uiError.hidden = true;
        document.getElementById("loading").hidden = false;
    }
    document.getElementById("page-unavailable-refresh").onclick = event => {
        clickRefresh();
    };
    document.getElementById("not-connected-refresh").onclick = event => {
        clickRefresh();
    };
    const notConnected = document.getElementById("not-connected");
    const pageUnavailable = document.getElementById("page-unavailable");
    function checkConnection() {
        if (navigator.onLine) {
            notConnected.hidden = true;
            pageUnavailable.hidden = false;
        } else {
            notConnected.hidden = false;
            pageUnavailable.hidden = true;
        }
    }
    checkConnection();
    const error = document.getElementById("error");
    var queryParameters = parseQueryParameters();
    if (queryParameters.httpStatus)
        error.textContent = `HTTP ${queryParameters.httpStatus}`;
    else if (queryParameters.failureName)
        error.textContent = `Error: ${queryParameters.failureName}`;
    else
        error.hidden = true;
    uiError.hidden = false;
    window.ononline = event => {
        setTimeout(clickRefresh, 1000);
    };
    window.onoffline = event => {
        checkConnection();
    };
}());
